<?php

namespace App\Http\Requests;

/**
 * Validation for PurchaseController::markReceived() - moved out of the controller with the rules unchanged.
 */
class MarkPurchasesReceivedRequest extends ApiFormRequest
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
            'ids'   => 'required|array|min:1',
            'ids.*' => 'integer|exists:purchase_entries,id',
        ];
    }
}
