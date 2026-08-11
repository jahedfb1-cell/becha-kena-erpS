<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('invoices', 'po_number')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->string('po_number', 100)->nullable()->after('invoice_number');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('invoices', 'po_number')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->dropColumn('po_number');
            });
        }
    }
};
