<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Supports the salesman <-> accounts payment-notification loop:
     *  - cheque_status tracks bank-cheque clearance so the salesman is only
     *    notified once a cheque actually clears (not the moment it's entered).
     *  - collection_channel / collected_by_name record whether the money was
     *    handed in at the office or collected on-site by a field technician
     *    (technicians have no ERP login, so this is a note, not a user link).
     */
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->enum('cheque_status', ['pending', 'cleared', 'bounced'])
                  ->nullable()
                  ->after('cheque_number')
                  ->comment('Only set when payment_method=bank. Salesman notification waits for cleared.');

            $table->enum('collection_channel', ['office', 'field_technician'])
                  ->default('office')
                  ->after('cheque_status');

            $table->string('collected_by_name')->nullable()->after('collection_channel')
                  ->comment('Free-text technician/collector name when collection_channel=field_technician');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['cheque_status', 'collection_channel', 'collected_by_name']);
        });
    }
};
