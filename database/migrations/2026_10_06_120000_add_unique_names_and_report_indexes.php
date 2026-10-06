<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two kinds of gap found by comparing the live schema with how the app uses it.
 *
 * Unique: the app already refuses a duplicate category / department name in
 * its validation, but the database did not, so a race or a script could still
 * create one. Adding the index makes the rule hold at the one place nothing
 * can bypass. Live holds no duplicates of these (checked before adding).
 *
 * users.phone is deliberately NOT made unique here. Two accounts on live (the
 * admins, who sign in by email) have an empty phone, the column cannot hold
 * NULL, and MariaDB has no "unique except empty" index, so the index would
 * fail on live. The app's own validation (unique:users,phone) keeps real
 * phone numbers unique.
 *
 * Index: the list and report screens filter on these columns on their own
 * (status tabs, date ranges, payment status); the existing indexes are all
 * composites led by another column, which cannot serve those lookups. The
 * tables are small today, so this is for the day they are not.
 *
 * Each step is skipped when its index is already there.
 */
return new class extends Migration
{
    private const UNIQUE = [
        'customer_categories' => 'name',
        'product_categories' => 'name',
        'expense_categories' => 'name',
        'departments'        => 'name',
    ];

    private const INDEXES = [
        'quotations'       => ['status'],
        'invoices'         => ['invoice_date', 'payment_status'],
        'payments'         => ['payment_date'],
        'customer_ledgers' => ['transaction_date'],
    ];

    public function up(): void
    {
        foreach (self::UNIQUE as $table => $column) {
            $name = "{$table}_{$column}_unique";
            if (Schema::hasColumn($table, $column) && !Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $t) => $t->unique($column, $name));
            }
        }

        foreach (self::INDEXES as $table => $columns) {
            foreach ($columns as $column) {
                $name = "{$table}_{$column}_index";
                if (Schema::hasColumn($table, $column) && !Schema::hasIndex($table, $name)) {
                    Schema::table($table, fn (Blueprint $t) => $t->index($column, $name));
                }
            }
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => $columns) {
            foreach ($columns as $column) {
                $name = "{$table}_{$column}_index";
                if (Schema::hasIndex($table, $name)) {
                    Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
                }
            }
        }
        foreach (self::UNIQUE as $table => $column) {
            $name = "{$table}_{$column}_unique";
            if (Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropUnique($name));
            }
        }
    }
};
