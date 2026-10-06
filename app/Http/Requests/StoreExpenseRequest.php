<?php

namespace App\Http\Requests;

/**
 * Validation for ExpenseController::store() - moved out of the controller with the rules unchanged.
 */
class StoreExpenseRequest extends ApiFormRequest
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
            'expense_category_id' => 'required|exists:expense_categories,id',
            'amount'              => 'required|numeric|min:0.01',
            'payment_method'      => 'required|in:cash,bank,mobile',
            'expense_date'        => 'required|date',
            'bank_account_id'     => 'nullable|integer',
            'bank_name'           => 'nullable|string',
            'mobile_account_id'   => 'nullable|integer',
            'mobile_provider'     => 'nullable|string',
            'reference_number'    => 'nullable|string',
            'description'         => 'nullable|string',
        ];
    }
}
