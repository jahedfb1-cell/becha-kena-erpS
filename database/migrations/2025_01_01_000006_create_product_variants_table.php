<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Product variants — e.g. Ivory White, Dark Brown, Pearl
     */
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            // FK: parent product
            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();
            $table->string('variant_name')->comment('e.g. Ivory White, Dark Brown');
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
        Schema::dropIfExists('product_variants');
    }
};
