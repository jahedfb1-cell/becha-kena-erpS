<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * quotation_number format: QT-2025-0001 (auto-generated)
     *
     * Status Flow:
     * quotation → pending_approval → approved → invoiced
     *                               → rejected
     *                               → pending_reapproval → approved
     */
    public function up(): void
    {
        Schema::create('quotations', function (Blueprint $table) {
            $table->id();
            $table->string('quotation_number', 30)->unique()
                  ->comment('Format: QT-2025-0001');

            $table->foreignId('customer_id')
                  ->constrained('customers')
                  ->restrictOnDelete();
            $table->foreignId('salesman_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            $table->enum('status', [
                'quotation',
                'pending_approval',
                'approved',
                'rejected',
                'pending_reapproval',
                'invoiced',
            ])->default('quotation');

            // Financial summary
            $table->decimal('subtotal', 14, 2)->default(0)
                  ->comment('SUM of all line_total');
            $table->decimal('convenience_charge', 12, 2)->default(0);
            $table->decimal('other_charge', 12, 2)->default(0);

            $table->decimal('vat_percentage', 5, 2)->default(0);
            $table->decimal('vat_amount', 12, 2)->default(0)
                  ->comment('subtotal × vat_percentage / 100');

            $table->enum('discount_type', ['percentage', 'flat'])->default('flat');
            $table->decimal('discount_value', 12, 2)->default(0)
                  ->comment('Percentage value OR flat amount');
            $table->decimal('discount_amount', 12, 2)->default(0)
                  ->comment('Calculated discount amount');

            $table->decimal('net_amount', 14, 2)->default(0)
                  ->comment('subtotal + convenience + other + vat - discount');

            $table->text('note')->nullable();
            $table->text('rejection_reason')->nullable();

            // Approval tracking
            $table->foreignId('approved_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->text('archive_reason')->nullable();

            $table->foreignId('created_by')
                  ->constrained('users')
                  ->restrictOnDelete();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index(['salesman_id', 'status']);
            $table->index(['created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quotations');
    }
};
