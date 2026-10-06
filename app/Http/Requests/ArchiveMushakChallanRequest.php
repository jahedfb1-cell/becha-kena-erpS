<?php

namespace App\Http\Requests;

/**
 * Validation for MushakController::destroy() - moved out of the controller with the rules unchanged.
 */
class ArchiveMushakChallanRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('mushak:issue') ?? false;
    }

    public function rules(): array
    {
        return ['archive_reason' => 'required|string|max:1000'];
    }
}
