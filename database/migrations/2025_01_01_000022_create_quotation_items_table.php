<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Calculation:
     *   actual_sqft  = (width × height) / 144
     *   billed_sqft  = MAX(actual_sqft, min_billing_sqft) × pcs
     *   line_total   = billed_sqft × unit_price
     */
    public function up(): void
    {
        Schema::create('quotation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quotation_id')
                  ->constrained('quotations')
                  ->cascadeOnDelete();
            $table->foreignId('product_id')
                  ->constrained('products')
                  ->restrictOnDelete();
            $table->foreignId('product_variant_id')
                  ->nullable()
                  ->constrained('product_variants')
                  ->nullOnDelete();
            $table->foreignId('supplier_id')
                  ->nullable()
                  ->constrained('suppliers')
                  ->nullOnDelete()
                  ->comment('Auto-routed or manually overridden supplier');

            // Dimensions
            $table->decimal('width', 10, 2)->default(0)->comment('Inches');
            $table->decimal('height', 10, 2)->default(0)->comment('Inches');
            $table->unsignedInteger('pcs')->default(1);

            // Calculated sqft
            $table->decimal('actual_sqft', 10, 2)->default(0)
                  ->comment('(width × height) / 144');
            $table->decimal('min_billing_sqft', 10, 2)->default(0)
                  ->comment('From product_supplier_links, overridable');
            $table->decimal('billed_sqft', 10, 2)->default(0)
                  ->comment('MAX(actual_sqft, min_billing_sqft) × pcs');

            // Pricing
            $table->decimal('unit_price', 10, 2)->default(0)
                  ->comment('Selling price per sqft');
            $table->decimal('cost_price', 10, 2)->default(0)
                  ->comment('Purchase cost per sqft from supplier');
            $table->decimal('line_total', 12, 2)->default(0)
                  ->comment('billed_sqft × unit_price');

            // Supplier override
            $table->boolean('is_supplier_overridden')->default(false)
                  ->comment('True if salesman manually selected supplier');

            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['quotation_id']);
            $table->index(['product_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quotation_items');
    }
};
