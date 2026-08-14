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
     * balance = running payable balance (আমরা supplier-কে কত দিতে বাকি আছি)
     *   → Purchase হলে credit বাড়ে (আমাদের payable বাড়ে)
     *   → Payment করলে debit বাড়ে (payable কমে)
     *   → balance = পূর্ববর্তী balance + credit - debit
     * Running balance রাখায় মুহূর্তেই outstanding payable জানা যায়।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('supplier_ledgers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')
                  ->constrained('suppliers')
                  ->restrictOnDelete();
            $table->enum('transaction_type', ['purchase', 'payment', 'adjustment', 'opening_balance']);
            // Polymorphic reference
            $table->string('reference_type')->comment('PurchaseOrder / Voucher / Adjustment — morphTo type');
            $table->unsignedBigInteger('reference_id')->comment('morphTo id');
            $table->string('description');
            $table->decimal('debit', 12, 2)->default(0)
                  ->comment('আমরা supplier-কে payment দিলাম — payable কমে');
            $table->decimal('credit', 12, 2)->default(0)
                  ->comment('Purchase করলাম — আমাদের payable বাড়ে');
            $table->decimal('balance', 12, 2)
                  ->comment('Running payable balance — কত টাকা supplier-কে দিতে বাকি। Instant lookup-এর জন্য।');
            $table->date('transaction_date');
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            // Index for fast ledger lookup per supplier
            $table->index(['supplier_id', 'transaction_date']);
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('supplier_ledgers');
    }
};
