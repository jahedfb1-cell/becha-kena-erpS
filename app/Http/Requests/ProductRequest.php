<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProductRequest extends FormRequest
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
        $id = $this->route('id');

        return [
            'product_code'                       => 'required|string|max:30|unique:products,product_code,' . $id,
            'name'                               => 'required|string|max:255',
            'unit'                               => 'nullable|string|max:20',
            'product_category_id'                => 'nullable|exists:product_categories,id',
            'default_unit_price'                 => 'required|numeric|min:0|max:99999999.99',
            'details'                            => 'nullable|string|max:5000',
            'supplier_links'                     => 'nullable|array',
            'supplier_links.*.supplier_id'       => 'required|exists:suppliers,id',
            'supplier_links.*.priority_rank'     => 'nullable|integer|min:1',
            'supplier_links.*.cost_price'        => 'nullable|numeric|min:0',
            'supplier_links.*.min_billing_sqft'  => 'nullable|numeric|min:0',
        ];
    }
}
