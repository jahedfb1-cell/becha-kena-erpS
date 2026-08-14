<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A Purchase Order now covers every line item bought from one supplier for
 * one order, so several purchase_entries rows deliberately share the same
 * purchase_number. The old UNIQUE index made that impossible — replace it
 * with a plain index (still fast for lookups/grouping, no longer exclusive).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $indexes = collect(DB::select("PRAGMA index_list('purchase_entries')"))
                ->where('name', 'purchase_entries_purchase_number_unique');
        } else {
            $indexes = collect(DB::select('SHOW INDEX FROM purchase_entries'))
                ->where('Key_name', 'purchase_entries_purchase_number_unique');
        }

        if ($indexes->isNotEmpty()) {
            Schema::table('purchase_entries', function (Blueprint $table) {
                $table->dropUnique('purchase_entries_purchase_number_unique');
            });

            Schema::table('purchase_entries', function (Blueprint $table) {
                $table->index('purchase_number', 'purchase_entries_purchase_number_index');
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $indexes = collect(DB::select("PRAGMA index_list('purchase_entries')"))
                ->where('name', 'purchase_entries_purchase_number_index');
        } else {
            $indexes = collect(DB::select('SHOW INDEX FROM purchase_entries'))
                ->where('Key_name', 'purchase_entries_purchase_number_index');
        }

        if ($indexes->isNotEmpty()) {
            Schema::table('purchase_entries', function (Blueprint $table) {
                $table->dropIndex('purchase_entries_purchase_number_index');
            });

            // Only restorable while every purchase_number is still distinct
            Schema::table('purchase_entries', function (Blueprint $table) {
                $table->unique('purchase_number', 'purchase_entries_purchase_number_unique');
            });
        }
    }
};
