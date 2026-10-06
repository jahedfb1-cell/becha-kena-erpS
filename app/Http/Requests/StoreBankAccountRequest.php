<?php

namespace App\Http\Requests;

/**
 * Validation for SettingController::storeBankAccount() - moved out of the controller with the rules unchanged.
 */
class StoreBankAccountRequest extends ApiFormRequest
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
            'bank_name'       => 'required|string|max:150',
            'account_name'    => 'required|string|max:150',
            'account_number'  => 'required|string|max:100',
            'branch'          => 'nullable|string|max:150',
            'opening_balance' => 'nullable|numeric|min:0',
        ];
    }
}
