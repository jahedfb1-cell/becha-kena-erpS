<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\CustomerLedger;
use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Quotation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The one-off data corrections (waive-off backfill, duplicate legacy
 * invoices) and the unique indexes that stop the same mistakes recurring.
 */
class DataCorrectionCommandsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $category = CustomerCategory::create(['name' => 'Retail', 'created_by' => $this->admin->id]);
        $this->customer = Customer::create(['customer_category_id' => $category->id, 'customer_code' => 'C1', 'name' => 'C', 'phone' => '017', 'created_by' => $this->admin->id]);
    }

    private function order(string $no): Quotation
    {
        return Quotation::create(['quotation_number' => $no, 'customer_id' => $this->customer->id, 'salesman_id' => $this->admin->id, 'status' => 'invoiced', 'subtotal' => 9410.36, 'net_amount' => 9410.36, 'created_by' => $this->admin->id]);
    }

    private function invoice(Quotation $q, string $no, float $total = 9410.36): Invoice
    {
        return Invoice::create(['invoice_number' => $no, 'quotation_id' => $q->id, 'customer_id' => $this->customer->id, 'subtotal' => $total, 'grand_total' => $total, 'due_amount' => $total, 'invoice_date' => '2024-01-01', 'created_by' => $this->admin->id]);
    }

    private function payment(Invoice $i, string $no, float $amount, float $discount = 0): Payment
    {
        return Payment::create(['payment_number' => $no, 'invoice_id' => $i->id, 'customer_id' => $this->customer->id, 'amount' => $amount, 'discount_amount' => $discount, 'payment_method' => 'cash', 'payment_date' => '2026-08-19', 'created_by' => $this->admin->id]);
    }

    // ------------------------------------------------------- waive-off backfill

    public function test_waive_off_is_copied_from_the_ledger_line_and_only_once(): void
    {
        $inv = $this->invoice($this->order('QT-1'), 'INV-1', 130254.40);
        $pay = $this->payment($inv, 'PAY-0007', 122254);
        CustomerLedger::create(['customer_id' => $this->customer->id, 'transaction_type' => 'discount', 'reference_type' => Payment::class, 'reference_id' => $pay->id, 'description' => 'Waive-off', 'debit' => 0, 'credit' => 8000, 'balance' => 0, 'transaction_date' => '2026-08-19', 'created_by' => $this->admin->id]);

        // a payment that already records its own discount must not be overwritten
        $own = $this->payment($this->invoice($this->order('QT-2'), 'INV-2'), 'PAY-0008', 100, 50);
        CustomerLedger::create(['customer_id' => $this->customer->id, 'transaction_type' => 'discount', 'reference_type' => Payment::class, 'reference_id' => $own->id, 'description' => 'Waive-off', 'debit' => 0, 'credit' => 999, 'balance' => 0, 'transaction_date' => '2026-10-01', 'created_by' => $this->admin->id]);

        $this->artisan('payments:backfill-waive-off', ['--dry-run' => true])->expectsOutputToContain('would update: 1')->assertExitCode(0);
        $this->assertEquals(0, $pay->fresh()->discount_amount);

        $this->artisan('payments:backfill-waive-off')->expectsOutputToContain('Updated: 1')->assertExitCode(0);
        $this->assertEquals(8000, $pay->fresh()->discount_amount);
        $this->assertEquals(50, $own->fresh()->discount_amount);
        $this->assertEquals(122254, $pay->fresh()->amount, 'the amount received is untouched');
        $this->assertEquals(130254.40, $inv->fresh()->grand_total);
        $this->assertTrue(AuditLog::where('module', Payment::class)->where('reference_id', $pay->id)->exists());

        $this->artisan('payments:backfill-waive-off')->expectsOutputToContain('Updated: 0')->assertExitCode(0);
    }

    // ----------------------------------------------- duplicate legacy invoices

    public function test_the_unpaid_never_ledgered_duplicate_is_archived_and_nothing_else_moves(): void
    {
        $q = $this->order('QDB-2410727');
        $first = $this->invoice($q, 'DB-2410453');
        $paid = $this->invoice($q, 'DB-2410454');
        $this->payment($paid, 'PAY-5000', 5000);
        DeliveryChallan::create(['challan_number' => 'CH-1', 'invoice_id' => $first->id, 'customer_id' => $this->customer->id, 'status' => 'pending', 'challan_date' => '2024-10-28', 'created_by' => $this->admin->id]);

        $this->artisan('invoices:archive-duplicates', ['--dry-run' => true])->expectsOutputToContain('would archive: 1')->assertExitCode(0);
        $this->assertFalse((bool) $first->fresh()->is_archived);

        $this->artisan('invoices:archive-duplicates')->expectsOutputToContain('Archived: 1')->assertExitCode(0);

        $this->assertTrue((bool) $first->fresh()->is_archived, 'the unpaid copy is archived');
        $this->assertFalse((bool) $paid->fresh()->is_archived, 'the invoice with the payment is kept');
        $this->assertSame('invoiced', $q->fresh()->status, 'the order stays invoiced');
        $this->assertSame(0, CustomerLedger::count(), 'no credit is invented on the ledger');
        $this->assertTrue((bool) DeliveryChallan::where('invoice_id', $first->id)->first()->is_archived);
        $this->assertTrue(AuditLog::where('reference_id', $first->id)->where('action_type', 'archive')->exists());

        $this->artisan('invoices:archive-duplicates')->expectsOutputToContain('Archived: 0')->assertExitCode(0);
    }

    public function test_it_leaves_alone_anything_that_is_not_a_clear_duplicate(): void
    {
        $diff = $this->order('QT-DIFF');
        $this->invoice($diff, 'INV-A', 1000);
        $this->invoice($diff, 'INV-B', 2000); // different totals: two real invoices

        $both = $this->order('QT-BOTH');
        $a = $this->invoice($both, 'INV-C');
        $b = $this->invoice($both, 'INV-D');
        $this->payment($a, 'PAY-C', 10);
        $this->payment($b, 'PAY-D', 10); // both paid: a person decides

        $this->artisan('invoices:archive-duplicates')->expectsOutputToContain('Archived: 0')->assertExitCode(0);
        $this->assertSame(4, Invoice::where('is_archived', false)->count());
    }

    // ----------------------------------------------------------- unique indexes

    public function test_the_unique_and_report_indexes_exist(): void
    {
        foreach ([
            'customer_categories' => 'customer_categories_name_unique',
            'product_categories' => 'product_categories_name_unique',
            'expense_categories' => 'expense_categories_name_unique',
            'departments' => 'departments_name_unique',
            'quotations' => 'quotations_status_index',
            'invoices' => 'invoices_invoice_date_index',
            'payments' => 'payments_payment_date_index',
            'customer_ledgers' => 'customer_ledgers_transaction_date_index',
        ] as $table => $index) {
            $this->assertTrue(Schema::hasIndex($table, $index), "$table is missing $index");
        }
    }

    public function test_the_database_itself_refuses_a_duplicate_category_name(): void
    {
        \App\Models\ProductCategory::create(['name' => 'Rollers', 'created_by' => $this->admin->id]);

        $this->expectException(QueryException::class);
        \App\Models\ProductCategory::create(['name' => 'Rollers', 'created_by' => $this->admin->id]);
    }
}
