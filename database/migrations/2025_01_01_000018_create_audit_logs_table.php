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
     * AUDIT LOG DESIGN NOTES:
     * ──────────────────────────────────────────────────────────────────
     * 1. user_name (snapshot): user delete হলেও log-এ নাম থাকবে
     *    → users table-এ FK রাখা হয়নি কারণ user delete হলে log হারিয়ে যাবে
     *    → user_id nullable রাখা হয়েছে (system action বা deleted user)
     *
     * 2. old_value / new_value: JSON column-এ পুরো model snapshot রাখা যাবে
     *    উদাহরণ:
     *    old_value: {"status": "pending", "amount": 5000}
     *    new_value: {"status": "approved", "amount": 5000}
     *
     * 3. reference_type + reference_id: কোন record-এ action হয়েছে
     *    module='Invoice', reference_id=42 → invoices.id=42
     *
     * 4. Audit log কখনো UPDATE/DELETE করা যাবে না — immutable by design।
     *    → No is_archived, no softDelete এখানে।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();

            // user_id nullable — system action বা deleted user-এর ক্ষেত্রে
            $table->foreignId('user_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->string('user_name')
                  ->comment('Snapshot of user name at time of action — preserved even after user deletion');

            $table->enum('action_type', [
                'create',
                'update',
                'delete',
                'archive',
                'restore',
                'approve',
                'reject',
                'login',
                'logout',
                'generate',
                'void',
                'convert',
            ]);

            $table->string('module')
                  ->comment('Quotation / Order / Invoice / Payment / Customer etc.');
            $table->string('reference_number')->nullable()
                  ->comment('Human-readable reference e.g. INV-2025-0042');
            $table->unsignedBigInteger('reference_id')->nullable()
                  ->comment('Numeric ID of the affected record');

            $table->json('old_value')->nullable()
                  ->comment('Snapshot of record before change — for update/delete/archive');
            $table->json('new_value')->nullable()
                  ->comment('Snapshot of record after change — for create/update/restore');

            $table->text('description')->nullable()
                  ->comment('Human-readable summary of what happened');

            $table->string('ip_address', 45)->nullable()
                  ->comment('IPv4 or IPv6 — 45 chars covers IPv6 max length');
            $table->text('user_agent')->nullable();

            $table->timestamps();

            // Indexes for fast filtering
            $table->index(['user_id', 'action_type']);
            $table->index(['module', 'reference_id']);
            $table->index(['created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
