<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/users
     * Retrieve all active and archived users with optional search/role filters.
     */
    public function index(Request $request): JsonResponse
    {
        $currentUser = $request->user();
        $query = User::with(['manager:id,name,email', 'department:id,name']);

        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        // If Salesman, only see self. If Manager, see self & team. If Admin, see all.
        if ($currentUser->role === 'salesman' || $currentUser->role === 'staff') {
            $query->where('id', $currentUser->id);
        } elseif ($currentUser->role === 'manager') {
            $query->where(function ($q) use ($currentUser) {
                $q->where('id', $currentUser->id)
                  ->orWhere('manager_id', $currentUser->id);
            });
        }

        $users = $query->orderBy('id', 'desc')->get();

        return $this->successResponse($users, 'Users list retrieved successfully.');
    }

    /**
     * POST /api/users
     * Create a new user account with role & manager assignment.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'          => 'required|string|max:255',
            'phone'         => 'required|string|max:20|unique:users,phone',
            'email'         => 'nullable|email|unique:users,email',
            'password'      => 'required|string|min:6',
            'role'          => ['required', Rule::in(['admin', 'manager', 'salesman', 'staff'])],
            'department_id' => 'nullable|exists:departments,id',
            'manager_id'    => 'nullable|exists:users,id',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $user = User::create([
                'name'          => $validated['name'],
                'phone'         => $validated['phone'],
                'email'         => $validated['email'] ?? null,
                'password'      => Hash::make($validated['password']),
                'role'          => $validated['role'],
                'department_id' => $validated['department_id'] ?? null,
                'manager_id'    => $validated['manager_id'] ?? null,
                'is_active'     => true,
                'is_archived'   => false,
            ]);

            // Assign Spatie Role
            $user->assignRole($validated['role']);

            AuditLog::record(
                $request->user()->id,
                'CREATE_USER',
                'User',
                $user->id,
                "Created user account {$user->name} ({$user->role})"
            );

            return $this->successResponse($user->load(['manager:id,name', 'department:id,name']), 'User created successfully.', 201);
        });
    }

    /**
     * PUT /api/users/{id}
     * Update user details or role.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'phone'         => ['sometimes', 'required', 'string', 'max:20', Rule::unique('users')->ignore($user->id)],
            'email'         => ['nullable', 'email', Rule::unique('users')->ignore($user->id)],
            'password'      => 'nullable|string|min:6',
            'role'          => ['sometimes', 'required', Rule::in(['admin', 'manager', 'salesman', 'staff'])],
            'department_id' => 'nullable|exists:departments,id',
            'manager_id'    => 'nullable|exists:users,id',
            'is_active'     => 'sometimes|boolean',
        ]);

        return DB::transaction(function () use ($user, $validated, $request) {
            if (!empty($validated['password'])) {
                $validated['password'] = Hash::make($validated['password']);
            } else {
                unset($validated['password']);
            }

            $user->update($validated);

            if (isset($validated['role'])) {
                $user->syncRoles([$validated['role']]);
            }

            AuditLog::record(
                $request->user()->id,
                'UPDATE_USER',
                'User',
                $user->id,
                "Updated user account {$user->name}"
            );

            return $this->successResponse($user->load(['manager:id,name', 'department:id,name']), 'User updated successfully.');
        });
    }

    /**
     * DELETE /api/users/{id}
     * Archive or delete a user account.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        if ($user->id === $request->user()->id) {
            return $this->errorResponse('You cannot delete your own account.', 422);
        }

        $user->update([
            'is_active'   => false,
            'is_archived' => true,
            'archived_at' => now(),
            'archived_by' => $request->user()->id,
            'archive_reason' => $request->input('reason', 'Deactivated by admin'),
        ]);

        AuditLog::record(
            $request->user()->id,
            'ARCHIVE_USER',
            'User',
            $user->id,
            "Archived user account {$user->name}"
        );

        return $this->successResponse(null, 'User account deactivated successfully.');
    }
}
