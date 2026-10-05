<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Settings, purchase, expense and delivery-challan endpoints used to need
 * only a login. Each now requires the permission the matching screen already
 * checks. An empty body is enough here: a user who is let through reaches
 * validation (422) or a not-found (404); one who is not gets 403 first.
 */
class FinanceEndpointAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function userWithRole(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    /** [method, uri] pairs a salesman must not reach. */
    private function guardedEndpoints(): array
    {
        return [
            ['post', '/api/settings/balance-transfers'],
            ['get', '/api/settings/balance-transfers'],
            ['post', '/api/settings/units'],
            ['put', '/api/settings/units/999999'],
            ['delete', '/api/settings/units/999999'],
            ['post', '/api/settings/bank-accounts'],
            ['delete', '/api/settings/bank-accounts/999999'],
            ['post', '/api/settings/mobile-accounts'],
            ['delete', '/api/settings/mobile-accounts/999999'],
            ['post', '/api/settings/departments'],
            ['delete', '/api/settings/departments/999999'],
            ['get', '/api/settings/summary'],
            ['post', '/api/settings/pipeline-mode'],
            ['get', '/api/purchases'],
            ['get', '/api/purchases/999999'],
            ['post', '/api/purchases/supplier-payment'],
            ['post', '/api/purchases/mark-received'],
            ['get', '/api/expenses'],
            ['post', '/api/expenses'],
            ['delete', '/api/expenses/999999'],
            ['post', '/api/challans/generate/999999'],
            ['post', '/api/challans/999999/approve'],
            ['post', '/api/challans/999999/send-email'],
            ['delete', '/api/challans/999999'],
            ['post', '/api/master/product-categories'],
            ['put', '/api/master/product-categories/999999'],
            ['delete', '/api/master/product-categories/999999'],
        ];
    }

    public function test_salesman_is_refused_on_every_finance_and_settings_change(): void
    {
        $salesman = $this->userWithRole('salesman');

        foreach ($this->guardedEndpoints() as [$method, $uri]) {
            $this->actingAs($salesman, 'sanctum')
                ->json($method, $uri, [])
                ->assertStatus(403)
                ->assertJsonPath('success', false)
                ->assertJsonPath('message', 'Unauthorized action.');
        }
    }

    public function test_admin_passes_every_permission_check(): void
    {
        $admin = $this->userWithRole('admin');

        foreach ($this->guardedEndpoints() as [$method, $uri]) {
            $status = $this->actingAs($admin, 'sanctum')->json($method, $uri, [])->status();
            $this->assertNotEquals(403, $status, "admin refused on $method $uri");
        }
    }

    public function test_salesman_still_reads_the_lists_the_payment_and_product_forms_need(): void
    {
        $salesman = $this->userWithRole('salesman');

        foreach (['/api/settings/bank-accounts', '/api/settings/mobile-accounts', '/api/settings/units', '/api/master/product-categories', '/api/settings/departments'] as $uri) {
            $this->actingAs($salesman, 'sanctum')->getJson($uri)->assertOk();
        }
    }

    public function test_manager_keeps_the_purchases_page_and_expenses(): void
    {
        $manager = $this->userWithRole('manager');

        $this->actingAs($manager, 'sanctum')->getJson('/api/purchases')->assertOk();
        $this->actingAs($manager, 'sanctum')->postJson('/api/purchases/mark-received', [])->assertStatus(422);
        $this->actingAs($manager, 'sanctum')->getJson('/api/expenses')->assertOk();
        $this->actingAs($manager, 'sanctum')->deleteJson('/api/expenses/999999')->assertStatus(404);
        $this->actingAs($manager, 'sanctum')->postJson('/api/challans/generate/999999')->assertStatus(404);

        // ...but not the admin-only settings.
        $this->actingAs($manager, 'sanctum')->postJson('/api/settings/balance-transfers', [])->assertStatus(403);
    }

    public function test_staff_keeps_expenses_and_challans_but_not_purchases(): void
    {
        $staff = $this->userWithRole('staff');

        $this->actingAs($staff, 'sanctum')->getJson('/api/expenses')->assertOk();
        $this->actingAs($staff, 'sanctum')->deleteJson('/api/expenses/999999')->assertStatus(404);
        $this->actingAs($staff, 'sanctum')->postJson('/api/challans/generate/999999')->assertStatus(404);
        $this->actingAs($staff, 'sanctum')->getJson('/api/purchases')->assertStatus(403);
    }
}
