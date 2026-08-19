<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ──────────────────────────────────────────────────────────────────
 * কেন এই migration:
 * ──────────────────────────────────────────────────────────────────
 * Approved order edit করলে এতদিন 500 error আসত।
 *
 * কারণ: order edit করলে QuotationService::processAndSaveItems() পুরনো
 * quotation_items গুলো delete করে নতুন করে বানায়। কিন্তু ওই item গুলোর
 * দিকে purchase_entries.quotation_item_id FK (ON DELETE RESTRICT) তাক
 * করে থাকে — তাই delete টা database-এই আটকে যেত।
 *
 * সমাধান: column-টা nullable করা হলো, যাতে purchase entry reverse
 * (cancel) করার সময় সে তার line item-এর link ছেড়ে দিতে পারে। Reversed
 * entry মানেই বাতিল হওয়া কেনাকাটা — যে size-এর জন্য সেটা তৈরি হয়েছিল
 * সেটা আর order-এ নেই, তাই NULL-ই সঠিক অর্থ বহন করে, আর entry-টা
 * audit trail হিসেবে টিকে থাকে।
 *
 * FK-টা ইচ্ছে করেই RESTRICT রাখা হয়েছে (SET NULL করা হয়নি): যে
 * purchase এখনো বহাল আছে, সেটার line item যেন ভুল করেও মুছে না যায় —
 * ওটা একটা আসল safety net। শুধু reverse করার সময় কোডই স্পষ্টভাবে
 * link ছাড়ে, নিজে থেকে চুপচাপ কিছু হয় না।
 * ──────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_entries', function (Blueprint $table) {
            $table->unsignedBigInteger('quotation_item_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Rows whose line item was already released cannot be pointed back
        // at it, so they are dropped from the constraint's reach first.
        Schema::table('purchase_entries', function (Blueprint $table) {
            $table->unsignedBigInteger('quotation_item_id')->nullable(false)->change();
        });
    }
};
