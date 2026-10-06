<?php

namespace App\Http\Requests;

/**
 * Validation for QuotationController::reject() - moved out of the controller with the rules unchanged.
 */
class RejectQuotationRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('quotations:reject') ?? false;
    }

    public function rules(): array
    {
        return [
            'rejection_reason' => 'required|string|max:1000',
        ];
    }
}
