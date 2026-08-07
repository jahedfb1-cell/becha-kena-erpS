<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Modify role column to allow 'admin', 'manager', 'salesman', 'staff'
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'manager', 'salesman', 'staff') NOT NULL DEFAULT 'staff'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'manager', 'salesman') NOT NULL DEFAULT 'salesman'");
    }
};
