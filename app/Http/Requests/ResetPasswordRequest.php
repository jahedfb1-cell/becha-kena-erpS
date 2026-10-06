<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rules\Password;

/**
 * Validation for AuthController::resetPassword() - moved out of the controller with the rules unchanged.
 */
class ResetPasswordRequest extends ApiFormRequest
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
            'token'    => 'required|string',
            'email'    => 'required|email',
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
        ];
    }
}
