<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductSupplierLinkRequest extends FormRequest
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
        $productId = $this->route('productId') ?? $this->route('id');
        $linkId = $this->route('productId') ? $this->route('id') : null;

        return [
            'supplier_id' => [
                'required',
                'exists:suppliers,id',
                Rule::unique('product_supplier_links')->where(function ($query) use ($productId) {
                    return $query->where('product_id', $productId);
                })->ignore($linkId),
            ],
            'priority_rank' => [
                'required',
                'integer',
                'min:1',
                Rule::unique('product_supplier_links')->where(function ($query) use ($productId) {
                    return $query->where('product_id', $productId);
                })->ignore($linkId),
            ],
            'cost_price'       => 'nullable|numeric|min:0|max:99999999.99',
            'min_billing_sqft' => 'nullable|numeric|min:0|max:999999.99',
        ];
    }

    /**
     * Custom error messages for unique constraints.
     */
    public function messages(): array
    {
        return [
            'supplier_id.unique'  => 'This supplier is already linked to this product.',
            'priority_rank.unique' => 'This priority rank is already assigned to a supplier for this product.',
        ];
    }
}
