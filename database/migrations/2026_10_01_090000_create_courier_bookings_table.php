<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A courier booking slip is the paper that travels with a ready order to
     * the courier counter. It is deliberately separate from delivery_challans:
     * that one hangs off an Invoice and names our own driver, while this one
     * hangs off the Order (quotation) the moment it is confirmed, carries no
     * product prices at all, and names whoever is actually collecting the
     * goods at the other end.
     */
    public function up(): void
    {
        Schema::create('courier_bookings', function (Blueprint $table) {
            $table->id();
            $table->string('booking_number', 20)
                  ->comment('Short counter-friendly number, format: 26-02 (year-serial)');

            $table->foreignId('quotation_id')
                  ->constrained('quotations')
                  ->restrictOnDelete();
            $table->foreignId('customer_id')
                  ->constrained('customers')
                  ->restrictOnDelete();

            $table->date('booking_date');

            // The goods are often collected by a staff member of the customer
            // company rather than the company itself, from a different town and
            // on a different phone. Keeping the receiver here (and never writing
            // it back to the customer record) means each booking keeps its own
            // truthful history without corrupting the customer master.
            $table->string('receiver_name');
            $table->string('receiver_phone', 60)->nullable();
            $table->text('receiver_address')->nullable();
            $table->boolean('receiver_is_company')->default(true)
                  ->comment('false = booked in a staff members own name');

            $table->string('courier_name')->nullable();

            // Cash on delivery. Defaults to the order total minus whatever the
            // customer has already advanced, but stays editable because the
            // figure written on the slip is a negotiated "condition" amount.
            $table->boolean('cod_enabled')->default(true);
            $table->decimal('cod_amount', 15, 2)->default(0);
            $table->string('cod_label', 100)->nullable()
                  ->comment("Wording printed before the amount, e.g. \"COD 'Condition Tk\"");

            $table->enum('status', ['pending', 'booked', 'delivered', 'cancelled'])->default('pending');
            $table->text('notes')->nullable();

            $table->foreignId('created_by')
                  ->constrained('users')
                  ->restrictOnDelete();

            $table->boolean('is_archived')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('archived_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->text('archive_reason')->nullable();

            $table->foreignId('brand_id')
                  ->nullable()
                  ->constrained('brands')
                  ->nullOnDelete();

            $table->timestamps();

            $table->index(['quotation_id']);
            $table->index(['customer_id']);
            $table->unique(['brand_id', 'booking_number']);
        });

        Schema::create('courier_booking_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('courier_booking_id')
                  ->constrained('courier_bookings')
                  ->cascadeOnDelete();

            // Seeded from the order's product categories (Roller/Zebra pack as
            // one line; Vertical and PVC split into fabric + channels) and then
            // freely edited, because the final line-up is only known at packing.
            $table->string('description');
            $table->string('colour', 100)->nullable()
                  ->comment('Product code as printed under the Colour column, e.g. WBR 202');
            $table->decimal('bundles', 8, 2)->default(1);
            $table->unsignedInteger('sort_order')->default(0);

            $table->timestamps();

            $table->index(['courier_booking_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('courier_booking_lines');
        Schema::dropIfExists('courier_bookings');
    }
};
