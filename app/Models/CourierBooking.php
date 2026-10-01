<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CourierBooking extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'booking_number',
        'quotation_id',
        'customer_id',
        'booking_date',
        'receiver_name',
        'receiver_phone',
        'receiver_address',
        'receiver_is_company',
        'courier_name',
        'cod_enabled',
        'cod_amount',
        'cod_label',
        'status',
        'notes',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'booking_date'        => 'date',
        'receiver_is_company' => 'boolean',
        'cod_enabled'         => 'boolean',
        'cod_amount'          => 'decimal:2',
        'is_archived'         => 'boolean',
        'archived_at'         => 'datetime',
    ];

    /**
     * Relationship: the confirmed order this slip was raised against.
     */
    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class, 'quotation_id');
    }

    /**
     * Relationship: the customer who owns the order. Note this is the billing
     * party — who physically receives the parcel is on receiver_name/phone.
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * Relationship: printed bundle lines, in the order they appear on the slip.
     */
    public function lines(): HasMany
    {
        return $this->hasMany(CourierBookingLine::class, 'courier_booking_id')
                    ->orderBy('sort_order')
                    ->orderBy('id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }
}
