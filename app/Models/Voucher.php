<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Voucher extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'voucher_number',
        'voucher_type',
        'date',
        'description',
        'total_amount',
        'payment_method',
        'bank_name',
        'mobile_provider',
        'reference_number',
        'note',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'date'         => 'date',
        'total_amount' => 'decimal:2',
        'is_archived'   => 'boolean',
        'archived_at'   => 'datetime',
    ];

    /**
     * Relationship: Line items for double entry.
     * Constraint: FK voucher_id -> vouchers.id (cascadeOnDelete)
     */
    public function items(): HasMany
    {
        return $this->hasMany(VoucherItem::class, 'voucher_id');
    }

    /**
     * Relationship: Creator user.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this record.
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }
}
