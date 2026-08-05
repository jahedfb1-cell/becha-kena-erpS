<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Units Table
        if (!Schema::hasTable('units')) {
            Schema::create('units', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code')->unique();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });

            // Seed default ERP measurement units
            DB::table('units')->insert([
                ['name' => 'Square Feet', 'code' => 'Sq.ft', 'created_at' => now(), 'updated_at' => now()],
                ['name' => 'Pieces', 'code' => 'Pcs', 'created_at' => now(), 'updated_at' => now()],
                ['name' => 'Roll', 'code' => 'Roll', 'created_at' => now(), 'updated_at' => now()],
                ['name' => 'Meter', 'code' => 'Meter', 'created_at' => now(), 'updated_at' => now()],
                ['name' => 'Inch', 'code' => 'Inch', 'created_at' => now(), 'updated_at' => now()],
                ['name' => 'Box / Set', 'code' => 'Box', 'created_at' => now(), 'updated_at' => now()],
            ]);
        }

        // 2. Bank Accounts Table
        if (!Schema::hasTable('bank_accounts')) {
            Schema::create('bank_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('bank_name');
                $table->string('account_name');
                $table->string('account_number');
                $table->string('branch')->nullable();
                $table->decimal('opening_balance', 12, 2)->default(0);
                $table->decimal('current_balance', 12, 2)->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });

            // Seed default Bank Account
            DB::table('bank_accounts')->insert([
                [
                    'bank_name' => 'Dutch-Bangla Bank',
                    'account_name' => 'Dhaka Blinds',
                    'account_number' => '110.120.45892',
                    'branch' => 'Farmgate Branch',
                    'opening_balance' => 5000.00,
                    'current_balance' => 5000.00,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ]);
        }

        // 3. Mobile Accounts Table
        if (!Schema::hasTable('mobile_accounts')) {
            Schema::create('mobile_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('provider'); // bKash, Nagad, Rocket, Upay
                $table->string('account_number');
                $table->string('account_type')->default('Personal'); // Personal, Agent, Merchant
                $table->decimal('opening_balance', 12, 2)->default(0);
                $table->decimal('current_balance', 12, 2)->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });

            // Seed default Mobile Account
            DB::table('mobile_accounts')->insert([
                [
                    'provider' => 'bKash Merchant',
                    'account_number' => '01629000200',
                    'account_type' => 'Merchant',
                    'opening_balance' => 1000.00,
                    'current_balance' => 1000.00,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ]);
        }

        // 4. Balance Transfers Table
        if (!Schema::hasTable('balance_transfers')) {
            Schema::create('balance_transfers', function (Blueprint $table) {
                $table->id();
                $table->string('transfer_number')->unique();
                $table->string('from_account_type'); // cash, bank, mobile
                $table->unsignedBigInteger('from_account_id')->nullable();
                $table->string('to_account_type'); // cash, bank, mobile
                $table->unsignedBigInteger('to_account_id')->nullable();
                $table->decimal('amount', 12, 2);
                $table->date('transfer_date');
                $table->string('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('balance_transfers');
        Schema::dropIfExists('mobile_accounts');
        Schema::dropIfExists('bank_accounts');
        Schema::dropIfExists('units');
    }
};
