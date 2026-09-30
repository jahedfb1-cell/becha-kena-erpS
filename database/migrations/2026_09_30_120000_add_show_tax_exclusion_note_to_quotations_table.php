<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether the printed document carries the "All prices quoted above are
 * excluding VAT & TAX" note.
 *
 * That note used to be decided entirely by `vat_percentage`: no VAT on the
 * order meant the note printed, VAT meant it did not. That reads correctly
 * for an ordinary sale, but not for a customer who deducts Income Tax (and
 * sometimes VAT) at source under government rules and therefore expects the
 * quoted price to already be inclusive of them. Those orders carry no
 * `vat_percentage` of their own, so the note would print and tell the
 * customer tax is excluded when the opposite is true.
 *
 * Defaults to true so every existing order keeps printing exactly what it
 * prints today - the note only disappears where someone deliberately turns
 * it off. VAT on the order still hides it regardless, as before: the two
 * conditions are ANDed at print time, never traded against each other.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            if (!Schema::hasColumn('quotations', 'show_tax_exclusion_note')) {
                $table->boolean('show_tax_exclusion_note')->default(true)
                      ->after('vat_inclusive')
                      ->comment('Print the "prices exclude VAT & TAX" note (only ever shown when the order has no VAT of its own)');
            }
        });
    }

    public function down(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            if (Schema::hasColumn('quotations', 'show_tax_exclusion_note')) {
                $table->dropColumn('show_tax_exclusion_note');
            }
        });
    }
};
