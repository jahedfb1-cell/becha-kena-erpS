<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * ticket_number format: TKT-2025-0001 (auto-generated via Model observer)
     *
     * ──────────────────────────────────────────────────────────────────
     * FK NOTE:
     * invoice_id           → invoices.id         (table পরে তৈরি হবে)
     * quotation_item_id    → quotation_items.id   (table পরে তৈরি হবে)
     * replacement_quotation_id → quotations.id    (table পরে তৈরি হবে)
     *
     * এই তিনটি FK constraint এখন যোগ করা হয়নি কারণ referenced tables
     * এখনো exist করে না। Transaction tables migrate হওয়ার পরে
     * একটি আলাদা alter migration দিয়ে FK constraint যোগ করতে হবে।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('complaint_tickets', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_number', 30)->unique()
                  ->comment('Format: TKT-2025-0001, auto-generated via Observer');

            // Forward reference FK — constraint পরে যোগ হবে
            $table->unsignedBigInteger('invoice_id')->nullable()
                  ->comment('FK → invoices.id (constraint added after invoices table is created)');
            $table->unsignedBigInteger('quotation_item_id')->nullable()
                  ->comment('FK → quotation_items.id (constraint added after quotation_items table is created)');

            // Existing table FK
            $table->foreignId('customer_id')
                  ->constrained('customers')
                  ->restrictOnDelete();
            $table->foreignId('salesman_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            $table->enum('issue_type', [
                'cutting_mistake',
                'defect',
                'wrong_size',
                'wrong_color',
                'others',
            ]);
            $table->text('description');

            $table->enum('status', ['open', 'in_review', 'resolved', 'rejected'])
                  ->default('open');

            $table->enum('resolution_type', [
                'replacement',
                'refund',
                'repair',
                'no_action',
            ])->nullable()->comment('Null while ticket is open/in_review');

            $table->text('resolution_note')->nullable();

            // Forward reference FK — constraint পরে যোগ হবে
            $table->unsignedBigInteger('replacement_quotation_id')->nullable()
                  ->comment('FK → quotations.id — replacement order reference (constraint added later)');

            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->text('archive_reason')->nullable();

            // Created by
            $table->foreignId('created_by')
                  ->constrained('users')
                  ->restrictOnDelete();

            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index(['invoice_id']);
            $table->index(['quotation_item_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('complaint_tickets');
    }
};
