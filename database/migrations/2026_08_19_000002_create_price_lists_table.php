<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A saved rate card — the sheet of "this is what our products cost per
 * sq.ft" that a salesman hands a client before any window has been
 * measured.
 *
 * This is deliberately NOT a quotation. A quotation prices specific windows
 * at specific sizes and can be approved and converted into an order; a price
 * list quotes nothing but rates, has no totals, and never becomes an order.
 * Keeping it in its own table means the quotation pipeline (status, approval,
 * supplier assignment, purchase entries) is not burdened with rows that can
 * never travel through it.
 *
 * The customer's details are stored as a snapshot alongside `customer_id`,
 * the same way an issued Mushak challan snapshots its buyer: reprinting a
 * rate card sent out months ago has to reproduce the address and phone as
 * they were on the day it was sent. `customer_id` is nullable because these
 * are routinely produced for a walk-in enquiry with no customer record yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_lists', function (Blueprint $table) {
            $table->id();

            $table->string('reference_no', 30)->unique()
                  ->comment('Format: PL-2026-0001');

            $table->foreignId('brand_id')
                  ->nullable()
                  ->constrained('brands')
                  ->nullOnDelete();

            $table->foreignId('customer_id')
                  ->nullable()
                  ->constrained('customers')
                  ->nullOnDelete();

            // Customer, as known on the day the rate card was issued.
            $table->string('customer_name', 150)->nullable();
            $table->string('customer_company', 150)->nullable();
            $table->string('customer_phone', 30)->nullable();
            $table->text('customer_address')->nullable();

            $table->date('issue_date');
            $table->string('subject', 255)->nullable();
            $table->string('validity', 60)->nullable()
                  ->comment('Free text, e.g. "15 Days" - not a computed expiry');
            $table->text('terms')->nullable();

            $table->foreignId('created_by')
                  ->constrained('users')
                  ->restrictOnDelete();

            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->text('archive_reason')->nullable();

            $table->timestamps();

            // The list page filters by brand + date and, for a salesman, by
            // who created the row.
            $table->index(['brand_id', 'issue_date']);
            $table->index(['created_by', 'is_archived']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_lists');
    }
};
