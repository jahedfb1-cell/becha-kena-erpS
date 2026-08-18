<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The eleven columns of the Mushak 6.3 goods table, one row per line.
 *
 * These are copied from the order's items at issue time rather than joined
 * back to `quotation_items`, for the same reason the header duplicates the
 * buyer's details: an issued challan must keep printing what it said when
 * it was issued.
 *
 * Supplementary duty is carried per line even though this trade never
 * charges it. The form has the column and it cannot be left off the page,
 * so it is stored as an explicit zero rather than assumed at print time.
 *
 * `vat_rate` sits on every line because the form asks for it per line. All
 * lines of one challan currently carry the same rate, copied from the
 * order; keeping it per line means a future mixed-rate challan needs no
 * schema change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mushak_invoice_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('mushak_invoice_id')
                  ->constrained('mushak_invoices')
                  ->cascadeOnDelete();

            $table->unsignedInteger('serial_no');
            $table->text('description');
            $table->string('unit', 50)->nullable();

            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('total_value', 14, 2)->default(0);

            $table->decimal('sd_rate', 5, 2)->default(0);
            $table->decimal('sd_amount', 14, 2)->default(0);

            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->decimal('vat_amount', 14, 2)->default(0);

            $table->decimal('total_including_tax', 14, 2)->default(0);

            $table->timestamps();

            $table->index(['mushak_invoice_id', 'serial_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mushak_invoice_items');
    }
};
