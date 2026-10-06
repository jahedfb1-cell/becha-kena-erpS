<?php

namespace App\Http\Requests;

/**
 * Validation for PaymentController::transferPayment() - moved out of the controller with the rules unchanged.
 */
class TransferPaymentRequest extends ApiFormRequest
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
            'new_invoice_id' => 'required|exists:invoices,id',
            'reason'         => 'nullable|string|max:500',
        ];
    }
}
