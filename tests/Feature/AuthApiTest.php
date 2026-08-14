<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed roles and permissions
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_user_can_login_with_correct_credentials()
    {
        $user = User::create([
            'name'      => 'Test User',
            'email'     => 'test@example.com',
            'password'  => Hash::make('password123'),
            'role'      => 'salesman',
            'is_active' => true,
            'phone'     => '01711223344',
        ]);
        $user->assignRole('salesman');

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'test@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'access_token',
                    'token_type',
                    'user' => [
                        'id',
                        'name',
                        'email',
                        'role',
                        'roles',
                        'permissions'
                    ]
                ],
                'errors'
            ])
            ->assertJson([
                'success' => true,
                'message' => 'Login successful.'
            ]);

        $this->assertDatabaseHas('audit_logs', [
            'user_id'     => $user->id,
            'action_type' => 'login',
            'module'      => 'Auth',
        ]);
    }

    public function test_login_validation_errors()
    {
        $response = $this->postJson('/api/auth/login', []);

        $response->assertStatus(422)
            ->assertJsonStructure([
                'success',
                'message',
                'data',
                'errors' => [
                    'email',
                    'password'
                ]
            ])
            ->assertJson([
                'success' => false,
                'message' => 'The given data was invalid.'
            ]);
    }

    public function test_authenticated_user_can_get_profile()
    {
        $user = User::create([
            'name'      => 'Test User',
            'email'     => 'test@example.com',
            'password'  => Hash::make('password123'),
            'role'      => 'salesman',
            'is_active' => true,
            'phone'     => '01711223344',
        ]);
        $user->assignRole('salesman');

        $token = $user->createToken('test_token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'User profile retrieved.',
                'data' => [
                    'email' => 'test@example.com',
                    'role'  => 'salesman'
                ]
            ]);
    }

    public function test_user_can_change_password()
    {
        $user = User::create([
            'name'      => 'Test User',
            'email'     => 'test@example.com',
            'password'  => Hash::make('oldpassword123'),
            'role'      => 'salesman',
            'is_active' => true,
            'phone'     => '01711223344',
        ]);
        $user->assignRole('salesman');

        $token = $user->createToken('test_token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/auth/change-password', [
            'old_password'              => 'oldpassword123',
            'new_password'              => 'newpassword123',
            'new_password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Password updated successfully.'
            ]);

        $this->assertTrue(Hash::check('newpassword123', $user->refresh()->password));

        $this->assertDatabaseHas('audit_logs', [
            'user_id'     => $user->id,
            'action_type' => 'update',
            'module'      => 'Auth',
        ]);
    }
}
