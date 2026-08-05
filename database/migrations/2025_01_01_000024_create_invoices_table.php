<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number', 30)->unique()
                  ->comment('Format: INV-2025-0001');

            $table->foreignId('quotation_id')
                  ->constrained('quotations')
                  ->restrictOnDelete();
            $table->foreignId('customer_id')
                  ->constrained('customers')
                  ->restrictOnDelete();
            $table->foreignId('salesman_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('vat_amount', 12, 2)->default(0);
            $table->decimal('grand_total', 14, 2)->default(0);
            $table->decimal('paid_amount', 14, 2)->default(0);
            $table->decimal('due_amount', 14, 2)->default(0);

            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->default('unpaid');
            $table->date('invoice_date');

            $table->foreignId('created_by')
                  ->constrained('users')
                  ->restrictOnDelete();

            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->text('archive_reason')->nullable();

            $table->timestamps();

            $table->index(['customer_id', 'payment_status']);
            $table->index(['quotation_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
