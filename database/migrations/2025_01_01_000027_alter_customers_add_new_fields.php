<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds new fields to customers table:
     * - company_name
     * - second_contact_number
     * - address_2
     * - notes
     * - contact_show_status (enum)
     * - opening_balance
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('company_name')->nullable()->after('name');
            $table->string('second_contact_number', 20)->nullable()->after('phone');
            $table->text('address_2')->nullable()->after('address');
            $table->text('notes')->nullable()->after('address_2');
            // nullable() ensures SQLite test env doesn't throw NOT NULL constraint.
            // Default 'show_contact_number' is set at DB level AND in model $attributes.
            $table->string('contact_show_status', 30)
                  ->nullable()
                  ->default('show_contact_number')
                  ->after('notes');
            $table->decimal('opening_balance', 12, 2)->default(0)
                  ->comment('Old receivable amount from before ERP start. Admin-only editable.')
                  ->after('contact_show_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'company_name',
                'second_contact_number',
                'address_2',
                'notes',
                'contact_show_status',
                'opening_balance',
            ]);
        });
    }
};
