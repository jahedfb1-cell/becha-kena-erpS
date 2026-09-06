<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Adds 'advance_payment' to customer_ledgers.transaction_type enum, the
     * same safe-widen pattern the 'opening_balance' migration already
     * established for this column (MODIFY COLUMN rather than Schema::change(),
     * which drops and recreates a MySQL enum column and can lose data).
     *
     * Before: ['invoice', 'payment', 'discount', 'adjustment', 'opening_balance']
     * After:  [..., 'advance_payment']
     *
     * A distinct type from 'payment' so a ledger statement can tell "money
     * received against an order before it was ever invoiced" apart from a
     * normal invoice payment at a glance, even though both are a credit.
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("
                ALTER TABLE customer_ledgers
                MODIFY COLUMN transaction_type
                ENUM('invoice', 'payment', 'discount', 'adjustment', 'opening_balance', 'advance_payment')
                NOT NULL
            ");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            // Safety: migrate any advance_payment rows to 'payment' before shrinking enum
            DB::statement("
                UPDATE customer_ledgers
                SET transaction_type = 'payment'
                WHERE transaction_type = 'advance_payment'
            ");

            DB::statement("
                ALTER TABLE customer_ledgers
                MODIFY COLUMN transaction_type
                ENUM('invoice', 'payment', 'discount', 'adjustment', 'opening_balance')
                NOT NULL
            ");
        }
    }
};
