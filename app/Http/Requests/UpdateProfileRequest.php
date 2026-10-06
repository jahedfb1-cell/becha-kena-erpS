<?php

namespace App\Http\Requests;

/**
 * Validation for AuthController::updateProfile() - moved out of the controller with the rules unchanged.
 */
class UpdateProfileRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        // No permission of its own: the route's middleware / the controller decides
        // who may call this; the request only validates the input.
        return true;
    }

    public function rules(): array
    {
        return [
            'name'  => 'required|string|max:250',
            'email' => 'required|email|max:250|unique:users,email,' . $this->user()->id,
            'phone' => 'nullable|string|max:30',
        ];
    }
}
