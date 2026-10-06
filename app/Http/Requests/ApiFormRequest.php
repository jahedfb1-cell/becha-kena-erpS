<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Base for the API's form requests.
 *
 * Validation failures already come back as the API's own 422 shape (see the
 * ValidationException handler in bootstrap/app.php). A failed authorize()
 * would otherwise render as Laravel's default 403 page, so it is turned into
 * the same JSON envelope every controller uses for "not allowed":
 * { success: false, message, data: null, errors: null }.
 */
abstract class ApiFormRequest extends FormRequest
{
    /** Wording of the 403 when authorize() says no; override per request. */
    protected string $deniedMessage = 'Unauthorized action.';

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(response()->json([
            'success' => false,
            'message' => $this->deniedMessage,
            'data'    => null,
            'errors'  => null,
        ], 403));
    }
}
