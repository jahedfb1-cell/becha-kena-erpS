<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * purchase_number format: PO-2025-0001
     * Created automatically when a Quotation is approved.
     * One PurchaseEntry per QuotationItem line.
     */
    public function up(): void
    {
        Schema::create('purchase_entries', function (Blueprint $table) {
            $table->id();
            $table->string('purchase_number', 30)->unique()
                  ->comment('Format: PO-2025-0001');

            $table->foreignId('quotation_id')
                  ->constrained('quotations')
                  ->restrictOnDelete();
            $table->foreignId('quotation_item_id')
                  ->constrained('quotation_items')
                  ->restrictOnDelete();
            $table->foreignId('supplier_id')
                  ->constrained('suppliers')
                  ->restrictOnDelete();
            $table->foreignId('product_id')
                  ->constrained('products')
                  ->restrictOnDelete();
            $table->foreignId('product_variant_id')
                  ->nullable()
                  ->constrained('product_variants')
                  ->nullOnDelete();

            // Dimensions & sqft from quotation item
            $table->decimal('width', 10, 2)->default(0);
            $table->decimal('height', 10, 2)->default(0);
            $table->unsignedInteger('pcs')->default(1);
            $table->decimal('billed_sqft', 10, 2)->default(0);
            $table->decimal('cost_price', 10, 2)->default(0);
            $table->decimal('total_cost', 12, 2)->default(0)
                  ->comment('cost_price × billed_sqft');

            $table->date('purchase_date')->nullable();
            $table->enum('status', ['pending', 'ordered', 'received', 'cancelled'])
                  ->default('pending');
            $table->boolean('is_reversed')->default(false)
                  ->comment('True when parent quotation is archived');

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

            $table->index(['quotation_id']);
            $table->index(['supplier_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('purchase_entries');
    }
};
