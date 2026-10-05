<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Two kinds of seed data, kept apart on purpose:
 *
 * - Reference data the app cannot run without (roles and permissions,
 *   default categories, the first admin). Safe to run on any environment and
 *   safe to run again: every seeder here only adds what is missing and never
 *   overwrites what the business has since changed.
 *
 * - Demo data (DemoDataSeeder: fake customers, orders, invoices, payments).
 *   Only for a local or testing database. It refuses to run in production,
 *   where it would mix invented sales into the real books.
 *
 * Run demo data explicitly on a dev machine:
 *   php artisan db:seed --class=DemoDataSeeder
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            AdminUserSeeder::class,
            CustomerCategorySeeder::class,
            ExpenseCategorySeeder::class,
        ]);

        if (app()->environment(['local', 'testing'])) {
            $this->call(DemoDataSeeder::class);
        } else {
            $this->command?->info('Demo data skipped (environment: ' . app()->environment() . ').');
        }
    }
}
