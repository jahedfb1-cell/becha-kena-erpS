<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Invoice;
use App\Models\Quotation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Validation and the permission that guards it live in FormRequest classes
 * (app/Http/Requests). The controller never runs for a refused or invalid
 * request, so these check the three outcomes a client sees: refused (403,
 * the API's usual envelope), invalid (422 with the field errors), and valid
 * (the same behaviour as before the move).
 */
class FormRequestsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $salesman;
    private User $staff;
    private Quotation $quote;
    private Invoice $invoice;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = $this->makeUser('admin', '01711000001');
        $this->salesman = $this->makeUser('salesman', '01711000002');
        $this->staff = $this->makeUser('staff', '01711000003');

        $category = CustomerCategory::create(['name' => 'Retail', 'created_by' => $this->admin->id]);
        $customer = Customer::create(['customer_category_id' => $category->id, 'customer_code' => 'C1', 'name' => 'C', 'phone' => '017', 'created_by' => $this->admin->id]);
        $this->quote = Quotation::create(['quotation_number' => 'QT-2026-0001', 'customer_id' => $customer->id, 'salesman_id' => $this->salesman->id, 'status' => 'pending_approval', 'subtotal' => 1000, 'net_amount' => 1000, 'created_by' => $this->admin->id]);
        $this->invoice = Invoice::create(['invoice_number' => 'INV-2026-0001', 'quotation_id' => $this->quote->id, 'customer_id' => $customer->id, 'subtotal' => 1000, 'grand_total' => 1000, 'due_amount' => 1000, 'invoice_date' => now()->toDateString(), 'created_by' => $this->admin->id]);
    }

    private function makeUser(string $role, string $phone): User
    {
        $user = User::factory()->create(['role' => $role, 'phone' => $phone, 'is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    private function as(User $user): self
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user, 'sanctum');
    }

    /** @return array<int, array{0: string, 1: string, 2: string}> verb, uri, role that lacks the permission */
    private function guardedByAuthorize(): array
    {
        return [
            ['POST', '/api/access-setup/update', 'salesman'],
            ['POST', '/api/company-profile', 'salesman'],
            ['POST', '/api/mushak/issue/1', 'salesman'],
            ['DELETE', '/api/mushak/1', 'salesman'],
            ['POST', "/api/quotations/{$this->quote->id}/reject", 'salesman'],
            ['POST', "/api/quotations/{$this->quote->id}/advance-payments", 'staff'],
            ['POST', '/api/users', 'salesman'],
            ['PUT', '/api/users/1', 'salesman'],
            ['POST', '/api/vouchers', 'salesman'],
            ['POST', '/api/price-lists', 'staff'],
            ['PUT', '/api/price-lists/1', 'staff'],
        ];
    }

    public function test_a_user_without_the_permission_is_refused_with_the_usual_403_envelope(): void
    {
        foreach ($this->guardedByAuthorize() as [$verb, $uri, $role]) {
            $user = $role === 'staff' ? $this->staff : $this->salesman;
            // A valid-looking body: refusal must come before validation looks at it.
            $res = $this->as($user)->json($verb, $uri, []);

            $res->assertStatus(403)
                ->assertJsonPath('success', false)
                ->assertJsonPath('data', null)
                ->assertJsonPath('errors', null);
            $this->assertNotEmpty($res->json('message'), "$verb $uri");
        }
    }

    public function test_voucher_refusal_keeps_its_own_wording_and_is_no_longer_a_server_error(): void
    {
        // forbiddenResponse() was never defined, so this used to be a 500.
        $this->as($this->salesman)->postJson('/api/vouchers', [])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Only system administrators can create manual accounting vouchers.');

        $voucherId = \App\Models\Voucher::create(['voucher_number' => 'VOU-2026-0001', 'voucher_type' => 'debit', 'date' => now()->toDateString(), 'description' => 'x', 'total_amount' => 5, 'payment_method' => 'cash', 'created_by' => $this->admin->id])->id;
        $this->as($this->salesman)->deleteJson("/api/vouchers/{$voucherId}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'Only system administrators can archive vouchers.');
    }

    public function test_authorized_but_invalid_input_gets_a_422_naming_the_fields(): void
    {
        $this->as($this->admin)->postJson('/api/users', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'phone', 'password', 'role'], 'errors');

        $this->as($this->admin)->postJson('/api/users', ['name' => 'X', 'phone' => '01711000009', 'password' => '123', 'role' => 'wizard'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password', 'role'], 'errors');

        $this->as($this->admin)->postJson('/api/price-lists', ['issue_date' => 'nope', 'items' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['issue_date', 'items'], 'errors');

        $this->as($this->admin)->postJson('/api/payments', ['invoice_id' => $this->invoice->id, 'amount' => 10, 'payment_method' => 'bank'])
            ->assertStatus(422);

        $this->as($this->admin)->postJson('/api/settings/units', [])
            ->assertStatus(422)
            ->assertJsonPath('message', 'The given data was invalid.');
    }

    public function test_valid_input_behaves_as_before(): void
    {
        // users: create, then edit (unique phone ignores the user's own row)
        $id = $this->as($this->admin)->postJson('/api/users', ['name' => 'New Hand', 'phone' => '01711000010', 'password' => 'secret1', 'role' => 'salesman'])
            ->assertStatus(201)->json('data.id');
        $this->as($this->admin)->putJson("/api/users/{$id}", ['phone' => '01711000010', 'name' => 'Renamed'])
            ->assertOk()->assertJsonPath('data.name', 'Renamed');
        $this->as($this->admin)->putJson("/api/users/{$id}", ['phone' => '01711000001'])
            ->assertStatus(422)->assertJsonValidationErrors('phone', 'errors');

        // ...each user change is written to the audit log (this used to throw a
        // TypeError and answer 500, so no user could be created or edited)
        foreach (['create' => 'Created user account New Hand', 'update' => 'Updated user account Renamed'] as $action => $text) {
            $this->assertTrue(AuditLog::where('action_type', $action)->where('module', User::class)->where('reference_id', $id)->where('description', 'like', "%{$text}%")->exists(), "audit log: $action");
        }
        $this->as($this->admin)->deleteJson("/api/users/{$id}")->assertOk();
        $this->assertTrue(AuditLog::where('action_type', 'archive')->where('module', User::class)->where('reference_id', $id)->exists());
        $this->assertFalse((bool) User::find($id)->is_active);

        // settings + categories
        $this->as($this->admin)->postJson('/api/settings/units', ['name' => 'Bundle', 'code' => 'bdl'])->assertStatus(201);
        $this->as($this->admin)->postJson('/api/settings/departments', ['name' => 'Packing'])->assertStatus(201);
        $catId = $this->as($this->admin)->postJson('/api/master/product-categories', ['name' => 'Rollers'])->assertStatus(201)->json('data.id');
        $this->as($this->admin)->putJson("/api/master/product-categories/{$catId}", ['name' => 'Rollers'])->assertOk();

        // price list
        $this->as($this->admin)->postJson('/api/price-lists', [
            'issue_date' => now()->toDateString(),
            'items'      => [['product_name' => 'Zebra', 'rate' => 120]],
        ])->assertStatus(201);

        // reject a quotation with a reason
        $this->as($this->admin)->postJson("/api/quotations/{$this->quote->id}/reject", ['rejection_reason' => 'Out of budget'])->assertOk();
    }
}
