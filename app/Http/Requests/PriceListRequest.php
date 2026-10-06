<?php

namespace App\Http\Requests;

/**
 * The shape the price-list create/update form posts and the show endpoint
 * returns (rules moved here unchanged from PriceListController).
 *
 * `items` is required and must be non-empty: a rate card with no rates is not
 * a document, and letting one save would put an unopenable row on the list page.
 */
class PriceListRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('price_lists:create') ?? false;
    }

    public function rules(): array
    {
        return [
            'customer_id'            => 'nullable|integer|exists:customers,id',
            'customer_name'          => 'nullable|string|max:150',
            'customer_company'       => 'nullable|string|max:150',
            'customer_phone'         => 'nullable|string|max:30',
            'customer_address'       => 'nullable|string',
            'issue_date'             => 'required|date',
            'subject'                => 'nullable|string|max:255',
            'validity'               => 'nullable|string|max:60',
            'terms'                  => 'nullable|string',

            'items'                  => 'required|array|min:1',
            'items.*.product_id'     => 'nullable|integer|exists:products,id',
            'items.*.product_name'   => 'required|string|max:255',
            'items.*.description'    => 'nullable|string',
            'items.*.color_code'     => 'nullable|string|max:100',
            'items.*.uom'            => 'nullable|string|max:30',
            'items.*.rate'           => 'nullable|numeric|min:0',
            'items.*.remarks'        => 'nullable|string|max:255',
        ];
    }
}
