<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QuotationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $inputs = $this->all();
        foreach ($inputs as $key => $value) {
            if ($value === 'null' || $value === 'undefined' || $value === '') {
                $inputs[$key] = null;
            }
        }

        if (isset($inputs['items']) && is_array($inputs['items'])) {
            foreach ($inputs['items'] as $index => $item) {
                foreach ($item as $key => $value) {
                    if ($value === 'null' || $value === 'undefined' || $value === '') {
                        $inputs['items'][$index][$key] = null;
                    }
                }
            }
        }

        $this->replace($inputs);
    }

    public function rules(): array
    {
        return [
            'customer_id'         => 'required|exists:customers,id',

            // Matches the column's own enum. Without this the value went
            // through to the database unchecked, so a typo surfaced as a
            // failed write rather than a readable validation error.
            'status'              => 'nullable|in:quotation,pending_approval,approved,rejected,pending_reapproval,invoiced',
            'convenience_charge'  => 'nullable|numeric|min:0',
            'other_charge'        => 'nullable|numeric|min:0',
            'other_charge_label'  => 'nullable|string|max:255',
            'vat_percentage'      => 'nullable|numeric|min:0|max:100',

            // VAT challan (Mushak 6.3) settings. The rate is only meaningful
            // when the order is marked VAT-applicable, and is required then —
            // a challan with no rate on it cannot be issued.
            'vat_enabled'         => 'nullable|boolean',
            'vat_rate'            => 'nullable|required_if:vat_enabled,true,1|numeric|min:0|max:100',
            'vat_inclusive'       => 'nullable|boolean',
            'discount_type'       => 'nullable|in:percentage,flat',
            'discount_value'      => 'nullable|numeric|min:0',
            'note'                => 'nullable|string|max:2000',
            'delivery_address'    => 'nullable|string|max:2000',

            // Items array
            'items'                       => 'required|array|min:1',
            'items.*.section_name'        => 'nullable|string|max:255',
            'items.*.option_group_id'     => 'nullable|string|max:255',
            'items.*.is_optional'         => 'nullable|boolean',
            'items.*.is_selected'         => 'nullable|boolean',
            'items.*.is_enabled_for_print'=> 'nullable|boolean',
            'items.*.product_id'          => 'required|exists:products,id',
            'items.*.product_variant_id'  => 'nullable|exists:product_variants,id',
            'items.*.supplier_id'         => 'nullable|exists:suppliers,id',
            'items.*.width'               => 'nullable|numeric|min:0',
            'items.*.height'              => 'nullable|numeric|min:0',
            'items.*.pcs'                 => 'nullable|integer|min:1',
            'items.*.unit_price'          => 'required|numeric|min:0',
            'items.*.cost_price'          => 'nullable|numeric|min:0',
            'items.*.min_billing_sqft'    => 'nullable|numeric|min:0',
            'items.*.notes'               => 'nullable|string|max:5000',
        ];
    }

    public function messages(): array
    {
        return [
            'items.required'              => 'At least one quotation item is required.',
            'items.min'                   => 'At least one quotation item is required.',
            'items.*.width.min'           => 'Width must be at least 0.01 inches.',
            'items.*.height.min'          => 'Height must be at least 0.01 inches.',
            'vat_rate.required_if'        => 'A VAT rate is required when VAT is applicable.',
            'vat_rate.max'                => 'VAT rate cannot be more than 100 percent.',
        ];
    }
}
