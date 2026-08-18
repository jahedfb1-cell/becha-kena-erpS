<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Business Identification Number, for buyers who are VAT registered.
 *
 * Nullable and never required. Customers routinely do not supply a BIN when
 * the account is opened — it commonly arrives only once an invoice is put in
 * front of them, and unregistered buyers never have one at all. Making this
 * mandatory anywhere would stall ordinary sales for a number that is not yet
 * knowable, so the VAT challan screen accepts it at issue time instead and
 * writes it back here for next time.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('customers', 'bin')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->string('bin', 30)->nullable()->after('company_name')
                      ->comment('Business Identification Number (VAT), supplied by the buyer');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('customers', 'bin')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropColumn('bin');
            });
        }
    }
};
