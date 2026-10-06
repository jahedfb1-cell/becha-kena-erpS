<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\CustomerLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Book and ledger lines whose payment / invoice was deleted are cancelled
 * with a reversing line, both archived, never deleted.
 */
class ReverseOrphanBookEntriesTest extends TestCase
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

        $base = ['created_by' => $this->admin->id, 'entry_date' => '2026-08-07'];
        // Live-like: demo payments 1 and 2 deleted, their book lines left behind.
        CashBookEntry::create($base + ['entry_type' => 'in', 'reference_type' => Payment::class, 'reference_id' => 1, 'description' => 'Payment PAY-2026-0001', 'amount' => 119566.65, 'balance' => 119566.65]);
        BankBookEntry::create($base + ['bank_name' => 'City Bank', 'entry_type' => 'in', 'reference_type' => Payment::class, 'reference_id' => 2, 'description' => 'Payment PAY-2026-0002', 'amount' => 40139.82, 'balance' => 40139.82]);
        // ...and a ledger debit for a deleted invoice, followed by a real one.
        CustomerLedger::create(['customer_id' => $this->customer->id, 'transaction_type' => 'invoice', 'reference_type' => Invoice::class, 'reference_id' => 999, 'description' => 'Generated invoice INV-2026-0003', 'debit' => 8982.60, 'credit' => 0, 'balance' => 8982.60, 'transaction_date' => '2026-08-10', 'created_by' => $this->admin->id]);
        CustomerLedger::create(['customer_id' => $this->customer->id, 'transaction_type' => 'opening_balance', 'reference_type' => Customer::class, 'reference_id' => $this->customer->id, 'description' => 'Opening', 'debit' => 15680, 'credit' => 0, 'balance' => 24662.60, 'transaction_date' => '2026-09-19', 'created_by' => $this->admin->id]);
    }

    public function test_dry_run_changes_nothing(): void
    {
        $this->artisan('books:reverse-orphan-entries', ['--dry-run' => true])
            ->expectsOutputToContain('would reverse: 3')->assertExitCode(0);

        $this->assertSame(1, CashBookEntry::count());
        $this->assertSame(0, CashBookEntry::where('is_archived', true)->count());
    }

    public function test_orphans_are_reversed_and_archived_as_pairs_and_balances_corrected(): void
    {
        $this->artisan('books:reverse-orphan-entries')->expectsOutputToContain('Reversed: 3')->assertExitCode(0);

        // Cash: original kept, reversal posted, latest balance back to 0.
        $this->assertSame(2, CashBookEntry::count());
        $this->assertSame(2, CashBookEntry::where('is_archived', true)->count());
        $this->assertEquals(0, CashBookEntry::orderByDesc('id')->first()->balance);
        $this->assertSame('out', CashBookEntry::orderByDesc('id')->first()->entry_type);

        $this->assertEquals(0, BankBookEntry::where('bank_name', 'City Bank')->orderByDesc('id')->first()->balance);

        // Customer: the unsupported 8,982.60 is credited back.
        $last = CustomerLedger::where('customer_id', $this->customer->id)->orderByDesc('id')->first();
        $this->assertSame('adjustment', $last->transaction_type);
        $this->assertEquals(8982.60, $last->credit);
        $this->assertEquals(15680, $last->balance);
        $this->assertFalse((bool) CustomerLedger::where('description', 'Opening')->first()->is_archived, 'real lines untouched');

        $this->assertSame(3, AuditLog::where('description', 'like', 'Reversed orphan%')->count());

        // Nothing left to do on a second run.
        $this->artisan('books:reverse-orphan-entries')->expectsOutputToContain('Reversed: 0')->assertExitCode(0);
    }
}
