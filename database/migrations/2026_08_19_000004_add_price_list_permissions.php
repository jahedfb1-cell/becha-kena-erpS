<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Grants the price list permissions on an existing installation.
 *
 * RolesAndPermissionsSeeder already lists these, but it must not be the way
 * they reach production: it ends in `syncPermissions()` on every role, and
 * the Access Setup screen writes role permissions through the same call. Any
 * permission an admin has tuned there — a manager given report access, a
 * salesman denied something — would be silently reset to the seeder's
 * hardcoded lists. So deploying this release must not require running it.
 *
 * Everything here is additive and idempotent: firstOrCreate for the
 * permissions, givePermissionTo (never sync) for manager and salesman. Admin
 * is re-synced to the full set deliberately, since that role is defined as
 * "everything" in the seeder too.
 *
 * On a fresh database the roles do not exist yet when this runs — the seeder
 * creates them afterwards — hence the null-safe calls.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'price_lists:create',
        'price_lists:view-team',
        'price_lists:view-all',
        'price_lists:archive',
    ];

    public function up(): void
    {
        foreach (self::PERMISSIONS as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        // Model instances, never plain strings: this app's default auth guard
        // is `sanctum` while every role and permission lives on the `web`
        // guard, so a string would be resolved against the wrong guard and
        // throw PermissionDoesNotExist.
        $byName = Permission::whereIn('name', self::PERMISSIONS)
            ->where('guard_name', 'web')
            ->get()
            ->keyBy('name');

        // Deliberately not $byName->only($names): on an
        // Illuminate\Database\Eloquent\Collection, only() is OVERRIDDEN to
        // filter by each model's primary key (id), not by the collection's
        // array keys — so it silently ignores whatever keyBy('name') did
        // and matches against permission name strings against integer ids,
        // finding nothing. Caught in production: this exact line reached
        // admin fine (a plain ->get() with no ->only()) but silently
        // granted nothing to manager/salesman. array_filter+array_map over
        // the plain $names array sidesteps the Collection method entirely.
        $grant = fn (string $role, array $names) => Role::where('name', $role)
            ->where('guard_name', 'web')
            ->first()
            ?->givePermissionTo(array_values(array_filter(
                array_map(fn ($n) => $byName->get($n), $names)
            )));

        Role::where('name', 'admin')
            ->where('guard_name', 'web')
            ->first()
            ?->syncPermissions(Permission::where('guard_name', 'web')->get());

        // A manager sees their team's sheets; a salesman gets neither
        // view-team nor view-all, which is what makes the controller fall
        // through to "own rows only".
        $grant('manager', ['price_lists:create', 'price_lists:view-team', 'price_lists:archive']);
        $grant('salesman', ['price_lists:create', 'price_lists:archive']);

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::whereIn('name', self::PERMISSIONS)->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
