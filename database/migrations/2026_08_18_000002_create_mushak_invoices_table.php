<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * NBR Mushak 6.3 — the VAT challan issued against a sales invoice.
 *
 * Almost every field here duplicates something already reachable through
 * `sales_invoice_id`, and that is the point. A challan handed to the VAT
 * office is a statement about one moment: reprinting it two years later has
 * to reproduce the buyer's address, BIN and rate exactly as issued, even if
 * the customer record has since been corrected or the brand's registration
 * has changed. Reading those through the relation would let a later edit
 * silently rewrite an issued document.
 *
 * `sales_invoice_id` is unique: one invoice yields one challan. A mistake is
 * corrected by archiving the challan and issuing a fresh one, never by
 * editing the issued figures.
 *
 * The brand column carries the usual tenant tag, but VAT registration
 * belongs to Western Blinds Ltd alone, so in practice every row here is
 * brand 2. The column stays for consistency with the other transactional
 * tables and so the print layout can resolve the right company profile.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mushak_invoices', function (Blueprint $table) {
            $table->id();

            $table->string('challan_number', 30)->unique()
                  ->comment('Format: MUSHAK-2026-0001');

            $table->foreignId('sales_invoice_id')
                  ->unique()
                  ->constrained('invoices')
                  ->restrictOnDelete();

            $table->foreignId('brand_id')
                  ->nullable()
                  ->constrained('brands')
                  ->nullOnDelete();

            $table->date('issue_date');
            $table->time('issue_time')
                  ->comment('Mushak 6.3 requires the time of issue, not only the date');

            // Seller, as registered at the moment of issue.
            $table->string('seller_name', 150);
            $table->string('seller_bin', 30);
            $table->text('seller_address');

            // Buyer, as known at the moment of issue. BIN is nullable because
            // customers routinely do not supply one until the invoice is
            // actually presented to them, and an unregistered buyer has none
            // at all.
            $table->string('buyer_name', 150);
            $table->text('buyer_address')->nullable();
            $table->string('buyer_bin', 30)->nullable();

            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->boolean('vat_inclusive')->default(false);

            $table->decimal('taxable_amount', 14, 2)->default(0);
            $table->decimal('sd_amount', 14, 2)->default(0)
                  ->comment('Supplementary duty; zero for this trade, column required by the form');
            $table->decimal('vat_amount', 14, 2)->default(0);
            $table->decimal('grand_total', 14, 2)->default(0);

            $table->string('issued_by_name', 150)->nullable();
            $table->string('issued_by_designation', 150)->nullable();

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

            $table->index(['brand_id', 'issue_date']);
            $table->index(['is_archived']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mushak_invoices');
    }
};
