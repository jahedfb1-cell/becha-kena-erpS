<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A waive-off always has a reason behind it — a rounding adjustment, an
     * agreed settlement, compensation for a late delivery — and until now
     * none of it was written down anywhere. The amount was added straight
     * onto the invoice's running discount total and the receipt handed to
     * the customer said nothing about it at all.
     *
     * The amount is stored here too, not only the note. It was deliberately
     * left off the payment before (see PaymentService::voidPayment's comment
     * about not being able to reverse a waive-off), but a note without the
     * figure it explains cannot be shown in context on the receipt.
     */
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->decimal('discount_amount', 15, 2)->default(0)
                  ->after('amount')
                  ->comment('Waive-off granted along with this receipt');

            $table->string('discount_note')->nullable()
                  ->after('discount_amount')
                  ->comment('Why the waive-off was given; printed on the receipt only when filled in');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['discount_amount', 'discount_note']);
        });
    }
};
