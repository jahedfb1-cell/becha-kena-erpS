<?php

namespace App\Http\Requests;

/**
 * Validation for AiAssistController::transcribe() - moved out of the controller with the rules unchanged.
 */
class TranscribeAudioRequest extends ApiFormRequest
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
            'audio' => 'required|file|mimes:webm,ogg,mp3,wav,m4a,mp4|max:10240',
        ];
    }
}
