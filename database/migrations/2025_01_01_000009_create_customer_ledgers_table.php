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
     * balance = running balance (প্রতিটি row-তে সেই মুহূর্তের মোট বাকি)
     * কেন রাখছি?
     *   → SUM() query ছাড়াই যেকোনো সময়ের balance instant পাওয়া যায়
     *   → Statement/PDF generate করতে O(1) lookup
     *   → বড় dataset-এ performance অনেক ভালো
     * কীভাবে maintain করব?
     *   → Service class-এ নতুন entry insert করার আগে last balance নিয়ে
     *      debit বা credit যোগ/বিয়োগ করে নতুন balance সেট করব
     * ──────────────────────────────────────────────────────────────────
     *
     * REFERENCE_TYPE + REFERENCE_ID (Polymorphic) ব্যাখ্যা:
     * ──────────────────────────────────────────────────────────────────
     * reference_type = 'Invoice'  → reference_id = invoices.id
     * reference_type = 'Payment'  → reference_id = payments.id
     * reference_type = 'Voucher'  → reference_id = vouchers.id
     *
     * এটি Laravel-এর morphTo() relation এর মতো কাজ করে:
     *   public function reference(): MorphTo
     *   {
     *       return $this->morphTo(__FUNCTION__, 'reference_type', 'reference_id');
     *   }
     * Model map করতে Relation::enforceMorphMap([...]) ব্যবহার করব।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('customer_ledgers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')
                  ->constrained('customers')
                  ->restrictOnDelete();
            $table->foreignId('salesman_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->enum('transaction_type', ['invoice', 'payment', 'discount', 'adjustment', 'opening_balance']);
            // Polymorphic reference
            $table->string('reference_type')->comment('Invoice / Payment / Voucher — morphTo type');
            $table->unsignedBigInteger('reference_id')->comment('morphTo id — points to the source record');
            $table->string('description');
            $table->decimal('debit', 12, 2)->default(0)
                  ->comment('Customer-এর বাকি বাড়ে — invoice raise করলে debit');
            $table->decimal('credit', 12, 2)->default(0)
                  ->comment('Payment বা discount পেলে credit — বাকি কমে');
            $table->decimal('balance', 12, 2)
                  ->comment('Running balance: প্রতি row-তে সেই মুহূর্তের মোট বাকি। SUM() ছাড়াই instant lookup।');
            $table->date('transaction_date');
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            // Index for fast ledger lookup per customer
            $table->index(['customer_id', 'transaction_date']);
            // Polymorphic index
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customer_ledgers');
    }
};
