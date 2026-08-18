<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * VAT settings for the NBR Mushak 6.3 challan, held on the order.
 *
 * "Orders" are not a table of their own in this system — an order is a
 * quotation that has reached `approved` / `invoiced`, so the columns go
 * here.
 *
 * `vat_rate` is deliberately separate from the existing `vat_percentage`.
 * That column drives the quotation's own arithmetic and its printed total,
 * and changing what it means would alter every historical quotation's
 * figures. These three columns only decide what the VAT challan says, and
 * default to VAT being off so nothing that exists today changes behaviour.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            if (!Schema::hasColumn('quotations', 'vat_enabled')) {
                $table->boolean('vat_enabled')->default(false)
                      ->after('vat_amount')
                      ->comment('Whether this order is billed with VAT (Mushak 6.3)');
            }

            if (!Schema::hasColumn('quotations', 'vat_rate')) {
                $table->decimal('vat_rate', 5, 2)->nullable()
                      ->after('vat_enabled')
                      ->comment('VAT rate applied to the challan, e.g. 15.00');
            }

            if (!Schema::hasColumn('quotations', 'vat_inclusive')) {
                $table->boolean('vat_inclusive')->default(false)
                      ->after('vat_rate')
                      ->comment('True when the quoted prices already include VAT');
            }
        });
    }

    public function down(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            foreach (['vat_enabled', 'vat_rate', 'vat_inclusive'] as $column) {
                if (Schema::hasColumn('quotations', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
