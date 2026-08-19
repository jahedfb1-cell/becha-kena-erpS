<?php

namespace Tests\Feature;

use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\CustomerLedger;
use App\Models\Invoice;
use App\Models\MobileBookEntry;
use App\Models\Payment;
use App\Models\Quotation;
use App\Models\User;
use App\Services\PaymentService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers PaymentService paths the API tests never reach: transferring a
 * payment between invoices, and the bank/mobile branches of the book entry
 * (only cash is exercised elsewhere).
 */
class PaymentServiceTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;
    protected PaymentService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $category = CustomerCategory::create([
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

        $this->service = new PaymentService();
    }

    private function makeInvoice(float $grandTotal = 1000, string $number = 'INV-2026-0001'): Invoice
    {
        $quotation = Quotation::create([
            'quotation_number' => 'QT-' . $number,
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->admin->id,
            'status'           => 'invoiced',
            'subtotal'         => $grandTotal,
            'net_amount'       => $grandTotal,
            'created_by'       => $this->admin->id,
        ]);

        $invoice = Invoice::create([
            'invoice_number' => $number,
            'quotation_id'   => $quotation->id,
            'customer_id'    => $this->customer->id,
            'salesman_id'    => $this->admin->id,
            'subtotal'       => $grandTotal,
            'grand_total'    => $grandTotal,
            'due_amount'     => $grandTotal,
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);

        // Opening debit, the way InvoiceService records it.
        $last = CustomerLedger::where('customer_id', $this->customer->id)->orderBy('id', 'desc')->first();
        CustomerLedger::create([
            'customer_id'      => $this->customer->id,
            'transaction_type' => 'invoice',
            'reference_type'   => Invoice::class,
            'reference_id'     => $invoice->id,
            'description'      => "Invoice {$number}",
            'debit'            => $grandTotal,
            'credit'           => 0,
            'balance'          => ($last ? (float) $last->balance : 0) + $grandTotal,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $this->admin->id,
        ]);

        return $invoice;
    }

    private function paymentData(array $overrides = []): array
    {
        return array_merge([
            'amount'         => 400,
            'payment_method' => 'cash',
            'payment_date'   => now()->toDateString(),
        ], $overrides);
    }

    // ── Numbering ────────────────────────────────────────────────────

    public function test_payment_numbers_run_in_an_unbroken_yearly_sequence(): void
    {
        $invoice = $this->makeInvoice();

        $first  = $this->service->processPayment($this->paymentData(['amount' => 100]), $invoice, $this->admin->id);
        $second = $this->service->processPayment($this->paymentData(['amount' => 100]), $invoice->fresh(), $this->admin->id);

        $year = now()->format('Y');
        $this->assertSame("PAY-{$year}-0001", $first->payment_number);
        $this->assertSame("PAY-{$year}-0002", $second->payment_number);
    }

    // ── Book entries per payment method ──────────────────────────────

    public function test_a_bank_payment_lands_in_the_bank_book_under_its_own_bank(): void
    {
        $invoice = $this->makeInvoice();

        $this->service->processPayment($this->paymentData([
            'amount'         => 400,
            'payment_method' => 'bank',
            'bank_name'      => 'City Bank',
            'cheque_number'  => 'CHQ-77',
        ]), $invoice, $this->admin->id);

        $entry = BankBookEntry::first();

        $this->assertNotNull($entry);
        $this->assertSame('City Bank', $entry->bank_name);
        $this->assertSame('in', $entry->entry_type);
        $this->assertSame('CHQ-77', $entry->cheque_number);
        $this->assertEquals(400, $entry->amount);
        $this->assertEquals(400, $entry->balance);
        $this->assertSame(0, CashBookEntry::count());
    }

    /** Each bank keeps its own running balance, not one shared total. */
    public function test_bank_balances_are_tracked_separately_per_bank(): void
    {
        $invoice = $this->makeInvoice(2000);

        $this->service->processPayment($this->paymentData([
            'amount' => 400, 'payment_method' => 'bank', 'bank_name' => 'City Bank',
        ]), $invoice, $this->admin->id);

        $this->service->processPayment($this->paymentData([
            'amount' => 250, 'payment_method' => 'bank', 'bank_name' => 'BRAC Bank',
        ]), $invoice->fresh(), $this->admin->id);

        $this->service->processPayment($this->paymentData([
            'amount' => 100, 'payment_method' => 'bank', 'bank_name' => 'City Bank',
        ]), $invoice->fresh(), $this->admin->id);

        $this->assertEquals(500, BankBookEntry::where('bank_name', 'City Bank')->orderBy('id', 'desc')->first()->balance);
        $this->assertEquals(250, BankBookEntry::where('bank_name', 'BRAC Bank')->orderBy('id', 'desc')->first()->balance);
    }

    public function test_a_mobile_payment_lands_in_the_mobile_book_under_its_provider(): void
    {
        $invoice = $this->makeInvoice();

        $this->service->processPayment($this->paymentData([
            'amount'          => 300,
            'payment_method'  => 'mobile',
            'mobile_provider' => 'bKash',
            'transaction_id'  => 'TRX-9911',
        ]), $invoice, $this->admin->id);

        $entry = MobileBookEntry::first();

        $this->assertNotNull($entry);
        $this->assertSame('bKash', $entry->provider);
        $this->assertSame('in', $entry->entry_type);
        $this->assertSame('TRX-9911', $entry->transaction_id);
        $this->assertEquals(300, $entry->amount);
        $this->assertEquals(300, $entry->balance);
    }

    // ── Voiding ──────────────────────────────────────────────────────

    public function test_voiding_a_bank_payment_writes_the_reversal_to_the_same_bank(): void
    {
        $invoice = $this->makeInvoice();

        $payment = $this->service->processPayment($this->paymentData([
            'amount' => 400, 'payment_method' => 'bank', 'bank_name' => 'City Bank',
        ]), $invoice, $this->admin->id);

        $this->service->voidPayment($payment->fresh(), $this->admin->id);

        $reversal = BankBookEntry::orderBy('id', 'desc')->first();
        $this->assertSame('out', $reversal->entry_type);
        $this->assertSame('City Bank', $reversal->bank_name);
        $this->assertEquals(400, $reversal->amount);
        $this->assertEquals(0, $reversal->balance);

        $this->assertTrue((bool) $payment->fresh()->is_archived);
        $this->assertEquals(1000, $invoice->fresh()->due_amount);
        $this->assertSame('unpaid', $invoice->fresh()->payment_status);
    }

    /**
     * Documents a known, deliberate simplification rather than asserting it
     * is correct: voiding only reverses the cash, so a waived discount stays
     * applied and the invoice keeps showing it as settled.
     *
     * The service says as much in a comment at PaymentService::voidPayment().
     * Reversing it would need the per-payment discount stored on the payment
     * row, which it currently is not. If that is ever implemented this test
     * will fail — which is the point: it should be changed deliberately, not
     * discovered in production.
     */
    public function test_voiding_a_payment_leaves_its_waived_discount_applied(): void
    {
        $invoice = $this->makeInvoice(1000);

        $payment = $this->service->processPayment(
            $this->paymentData(['amount' => 400, 'discount_amount' => 100]),
            $invoice,
            $this->admin->id
        );

        $this->assertEquals(500, $invoice->fresh()->due_amount);

        $this->service->voidPayment($payment->fresh(), $this->admin->id);

        $after = $invoice->fresh();
        $this->assertEquals(0, $after->paid_amount);
        // Current behaviour: 1000 - 0 paid - 100 still-waived = 900, not 1000.
        $this->assertEquals(100, $after->discount_amount);
        $this->assertEquals(900, $after->due_amount);
    }

    // ── Transferring ─────────────────────────────────────────────────

    public function test_transferring_a_payment_moves_it_to_the_target_invoice(): void
    {
        $source = $this->makeInvoice(1000, 'INV-2026-0001');
        $target = $this->makeInvoice(1000, 'INV-2026-0002');

        $original = $this->service->processPayment(
            $this->paymentData(['amount' => 400]),
            $source,
            $this->admin->id
        );

        $moved = $this->service->transferPayment($original->fresh(), $target, $this->admin->id, 'Applied to wrong invoice');

        // Source is back to untouched.
        $this->assertEquals(0, $source->fresh()->paid_amount);
        $this->assertEquals(1000, $source->fresh()->due_amount);
        $this->assertSame('unpaid', $source->fresh()->payment_status);
        $this->assertTrue((bool) $original->fresh()->is_archived);

        // Target now carries the money, under a new payment number.
        $this->assertSame($target->id, $moved->invoice_id);
        $this->assertEquals(400, $moved->amount);
        $this->assertNotSame($original->payment_number, $moved->payment_number);
        $this->assertEquals(400, $target->fresh()->paid_amount);
        $this->assertEquals(600, $target->fresh()->due_amount);
        $this->assertSame('partial', $target->fresh()->payment_status);
    }

    public function test_a_transfer_records_where_the_payment_came_from(): void
    {
        $source = $this->makeInvoice(1000, 'INV-2026-0001');
        $target = $this->makeInvoice(1000, 'INV-2026-0002');

        $original = $this->service->processPayment($this->paymentData(['amount' => 400]), $source, $this->admin->id);
        $moved    = $this->service->transferPayment($original->fresh(), $target, $this->admin->id, 'Wrong invoice');

        $this->assertStringContainsString($original->payment_number, $moved->notes);
        $this->assertStringContainsString('Wrong invoice', $moved->notes);
    }

    public function test_a_transfer_carries_the_original_payment_method_across(): void
    {
        $source = $this->makeInvoice(1000, 'INV-2026-0001');
        $target = $this->makeInvoice(1000, 'INV-2026-0002');

        $original = $this->service->processPayment($this->paymentData([
            'amount'          => 300,
            'payment_method'  => 'mobile',
            'mobile_provider' => 'Nagad',
            'transaction_id'  => 'TRX-1',
        ]), $source, $this->admin->id);

        $moved = $this->service->transferPayment($original->fresh(), $target, $this->admin->id);

        $this->assertSame('mobile', $moved->payment_method);
        $this->assertSame('Nagad', $moved->mobile_provider);

        // Void-out then pay-in on the same provider nets back to the amount.
        $entries = MobileBookEntry::where('provider', 'Nagad')->orderBy('id')->get();
        $this->assertSame(['in', 'out', 'in'], $entries->pluck('entry_type')->all());
        $this->assertEquals(300, $entries->last()->balance);
    }

    /** The customer's overall position must not move just because the money did. */
    public function test_a_transfer_leaves_the_customer_ledger_balance_unchanged(): void
    {
        $source = $this->makeInvoice(1000, 'INV-2026-0001');
        $target = $this->makeInvoice(1000, 'INV-2026-0002');

        $original = $this->service->processPayment($this->paymentData(['amount' => 400]), $source, $this->admin->id);

        $balanceBefore = CustomerLedger::where('customer_id', $this->customer->id)
            ->orderBy('id', 'desc')->first()->balance;

        $this->service->transferPayment($original->fresh(), $target, $this->admin->id);

        $balanceAfter = CustomerLedger::where('customer_id', $this->customer->id)
            ->orderBy('id', 'desc')->first()->balance;

        $this->assertEquals($balanceBefore, $balanceAfter);
    }
}
