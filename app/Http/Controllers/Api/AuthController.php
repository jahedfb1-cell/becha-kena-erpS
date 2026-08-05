<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
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
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        if (!Auth::attempt($request->only('email', 'password'))) {
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
