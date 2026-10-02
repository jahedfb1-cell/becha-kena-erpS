<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Standard browser-hardening headers on every response PHP serves (the SPA
 * shell and the whole API). Static /assets files are answered by the web
 * server without touching PHP, so public_html/.htaccess carries the same set.
 *
 * No Content-Security-Policy script/style restrictions on purpose: the app
 * relies on inline styles and on-page generated print documents, and a
 * policy loose enough to work would add little over the headers below.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // SAMEORIGIN rather than DENY: the app's own PDF/print helpers render
        // same-origin frames.
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), payment=(), usb=()');

        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        header_remove('X-Powered-By');

        return $response;
    }
}
