<?php

namespace Tests\Feature;

use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Regression test for 2026_08_19_000004_add_price_list_permissions.
 *
 * Every other price-list test authenticates through
 * RolesAndPermissionsSeeder, which lists the price_lists:* permissions
 * directly — so it would pass even if this migration's own grant logic
 * were silently broken, exactly what happened on the first production
 * deploy: `Illuminate\Database\Eloquent\Collection::only()` is overridden
 * to filter by each model's primary key, not by keyBy()'s custom keys, so
 * `$byName->only($names)` where $names held permission *name* strings
 * matched nothing. The migration reported DONE, admin (reached via a plain
 * ->get(), no ->only()) ended up correct, and manager/salesman silently
 * got nothing — caught only by inspecting role_has_permissions directly
 * after a real deploy, not by any test.
 *
 * This exercises the actual scenario the migration exists for: an install
 * where the roles already exist (as they do in production, unlike a fresh
 * RefreshDatabase run where the migration is a no-op because the seeder
 * hasn't created the roles yet). It seeds first, strips the price_lists
 * grants the seeder happened to also list, then re-runs the migration's
 * up() directly and asserts the grants land — pinning the fix, not just
 * the seeder's independent copy of the same permission list.
 */
class PriceListPermissionsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_grants_price_list_permissions_to_existing_roles(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        // Simulate the real pre-deploy state: roles that predate this
        // permission set, so the seeder's own listing of them isn't what
        // this test is proving works.
        $priceListPermissionNames = [
            'price_lists:create',
            'price_lists:view-team',
            'price_lists:view-all',
            'price_lists:archive',
        ];

        foreach (['manager', 'salesman'] as $roleName) {
            $role = Role::where('name', $roleName)->where('guard_name', 'web')->first();
            $role->revokePermissionTo(
                Permission::whereIn('name', $priceListPermissionNames)->get()
            );
        }

        $manager = Role::where('name', 'manager')->where('guard_name', 'web')->first();
        $salesman = Role::where('name', 'salesman')->where('guard_name', 'web')->first();

        $this->assertFalse($manager->hasPermissionTo('price_lists:create'), 'setup: stripped from manager');
        $this->assertFalse($salesman->hasPermissionTo('price_lists:create'), 'setup: stripped from salesman');

        // Migrations return an anonymous class; requiring the file again
        // hands back that same instance so its up() can be invoked directly,
        // the same as Laravel's migrator does.
        $migration = require database_path('migrations/2026_08_19_000004_add_price_list_permissions.php');
        $migration->up();

        $manager->refresh();
        $salesman->refresh();

        $this->assertTrue($manager->hasPermissionTo('price_lists:create'));
        $this->assertTrue($manager->hasPermissionTo('price_lists:view-team'));
        $this->assertTrue($manager->hasPermissionTo('price_lists:archive'));
        $this->assertFalse($manager->hasPermissionTo('price_lists:view-all'), 'manager should not gain view-all');

        $this->assertTrue($salesman->hasPermissionTo('price_lists:create'));
        $this->assertTrue($salesman->hasPermissionTo('price_lists:archive'));
        $this->assertFalse($salesman->hasPermissionTo('price_lists:view-team'), 'salesman should not gain view-team');
        $this->assertFalse($salesman->hasPermissionTo('price_lists:view-all'), 'salesman should not gain view-all');
    }

    /**
     * Idempotency matters here specifically because the migration cannot be
     * "rerun" on an install where it already executed (Laravel won't repeat
     * a completed migration) — the only way to correct a broken grant in
     * production was calling up() again by hand, exactly as this test does.
     * A second call must not error and must not duplicate rows.
     */
    public function test_migration_is_safe_to_run_twice(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $migration = require database_path('migrations/2026_08_19_000004_add_price_list_permissions.php');
        $migration->up();
        $migration->up();

        $manager = Role::where('name', 'manager')->where('guard_name', 'web')->first();
        $this->assertTrue($manager->hasPermissionTo('price_lists:create'));

        $permission = Permission::where('name', 'price_lists:create')->where('guard_name', 'web')->first();
        $rowCount = \DB::table('role_has_permissions')
            ->where('permission_id', $permission->id)
            ->where('role_id', $manager->id)
            ->count();
        $this->assertSame(1, $rowCount, 'a repeat grant must not duplicate the pivot row');
    }
}
