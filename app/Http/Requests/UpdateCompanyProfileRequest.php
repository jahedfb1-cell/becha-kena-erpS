<?php

namespace App\Http\Requests;

/**
 * Validation for CompanyProfileController::update() - moved out of the controller with the rules unchanged.
 */
class UpdateCompanyProfileRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('settings:company_profile') ?? false;
    }

    public function rules(): array
    {
        return [
            'brand_id'        => 'nullable|exists:brands,id',
            'company_name'    => 'required|string|max:200',
            'company_address' => 'required|string|max:500',
            'office_address'  => 'nullable|string|max:500',
            'footer_name'     => 'nullable|string|max:200',
            'cheque_favour_name' => 'nullable|string|max:200',
            'mobile'          => 'required|string|max:20',
            'email'           => 'nullable|email|max:200',
            'opening_balance' => 'nullable|numeric',
            'company_web'     => 'nullable|string|max:200',
            'company_facebook'=> 'nullable|string|max:200',
            'vat_reg_no'      => 'nullable|string|max:100',
            'terms_conditions'=> 'nullable|string|max:3000',
            'receipt_qr_template' => 'nullable|string|max:1000',
            // SVG deliberately excluded: it's an active content type (can embed
            // <script>) and would be served back on this origin, enabling stored XSS.
            'company_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'invoice_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'receipt_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'favicon'         => 'nullable|file|mimes:jpg,jpeg,png,ico|max:2048',
            'app_icon'        => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'browser_title'   => 'nullable|string|max:200',
        ];
    }
}
