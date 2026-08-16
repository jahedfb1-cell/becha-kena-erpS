<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Each user sells under exactly one trade name, fixed on their account —
 * there is no per-quotation brand picker. Whatever a user creates is
 * tagged with their brand, and that is what its printout shows.
 *
 * Existing users are backfilled to Dhaka Blinds so nothing about the
 * current setup changes until someone is explicitly moved to Western.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('brand_id')
                  ->nullable()
                  ->after('role')
                  ->constrained('brands')
                  ->nullOnDelete();
        });

        DB::table('users')->whereNull('brand_id')->update(['brand_id' => 1]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['brand_id']);
            $table->dropColumn('brand_id');
        });
    }
};
