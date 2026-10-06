<?php

namespace App\Http\Requests;

/**
 * Validation for AuthController::forgotPassword() - moved out of the controller with the rules unchanged.
 */
class ForgotPasswordRequest extends ApiFormRequest
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
            'email' => 'required|email',
        ];
    }
}
