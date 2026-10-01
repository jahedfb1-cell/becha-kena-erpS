<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourierBookingLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'courier_booking_id',
        'description',
        'colour',
        'bundles',
        'sort_order',
    ];

    protected $casts = [
        'bundles' => 'decimal:2',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(CourierBooking::class, 'courier_booking_id');
    }
}
