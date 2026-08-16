<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations to support Sections, Options & Print Toggles.
     */
    public function up(): void
    {
        // Each column is guarded individually because this migration was found
        // half-applied on an existing database — `section_name` was already
        // present while the rest were not, and its migrations-table row was
        // missing, so a plain re-run died on a duplicate-column error and
        // blocked every migration queued behind it.
        Schema::table('quotation_items', function (Blueprint $table) {
            if (!Schema::hasColumn('quotation_items', 'section_name')) {
                $table->string('section_name')->nullable()->after('quotation_id')->comment('Section/Group name (e.g. Ground Floor)');
            }
            if (!Schema::hasColumn('quotation_items', 'option_group_id')) {
                $table->string('option_group_id')->nullable()->after('section_name')->comment('Option group identifier for variations');
            }
            if (!Schema::hasColumn('quotation_items', 'is_optional')) {
                $table->boolean('is_optional')->default(false)->after('option_group_id')->comment('True if item is an optional variation');
            }
            if (!Schema::hasColumn('quotation_items', 'is_selected')) {
                $table->boolean('is_selected')->default(true)->after('is_optional')->comment('True if this option variation is selected');
            }
            if (!Schema::hasColumn('quotation_items', 'is_enabled_for_print')) {
                $table->boolean('is_enabled_for_print')->default(true)->after('is_selected')->comment('True if enabled for print and calculation');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('quotation_items', function (Blueprint $table) {
            $table->dropColumn([
                'section_name',
                'option_group_id',
                'is_optional',
                'is_selected',
                'is_enabled_for_print',
            ]);
        });
    }
};
