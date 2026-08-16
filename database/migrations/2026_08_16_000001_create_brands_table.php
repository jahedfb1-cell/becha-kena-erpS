<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ──────────────────────────────────────────────────────────────────
 * BRANDS (trade names) ব্যাখ্যা:
 * ──────────────────────────────────────────────────────────────────
 * একই ERP-র ভেতর থেকে দুটো আলাদা নামে ব্যবসা চলে — "Dhaka Blinds" আর
 * "Western Blinds Ltd"। এটা multi-tenant নয়: customer, product,
 * supplier সব shared থাকে, টেবিলের গঠনও বদলায় না। শুধু প্রতিটি
 * লেনদেন কোন নামে হয়েছে সেটা `brand_id` দিয়ে ট্যাগ করা থাকে, আর
 * print/PDF-এ সেই brand-এর logo, ঠিকানা ও footer বসে।
 *
 * এই টেবিলে ইচ্ছে করেই শুধু পরিচয়ের ফিল্ডগুলো রাখা হয়েছে। logo,
 * ঠিকানা, terms — অর্থাৎ পুরো company profile — brand প্রতি একটা
 * করে JSON ফাইলে থাকে (storage/app/company_profile*.json), যেটা
 * CompanyProfileController আগে থেকেই ব্যবহার করে আসছে। ফলে ওই
 * controller-এর upload/mirror লজিক নতুন করে লিখতে হয় না।
 *
 * brand_id = 1 (Dhaka Blinds) হলো default — পুরনো সব row এই id
 * পায়, তাই আগের কোনো ডেটা বা print-এর চেহারা বদলায় না।
 * ──────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('short_name', 50)->nullable();
            $table->boolean('is_default')->default(false)
                  ->comment('যে brand-এ brand_id ছাড়া record গিয়ে পড়বে');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        DB::table('brands')->insert([
            [
                'id'         => 1,
                'name'       => 'Dhaka Blinds',
                'short_name' => 'DB',
                'is_default' => true,
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id'         => 2,
                'name'       => 'Western Blinds Ltd',
                'short_name' => 'WBL',
                'is_default' => false,
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('brands');
    }
};
