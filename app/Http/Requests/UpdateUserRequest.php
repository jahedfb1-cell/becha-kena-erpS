<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

/**
 * Validation for UserController::update() - moved out of the controller with the rules unchanged.
 */
class UpdateUserRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('users:edit') ?? false;
    }

    public function rules(): array
    {
        return [
            'name'          => 'sometimes|required|string|max:255',
            'phone'         => ['sometimes', 'required', 'string', 'max:20', Rule::unique('users')->ignore((int) $this->route('id'))],
            'email'         => ['nullable', 'email', Rule::unique('users')->ignore((int) $this->route('id'))],
            'password'      => 'nullable|string|min:6',
            'role'          => ['sometimes', 'required', Rule::in(['admin', 'manager', 'salesman', 'staff'])],
            'brand_id'      => 'nullable|exists:brands,id',
            'department_id' => 'nullable|exists:departments,id',
            'manager_id'    => 'nullable|exists:users,id',
            'is_active'     => 'sometimes|boolean',
        ];
    }
}
