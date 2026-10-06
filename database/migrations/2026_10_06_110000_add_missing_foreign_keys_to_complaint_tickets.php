<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The complaint_tickets migration created invoice_id, quotation_item_id and
 * replacement_quotation_id as plain columns, noting "constraint added after
 * ... is created" - and the constraints never were. Adds them now (restrict:
 * invoices, quotations and their lines are archived, never deleted, so a
 * ticket can always reach the document it is about).
 *
 * Also indexes the balance-transfer account columns. They cannot carry a
 * foreign key - each one points at a bank OR a mobile account, by
 * *_account_type - so the type + id pair is indexed instead.
 */
return new class extends Migration
{
    private const KEYS = [
        'invoice_id'               => 'invoices',
        'quotation_item_id'        => 'quotation_items',
        'replacement_quotation_id' => 'quotations',
    ];

    public function up(): void
    {
        Schema::table('complaint_tickets', function (Blueprint $table) {
            foreach (self::KEYS as $column => $parent) {
                $table->foreign($column)->references('id')->on($parent)->restrictOnDelete();
            }
        });

        Schema::table('balance_transfers', function (Blueprint $table) {
            $table->index(['from_account_type', 'from_account_id'], 'balance_transfers_from_account_index');
            $table->index(['to_account_type', 'to_account_id'], 'balance_transfers_to_account_index');
        });
    }

    public function down(): void
    {
        Schema::table('balance_transfers', function (Blueprint $table) {
            $table->dropIndex('balance_transfers_from_account_index');
            $table->dropIndex('balance_transfers_to_account_index');
        });

        Schema::table('complaint_tickets', function (Blueprint $table) {
            foreach (array_keys(self::KEYS) as $column) {
                $table->dropForeign([$column]);
            }
        });
    }
};
