<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// On some shared-hosting deployments the app code lives in a folder
// (e.g. "laravel_app") separate from the document root (e.g. "public_html"),
// with the two as siblings, and the public/ folder's contents get moved
// into that sibling instead of staying at "<base>/public". Detect that by
// checking whether the local public/index.php is missing while a sibling
// "public_html/index.php" exists, and point Laravel's public path there.
$deployedPublicPath = dirname(__DIR__).'/../public_html';
$usesSplitPublicFolder = ! file_exists(dirname(__DIR__).'/public/index.php')
    && file_exists($deployedPublicPath.'/index.php');

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => \App\Http\Middleware\CheckRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'data'    => null,
                ], 401);
            }
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'The given data was invalid.',
                    'data'    => null,
                    'errors'  => $e->errors(),
                ], 422);
            }
        });
    })->create();

if ($usesSplitPublicFolder) {
    $app->usePublicPath(realpath($deployedPublicPath) ?: $deployedPublicPath);
}

return $app;
