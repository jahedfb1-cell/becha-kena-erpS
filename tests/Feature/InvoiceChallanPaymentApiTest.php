<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\Invoice;
use App\Models\DeliveryChallan;
use App\Models\Payment;
use App\Models\CustomerLedger;
use App\Models\CashBookEntry;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceChallanPaymentApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $salesman;
    protected Customer $customer;
    protected Product $product;
    protected Quotation $approvedQuotation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->salesman = User::factory()->create(['role' => 'salesman']);
        $this->salesman->assignRole('salesman');

        $category = \App\Models\CustomerCategory::create([
            'name'       => 'Retail',
            'created_by' => $this->admin->id,
        ]);

        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Test Customer',
            'phone'                => '01700000000',
            'created_by'           => $this->admin->id,
        ]);

        $this->product = Product::create([
            'product_code'       => 'BL-001',
            'name'               => 'Vertical Blind Standard',
            'unit'               => 'sqft',
            'default_unit_price' => 100.00,
            'created_by'         => $this->admin->id,
        ]);

        $this->approvedQuotation = Quotation::create([
            'quotation_number' => 'QT-2026-0001',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'approved',
            'subtotal'         => 1000,
            'vat_amount'       => 50,
            'net_amount'       => 1050,
            'created_by'       => $this->salesman->id,
        ]);
    }

    /** @test */
    public function admin_can_generate_invoice_from_approved_quotation()
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->approvedQuotation->id}");

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.grand_total', 1050)
            ->assertJsonPath('data.payment_status', 'unpaid');

        // Quotation status should now be invoiced (locked)
        $this->assertEquals('invoiced', $this->approvedQuotation->fresh()->status);

        // A debit customer ledger entry should have been created
        $ledger = CustomerLedger::where('customer_id', $this->customer->id)
            ->where('transaction_type', 'invoice')
            ->first();

        $this->assertNotNull($ledger);
        $this->assertEquals(1050, $ledger->debit);
        $this->assertEquals(1050, $ledger->balance);
    }

    /** @test */
    public function cannot_generate_invoice_from_unapproved_quotation()
    {
        $draftQuotation = Quotation::create([
            'quotation_number' => 'QT-2026-0002',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'quotation',
            'subtotal'         => 500,
            'net_amount'       => 500,
            'created_by'       => $this->salesman->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$draftQuotation->id}");

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /** @test */
    public function admin_can_generate_delivery_challan_from_invoice()
    {
        $invoice = Invoice::create([
            'invoice_number' => 'INV-2026-0001',
            'quotation_id'   => $this->approvedQuotation->id,
            'customer_id'    => $this->customer->id,
            'subtotal'       => 1000,
            'grand_total'    => 1050,
            'due_amount'     => 1050,
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/challans/generate/{$invoice->id}");

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('delivery_challans', [
            'invoice_id' => $invoice->id,
            'status'     => 'pending'
        ]);
    }

    /** @test */
    public function user_can_record_payment_against_invoice()
    {
        $invoice = Invoice::create([
            'invoice_number' => 'INV-2026-0001',
            'quotation_id'   => $this->approvedQuotation->id,
            'customer_id'    => $this->customer->id,
            'subtotal'       => 1000,
            'grand_total'    => 1050,
            'due_amount'     => 1050,
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        // Start with clean balance
        CustomerLedger::create([
            'customer_id'      => $this->customer->id,
            'transaction_type' => 'invoice',
            'reference_type'   => Invoice::class,
            'reference_id'     => $invoice->id,
            'description'      => 'Test Invoice',
            'debit'            => 1050,
            'credit'           => 0,
            'balance'          => 1050,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/payments', [
                'invoice_id'      => $invoice->id,
                'amount'          => 500,
                'payment_method'  => 'cash',
                'payment_date'    => now()->toDateString(),
                'discount_amount' => 50, // Waive-off discount
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $freshInvoice = $invoice->fresh();
        $this->assertEquals(500, $freshInvoice->paid_amount);
        $this->assertEquals(50, $freshInvoice->discount_amount);
        $this->assertEquals(500, $freshInvoice->due_amount);
        $this->assertEquals('partial', $freshInvoice->payment_status);

        // Verification of Customer Ledger credit entries
        $paymentLedger = CustomerLedger::where('customer_id', $this->customer->id)
            ->where('transaction_type', 'payment')
            ->first();
        $this->assertNotNull($paymentLedger);
        $this->assertEquals(500, $paymentLedger->credit);

        $discountLedger = CustomerLedger::where('customer_id', $this->customer->id)
            ->where('transaction_type', 'discount')
            ->first();
        $this->assertNotNull($discountLedger);
        $this->assertEquals(50, $discountLedger->credit);

        // Final balance should be 1050 - 500 - 50 = 500
        $latestLedger = CustomerLedger::where('customer_id', $this->customer->id)->orderBy('id', 'desc')->first();
        $this->assertEquals(500, $latestLedger->balance);

        // CashBook Entry verified
        $cashEntry = CashBookEntry::where('entry_type', 'in')->first();
        $this->assertNotNull($cashEntry);
        $this->assertEquals(500, $cashEntry->amount);
    }

    /** @test */
    public function admin_can_void_payment()
    {
        $invoice = Invoice::create([
            'invoice_number' => 'INV-2026-0001',
            'quotation_id'   => $this->approvedQuotation->id,
            'customer_id'    => $this->customer->id,
            'subtotal'       => 1000,
            'grand_total'    => 1050,
            'paid_amount'    => 500,
            'due_amount'     => 550,
            'payment_status' => 'partial',
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        $payment = Payment::create([
            'payment_number' => 'PAY-2026-0001',
            'invoice_id'     => $invoice->id,
            'customer_id'    => $this->customer->id,
            'amount'         => 500,
            'payment_method' => 'cash',
            'payment_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        // Record initial ledger
        CustomerLedger::create([
            'customer_id'      => $this->customer->id,
            'transaction_type' => 'payment',
            'reference_type'   => Payment::class,
            'reference_id'     => $payment->id,
            'description'      => 'Test Payment',
            'debit'            => 0,
            'credit'           => 500,
            'balance'          => 550,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $this->admin->id,
        ]);

        // Record initial cashbook
        CashBookEntry::create([
            'entry_type'     => 'in',
            'reference_type' => Payment::class,
            'reference_id'   => $payment->id,
            'description'    => 'Payment PAY-2026-0001',
            'amount'         => 500,
            'balance'        => 500,
            'entry_date'     => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/payments/{$payment->id}/void");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Verification of Invoice status & values
        $freshInvoice = $invoice->fresh();
        $this->assertEquals(0, $freshInvoice->paid_amount);
        $this->assertEquals(1050, $freshInvoice->due_amount);
        $this->assertEquals('unpaid', $freshInvoice->payment_status);

        // CashBook Entry verified (should have 'out' entry to balance)
        $cashEntry = CashBookEntry::orderBy('id', 'desc')->first();
        $this->assertEquals('out', $cashEntry->entry_type);
        $this->assertEquals(500, $cashEntry->amount);
        $this->assertEquals(0, $cashEntry->balance);

        // Ledger void balance check (should be +500 back to 1050)
        $latestLedger = CustomerLedger::where('customer_id', $this->customer->id)->orderBy('id', 'desc')->first();
        $this->assertEquals(1050, $latestLedger->balance);
        $this->assertEquals('adjustment', $latestLedger->transaction_type);
    }

    /** @test */
    public function admin_can_archive_invoice_if_no_payments()
    {
        $invoice = Invoice::create([
            'invoice_number' => 'INV-2026-0001',
            'quotation_id'   => $this->approvedQuotation->id,
            'customer_id'    => $this->customer->id,
            'subtotal'       => 1000,
            'grand_total'    => 1050,
            'due_amount'     => 1050,
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        $challan = DeliveryChallan::create([
            'challan_number' => 'DC-2026-0001',
            'invoice_id'     => $invoice->id,
            'customer_id'    => $this->customer->id,
            'status'         => 'pending',
            'created_by'     => $this->admin->id,
        ]);

        // Start with clean balance
        CustomerLedger::create([
            'customer_id'      => $this->customer->id,
            'transaction_type' => 'invoice',
            'reference_type'   => Invoice::class,
            'reference_id'     => $invoice->id,
            'description'      => 'Test Invoice',
            'debit'            => 1050,
            'credit'           => 0,
            'balance'          => 1050,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/invoices/{$invoice->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Challan should be archived
        $this->assertTrue((bool)$challan->fresh()->is_archived);

        // Quotation should be unlocked (status -> approved)
        $this->assertEquals('approved', $this->approvedQuotation->fresh()->status);

        // Customer Ledger should contain a reverse entry
        $latestLedger = CustomerLedger::where('customer_id', $this->customer->id)->orderBy('id', 'desc')->first();
        $this->assertEquals('adjustment', $latestLedger->transaction_type);
        $this->assertEquals(0, $latestLedger->balance);
    }
}
