<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Links products to their suppliers with priority ranking and cost pricing.
     * priority_rank: 1=Preferred, 2=Secondary, 3=Tertiary
     *
     * Unique constraints:
     *   - (product_id, supplier_id)   → একই product-supplier pair একবারই থাকবে
     *   - (product_id, priority_rank) → একই product-এ দুটি supplier একই priority পাবে না
     */
    public function up(): void
    {
        Schema::create('product_supplier_links', function (Blueprint $table) {
            $table->id();
            // FK: product
            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();
            // FK: supplier
            $table->foreignId('supplier_id')
                  ->constrained('suppliers')
                  ->restrictOnDelete();
            $table->tinyInteger('priority_rank')->unsigned()
                  ->comment('1=Preferred, 2=Secondary, 3=Tertiary');
            $table->decimal('cost_price', 10, 2)->comment('Supplier cost price per unit');
            $table->decimal('min_billing_sqft', 8, 2)
                  ->comment('Minimum billing area in sqft for this supplier');
            // Unique constraints
            $table->unique(['product_id', 'supplier_id'], 'uq_product_supplier');
            $table->unique(['product_id', 'priority_rank'], 'uq_product_priority');
            // FK: user who created
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
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('product_supplier_links');
    }
};
