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
     * balance = running cash balance (হাতে কত নগদ আছে)
     *   → 'in'  entry → balance বাড়ে
     *   → 'out' entry → balance কমে
     * প্রতি row-তে সেই মুহূর্তের cash-in-hand ট্র্যাক।
     * Day-end closing balance instant পাওয়া যায় → last row of the day।
     * ──────────────────────────────────────────────────────────────────
     *
     * POLYMORPHIC reference_type + reference_id:
     * ──────────────────────────────────────────────────────────────────
     * Payment     → Cash book 'in'  entry (customer payment)
     * Expense     → Cash book 'out' entry
     * Voucher     → Cash book 'out' entry (supplier payment via cash)
     * একই pattern সব book-এ consistent রাখা হয়েছে।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('cash_book_entries', function (Blueprint $table) {
            $table->id();
            $table->enum('entry_type', ['in', 'out'])
                  ->comment('in = টাকা ঢুকলো, out = টাকা বের হলো');
            // Polymorphic reference
            $table->string('reference_type')->comment('Payment / Expense / Voucher — morphTo type');
            $table->unsignedBigInteger('reference_id')->comment('morphTo id');
            $table->string('description');
            $table->decimal('amount', 12, 2);
            $table->decimal('balance', 12, 2)
                  ->comment('Running cash balance — হাতে কত নগদ আছে এই মুহূর্তে। Day closing instant পাওয়া যায়।');
            $table->date('entry_date');
            // Archive fields
            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('archive_reason')->nullable();
            // Created by
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index(['entry_date']);
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cash_book_entries');
    }
};
