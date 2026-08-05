<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * ──────────────────────────────────────────────────────────────────
     * BALANCE FIELD ব্যাখ্যা:
     * ──────────────────────────────────────────────────────────────────
     * balance = bank account-এর running balance
     * একাধিক bank account থাকতে পারে।
     * bank_name + account_number দিয়ে filter করলে
     * specific account-এর statement পাওয়া যাবে।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('bank_book_entries', function (Blueprint $table) {
            $table->id();
            $table->string('bank_name')->comment('e.g. Dutch-Bangla Bank, Islami Bank');
            $table->string('account_number')->nullable()->comment('Bank account number');
            $table->enum('entry_type', ['in', 'out'])
                  ->comment('in = deposit/receive, out = withdrawal/payment');
            // Polymorphic reference
            $table->string('reference_type')->comment('Payment / Voucher / Transfer — morphTo type');
            $table->unsignedBigInteger('reference_id')->comment('morphTo id');
            $table->string('description');
            $table->string('cheque_number')->nullable()->comment('Cheque no. যদি থাকে');
            $table->decimal('amount', 12, 2);
            $table->decimal('balance', 12, 2)
                  ->comment('Running bank balance per account. bank_name+account_number দিয়ে filter করে account-specific balance পাওয়া যায়।');
            $table->date('entry_date');
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index(['bank_name', 'account_number', 'entry_date']);
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bank_book_entries');
    }
};
