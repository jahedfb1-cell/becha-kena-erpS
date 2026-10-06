<?php

namespace App\Http\Requests;

/**
 * Validation for AiAssistController::parseCustomer() - moved out of the controller with the rules unchanged.
 */
class ParseCustomerTextRequest extends ApiFormRequest
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
            'image' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:6144',
            'text'  => 'nullable|string|max:8000',
            'mode'  => 'nullable|string|in:card,text,voice',
        ];
    }
}
