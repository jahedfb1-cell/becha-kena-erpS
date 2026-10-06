<?php

namespace App\Http\Requests;

/**
 * Validation for AccessSetupController::update() - moved out of the controller with the rules unchanged.
 */
class UpdateAccessSetupRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('access_setup:manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'role'          => 'required|string',
            'permissions'   => 'present|array',
            'permissions.*' => 'string',
        ];
    }
}
