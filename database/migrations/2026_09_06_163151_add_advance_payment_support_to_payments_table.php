<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lets a Payment be recorded against a Quotation (an order that hasn't
     * been invoiced yet) instead of only ever against an Invoice, so an
     * advance a customer pays at order time hits Cash/Bank/Mobile Book and
     * the Customer Ledger the same moment the cash is actually received -
     * not days later when an invoice finally gets generated.
     *
     * invoice_id becomes nullable (an advance payment has none yet); the new
     * quotation_id is what an advance is filed against. A payment always has
     * exactly one of the two set - enforced in PaymentService, not here, to
     * match how the rest of this schema leaves cross-field rules to the
     * application layer rather than DB CHECK constraints.
     *
     * When the invoice is later generated from that same quotation
     * (InvoiceService::generate), every advance payment still carrying that
     * quotation_id gets its invoice_id filled in and folds into the new
     * invoice's paid_amount - it does not get a second ledger/book entry,
     * since that side of the accounting already happened when the advance
     * was taken.
     */
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('quotation_id')
                  ->nullable()
                  ->after('invoice_id')
                  ->constrained('quotations')
                  ->restrictOnDelete();

            $table->index(['quotation_id']);
        });

        // invoice_id's NOT NULL has to drop separately - Laravel's
        // change() on a column with an existing foreign key requires
        // doctrine/dbal on MySQL, which isn't installed here, so MySQL goes
        // through raw SQL instead, mirroring the enum-widening migration's
        // approach of reaching for raw statements wherever the schema
        // builder can't touch an already-constrained column on its own.
        // SQLite (tests) needs no such workaround - Laravel 11+ rebuilds a
        // SQLite table for change() natively, dbal or not.
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedBigInteger('invoice_id')->nullable()->change();
            });
        } else {
            DB::statement('ALTER TABLE payments MODIFY COLUMN invoice_id BIGINT UNSIGNED NULL');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['quotation_id']);
            $table->dropIndex(['quotation_id']);
            $table->dropColumn('quotation_id');
        });

        if (DB::getDriverName() !== 'sqlite') {
            // Safety: any advance payment still unlinked to an invoice has
            // no invoice_id to restore - refuse to re-tighten the column
            // while such rows exist rather than corrupt them with a bogus FK.
            DB::statement('ALTER TABLE payments MODIFY COLUMN invoice_id BIGINT UNSIGNED NOT NULL');
        }
    }
};
