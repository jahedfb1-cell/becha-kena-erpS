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
    // or revalidation directive, which both Hostinger's hCDN edge and (more
    // importantly) LiteSpeed's own server-side page cache (LSCache) read as
    // "cache indefinitely". Confirmed live, in this order: a CDN purge did
    // not fix it (Cache-Control: no-store now confirmed present on every
    // edge, x-hcdn-cache-status: DYNAMIC on every request — the CDN layer
    // is not the culprit); every cache-purge option in hPanel was tried and
    // none of them changed it; and a request straight at the origin
    // (Host-header-spoofed to 127.0.0.1, bypassing the CDN entirely) still
    // returned the pre-fix bundle. That last result is the tell: LiteSpeed
    // itself is the web server answering 127.0.0.1, so a cache that survives
    // going straight at it has to be LiteSpeed's own LSCache — which can
    // serve a cached page without ever invoking PHP again, meaning the
    // standard Cache-Control header above never gets a chance to be read
    // for a cached hit. LSCache is controlled through its own header
    // instead: X-LiteSpeed-Cache-Control: no-cache is the documented way an
    // application opts a response out of it.
    //
    // This is the one response that must never be cached this way, because
    // it's the thing that names every other file the browser goes on to
    // request (the hashed /assets/*.js and *.css themselves are safe to
    // cache forever — a new build gives them new filenames, so nothing here
    // affects them).
    return response()->file($indexFile, [
        'Cache-Control'              => 'no-cache, no-store, must-revalidate',
        'Pragma'                     => 'no-cache',
        'Expires'                    => '0',
        'X-LiteSpeed-Cache-Control'  => 'no-cache',
    ]);
})->where('any', '^(?!api).*$');
