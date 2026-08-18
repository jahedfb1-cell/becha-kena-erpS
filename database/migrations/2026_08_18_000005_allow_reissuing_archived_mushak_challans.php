<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets an invoice get a fresh VAT challan after a wrong one is archived.
 *
 * The table was created with `sales_invoice_id` unique, while its own
 * docblock described the correction path as "archiving the challan and
 * issuing a fresh one". Those two cannot both hold: once a challan exists
 * for an invoice the unique index refuses a second row, archived or not, so
 * archiving a challan issued at the wrong rate left the invoice with no way
 * to ever carry a correct one.
 *
 * MySQL has no partial unique index, so "at most one *active* challan per
 * invoice" cannot be expressed in the schema. The index becomes an ordinary
 * one and the rule moves into MushakService::assertIssuable(), which
 * already refuses to issue against an invoice that has a live challan.
 * Issuing runs inside a transaction, and challans are issued one at a time
 * by an administrator, so the check is where the rule belongs.
 *
 * Nothing is lost by relaxing it: archived rows stay in place, still
 * numbered in the same unbroken NBR sequence, and remain auditable.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The plain index has to exist before the unique one goes, in both
        // directions: the foreign key on sales_invoice_id needs some index to
        // sit on, and MySQL refuses to drop the last one that qualifies
        // ("Cannot drop index ...: needed in a foreign key constraint").
        Schema::table('mushak_invoices', function (Blueprint $table) {
            $table->index('sales_invoice_id');
        });

        Schema::table('mushak_invoices', function (Blueprint $table) {
            $table->dropUnique('mushak_invoices_sales_invoice_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('mushak_invoices', function (Blueprint $table) {
            $table->unique('sales_invoice_id');
        });

        Schema::table('mushak_invoices', function (Blueprint $table) {
            $table->dropIndex(['sales_invoice_id']);
        });
    }
};
