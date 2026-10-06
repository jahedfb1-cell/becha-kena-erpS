<?php

namespace App\Http\Requests;

/**
 * Validation for NotificationController::updateSettings() - moved out of the controller with the rules unchanged.
 */
class UpdateNotificationSettingsRequest extends ApiFormRequest
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
            'email_enabled' => 'required|boolean',
            'sms_enabled'   => 'required|boolean',
            'events'        => 'nullable|array',
        ];
    }
}
