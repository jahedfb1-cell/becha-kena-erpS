<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ties money movements to a registered bank / mobile account.
 *
 * Until now a bank book line only carried a typed bank name ("Dhaka bank",
 * "dhaka blink", ...), so the software could not say how much was in which
 * account, and an account's balance was a stored number that only balance
 * transfers ever changed. From here on:
 *
 * - bank_accounts / mobile_accounts are proper records: brand, created_by,
 *   archive instead of delete, no duplicates.
 * - bank_book_entries, mobile_book_entries and payments point at the account
 *   they moved money through (bank_account_id / mobile_account_id).
 * - An account's balance is computed (opening + the entries linked to it),
 *   never stored, so it cannot drift.
 *
 * Existing book lines keep their typed name and stay unlinked: which real
 * account "Dhaka bank" was is the business's call, not the migration's.
 * Existing accounts are given to the default brand (Dhaka Blinds, id 1),
 * which is where every one of them was created.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['bank_accounts', 'mobile_accounts'] as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->foreignId('brand_id')->nullable()->after('id')->constrained('brands')->nullOnDelete();
                $t->foreignId('created_by')->nullable()->after('is_active')->constrained('users')->nullOnDelete();
                $t->boolean('is_archived')->default(false)->after('created_by');
                $t->timestamp('archived_at')->nullable()->after('is_archived');
                $t->foreignId('archived_by')->nullable()->after('archived_at')->constrained('users')->nullOnDelete();
                $t->text('archive_reason')->nullable()->after('archived_by');
            });
        }

        $defaultBrand = DB::table('brands')->orderBy('id')->value('id');
        if ($defaultBrand) {
            DB::table('bank_accounts')->whereNull('brand_id')->update(['brand_id' => $defaultBrand]);
            DB::table('mobile_accounts')->whereNull('brand_id')->update(['brand_id' => $defaultBrand]);
        }

        Schema::table('bank_accounts', function (Blueprint $t) {
            $t->unique(['brand_id', 'bank_name', 'account_number'], 'bank_accounts_brand_bank_number_unique');
        });
        Schema::table('mobile_accounts', function (Blueprint $t) {
            $t->unique(['brand_id', 'provider', 'account_number'], 'mobile_accounts_brand_provider_number_unique');
        });

        // restrictOnDelete: accounts are archived, never deleted, so a book
        // line can always be traced back to the account it moved money through.
        Schema::table('bank_book_entries', function (Blueprint $t) {
            $t->foreignId('bank_account_id')->nullable()->after('id')->constrained('bank_accounts')->restrictOnDelete();
        });
        Schema::table('mobile_book_entries', function (Blueprint $t) {
            $t->foreignId('mobile_account_id')->nullable()->after('id')->constrained('mobile_accounts')->restrictOnDelete();
        });
        Schema::table('payments', function (Blueprint $t) {
            $t->foreignId('bank_account_id')->nullable()->after('bank_name')->constrained('bank_accounts')->restrictOnDelete();
            $t->foreignId('mobile_account_id')->nullable()->after('mobile_provider')->constrained('mobile_accounts')->restrictOnDelete();
        });
        Schema::table('expenses', function (Blueprint $t) {
            $t->foreignId('bank_account_id')->nullable()->after('bank_name')->constrained('bank_accounts')->restrictOnDelete();
            $t->foreignId('mobile_account_id')->nullable()->after('mobile_provider')->constrained('mobile_accounts')->restrictOnDelete();
        });
        Schema::table('vouchers', function (Blueprint $t) {
            $t->foreignId('bank_account_id')->nullable()->after('bank_name')->constrained('bank_accounts')->restrictOnDelete();
            $t->foreignId('mobile_account_id')->nullable()->after('mobile_provider')->constrained('mobile_accounts')->restrictOnDelete();
        });
    }

    /**
     * Each step checks first, so a rollback that stopped half way can simply
     * be run again. The brand_id foreign key is dropped before the unique
     * index: MySQL uses that index (it starts with brand_id) to back the key.
     */
    public function down(): void
    {
        $hasFk = fn (string $table, string $column) => collect(Schema::getForeignKeys($table))
            ->contains(fn ($fk) => $fk['columns'] === [$column]);

        // Drops the column, and its foreign key when that is still there.
        $dropFk = function (string $table, string $column) use ($hasFk) {
            if ($hasFk($table, $column)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropForeign([$column]));
            }
            if (Schema::hasColumn($table, $column)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn($column));
            }
        };

        foreach (['vouchers', 'expenses', 'payments'] as $table) {
            $dropFk($table, 'mobile_account_id');
            $dropFk($table, 'bank_account_id');
        }
        $dropFk('mobile_book_entries', 'mobile_account_id');
        $dropFk('bank_book_entries', 'bank_account_id');

        $uniques = [
            'bank_accounts'   => 'bank_accounts_brand_bank_number_unique',
            'mobile_accounts' => 'mobile_accounts_brand_provider_number_unique',
        ];
        foreach ($uniques as $table => $unique) {
            $dropFk($table, 'archived_by');
            if (Schema::hasColumn($table, 'is_archived')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn(['archive_reason', 'archived_at', 'is_archived']));
            }
            $dropFk($table, 'created_by');
            if ($hasFk($table, 'brand_id')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropForeign(['brand_id']));
            }
            if (Schema::hasIndex($table, $unique)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropUnique($unique));
            }
            $dropFk($table, 'brand_id');
        }
    }
};
