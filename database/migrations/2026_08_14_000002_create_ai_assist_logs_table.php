<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Usage log for AI Assist (AI_Assist_PRD.md §9.4).
 *
 * Deliberately holds no extracted content — no names, phones or addresses.
 * The point of the table is the `applied` flag: a high extraction count with a
 * low apply rate means the output is not trusted, whatever confidence claims.
 *
 * The PRD lists a `company_id` column, but this app is single-tenant, so
 * `user_id` is the only scope that exists here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_assist_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('mode', 20)->default('text');   // card | text | voice
            $table->decimal('confidence', 3, 2)->nullable();
            $table->boolean('applied')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_assist_logs');
    }
};
