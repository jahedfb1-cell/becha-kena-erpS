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
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number', 30)->unique()
                  ->comment('Format: PAY-2025-0001');

            $table->foreignId('invoice_id')
                  ->constrained('invoices')
                  ->restrictOnDelete();
            $table->foreignId('customer_id')
                  ->constrained('customers')
                  ->restrictOnDelete();

            $table->decimal('amount', 14, 2);
            $table->enum('payment_method', ['cash', 'bank', 'mobile']);
            
            // Optional fields based on payment method
            $table->string('bank_name')->nullable();
            $table->string('mobile_provider')->nullable();
            $table->string('transaction_id')->nullable();
            $table->string('cheque_number')->nullable();
            
            $table->date('payment_date');
            $table->text('notes')->nullable();

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

            $table->index(['invoice_id']);
            $table->index(['customer_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
