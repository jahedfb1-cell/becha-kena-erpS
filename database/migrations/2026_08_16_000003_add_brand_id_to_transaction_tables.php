<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tags every transactional record with the trade name it was made under.
 *
 * The brand is stored on the record rather than read from whoever is logged
 * in at print time. Reprinting a two-year-old Dhaka Blinds invoice from a
 * Western Blinds account must still produce the Dhaka Blinds document — the
 * old CodeIgniter system got this wrong by reading the branding out of the
 * session, so the same quotation printed differently depending on who opened
 * it.
 *
 * Ledger and book tables get the column now even though the ledger UI is not
 * brand-split yet. Backfilling `brand_id` onto historical rows later would be
 * guesswork, whereas from today every new row records it correctly — so when
 * the per-brand ledger view is built it only needs a `where`, no migration.
 *
 * Every existing row is backfilled to brand 1 (Dhaka Blinds), which is what
 * they have always effectively been.
 */
return new class extends Migration
{
    /**
     * Deliberately not including customers, products or suppliers: those stay
     * shared between brands, so the same customer can buy under either name.
     */
    private array $tables = [
        'quotations',
        'invoices',
        'delivery_challans',
        'payments',
        'vouchers',
        'expenses',
        'customer_ledgers',
        'supplier_ledgers',
        'cash_book_entries',
        'bank_book_entries',
        'mobile_book_entries',
        'purchase_entries',
    ];

    public function up(): void
    {
        foreach ($this->tables as $name) {
            if (!Schema::hasTable($name) || Schema::hasColumn($name, 'brand_id')) {
                continue;
            }

            Schema::table($name, function (Blueprint $table) {
                $table->foreignId('brand_id')
                      ->nullable()
                      ->constrained('brands')
                      ->nullOnDelete();
            });

            DB::table($name)->whereNull('brand_id')->update(['brand_id' => 1]);
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $name) {
            if (!Schema::hasTable($name) || !Schema::hasColumn($name, 'brand_id')) {
                continue;
            }

            Schema::table($name, function (Blueprint $table) {
                $table->dropForeign(['brand_id']);
                $table->dropColumn('brand_id');
            });
        }
    }
};
