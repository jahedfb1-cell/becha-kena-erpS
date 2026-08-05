<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * ────────────────────────────────────────────────────────────
     * WHY RAW SQL INSTEAD OF Blueprint->enum()?
     * ────────────────────────────────────────────────────────────
     * MySQL ENUM alteration via Laravel's Schema builder (change())
     * has a known limitation: it drops and recreates the column,
     * which can LOSE DATA on existing rows.
     *
     * The safe MySQL approach for adding a new ENUM value is:
     *   ALTER TABLE ... MODIFY COLUMN ... ENUM('old1','old2','new_value')
     *
     * This preserves all existing data while extending the enum.
     * ────────────────────────────────────────────────────────────
     *
     * Adds 'opening_balance' to customer_ledgers.transaction_type enum.
     * Before: ['invoice', 'payment', 'discount', 'adjustment']
     * After:  ['invoice', 'payment', 'discount', 'adjustment', 'opening_balance']
     */
    public function up(): void
    {
        // SQLite (used in tests) does NOT support ENUM or MODIFY COLUMN.
        // In SQLite every column is TEXT anyway, so new values like
        // 'opening_balance' are accepted without any schema change.
        // We only run the ALTER on a real MySQL/MariaDB connection.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("
                ALTER TABLE customer_ledgers
                MODIFY COLUMN transaction_type
                ENUM('invoice', 'payment', 'discount', 'adjustment', 'opening_balance')
                NOT NULL
            ");
        }
    }

    /**
     * Reverse the migrations.
     *
     * Removes 'opening_balance' from enum.
     * NOTE: Any existing rows with transaction_type='opening_balance'
     * must be cleaned up before rolling back, otherwise MySQL will error.
     */
    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            // Safety: migrate any opening_balance rows to 'adjustment' before shrinking enum
            DB::statement("
                UPDATE customer_ledgers
                SET transaction_type = 'adjustment'
                WHERE transaction_type = 'opening_balance'
            ");

            DB::statement("
                ALTER TABLE customer_ledgers
                MODIFY COLUMN transaction_type
                ENUM('invoice', 'payment', 'discount', 'adjustment')
                NOT NULL
            ");
        }
    }
};
