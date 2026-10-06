<?php

namespace App\Http\Requests;

/**
 * Validation for QuotationController::convertToOrder() - moved out of the controller with the rules unchanged.
 */
class ConvertQuotationToOrderRequest extends ApiFormRequest
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
            'discount_type'   => 'nullable|in:percentage,flat',
            'discount_value'  => 'nullable|numeric|min:0',
            'selected_option' => 'nullable|integer|min:1',
        ];
    }
}
