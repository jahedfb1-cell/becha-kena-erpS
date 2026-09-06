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
