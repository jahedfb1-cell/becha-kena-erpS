<?php

namespace App\Http\Requests;

/**
 * Validation for PaymentController::store() - moved out of the controller with the rules unchanged.
 */
class StorePaymentRequest extends ApiFormRequest
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
            'invoice_id'      => 'required|exists:invoices,id',
            'amount'          => 'required|numeric|min:0.01',
            'payment_method'  => 'required|in:cash,bank,mobile',
            'payment_date'    => 'required|date',
            'discount_amount' => 'nullable|numeric|min:0',
            // Optional: why the waive-off was given. Printed on the receipt
            // only when it is filled in.
            'discount_note'   => 'nullable|string|max:255',
            // Required so the bank/mobile book-entry (which has a NOT NULL
            // bank_name/provider column) never fails at the database level.
            'bank_account_id' => 'nullable|integer',
            'bank_name'       => 'exclude_with:bank_account_id|required_if:payment_method,bank|string|max:100',
            'mobile_account_id' => 'nullable|integer',
            'mobile_provider' => 'exclude_with:mobile_account_id|required_if:payment_method,mobile|string|max:100',
        ];
    }
}
