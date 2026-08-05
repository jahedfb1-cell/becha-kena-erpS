<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * expense_number format: EXP-2025-0001 (auto-generated via Model observer)
     *
     * Payment হলে অটোমেটিক cash/bank/mobile book-এ 'out' entry হবে।
     * এই logic Service layer-এ handle করতে হবে।
     */
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('expense_number', 30)->unique()
                  ->comment('Format: EXP-2025-0001, auto-generated via Observer');
            $table->foreignId('expense_category_id')
                  ->constrained('expense_categories')
                  ->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->enum('payment_method', ['cash', 'bank', 'mobile'])
                  ->comment('Payment method → corresponding book-এ auto-entry হবে');
            $table->string('bank_name')->nullable()
                  ->comment('payment_method=bank হলে প্রযোজ্য');
            $table->string('mobile_provider')->nullable()
                  ->comment('payment_method=mobile হলে প্রযোজ্য');
            $table->string('reference_number')->nullable()
                  ->comment('Cheque no. / TrxID');
            $table->text('description')->nullable();
            $table->date('expense_date');
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index(['expense_date', 'expense_category_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
