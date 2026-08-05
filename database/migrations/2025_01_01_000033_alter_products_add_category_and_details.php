<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds product_category_id FK and details text column to products table.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('product_category_id')
                  ->nullable()
                  ->after('unit')
                  ->constrained('product_categories')
                  ->nullOnDelete();

            $table->text('details')->nullable()->after('default_unit_price')
                  ->comment('Product Details text for quotation and invoice print');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropForeign(['product_category_id']);
            $table->dropColumn(['product_category_id', 'details']);
        });
    }
};
