<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Adds the X-Robots-Tag header to every response so search engines and AI
 * crawlers are told not to index this API - the same "never index this"
 * signal as the <meta name="robots"> tag on the frontend, but for
 * non-HTML responses (JSON, etc.) where a meta tag doesn't apply.
 */
class NoRobotsHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');

        return $response;
    }
}
