<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\CustomerLedger;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\QuotationItem;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LedgerStatementTextTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Customer $customer;
    private Quotation $quotation;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $cat = CustomerCategory::create(['name' => 'Retail', 'created_by' => $this->admin->id]);
        $this->customer = Customer::create(['customer_category_id' => $cat->id, 'customer_code' => 'CUS-0001', 'name' => 'T', 'phone' => '01700000000', 'created_by' => $this->admin->id]);
        $this->product = Product::create(['product_code' => 'WBR 201', 'name' => 'Wooden', 'unit' => 'sqft', 'default_unit_price' => 100, 'created_by' => $this->admin->id]);
        $this->quotation = Quotation::create(['quotation_number' => 'QT-2026-0001', 'customer_id' => $this->customer->id, 'salesman_id' => $this->admin->id, 'status' => 'approved', 'subtotal' => 1000, 'vat_amount' => 0, 'net_amount' => 1000, 'created_by' => $this->admin->id]);
        QuotationItem::create(['quotation_id' => $this->quotation->id, 'section_name' => 'Hall', 'product_id' => $this->product->id, 'is_selected' => true, 'width' => 1, 'height' => 1, 'pcs' => 1, 'unit_price' => 1000, 'line_total' => 1000]);
    }

    /** @test */
    public function invoice_and_payment_rows_carry_the_statement_text_and_never_change_afterwards()
    {
        $invoiceId = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->quotation->id}")->assertStatus(201)->json('data.invoice.id');

        $this->actingAs($this->admin, 'sanctum')->postJson('/api/payments', [
            'invoice_id' => $invoiceId, 'amount' => 400, 'payment_method' => 'cash',
            'payment_date' => '2026-09-17', 'notes' => 'first part',
        ])->assertStatus(201);

        $invoice = \App\Models\Invoice::find($invoiceId);
        $payment = \App\Models\Payment::first();

        $inv = CustomerLedger::where('transaction_type', 'invoice')->first();
        $pay = CustomerLedger::where('transaction_type', 'payment')->first();
        $this->assertSame("{$invoice->invoice_number} - Color Code : WBR 201", $inv->description);
        $this->assertSame("Cash  {$invoice->invoice_number} ({$payment->payment_number})", $pay->description);

        // Editing the product afterwards must not touch the posted ledger.
        $this->product->update(['product_code' => 'XYZ 999']);
        $this->assertSame("{$invoice->invoice_number} - Color Code : WBR 201", $inv->fresh()->description);

        // The customer API returns the frozen text plus the payment remark.
        $rows = $this->actingAs($this->admin, 'sanctum')->getJson("/api/customers/{$this->customer->id}")->json('data.ledgers');
        $this->assertSame("{$invoice->invoice_number} - Color Code : WBR 201", $rows[0]['description']);
        $this->assertSame('first part', $rows[1]['payment_note']);
    }

    /** @test */
    public function freeze_command_converts_old_wording_once_and_is_idempotent()
    {
        $invoice = \App\Models\Invoice::create(['invoice_number' => 'INV-2026-0099', 'quotation_id' => $this->quotation->id, 'customer_id' => $this->customer->id, 'salesman_id' => $this->admin->id, 'subtotal' => 1000, 'grand_total' => 1000, 'due_amount' => 1000, 'invoice_date' => '2026-09-17', 'created_by' => $this->admin->id]);
        $row = CustomerLedger::create(['customer_id' => $this->customer->id, 'transaction_type' => 'invoice', 'reference_type' => \App\Models\Invoice::class, 'reference_id' => $invoice->id, 'description' => 'Generated invoice INV-2026-0099 for quotation QT-2026-0001', 'debit' => 1000, 'credit' => 0, 'balance' => 1000, 'transaction_date' => '2026-09-17', 'created_by' => $this->admin->id]);

        $this->artisan('ledger:freeze-descriptions', ['--dry-run' => true])->assertSuccessful();
        $this->assertStringStartsWith('Generated invoice', $row->fresh()->description);

        $this->artisan('ledger:freeze-descriptions')->assertSuccessful();
        $this->assertSame('INV-2026-0099 - Color Code : WBR 201', $row->fresh()->description);

        $this->product->update(['product_code' => 'XYZ 999']);
        $this->artisan('ledger:freeze-descriptions')->assertSuccessful();
        $this->assertSame('INV-2026-0099 - Color Code : WBR 201', $row->fresh()->description);
    }
}
