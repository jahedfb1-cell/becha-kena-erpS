<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Prepares the roles for the permission checks now placed on the settings,
 * purchase, expense and delivery-challan routes, which until now only needed
 * a login (a salesman could, for example, record a supplier payment).
 *
 * Nobody loses access they use today:
 *
 * - `expenses:archive` is new (archiving an expense had no permission of its
 *   own). It goes to every role that can already record expenses.
 * - The manager sees the Purchases page and works it today, so the manager
 *   gets `purchase_entries:view` and `purchase_entries:create`, which the
 *   purchase routes now require.
 *
 * Additive and idempotent: firstOrCreate for the permission, givePermissionTo
 * (never syncPermissions) for the non-admin roles, so whatever an admin has
 * tuned in Access Setup stays. Admin is given every web permission. Model
 * instances throughout - the default auth guard is sanctum while roles and
 * permissions live on web, so a plain string would resolve the wrong guard.
 */
return new class extends Migration
{
    public function up(): void
    {
        $archive = Permission::firstOrCreate(['name' => 'expenses:archive', 'guard_name' => 'web']);

        $web = fn (string $name) => Permission::where('name', $name)->where('guard_name', 'web')->first();
        $role = fn (string $name) => Role::where('name', $name)->where('guard_name', 'web')->first();

        // Whoever can record an expense can also archive one.
        $create = $web('expenses:create');
        if ($create) {
            foreach (Role::where('guard_name', 'web')->get() as $r) {
                if ($r->hasPermissionTo($create)) {
                    $r->givePermissionTo($archive);
                }
            }
        }

        // The manager already runs the Purchases page.
        $purchasePermissions = array_values(array_filter([
            $web('purchase_entries:view'),
            $web('purchase_entries:create'),
        ]));
        if ($purchasePermissions) {
            $role('manager')?->givePermissionTo($purchasePermissions);
        }

        $role('admin')?->givePermissionTo(Permission::where('guard_name', 'web')->get());

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::where('name', 'expenses:archive')->where('guard_name', 'web')->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
