<?php

namespace App\Http\Requests;

/**
 * Validation for SettingController::storeBalanceTransfer() - moved out of the controller with the rules unchanged.
 */
class StoreBalanceTransferRequest extends ApiFormRequest
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
            'from_account_type' => 'required|string|in:cash,bank,mobile',
            'from_account_id'   => 'nullable|required_unless:from_account_type,cash|integer',
            'to_account_type'   => 'required|string|in:cash,bank,mobile',
            'to_account_id'     => 'nullable|required_unless:to_account_type,cash|integer',
            'amount'            => 'required|numeric|min:1',
            'transfer_date'     => 'required|date',
            'note'              => 'nullable|string',
        ];
    }
}
