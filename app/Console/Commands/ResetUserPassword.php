<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Emergency password reset for any user (typically the admin account),
 * usable from the command line when nobody can log in to use the
 * in-app "Change Password" screen. Does not require email/SMTP to be
 * configured, since it is run directly on the server/machine.
 *
 * Usage:
 *   php artisan user:reset-password
 *   php artisan user:reset-password admin@bechakenarp.com
 *   php artisan user:reset-password admin@bechakenarp.com --password="NewPass123"
 *   php artisan user:reset-password admin@bechakenarp.com --generate
 */
class ResetUserPassword extends Command
{
    protected $signature = 'user:reset-password
        {email? : Email of the account to reset}
        {--password= : New password to set (skips the interactive prompt)}
        {--generate : Auto-generate a random secure password instead of typing one}';

    protected $description = 'Reset a user\'s password from the command line (for when nobody can log in, e.g. a forgotten admin password)';

    public function handle(): int
    {
        $email = $this->argument('email');

        if (!$email) {
            $email = $this->ask('Email of the account to reset (leave blank for admin@bechakenarp.com)', 'admin@bechakenarp.com');
        }

        $user = User::where('email', trim($email))->first();

        if (!$user) {
            $this->error("No user found with email: {$email}");

            $available = User::pluck('email')->implode(', ');
            if ($available) {
                $this->line("Available accounts: {$available}");
            }

            return self::FAILURE;
        }

        if ($this->option('generate')) {
            $newPassword = $this->generateSecurePassword();
        } elseif ($this->option('password')) {
            $newPassword = $this->option('password');
        } else {
            $newPassword = $this->secret('Enter the new password (min 8 characters, hidden while typing)');
            $confirm = $this->secret('Confirm the new password');

            if ($newPassword !== $confirm) {
                $this->error('Passwords did not match. Nothing was changed.');
                return self::FAILURE;
            }
        }

        if (strlen($newPassword) < 8) {
            $this->error('Password must be at least 8 characters.');
            return self::FAILURE;
        }

        $user->password = Hash::make($newPassword);
        $user->save();

        AuditLog::create([
            'user_id'     => $user->id,
            'user_name'   => $user->name,
            'action_type' => 'update',
            'module'      => 'Auth',
            'reference_id' => $user->id,
            'description' => 'Password reset via command-line (user:reset-password).',
        ]);

        $this->newLine();
        $this->info('✅ Password reset successfully.');
        $this->line("   Email:    {$user->email}");
        $this->line("   Password: {$newPassword}");
        $this->newLine();
        $this->line('Log in with the credentials above, then change the password again from the in-app profile settings if you like.');

        return self::SUCCESS;
    }

    private function generateSecurePassword(): string
    {
        // Mix of letters, digits, and a couple of symbols; avoids ambiguous
        // characters (0/O, l/1) so it's easy to read and retype if needed.
        $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        $digits = '23456789';
        $symbols = '!@#$%';

        $password = Str::random(1) . $letters[array_rand(str_split($letters))]
            . $digits[array_rand(str_split($digits))]
            . $symbols[array_rand(str_split($symbols))];

        $pool = $letters . $digits;
        for ($i = 0; $i < 8; $i++) {
            $password .= $pool[random_int(0, strlen($pool) - 1)];
        }

        return substr(str_shuffle($password), 0, 12);
    }
}
