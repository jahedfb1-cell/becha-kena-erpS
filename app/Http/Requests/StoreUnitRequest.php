<?php

namespace App\Http\Requests;

/**
 * Validation for SettingController::storeUnit() - moved out of the controller with the rules unchanged.
 */
class StoreUnitRequest extends ApiFormRequest
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
            'name' => 'required|string|max:100',
            'code' => 'required|string|max:20|unique:units,code',
        ];
    }
}
