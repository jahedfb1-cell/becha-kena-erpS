<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $admin = User::firstOrCreate(
            ['email' => 'admin@bechakenarp.com'],
            [
                'name'        => 'System Admin',
                'password'    => Hash::make('Admin@1234'),
                'role'        => 'admin',
                'phone'       => '01700000000',
                'is_active'   => true,
                'is_archived' => false,
            ]
        );

        // Assign Spatie Role
        $admin->assignRole('admin');
    }
}
