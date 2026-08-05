<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * voucher_number format: VCH-2025-0001 (auto-generated via Model observer)
     *
     * voucher_type:
     *   'debit'   → টাকা বের হয় (Supplier payment, expense)
     *   'credit'  → টাকা ঢোকে (Customer receipt)
     *   'journal' → Double entry (transfer, adjustment — debit=credit)
     */
    public function up(): void
    {
        Schema::create('vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('voucher_number', 30)->unique()
                  ->comment('Format: VCH-2025-0001, auto-generated via Observer');
            $table->enum('voucher_type', ['debit', 'credit', 'journal'])
                  ->comment('debit=payment out, credit=receipt in, journal=double entry');
            $table->date('date');
            $table->text('description');
            $table->decimal('total_amount', 12, 2);
            // Payment method — journal voucher-এ nullable
            $table->enum('payment_method', ['cash', 'bank', 'mobile'])->nullable()
                  ->comment('Journal voucher-এ NULL — শুধু debit/credit voucher-এ applicable');
            $table->string('bank_name')->nullable()
                  ->comment('payment_method=bank হলে প্রযোজ্য');
            $table->string('mobile_provider')->nullable()
                  ->comment('payment_method=mobile হলে প্রযোজ্য (bkash/nagad/rocket)');
            $table->string('reference_number')->nullable()
                  ->comment('Cheque no. / TrxID / Bank reference');
            $table->text('note')->nullable();
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index(['date', 'voucher_type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vouchers');
    }
};
