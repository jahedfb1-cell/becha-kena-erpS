<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    /**
     * Brute-force and mail-flooding limits for the unauthenticated auth
     * endpoints. Both limiters are keyed twice: once on the account being
     * attacked (so a botnet spread over many IPs still cannot hammer one
     * login) and once on the caller's IP (so one machine cannot sweep
     * through many accounts).
     */
    protected function configureRateLimiting(): void
    {
        $account = fn (Request $request) => strtolower(trim((string) $request->input('email'))).'|'.$request->ip();

        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by('login:'.$account($request)),
            Limit::perMinute(30)->by('login-ip:'.$request->ip()),
        ]);

        RateLimiter::for('password-reset', fn (Request $request) => [
            Limit::perMinute(3)->by('reset:'.$account($request)),
            Limit::perHour(20)->by('reset-ip:'.$request->ip()),
        ]);
    }
}
