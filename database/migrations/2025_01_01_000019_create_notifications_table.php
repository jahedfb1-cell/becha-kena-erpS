<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * In-app notification center।
     * reference_type + reference_id দিয়ে notification-এ click করলে
     * সরাসরি সেই record-এ navigate করা যাবে।
     *
     * উদাহরণ:
     *   type='invoice', reference_type='Invoice', reference_id=42
     *   → Click → /invoices/42
     */
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->enum('type', [
                'quotation',
                'order',
                'invoice',
                'payment',
                'complaint',
                'system',
            ]);
            // Polymorphic deep-link reference
            $table->string('reference_type')->nullable()
                  ->comment('Quotation / Invoice / Payment / ComplaintTicket — navigation target');
            $table->unsignedBigInteger('reference_id')->nullable()
                  ->comment('ID of the target record for navigation on click');

            $table->boolean('is_read')->default(false);
            $table->timestamp('read_at')->nullable();

            $table->timestamps();

            // Fast unread count per user
            $table->index(['user_id', 'is_read', 'created_at']);
            $table->index(['reference_type', 'reference_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
