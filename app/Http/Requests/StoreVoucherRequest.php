<?php

namespace App\Http\Requests;

/**
 * Validation for VoucherController::store() - moved out of the controller with the rules unchanged.
 */
class StoreVoucherRequest extends ApiFormRequest
{
    protected string $deniedMessage = 'Only system administrators can create manual accounting vouchers.';

    public function authorize(): bool
    {
        $user = $this->user();

        return $user && ($user->role === 'admin' || $user->can('vouchers:create'));
    }

    public function rules(): array
    {
        return [
            'voucher_type'     => 'required|in:debit,credit,journal',
            'date'             => 'required|date',
            'total_amount'     => 'required|numeric|min:0.01',
            'payment_method'   => 'required|in:cash,bank,mobile',
            'bank_account_id'   => 'nullable|integer',
            'bank_name'         => 'nullable|string',
            'mobile_account_id' => 'nullable|integer',
            'mobile_provider'   => 'nullable|string',
            'reference_number'  => 'nullable|string',
            'description'      => 'required|string|max:1000',
            'note'             => 'nullable|string',
        ];
    }
}
