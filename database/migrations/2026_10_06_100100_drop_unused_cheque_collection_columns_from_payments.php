<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the three payments columns left behind by the cheque-clearance
 * feature that was rolled back on 11 Aug (7f65b62). Its migration
 * (2026_08_10_000001_add_cheque_and_collection_fields_to_payments) had
 * already run on the live database, and the rollback deleted the migration
 * file without dropping the columns, so live carried columns nothing reads
 * or writes. On live they hold no data: cheque_status and collected_by_name
 * are empty everywhere and collection_channel is the default "office".
 *
 * Guarded, so it is a no-op on a database that never had them. down() puts
 * them back exactly as that migration defined them.
 */
return new class extends Migration
{
    private const COLUMNS = ['cheque_status', 'collection_channel', 'collected_by_name'];

    public function up(): void
    {
        $present = array_values(array_filter(self::COLUMNS, fn ($c) => Schema::hasColumn('payments', $c)));
        if ($present) {
            Schema::table('payments', fn (Blueprint $table) => $table->dropColumn($present));
        }
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasColumn('payments', 'cheque_status')) {
                $table->enum('cheque_status', ['pending', 'cleared', 'bounced'])->nullable()->after('cheque_number');
            }
            if (!Schema::hasColumn('payments', 'collection_channel')) {
                $table->enum('collection_channel', ['office', 'field_technician'])->default('office')->after('cheque_status');
            }
            if (!Schema::hasColumn('payments', 'collected_by_name')) {
                $table->string('collected_by_name')->nullable()->after('collection_channel');
            }
        });
    }
};
