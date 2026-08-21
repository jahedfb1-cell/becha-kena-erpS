<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $salesmen = [
            [
                'name' => 'Al Meheraj',
                'email' => 'meheraj@dhakablinds.shop',
                'phone' => '+8801876989658',
                'password' => '1TZYrZdeC9n4t9',
                'role' => 'salesman',
            ],
            [
                'name' => 'Nurul Absar',
                'email' => 'absar@dhakablinds.shop',
                'phone' => '+8801641667557',
                'password' => 'cC40i8BzhAvJuM',
                'role' => 'salesman',
            ],
        ];

        foreach ($salesmen as $data) {
            $user = User::where('email', $data['email'])
                ->orWhere('phone', $data['phone'])
                ->first();

            if ($user) {
                $user->update([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'phone' => $data['phone'],
                    'password' => Hash::make($data['password']),
                    'role' => $data['role'],
                    'is_active' => true,
                    'is_archived' => false,
                ]);
            } else {
                $user = User::create([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'phone' => $data['phone'],
                    'password' => Hash::make($data['password']),
                    'role' => $data['role'],
                    'is_active' => true,
                    'is_archived' => false,
                ]);
            }

            try {
                $user->syncRoles([$data['role']]);
            } catch (\Throwable $e) {
                // Ignore if spatie table not populated yet
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        User::whereIn('email', [
            'meheraj@dhakablinds.shop',
            'absar@dhakablinds.shop',
        ])->delete();
    }
};
