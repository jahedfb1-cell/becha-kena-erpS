<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QuotationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id'         => 'required|exists:customers,id',
            'convenience_charge'  => 'nullable|numeric|min:0',
            'other_charge'        => 'nullable|numeric|min:0',
            'other_charge_label'  => 'nullable|string|max:255',
            'vat_percentage'      => 'nullable|numeric|min:0|max:100',
            'discount_type'       => 'nullable|in:percentage,flat',
            'discount_value'      => 'nullable|numeric|min:0',
            'note'                => 'nullable|string|max:2000',
            'delivery_address'    => 'nullable|string|max:2000',

            // Items array
            'items'                       => 'required|array|min:1',
            'items.*.product_id'          => 'required|exists:products,id',
            'items.*.product_variant_id'  => 'nullable|exists:product_variants,id',
            'items.*.supplier_id'         => 'nullable|exists:suppliers,id',
            'items.*.width'               => 'required|numeric|min:0.01',
            'items.*.height'              => 'required|numeric|min:0.01',
            'items.*.pcs'                 => 'required|integer|min:1',
            'items.*.unit_price'          => 'required|numeric|min:0',
            'items.*.cost_price'          => 'nullable|numeric|min:0',
            'items.*.min_billing_sqft'    => 'nullable|numeric|min:0',
            'items.*.notes'               => 'nullable|string|max:500',
        ];
    }

    public function messages(): array
    {
        return [
            'items.required'              => 'At least one quotation item is required.',
            'items.min'                   => 'At least one quotation item is required.',
            'items.*.width.min'           => 'Width must be at least 0.01 inches.',
            'items.*.height.min'          => 'Height must be at least 0.01 inches.',
        ];
    }
}
