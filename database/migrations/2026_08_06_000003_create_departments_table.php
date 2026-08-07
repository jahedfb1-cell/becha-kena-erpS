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
        if (!Schema::hasTable('departments')) {
            Schema::create('departments', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->text('description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });

            // Seed default departments
            DB::table('departments')->insert([
                ['name' => 'Sales', 'description' => 'Sales & Field Representatives', 'is_active' => true, 'created_at' => '2022-12-06 00:00:00', 'updated_at' => now()],
                ['name' => 'Office Manager', 'description' => 'Office Administration & Accounts', 'is_active' => true, 'created_at' => '2022-12-06 00:00:00', 'updated_at' => now()],
                ['name' => 'Factory Manager', 'description' => 'Factory Production & Logistics', 'is_active' => true, 'created_at' => '2022-12-06 00:00:00', 'updated_at' => now()],
            ]);
        }

        // Add department_id to users table if not exists
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'department_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreignId('department_id')
                      ->nullable()
                      ->after('role')
                      ->constrained('departments')
                      ->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('users', 'department_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropForeign(['department_id']);
                $table->dropColumn('department_id');
            });
        }

        Schema::dropIfExists('departments');
    }
};
