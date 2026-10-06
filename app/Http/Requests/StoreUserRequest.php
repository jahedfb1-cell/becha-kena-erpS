<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

/**
 * Validation for UserController::store() - moved out of the controller with the rules unchanged.
 */
class StoreUserRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('users:create') ?? false;
    }

    public function rules(): array
    {
        return [
            'name'          => 'required|string|max:255',
            'phone'         => 'required|string|max:20|unique:users,phone',
            'email'         => 'nullable|email|unique:users,email',
            'password'      => 'required|string|min:6',
            'role'          => ['required', Rule::in(['admin', 'manager', 'salesman', 'staff'])],
            'brand_id'      => 'nullable|exists:brands,id',
            'department_id' => 'nullable|exists:departments,id',
            'manager_id'    => 'nullable|exists:users,id',
        ];
    }
}
