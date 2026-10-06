<?php

namespace App\Http\Requests;

/**
 * Validation for ProductCategoryController::store() - moved out of the controller with the rules unchanged.
 */
class StoreProductCategoryRequest extends ApiFormRequest
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
            'name'        => 'required|string|max:255|unique:product_categories,name',
            'description' => 'nullable|string|max:1000',
        ];
    }
}
