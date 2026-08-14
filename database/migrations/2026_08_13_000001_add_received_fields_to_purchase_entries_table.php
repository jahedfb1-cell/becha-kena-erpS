<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('purchase_entries', 'received_at')) {
            Schema::table('purchase_entries', function (Blueprint $table) {
                $table->timestamp('received_at')->nullable()->after('status');
                $table->unsignedBigInteger('received_by')->nullable()->after('received_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('purchase_entries', 'received_at')) {
            Schema::table('purchase_entries', function (Blueprint $table) {
                $table->dropColumn(['received_at', 'received_by']);
            });
        }
    }
};
