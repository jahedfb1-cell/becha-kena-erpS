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
     * balance = mobile wallet-এর running balance per provider per account
     * bKash / Nagad / Rocket আলাদা আলাদা ব্যালেন্স ট্র্যাক।
     * provider + account_number দিয়ে filter করলে
     * specific wallet-এর statement পাওয়া যাবে।
     * ──────────────────────────────────────────────────────────────────
     *
     * transaction_id = bKash/Nagad TrxID (e.g. ABC123XYZ)
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('mobile_book_entries', function (Blueprint $table) {
            $table->id();
            $table->enum('provider', ['bkash', 'nagad', 'rocket'])
                  ->comment('Mobile banking provider');
            $table->string('account_number')->nullable()->comment('Mobile account number (01XXXXXXXXX)');
            $table->enum('entry_type', ['in', 'out'])
                  ->comment('in = receive, out = send/payment');
            // Polymorphic reference
            $table->string('reference_type')->comment('Payment / Voucher / Expense — morphTo type');
            $table->unsignedBigInteger('reference_id')->comment('morphTo id');
            $table->string('description');
            $table->string('transaction_id')->nullable()->comment('bKash/Nagad TrxID যদি থাকে');
            $table->decimal('amount', 12, 2);
            $table->decimal('balance', 12, 2)
                  ->comment('Running mobile wallet balance. provider+account_number দিয়ে filter করে wallet-specific balance। Cash-out charge এখানে track হয় না।');
            $table->date('entry_date');
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index(['provider', 'account_number', 'entry_date']);
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mobile_book_entries');
    }
};
