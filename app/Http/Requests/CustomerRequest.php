<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Handles BOTH store and update for customers.
 *
 * OPENING BALANCE SECURITY STRATEGY:
 * ────────────────────────────────────────────────────────────────
 * We use "silently ignore" approach for non-admins sending opening_balance.
 *
 * WHY NOT "reject with validation error"?
 * - Non-admin users (salesmen/managers) use the same form that may
 *   include the opening_balance field from the UI (e.g., if cached).
 * - Throwing a validation error would confuse them or break UX.
 * - The field is harmless if ignored server-side.
 * - The controller strips opening_balance from the payload for non-admins.
 *
 * WHY NOT allow non-admins?
 * - Opening balance is a financial figure that affects customer due amounts.
 * - Only admin should have authority to set legacy balances.
 *
 * Result: Non-admin can submit the form with any opening_balance value —
 * the controller will safely strip it. Admin changes take effect normally.
 * ────────────────────────────────────────────────────────────────
 */
class CustomerRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            'name'                    => 'required|string|max:255',
            'company_name'            => 'nullable|string|max:255',
            'bin'                     => 'nullable|string|max:30',
            'phone'                   => 'nullable|string|max:20',
            'second_contact_number'   => 'nullable|string|max:20',
            'third_contact_number'    => 'nullable|string|max:20',
            'email'                   => 'nullable|email|max:255',
            'address'                 => 'nullable|string|max:1000',
            'address_2'               => 'nullable|string|max:1000',
            'notes'                   => 'nullable|string|max:2000',
            // 'sometimes' means: only validate if present in payload.
            // The Customer model has a default of 'show_contact_number',
            // so omitting it from old API calls is safe.
            'contact_show_status'     => 'sometimes|in:show_contact_number,cannot_show_contact_number',
            'customer_category_id'    => 'required|exists:customer_categories,id',
            'opening_balance'         => 'nullable|numeric|min:0',
        ];

    }

    /**
     * Custom validation messages.
     */
    public function messages(): array
    {
        return [
            'name.required'                  => 'Customer name is required.',
            'customer_category_id.required'  => 'Customer category is required.',
            'customer_category_id.exists'    => 'Selected category does not exist.',
            'contact_show_status.required'   => 'Contact show status is required.',
            'contact_show_status.in'         => 'Contact show status must be either show_contact_number or cannot_show_contact_number.',
            'opening_balance.numeric'        => 'Opening balance must be a numeric value.',
            'opening_balance.min'            => 'Opening balance cannot be negative.',
        ];
    }
}
