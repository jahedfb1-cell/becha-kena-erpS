<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One quoted rate per row, in printed order.
 *
 * `product_id` is kept so a saved list can be traced back to the product
 * master, but every printed value is stored on the row itself rather than
 * read through the relation. A rate card is a statement about prices on the
 * day it was sent: if `default_unit_price` is raised next month, the sheet
 * already in the client's hands must keep showing what it quoted. It is
 * nullable both because a line can be typed free-hand (a product not yet in
 * the master) and so that archiving a product never blanks an old sheet.
 *
 * There is no quantity or line total here on purpose — a price list quotes
 * a rate per unit and nothing else. Sizes and totals are what the Quotation
 * flow is for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_list_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('price_list_id')
                  ->constrained('price_lists')
                  ->cascadeOnDelete();

            $table->foreignId('product_id')
                  ->nullable()
                  ->constrained('products')
                  ->nullOnDelete();

            $table->unsignedInteger('serial_no');

            $table->string('product_name', 255);
            $table->text('description')->nullable();
            $table->string('color_code', 100)->nullable();
            $table->string('uom', 30)->default('1 Sq.Ft');
            $table->decimal('rate', 14, 2)->default(0);
            $table->string('remarks', 255)->nullable();

            $table->timestamps();

            $table->index(['price_list_id', 'serial_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_list_items');
    }
};
