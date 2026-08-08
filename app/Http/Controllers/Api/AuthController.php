<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Traits\ApiResponse;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    use ApiResponse;

    /**
     * Authenticate a user and return a Sanctum token.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|string',
            'password' => 'required|string',
        ]);

        $loginInput = trim($request->input('email'));
        $fieldType = filter_var($loginInput, FILTER_VALIDATE_EMAIL) ? 'email' : 'phone';

        if (!Auth::attempt([$fieldType => $loginInput, 'password' => $request->password])) {
            return $this->errorResponse('Invalid login credentials.', 401);
        }

        $user = Auth::user();

        if (!$user->is_active) {
            Auth::logout();
            return $this->errorResponse('Your account is deactivated. Please contact administrator.', 403);
        }

        // Generate Sanctum token
        $token = $user->createToken('auth_token')->plainTextToken;

        // Retrieve role and permission lists from Spatie Permission
        $roles       = $user->getRoleNames();
        $permissions = $user->getAllPermissions()->pluck('name');

        // Log the login audit event
        AuditLog::create([
            'user_id'     => $user->id,
            'user_name'   => $user->name,
            'action_type' => 'login',
            'module'      => 'Auth',
            'description' => "User logged in from IP: " . $request->ip(),
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
        ]);

        return $this->successResponse([
            'access_token' => $token,
            'token_type'   => 'Bearer',
            'user'         => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'role'       => $user->role,
                'phone'      => $user->phone,
                'is_active'  => $user->is_active,
                'roles'      => $roles,
                'permissions'=> $permissions,
            ]
        ], 'Login successful.');
    }

    /**
     * Send a password reset link email to the given address, if an
     * account exists for it. Always responds with a generic success
     * message regardless of whether the account exists, so this
     * endpoint can't be used to probe which emails are registered.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $status = PasswordBroker::sendResetLink(
            $request->only('email')
        );

        if ($status === PasswordBroker::RESET_LINK_SENT) {
            $targetUser = User::where('email', $request->email)->first();

            AuditLog::create([
                'user_id'     => $targetUser?->id,
                'user_name'   => $targetUser?->name ?? $request->email,
                'action_type' => 'update',
                'module'      => 'Auth',
                'description' => "Password reset link requested for: {$request->email}",
                'ip_address'  => $request->ip(),
                'user_agent'  => $request->userAgent(),
            ]);
        }

        // Always return the same generic message, whether or not the
        // account exists — don't leak which emails are registered.
        return $this->successResponse(null, 'If an account exists for that email, a password reset link has been sent.');
    }

    /**
     * Reset a password using the token emailed by forgotPassword().
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token'    => 'required|string',
            'email'    => 'required|email',
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
        ]);

        $status = PasswordBroker::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                ])->save();

                event(new PasswordReset($user));

                AuditLog::create([
                    'user_id'     => $user->id,
                    'user_name'   => $user->name,
                    'action_type' => 'update',
                    'module'      => 'Auth',
                    'reference_id' => $user->id,
                    'description' => 'Password reset via emailed reset link.',
                    'ip_address'  => request()->ip(),
                    'user_agent'  => request()->userAgent(),
                ]);
            }
        );

        if ($status !== PasswordBroker::PASSWORD_RESET) {
            return $this->errorResponse(__($status), 400);
        }

        return $this->successResponse(null, 'Password has been reset successfully. You can now log in.');
    }

    /**
     * Revoke the current user's authenticated Sanctum token.
     */
    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        // Log the logout audit event before revoking the token
        AuditLog::create([
            'user_id'     => $user->id,
            'user_name'   => $user->name,
            'action_type' => 'logout',
            'module'      => 'Auth',
            'description' => 'User logged out.',
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
        ]);

        // Revoke the current token
        $user->currentAccessToken()->delete();

        return $this->successResponse(null, 'Logout successful.');
    }

    /**
     * Retrieve the authenticated user's profile info along with role and permissions.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $roles = $user->getRoleNames();
        $permissions = $user->getAllPermissions()->pluck('name');

        return $this->successResponse([
            'id'          => $user->id,
            'name'        => $user->name,
            'email'       => $user->email,
            'role'        => $user->role,
            'phone'       => $user->phone,
            'is_active'   => $user->is_active,
            'roles'       => $roles,
            'permissions' => $permissions,
        ], 'User profile retrieved.');
    }

    /**
     * Update the authenticated user's password.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'old_password' => 'required|string',
            'new_password' => ['required', 'string', 'confirmed', Password::min(8)],
        ]);

        $user = $request->user();

        if (!Hash::check($request->old_password, $user->password)) {
            return $this->errorResponse('Validation error.', 422, [
                'old_password' => ['The provided current password does not match our records.']
            ]);
        }

        // Update the password
        $user->update([
            'password' => Hash::make($request->new_password)
        ]);

        // Log the password change audit event
        AuditLog::create([
            'user_id'          => $user->id,
            'user_name'        => $user->name,
            'action_type'      => 'update',
            'module'           => 'Auth',
            'reference_id'     => $user->id,
            'reference_number' => null,
            'description'      => 'User updated password successfully.',
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse(null, 'Password updated successfully.');
    }

    /**
     * Update authenticated user's profile info (name, email, phone).
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'name'  => 'required|string|max:250',
            'email' => 'required|email|max:250|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|max:30',
        ]);

        $user->update([
            'name'  => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
        ]);

        return $this->successResponse([
            'id'    => $user->id,
            'name'  => $user->name,
            'email' => $user->email,
            'role'  => $user->role,
            'phone' => $user->phone,
        ], 'Profile updated successfully.');
    }
}
