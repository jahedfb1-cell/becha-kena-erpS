<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds 'opening_balance' to supplier_ledgers.transaction_type enum.
     * Before: ['purchase', 'payment', 'adjustment']
     * After:  ['purchase', 'payment', 'adjustment', 'opening_balance']
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("
                ALTER TABLE supplier_ledgers
                MODIFY COLUMN transaction_type
                ENUM('purchase', 'payment', 'adjustment', 'opening_balance')
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
            DB::statement("
                UPDATE supplier_ledgers
                SET transaction_type = 'adjustment'
                WHERE transaction_type = 'opening_balance'
            ");

            DB::statement("
                ALTER TABLE supplier_ledgers
                MODIFY COLUMN transaction_type
                ENUM('purchase', 'payment', 'adjustment')
                NOT NULL
            ");
        }
    }
};
