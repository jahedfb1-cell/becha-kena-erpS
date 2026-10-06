<?php

namespace App\Http\Requests;

/**
 * Validation for SettingController::storeMobileAccount() - moved out of the controller with the rules unchanged.
 */
class StoreMobileAccountRequest extends ApiFormRequest
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
            'provider'        => 'required|string|max:100',
            'account_number'  => 'required|string|max:50',
            'account_type'    => 'nullable|string|max:50',
            'opening_balance' => 'nullable|numeric|min:0',
        ];
    }
}
