<?php

namespace App\Http\Requests;

/**
 * Validation for QuotationController::storeAdvancePayment() - moved out of the controller with the rules unchanged.
 */
class StoreAdvancePaymentRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('payments:create') ?? false;
    }

    public function rules(): array
    {
        return [
            'amount'          => 'required|numeric|min:0.01',
            'payment_method'  => 'required|in:cash,bank,mobile',
            'payment_date'    => 'required|date',
            'bank_account_id' => 'nullable|integer',
            'bank_name'       => 'exclude_with:bank_account_id|required_if:payment_method,bank|string|max:100',
            'mobile_account_id' => 'nullable|integer',
            'mobile_provider' => 'exclude_with:mobile_account_id|required_if:payment_method,mobile|string|max:100',
            'transaction_id'  => 'nullable|string|max:100',
            'cheque_number'   => 'nullable|string|max:100',
            'notes'           => 'nullable|string|max:1000',
        ];
    }
}
