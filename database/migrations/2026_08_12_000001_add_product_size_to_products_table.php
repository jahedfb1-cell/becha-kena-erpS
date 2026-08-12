<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('products', 'product_size')) {
            Schema::table('products', function (Blueprint $table) {
                $table->decimal('product_size', 8, 2)->nullable()->after('default_unit_price');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('products', 'product_size')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropColumn('product_size');
            });
        }
    }
};
