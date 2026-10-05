<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Invoice;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Seeding a live database must be harmless: reference data only, no demo
 * sales, no admin with the development password, and no undoing of role
 * permissions the business has changed in Admin Access.
 */
class SeederSafetyTest extends TestCase
{
    use RefreshDatabase;

    private function asProduction(): void
    {
        $this->app['env'] = 'production';
    }

    /** Exactly how it would be run on the live server. */
    private function seedForced(string $class): void
    {
        $this->artisan('db:seed', ['--class' => $class, '--force' => true])->assertExitCode(0);
    }

    public function test_full_seed_in_production_adds_reference_data_but_no_demo_data_or_default_admin(): void
    {
        $this->asProduction();

        $this->seedForced(DatabaseSeeder::class);

        $this->assertTrue(Role::where('name', 'admin')->exists());
        $this->assertGreaterThan(0, CustomerCategory::count());
        $this->assertSame(0, Customer::count(), 'demo customers must not be seeded in production');
        $this->assertSame(0, Invoice::count(), 'demo invoices must not be seeded in production');
        $this->assertFalse(
            User::withoutGlobalScopes()->where('email', 'admin@bechakenarp.com')->exists(),
            'no admin with the development password in production'
        );
    }

    public function test_demo_seeder_refuses_to_run_in_production_even_when_called_directly(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->asProduction();

        $this->seedForced(DemoDataSeeder::class);

        $this->assertSame(0, Customer::count());
    }

    public function test_reseeding_production_keeps_permissions_changed_in_admin_access(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        // The business changes the salesman role through Admin Access.
        $salesman = Role::findByName('salesman', 'web');
        $salesman->givePermissionTo('reports:view-sales');
        $salesman->revokePermissionTo('price_lists:archive');

        $this->asProduction();
        $this->seedForced(RolesAndPermissionsSeeder::class);

        $salesman = Role::findByName('salesman', 'web')->fresh();
        $this->assertTrue($salesman->hasPermissionTo('reports:view-sales'));
        $this->assertFalse($salesman->hasPermissionTo('price_lists:archive'));
    }

    public function test_existing_admin_password_is_never_overwritten(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create(['email' => 'admin@bechakenarp.com', 'role' => 'admin', 'password' => bcrypt('MyOwnSecret#1')]);

        $this->seed(DatabaseSeeder::class); // local/testing: would create the admin if missing

        $this->assertTrue(password_verify('MyOwnSecret#1', $admin->fresh()->password));
    }
}
