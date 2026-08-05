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
     * EVENTS JSON STRUCTURE (example):
     * ──────────────────────────────────────────────────────────────────
     * {
     *   "new_quotation":       { "email": true,  "sms": false },
     *   "quotation_approved":  { "email": true,  "sms": true  },
     *   "new_order":           { "email": true,  "sms": false },
     *   "order_delivered":     { "email": false, "sms": true  },
     *   "payment_received":    { "email": true,  "sms": true  },
     *   "new_complaint":       { "email": true,  "sms": false },
     *   "complaint_resolved":  { "email": true,  "sms": false },
     *   "low_stock_alert":     { "email": true,  "sms": false }
     * }
     *
     * এই JSON structure backend-এ NotificationService দিয়ে check করবে।
     * user_id UNIQUE → প্রতি user-এর একটিই settings row।
     * ──────────────────────────────────────────────────────────────────
     */
    public function up(): void
    {
        Schema::create('notification_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                  ->unique()
                  ->constrained('users')
                  ->cascadeOnDelete()
                  ->comment('One settings row per user');

            $table->boolean('email_enabled')->default(true)
                  ->comment('Global email toggle — false হলে সব email বন্ধ');
            $table->boolean('sms_enabled')->default(false)
                  ->comment('Global SMS toggle — false হলে সব SMS বন্ধ');

            $table->json('events')
                  ->nullable()
                  ->comment('Per-event toggle: {"new_quotation":{"email":true,"sms":false},...}');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notification_settings');
    }
};
