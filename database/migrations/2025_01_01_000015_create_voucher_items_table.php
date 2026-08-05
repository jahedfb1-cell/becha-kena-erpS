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
     * VOUCHER ITEMS — Double Entry Accounting
     * ──────────────────────────────────────────────────────────────────
     * Journal Voucher-এর প্রতিটি line item এখানে থাকে।
     * Double Entry নিয়ম: SUM(debit) = SUM(credit) for same voucher_id
     *
     * উদাহরণ (Supplier Payment via Bank):
     *   Line 1: account_head='Dutch Bangla Bank'  debit=5000  credit=0    (Bank কমলো)
     *   Line 2: account_head='Supplier ABC'       debit=0     credit=5000 (Payable কমলো)
     *
     * উদাহরণ (Customer Payment Cash):
     *   Line 1: account_head='Cash'               debit=3000  credit=0    (Cash বাড়লো)
     *   Line 2: account_head='Customer XYZ'       debit=0     credit=3000 (Receivable কমলো)
     *
     * reference_type + reference_id → morphTo
     *   reference_type='Supplier', reference_id=5  → suppliers table-এর row 5
     *   reference_type='Customer', reference_id=12 → customers table-এর row 12
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('voucher_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('voucher_id')
                  ->constrained('vouchers')
                  ->cascadeOnDelete();
            $table->string('account_head')
                  ->comment('e.g. Supplier Name / Cash / Dutch Bangla Bank / Customer ABC');
            // Polymorphic reference (nullable — সব line item-এ entity নাও থাকতে পারে)
            $table->string('reference_type')->nullable()
                  ->comment('Supplier / Customer / NULL — morphTo type');
            $table->unsignedBigInteger('reference_id')->nullable()
                  ->comment('morphTo id — nullable কারণ Cash/Bank line-এ entity থাকে না');
            $table->decimal('debit', 12, 2)->default(0)
                  ->comment('এই account head-এ কত টাকা debit হলো');
            $table->decimal('credit', 12, 2)->default(0)
                  ->comment('এই account head-এ কত টাকা credit হলো');
            $table->string('description')->nullable();
            $table->timestamps();

            // voucher_items-এ archived_by/is_archived নেই — voucher archive হলে cascade delete
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('voucher_items');
    }
};
