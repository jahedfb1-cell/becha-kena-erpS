<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * users.monthly_sales_target (read by the dashboard's sales-target card)
 * used to be created on the fly by a request handler. The 19 Aug refactor
 * (59b5871) removed that, believing a migration already existed - it never
 * did, so the column was on the live database only and a fresh install
 * lacked it. This is that missing migration.
 *
 * Guarded, so it is a no-op where the column is already there (live).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'monthly_sales_target')) {
            Schema::table('users', function (Blueprint $table) {
                $table->decimal('monthly_sales_target', 14, 2)->default(0)->after('is_active');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'monthly_sales_target')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn('monthly_sales_target'));
        }
    }
};
