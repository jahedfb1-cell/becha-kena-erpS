<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations to add slats & approx_slats fields.
     */
    public function up(): void
    {
        Schema::table('quotation_items', function (Blueprint $table) {
            if (!Schema::hasColumn('quotation_items', 'slats')) {
                $table->integer('slats')->nullable()->after('pcs')->comment('User inputted or calculated slat count for PVC products');
            }
            if (!Schema::hasColumn('quotation_items', 'approx_slats')) {
                $table->string('approx_slats', 20)->nullable()->after('slats')->comment('Exact decimal ratio width / 5.85');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('quotation_items', function (Blueprint $table) {
            $table->dropColumn(['slats', 'approx_slats']);
        });
    }
};
