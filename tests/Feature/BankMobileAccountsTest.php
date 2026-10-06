<?php

namespace Tests\Feature;

use App\Models\BankAccount;
use App\Models\BankBookEntry;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Models\MobileAccount;
use App\Models\MobileBookEntry;
use App\Models\Payment;
use App\Models\Quotation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Money moving through a bank or mobile account is linked to the registered
 * account, and the account's balance is computed from its book lines.
 */
class BankMobileAccountsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Quotation $order;
    private Customer $customer;
    private BankAccount $dbbl;
    private MobileAccount $bkash;
    private int $invoiceSeq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');
        $category = CustomerCategory::create(['name' => 'Retail', 'created_by' => $this->admin->id]);
        $this->customer = Customer::create(['customer_category_id' => $category->id, 'customer_code' => 'CUS-0001', 'name' => 'C', 'phone' => '01700000000', 'created_by' => $this->admin->id]);
        $this->order = Quotation::create(['quotation_number' => 'QT-2026-0001', 'customer_id' => $this->customer->id, 'salesman_id' => $this->admin->id, 'status' => 'approved', 'subtotal' => 100000, 'net_amount' => 100000, 'created_by' => $this->admin->id]);

        // The settings migration already registers these two (opening 5,000 and 1,000).
        $this->dbbl = BankAccount::where('account_number', '110.120.45892')->firstOrFail();
        $this->bkash = MobileAccount::where('account_number', '01629000200')->firstOrFail();
    }

    private function as(): self
    {
        return $this->actingAs($this->admin, 'sanctum');
    }

    private function invoice(float $total = 10000): Invoice
    {
        return Invoice::create(['invoice_number' => 'INV-2026-' . str_pad(++$this->invoiceSeq, 4, '0', STR_PAD_LEFT), 'quotation_id' => $this->order->id, 'customer_id' => $this->customer->id, 'subtotal' => $total, 'grand_total' => $total, 'due_amount' => $total, 'invoice_date' => now()->toDateString(), 'created_by' => $this->admin->id]);
    }

    private function balances(): array
    {
        $accounts = collect($this->as()->getJson('/api/settings/bank-accounts')->assertOk()->json('data'));
        $wallets = collect($this->as()->getJson('/api/settings/mobile-accounts')->assertOk()->json('data'));

        return [
            (float) $accounts->firstWhere('id', $this->dbbl->id)['current_balance'],
            (float) $wallets->firstWhere('id', $this->bkash->id)['current_balance'],
        ];
    }

    public function test_balance_starts_at_the_opening_balance(): void
    {
        $this->assertSame([5000.0, 1000.0], $this->balances());
    }

    public function test_a_bank_payment_is_linked_to_the_chosen_account_and_raises_its_balance(): void
    {
        $id = $this->as()->postJson('/api/payments', [
            'invoice_id' => $this->invoice()->id, 'amount' => 2000, 'payment_method' => 'bank',
            'bank_account_id' => $this->dbbl->id, 'payment_date' => now()->toDateString(),
        ])->assertStatus(201)->json('data.id');

        $payment = Payment::find($id);
        $this->assertSame($this->dbbl->id, (int) $payment->bank_account_id);
        $this->assertSame('Dutch-Bangla Bank', $payment->bank_name);
        $line = BankBookEntry::where('reference_id', $id)->firstOrFail();
        $this->assertSame($this->dbbl->id, (int) $line->bank_account_id);
        $this->assertEquals(7000, $line->balance, 'running balance starts from the opening balance');
        $this->assertSame([7000.0, 1000.0], $this->balances());
    }

    public function test_an_older_client_sending_only_a_bank_name_is_matched_to_the_account(): void
    {
        $id = $this->as()->postJson('/api/payments', [
            'invoice_id' => $this->invoice()->id, 'amount' => 500, 'payment_method' => 'bank',
            'bank_name' => 'dutch-bangla bank', 'payment_date' => now()->toDateString(),
        ])->assertStatus(201)->json('data.id');

        $this->assertSame($this->dbbl->id, (int) Payment::find($id)->bank_account_id);
        $this->assertSame([5500.0, 1000.0], $this->balances());
    }

    public function test_an_unregistered_bank_name_still_records_but_stays_unlinked(): void
    {
        $id = $this->as()->postJson('/api/payments', [
            'invoice_id' => $this->invoice()->id, 'amount' => 300, 'payment_method' => 'bank',
            'bank_name' => 'Some Other Bank', 'payment_date' => now()->toDateString(),
        ])->assertStatus(201)->json('data.id');

        $this->assertNull(Payment::find($id)->bank_account_id);
        $this->assertSame([5000.0, 1000.0], $this->balances());
    }

    public function test_an_archived_or_unknown_account_is_refused(): void
    {
        $this->dbbl->archive($this->admin->id, 'closed');

        $this->as()->postJson('/api/payments', [
            'invoice_id' => $this->invoice()->id, 'amount' => 100, 'payment_method' => 'bank',
            'bank_account_id' => $this->dbbl->id, 'payment_date' => now()->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors('bank_account_id', 'errors');
    }

    public function test_voiding_a_payment_reverses_it_on_the_same_account(): void
    {
        $id = $this->as()->postJson('/api/payments', [
            'invoice_id' => $this->invoice()->id, 'amount' => 1500, 'payment_method' => 'mobile',
            'mobile_account_id' => $this->bkash->id, 'payment_date' => now()->toDateString(),
        ])->assertStatus(201)->json('data.id');
        $this->assertSame([5000.0, 2500.0], $this->balances());

        $this->as()->postJson("/api/payments/{$id}/void")->assertOk();

        $this->assertSame([5000.0, 1000.0], $this->balances());
        $this->assertSame(2, MobileBookEntry::where('mobile_account_id', $this->bkash->id)->count());
        $this->assertSame('bkash', MobileBookEntry::first()->provider);
    }

    public function test_an_advance_payment_is_linked_too(): void
    {
        $this->as()->postJson("/api/quotations/{$this->order->id}/advance-payments", [
            'amount' => 4000, 'payment_method' => 'bank', 'bank_account_id' => $this->dbbl->id, 'payment_date' => now()->toDateString(),
        ])->assertStatus(201);

        $this->assertSame([9000.0, 1000.0], $this->balances());
    }

    public function test_an_expense_lowers_the_account_and_archiving_it_puts_the_money_back(): void
    {
        $cat = ExpenseCategory::create(['name' => 'Rent', 'created_by' => $this->admin->id]);
        $id = $this->as()->postJson('/api/expenses', [
            'expense_category_id' => $cat->id, 'amount' => 1200, 'payment_method' => 'bank',
            'bank_account_id' => $this->dbbl->id, 'expense_date' => now()->toDateString(),
        ])->assertStatus(201)->json('data.id');
        $this->assertSame([3800.0, 1000.0], $this->balances());

        $this->as()->deleteJson("/api/expenses/{$id}")->assertOk();

        $this->assertSame([5000.0, 1000.0], $this->balances());
        $this->assertSame(2, BankBookEntry::where('bank_account_id', $this->dbbl->id)->count(), 'original line kept, reversal added');
    }

    public function test_a_bank_expense_without_an_account_is_refused(): void
    {
        $cat = ExpenseCategory::create(['name' => 'Rent', 'created_by' => $this->admin->id]);
        $this->as()->postJson('/api/expenses', [
            'expense_category_id' => $cat->id, 'amount' => 100, 'payment_method' => 'bank', 'expense_date' => now()->toDateString(),
        ])->assertStatus(422);
    }

    public function test_vouchers_post_to_the_account_and_a_journal_voucher_now_saves(): void
    {
        $this->as()->postJson('/api/vouchers', [
            'voucher_type' => 'credit', 'date' => now()->toDateString(), 'total_amount' => 700, 'description' => 'Cash deposit',
            'payment_method' => 'mobile', 'mobile_account_id' => $this->bkash->id,
        ])->assertStatus(201);
        $this->assertSame([5000.0, 1700.0], $this->balances());

        // Used to fail: it tried to write an "adjustment" line the books do not allow.
        $this->as()->postJson('/api/vouchers', [
            'voucher_type' => 'journal', 'date' => now()->toDateString(), 'total_amount' => 300, 'payment_method' => 'cash', 'description' => 'Reclassify',
        ])->assertStatus(201);
        $this->assertSame([5000.0, 1700.0], $this->balances());
    }

    public function test_a_balance_transfer_moves_money_between_the_two_accounts(): void
    {
        $this->as()->postJson('/api/settings/balance-transfers', [
            'from_account_type' => 'bank', 'from_account_id' => $this->dbbl->id,
            'to_account_type' => 'mobile', 'to_account_id' => $this->bkash->id,
            'amount' => 2000, 'transfer_date' => now()->toDateString(),
        ])->assertStatus(201);

        $this->assertSame([3000.0, 3000.0], $this->balances());
    }

    public function test_a_transfer_needs_the_account_and_cannot_go_to_itself(): void
    {
        $this->as()->postJson('/api/settings/balance-transfers', [
            'from_account_type' => 'bank', 'to_account_type' => 'cash', 'amount' => 10, 'transfer_date' => now()->toDateString(),
        ])->assertStatus(422);

        $this->as()->postJson('/api/settings/balance-transfers', [
            'from_account_type' => 'bank', 'from_account_id' => $this->dbbl->id,
            'to_account_type' => 'bank', 'to_account_id' => $this->dbbl->id, 'amount' => 10, 'transfer_date' => now()->toDateString(),
        ])->assertStatus(422);
    }

    public function test_re_adding_an_archived_account_brings_it_back(): void
    {
        $this->as()->deleteJson("/api/settings/bank-accounts/{$this->dbbl->id}")->assertOk();

        $id = $this->as()->postJson('/api/settings/bank-accounts', [
            'bank_name' => 'Dutch-Bangla Bank', 'account_name' => 'Dhaka Blinds', 'account_number' => '110.120.45892', 'opening_balance' => 5000,
        ])->assertStatus(201)->json('data.id');

        $this->assertSame($this->dbbl->id, $id);
        $this->assertSame([5000.0, 1000.0], $this->balances());
    }

    public function test_accounts_are_archived_not_deleted_and_duplicates_are_refused(): void
    {
        $this->as()->postJson('/api/settings/bank-accounts', [
            'bank_name' => 'dutch-bangla bank', 'account_name' => 'X', 'account_number' => '110.120.45892',
        ])->assertStatus(422);

        $this->as()->postJson('/api/settings/mobile-accounts', [
            'provider' => 'Upay', 'account_number' => '01700000001',
        ])->assertStatus(422);

        $this->as()->deleteJson("/api/settings/bank-accounts/{$this->dbbl->id}")->assertOk();

        $this->assertDatabaseHas('bank_accounts', ['id' => $this->dbbl->id, 'is_archived' => true]);
        $this->assertCount(0, $this->as()->getJson('/api/settings/bank-accounts')->json('data'));
    }
}
