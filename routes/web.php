<?php

use App\Models\MushakInvoice;
use Illuminate\Support\Facades\Route;

// NBR Mushak 6.3 challan, printed from the browser.
//
// Registered before the SPA catch-all below, which would otherwise swallow
// it: that route matches everything except /api/*, and Laravel resolves in
// registration order.
//
// This is a server-rendered Blade page rather than a React print view like
// the invoice and challan ones, because the form is in Bengali and is meant
// to be filed with the VAT office as-is. It is deliberately separate from
// the existing print pages, which are untouched.
Route::get('/mushak/{id}/print', function (int $id, Illuminate\Http\Request $request) {
    // The same permission the API endpoints check. Being logged in under the
    // VAT-registered brand is not enough on its own: without this, anyone in
    // that brand could read a challan by walking the URL, whatever Admin
    // Access says about their access to VAT documents.
    abort_unless($request->user()->can('mushak:view'), 403, 'Unauthorized action.');

    $challan = MushakInvoice::with(['items', 'salesInvoice:id,invoice_number'])->find($id);

    abort_if(!$challan, 404, 'VAT challan not found.');

    return view('mushak.print', compact('challan'));
})->middleware(['auth:sanctum'])->name('mushak.print');

// Serve the built React SPA for every route except /api/*.
// Static assets (JS/CSS/images) are served directly by Apache before
// hitting this route, since Laravel's public/.htaccess only forwards
// requests that don't match an existing file.
Route::get('/{any?}', function () {
    $indexFile = public_path('index.html');

    if (! file_exists($indexFile)) {
        return response('Frontend build not found. Run the frontend build and deploy it to public/.', 500);
    }

    // response()->file() defaults to Cache-Control: public with no max-age
    // or revalidation directive. Hostinger's hCDN edge cache reads that as
    // "cache indefinitely" and freezes the *entire* response — headers
    // included — rather than reusing it as an ETag/Last-Modified check
    // against origin. Confirmed live: two separate deploys still served the
    // pre-deploy bundle's script tags after a full CDN purge, because the
    // cached snapshot was older than the purge's own visibility. This is
    // the one response that must never be cached that way, because it's
    // the thing that names every other file the browser needs (the
    // hashed /assets/*.js and *.css themselves are safe to cache forever —
    // a new build gives them new filenames, so nothing here affects them).
    return response()->file($indexFile, [
        'Cache-Control' => 'no-cache, no-store, must-revalidate',
        'Pragma'         => 'no-cache',
        'Expires'        => '0',
    ]);
})->where('any', '^(?!api).*$');
