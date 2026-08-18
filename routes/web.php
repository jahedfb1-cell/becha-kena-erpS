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

    return response()->file($indexFile);
})->where('any', '^(?!api).*$');
