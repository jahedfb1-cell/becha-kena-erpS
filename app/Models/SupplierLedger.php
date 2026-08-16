<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class SupplierLedger extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'supplier_id',
        'transaction_type',
        'reference_type',
        'reference_id',
        'description',
        'debit',
        'credit',
        'balance',
        'transaction_date',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'debit'            => 'decimal:2',
        'credit'           => 'decimal:2',
        'balance'          => 'decimal:2',
        'transaction_date' => 'date',
        'is_archived'       => 'boolean',
        'archived_at'       => 'datetime',
    ];

    /**
     * Relationship: Supplier associated with this ledger entry.
     * Constraint: FK supplier_id -> suppliers.id (restrictOnDelete)
     */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    /**
     * Polymorphic Relationship: Source record (Purchase / Voucher / Adjustment).
     */
    public function reference(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'reference_type', 'reference_id');
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
