<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds third_contact_number to customers table after second_contact_number.
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('third_contact_number', 20)->nullable()->after('second_contact_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('third_contact_number');
        });
    }
};
