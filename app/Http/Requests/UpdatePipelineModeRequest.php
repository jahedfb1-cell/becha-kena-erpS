<?php

namespace App\Http\Requests;

/**
 * Validation for SettingController::updatePipelineMode() - moved out of the controller with the rules unchanged.
 */
class UpdatePipelineModeRequest extends ApiFormRequest
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
            'order_pipeline_mode' => 'required|in:standard,role_based',
        ];
    }
}
