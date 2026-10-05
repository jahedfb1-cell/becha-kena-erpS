<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Creates the first admin account when it does not exist yet. An existing
 * account is never touched - its password, name and role stay as they are.
 *
 * Outside local/testing the email and password must come from the
 * environment (ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD); without them the
 * seeder creates nothing, so a production database never gets an admin
 * account with the well-known development password.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $isDev = app()->environment(['local', 'testing']);

        $email = env('ADMIN_SEED_EMAIL', $isDev ? 'admin@bechakenarp.com' : null);
        $password = env('ADMIN_SEED_PASSWORD', $isDev ? 'Admin@1234' : null);

        if (!$email || !$password) {
            $this->command?->warn('AdminUserSeeder skipped: set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD to create the first admin.');

            return;
        }

        $admin = User::firstOrCreate(
            ['email' => $email],
            [
                'name'        => 'System Admin',
                'password'    => Hash::make($password),
                'role'        => 'admin',
                'phone'       => env('ADMIN_SEED_PHONE', '01700000000'),
                'is_active'   => true,
                'is_archived' => false,
            ]
        );

        if (!$admin->hasRole('admin')) {
            $admin->assignRole('admin');
        }
    }
}
