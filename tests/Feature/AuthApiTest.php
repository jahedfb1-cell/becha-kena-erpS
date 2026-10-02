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

    private function makeUser(string $email = 'sec@example.com', string $password = 'password123'): User
    {
        $user = User::create([
            'name'      => 'Sec User',
            'email'     => $email,
            'password'  => Hash::make($password),
            'role'      => 'salesman',
            'is_active' => true,
            'phone'     => '01700000'.random_int(100, 999),
        ]);
        $user->assignRole('salesman');

        return $user;
    }

    public function test_login_is_blocked_after_five_wrong_passwords(): void
    {
        $this->makeUser();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'sec@example.com', 'password' => 'wrong'])
                ->assertStatus(401);
        }

        // Sixth try is throttled - even with the right password.
        $this->postJson('/api/auth/login', ['email' => 'sec@example.com', 'password' => 'password123'])
            ->assertStatus(429)
            ->assertJsonPath('success', false)
            ->assertJsonPath('data', null)
            ->assertHeader('Retry-After');
    }

    public function test_throttle_is_per_account_so_another_user_can_still_log_in(): void
    {
        $this->makeUser('victim@example.com');
        $this->makeUser('other@example.com');

        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'victim@example.com', 'password' => 'wrong']);
        }

        $this->postJson('/api/auth/login', ['email' => 'other@example.com', 'password' => 'password123'])
            ->assertOk();
    }

    public function test_forgot_password_is_throttled(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])->assertOk();
        }

        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])->assertStatus(429);
    }

    public function test_login_tokens_now_expire(): void
    {
        $this->assertSame(60 * 24 * 30, (int) config('sanctum.expiration'));

        $user = $this->makeUser();
        $token = $user->createToken('t');
        $this->assertNotNull($token->accessToken->id);

        \DB::table('personal_access_tokens')->where('id', $token->accessToken->id)
            ->update(['created_at' => now()->subDays(31)]);

        $this->withHeader('Authorization', 'Bearer '.$token->plainTextToken)
            ->getJson('/api/auth/me')
            ->assertStatus(401);
    }

    public function test_changing_password_signs_out_other_devices_but_not_this_one(): void
    {
        $user = $this->makeUser();
        $phone = $user->createToken('phone')->plainTextToken;
        $laptop = $user->createToken('laptop')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$laptop)
            ->postJson('/api/auth/change-password', [
                'old_password'          => 'password123',
                'new_password'          => 'NewPassw0rd!',
                'new_password_confirmation' => 'NewPassw0rd!',
            ])->assertOk();

        $this->assertSame(1, $user->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$laptop)->getJson('/api/auth/me')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$phone)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_security_headers_are_sent_and_php_is_not_advertised(): void
    {
        $response = $this->getJson('/up');

        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertNull($response->headers->get('X-Powered-By'));
    }

    public function test_cors_no_longer_allows_every_origin(): void
    {
        $this->assertNotContains('*', config('cors.allowed_origins'));
        $this->assertContains('https://dhakablinds.shop', config('cors.allowed_origins'));
    }
}
