<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Lets every role open and raise a courier booking slip.
 *
 * The courier endpoints originally borrowed the delivery-challan permissions,
 * which only admin, manager and staff hold — so a salesman got 403 on every
 * courier call and the slip simply would not open for them. Widening
 * `challans:view` instead would have been the wrong fix: that would also hand
 * out delivery challans, a separate document with its own deliberate policy.
 *
 * So the courier slip gets permissions of its own, granted to all four roles.
 * Anyone who can see an order can now book it to the courier, which is the
 * point: the slip is a packing document, filled in by whoever is packing.
 *
 * Everything here is additive and idempotent — firstOrCreate for the
 * permissions, givePermissionTo (never syncPermissions) for the non-admin
 * roles — because the Access Setup screen writes role permissions through
 * sync(), and re-running the seeder would wipe whatever an admin has tuned
 * there. Admin is re-synced to the full set deliberately, that role being
 * defined as "everything".
 *
 * Roles may not exist yet on a fresh database (the seeder runs afterwards),
 * hence the null-safe calls.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'courier_bookings:view',
        'courier_bookings:generate',
    ];

    private const ROLES = ['admin', 'manager', 'salesman', 'staff'];

    public function up(): void
    {
        foreach (self::PERMISSIONS as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        // Model instances, never plain strings: the app's default auth guard
        // is `sanctum` while roles and permissions live on `web`, so a string
        // would resolve against the wrong guard and throw.
        $byName = Permission::whereIn('name', self::PERMISSIONS)
            ->where('guard_name', 'web')
            ->get()
            ->keyBy('name');

        // array_map over the plain names rather than $byName->only(...):
        // on an Eloquent Collection, only() filters by primary key, not by
        // the keys keyBy() just set, and so silently grants nothing.
        $permissions = array_values(array_filter(
            array_map(fn ($n) => $byName->get($n), self::PERMISSIONS)
        ));

        foreach (self::ROLES as $role) {
            Role::where('name', $role)
                ->where('guard_name', 'web')
                ->first()
                ?->givePermissionTo($permissions);
        }

        Role::where('name', 'admin')
            ->where('guard_name', 'web')
            ->first()
            ?->syncPermissions(Permission::where('guard_name', 'web')->get());

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::whereIn('name', self::PERMISSIONS)->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
