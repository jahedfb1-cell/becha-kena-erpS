<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
     | Google Gemini — powers AI Assist on the New Customer Account form.
     |
     | The model name is deliberately configurable, never hardcoded: Google
     | retires models on a schedule, and a hardcoded name turns that into an
     | outage. Swapping providers later means changing these values only.
     */
    'gemini' => [
        'key'     => env('GEMINI_API_KEY'),
        'model'   => env('GEMINI_MODEL', 'gemini-flash-latest'),

        /*
         | Used when the primary model is out of free-tier quota (429) or
         | overloaded (503). A lite model has a far more generous free tier and
         | handles card extraction well, so a busy minute degrades quality
         | slightly instead of failing outright.
         */
        'fallback_model' => env('GEMINI_FALLBACK_MODEL', 'gemini-3.1-flash-lite'),

        'base_url' => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
        'timeout' => (int) env('GEMINI_TIMEOUT', 45),

        /*
         | Gemini 3 models think before answering, which for a card extraction
         | costs 60+ seconds and adds nothing — the task is transcription, not
         | reasoning. "low" brings the same result back in about 4 seconds.
         | Set to an empty string for models that reject thinkingConfig.
         */
        'thinking_level' => env('GEMINI_THINKING_LEVEL', 'low'),
    ],

    /*
     | Hostinger serves this app from two separate folders: `public_html/`
     | (the real web root) and `laravel_app/public/` (Laravel's own public
     | path inside the git checkout, used only because `public_path()`
     | resolves there). A deploy mirrors the frontend build into both, but
     | anything the app writes at runtime — like an uploaded logo — only
     | lands in `laravel_app/public/`, so it 404s on the live site and is
     | invisible until the next deploy happens to sync it.
     |
     | Set only in production's .env; absent (and inert) everywhere else,
     | including local dev where there is only one public folder.
     */
    'public_html_path' => env('PUBLIC_HTML_PATH'),

];
