<?php

namespace App\Http\Requests;

/**
 * Validation for MushakController::issue() - moved out of the controller with the rules unchanged.
 */
class IssueMushakChallanRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('mushak:issue') ?? false;
    }

    public function rules(): array
    {
        return [
            'buyer_bin'             => 'nullable|string|max:30',
            'save_bin_to_customer'  => 'nullable|boolean',
            'issued_by_name'        => 'nullable|string|max:150',
            'issued_by_designation' => 'nullable|string|max:150',
        ];
    }
}
