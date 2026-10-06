<?php

namespace App\Http\Requests;

/**
 * Validation for PurchaseController::recordSupplierPayment() - moved out of the controller with the rules unchanged.
 */
class RecordSupplierPaymentRequest extends ApiFormRequest
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
            'supplier_id'    => 'required|exists:suppliers,id',
            'amount'         => 'required|numeric|min:0.01',
            'payment_date'   => 'required|date',
            'payment_method' => 'required|in:cash,bank,mobile',
            'bank_name'      => 'nullable|string',
            'cheque_number'  => 'nullable|string',
            'transaction_id' => 'nullable|string',
            'notes'          => 'nullable|string',
        ];
    }
}
