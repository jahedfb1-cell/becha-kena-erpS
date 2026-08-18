<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Laravel's default only covers "api/*". The Mushak 6.3 challan is a
    | server-rendered Blade page under "mushak/*" rather than an API
    | endpoint, and the React app fetches its HTML over XHR so the bearer
    | token in localStorage travels with the request. In local development
    | the SPA runs on a different origin (localhost:5173) from the backend
    | (127.0.0.1:8000), so without this entry the browser rejects that fetch
    | at preflight and the print window comes up empty. In production both
    | are served from the same origin, where CORS never applies either way.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'mushak/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
