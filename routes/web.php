<?php

use Illuminate\Support\Facades\Route;

// Serve the built React SPA for every route except /api/*.
// Static assets (JS/CSS/images) are served directly by Apache before
// hitting this route, since Laravel's public/.htaccess only forwards
// requests that don't match an existing file.
Route::get('/{any?}', function () {
    $indexFile = public_path('index.html');

    if (! file_exists($indexFile)) {
        return response('Frontend build not found. Run the frontend build and deploy it to public/.', 500);
    }

    return response()->file($indexFile);
})->where('any', '^(?!api).*$');
