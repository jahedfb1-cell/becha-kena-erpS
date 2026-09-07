<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\CashBookEntry;
use App\Models\Payment;
use App\Models\Quotation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the advance-payment flow: money a customer pays against an order
 * before it has ever been invoiced. Unlike an ordinary Payment (which
 * requires an invoice_id), an advance payment is filed against the
 * quotation itself and only gets folded into an invoice's paid_amount once
 * one is eventually generated from that same order - see
 * PaymentService::processAdvancePayment() / linkAdvancePaymentsToInvoice().
 */
class AdvancePaymentApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $salesman;
    protected Customer $customer;
    protected Quotation $pendingOrder;

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

        $this->pendingOrder = Quotation::create([
            'quotation_number' => 'QT-2026-0001',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'pending_approval',
            'subtotal'         => 1000,
            'net_amount'       => 1000,
            'created_by'       => $this->salesman->id,
        ]);
    }

    /** @test */
    public function an_advance_payment_hits_the_ledger_and_cash_book_immediately(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$this->pendingOrder->id}/advance-payments", [
                'amount'         => 300,
                'payment_method' => 'cash',
                'payment_date'   => now()->toDateString(),
            ]);

        $response->assertStatus(201)->assertJsonPath('success', true);

        $payment = Payment::where('quotation_id', $this->pendingOrder->id)->first();
        $this->assertNotNull($payment);
        $this->assertNull($payment->invoice_id);
        $this->assertEquals(300, $payment->amount);

        $ledger = CustomerLedger::where('customer_id', $this->customer->id)
            ->where('transaction_type', 'advance_payment')
            ->first();
        $this->assertNotNull($ledger);
        $this->assertEquals(300, $ledger->credit);
        $this->assertEquals(-300, $ledger->balance);

        $cashEntry = CashBookEntry::where('entry_type', 'in')->first();
        $this->assertNotNull($cashEntry);
        $this->assertEquals(300, $cashEntry->amount);
    }

    /** @test */
    public function an_advance_cannot_exceed_the_orders_remaining_balance(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$this->pendingOrder->id}/advance-payments", [
                'amount'         => 1500,
                'payment_method' => 'cash',
                'payment_date'   => now()->toDateString(),
            ]);

        $response->assertStatus(422)->assertJsonPath('success', false);
        $this->assertDatabaseCount('payments', 0);
    }

    /** @test */
    public function a_second_advance_is_capped_by_what_the_first_already_covered(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 700, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        )->assertStatus(201);

        // Only 300 of the 1000 order remains
        $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 400, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        )->assertStatus(422);

        $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 300, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        )->assertStatus(201);

        $this->assertEquals(1000, Payment::where('quotation_id', $this->pendingOrder->id)->sum('amount'));
    }

    /** @test */
    public function voiding_an_unlinked_advance_reverses_the_ledger_and_cash_book(): void
    {
        $store = $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 300, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        );
        $paymentId = $store->json('data.id');

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/advance-payments/{$paymentId}/void");

        $response->assertStatus(200)->assertJsonPath('success', true);

        $this->assertTrue((bool) Payment::withoutGlobalScopes()->find($paymentId)->is_archived);

        $latestLedger = CustomerLedger::where('customer_id', $this->customer->id)->orderBy('id', 'desc')->first();
        $this->assertEquals(0, $latestLedger->balance);

        $lastCash = CashBookEntry::orderBy('id', 'desc')->first();
        $this->assertEquals('out', $lastCash->entry_type);
    }

    /** @test */
    public function generating_the_invoice_folds_the_advance_into_paid_amount(): void
    {
        // Order needs to be approved for an invoice to be generated from it.
        $this->pendingOrder->update(['status' => 'approved']);

        $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 400, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        )->assertStatus(201);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->pendingOrder->id}?with_challan=0");

        $response->assertStatus(201)
            ->assertJsonPath('data.invoice.paid_amount', 400)
            ->assertJsonPath('data.invoice.due_amount', 600)
            ->assertJsonPath('data.invoice.payment_status', 'partial');

        $invoiceId = $response->json('data.invoice.id');

        $payment = Payment::where('quotation_id', $this->pendingOrder->id)->first();
        $this->assertEquals($invoiceId, $payment->invoice_id);

        // The advance's own ledger/book entries must not be duplicated -
        // exactly one advance_payment ledger row and one cash-in entry.
        $this->assertEquals(1, CustomerLedger::where('transaction_type', 'advance_payment')->count());
        $this->assertEquals(1, CashBookEntry::where('entry_type', 'in')->count());
    }

    /** @test */
    public function archiving_an_invoice_with_only_a_folded_advance_is_allowed_and_keeps_the_ledger(): void
    {
        $this->pendingOrder->update(['status' => 'approved']);

        $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 400, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        )->assertStatus(201);

        $genResponse = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->pendingOrder->id}?with_challan=0");
        $invoiceId = $genResponse->json('data.invoice.id');

        $ledgerRowsBefore = CustomerLedger::count();
        $cashRowsBefore = CashBookEntry::count();

        // This used to be rejected outright ("Cannot archive invoice
        // because it has associated payments") purely because the folded
        // advance counted as "an associated payment" - it must not,
        // because unlike a genuine post-invoice payment there's nothing
        // here that needs voiding first.
        $response = $this->actingAs($this->admin, 'sanctum')->deleteJson("/api/invoices/{$invoiceId}");
        $response->assertStatus(200)->assertJsonPath('success', true);

        // The order is editable again.
        $this->assertEquals('approved', $this->pendingOrder->fresh()->status);

        // The advance is unlinked from the archived invoice but otherwise
        // completely untouched - still active, same amount, no new ledger
        // or book entry (archiving only adds the invoice's own reversal
        // row, not a second reversal of the advance).
        $payment = Payment::where('quotation_id', $this->pendingOrder->id)->first();
        $this->assertNull($payment->invoice_id);
        $this->assertFalse((bool) $payment->is_archived);
        $this->assertEquals(400, $payment->amount);

        $this->assertEquals($ledgerRowsBefore + 1, CustomerLedger::count()); // just the invoice reversal
        $this->assertEquals($cashRowsBefore, CashBookEntry::count()); // untouched

        // Customer's balance nets back to exactly what it was before this
        // invoice existed (the advance's own credit is still in effect).
        $latestLedger = CustomerLedger::where('customer_id', $this->customer->id)->orderBy('id', 'desc')->first();
        $this->assertEquals(-400, $latestLedger->balance);
    }

    /** @test */
    public function regenerating_the_invoice_after_archiving_folds_the_same_advance_back_in(): void
    {
        $this->pendingOrder->update(['status' => 'approved']);

        $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 400, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        )->assertStatus(201);

        $firstInvoiceId = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->pendingOrder->id}?with_challan=0")
            ->json('data.invoice.id');

        $this->actingAs($this->admin, 'sanctum')->deleteJson("/api/invoices/{$firstInvoiceId}")
            ->assertStatus(200);

        // Simulate the real workflow this whole fix is for: order edited
        // while unlocked (a real edit isn't necessary to prove the point -
        // just that a second invoice can be generated and picks the same
        // advance back up).
        $second = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->pendingOrder->id}?with_challan=0");

        $second->assertStatus(201)
            ->assertJsonPath('data.invoice.paid_amount', 400)
            ->assertJsonPath('data.invoice.due_amount', 600);

        $payment = Payment::where('quotation_id', $this->pendingOrder->id)->first();
        $this->assertEquals($second->json('data.invoice.id'), $payment->invoice_id);

        // Still exactly one advance_payment ledger row and one cash-in
        // entry throughout - archiving/regenerating never re-charges it.
        $this->assertEquals(1, CustomerLedger::where('transaction_type', 'advance_payment')->count());
        $this->assertEquals(1, CashBookEntry::where('entry_type', 'in')->count());
    }

    /** @test */
    public function an_invoice_with_a_genuine_post_invoice_payment_can_also_be_archived_and_keeps_the_ledger(): void
    {
        $this->pendingOrder->update(['status' => 'approved']);

        $invoiceId = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->pendingOrder->id}?with_challan=0")
            ->json('data.invoice.id');

        // A normal payment recorded directly against the invoice (not a
        // pre-invoice advance) - Payment::quotation_id stays null for these,
        // set only by PaymentService::processAdvancePayment(). This is the
        // real-world case an invoice like INV-2026-0045 hits: money already
        // taken straight against the invoice, and the order still needs
        // fixing and re-invoicing.
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/payments', [
            'invoice_id'     => $invoiceId,
            'amount'         => 500,
            'payment_method' => 'cash',
            'payment_date'   => now()->toDateString(),
        ])->assertStatus(201);

        $ledgerRowsBefore = CustomerLedger::count();
        $cashRowsBefore = CashBookEntry::count();

        $response = $this->actingAs($this->admin, 'sanctum')->deleteJson("/api/invoices/{$invoiceId}");
        $response->assertStatus(200)->assertJsonPath('success', true);

        // The order is editable again.
        $this->assertEquals('approved', $this->pendingOrder->fresh()->status);

        // The payment is unlinked from the archived invoice and backfilled
        // to the order (quotation_id), ready to fold into whichever invoice
        // gets generated next - but it is otherwise completely untouched:
        // still active, same amount, no new ledger or book entry.
        $payment = Payment::where('quotation_id', $this->pendingOrder->id)->first();
        $this->assertNull($payment->invoice_id);
        $this->assertFalse((bool) $payment->is_archived);
        $this->assertEquals(500, $payment->amount);

        $this->assertEquals($ledgerRowsBefore + 1, CustomerLedger::count()); // just the invoice reversal
        $this->assertEquals($cashRowsBefore, CashBookEntry::count()); // untouched

        // Regenerating a second invoice folds this same payment back in.
        $second = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$this->pendingOrder->id}?with_challan=0");
        $second->assertStatus(201)
            ->assertJsonPath('data.invoice.paid_amount', 500);
        $this->assertEquals($second->json('data.invoice.id'), $payment->fresh()->invoice_id);
    }

    /** @test */
    public function a_new_direct_order_can_carry_an_advance_payment_in_the_same_request(): void
    {
        $product = \App\Models\Product::create([
            'product_code'       => 'BL-001',
            'name'               => 'Vertical Blind Standard',
            'unit'               => 'sqft',
            'default_unit_price' => 100.00,
            'created_by'         => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'status'      => 'approved',
            'items'       => [[
                'product_id' => $product->id,
                'width'      => 24,
                'height'     => 36,
                'pcs'        => 1,
                'unit_price' => 100,
            ]],
            'advance_payment' => [
                'amount'         => 300,
                'payment_method' => 'cash',
                'payment_date'   => now()->toDateString(),
            ],
        ]);

        $response->assertStatus(201)->assertJsonPath('success', true);

        $newOrderId = $response->json('data.id');
        $payment = Payment::where('quotation_id', $newOrderId)->first();

        $this->assertNotNull($payment);
        $this->assertEquals(300, $payment->amount);
        $this->assertNull($payment->invoice_id);

        $this->assertEquals(1, CashBookEntry::where('entry_type', 'in')->count());
    }

    /** @test */
    public function creating_an_order_rejects_an_advance_that_exceeds_the_order_total(): void
    {
        $product = \App\Models\Product::create([
            'product_code'       => 'BL-002',
            'name'               => 'Vertical Blind Small',
            'unit'               => 'sqft',
            'default_unit_price' => 50.00,
            'created_by'         => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'status'      => 'approved',
            'items'       => [[
                'product_id' => $product->id,
                'width'      => 12,
                'height'     => 12,
                'pcs'        => 1,
                'unit_price' => 50,
            ]],
            'advance_payment' => [
                'amount'         => 999999,
                'payment_method' => 'cash',
                'payment_date'   => now()->toDateString(),
            ],
        ]);

        $response->assertStatus(500);
        $this->assertDatabaseCount('quotations', 1); // only the setUp() order — this one rolled back
        $this->assertDatabaseCount('payments', 0);
    }

    /** @test */
    public function an_advance_cannot_be_recorded_against_an_already_invoiced_order(): void
    {
        $this->pendingOrder->update(['status' => 'invoiced']);

        $response = $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/quotations/{$this->pendingOrder->id}/advance-payments",
            ['amount' => 100, 'payment_method' => 'cash', 'payment_date' => now()->toDateString()]
        );

        $response->assertStatus(422)->assertJsonPath('success', false);
    }
}
