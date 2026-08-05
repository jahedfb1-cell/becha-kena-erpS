<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class CustomerLedger extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'customer_id',
        'salesman_id',
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
        'debit'            => 'float',
        'credit'           => 'float',
        'balance'          => 'float',
        'transaction_date' => 'date',
        'is_archived'      => 'boolean',
        'archived_at'      => 'datetime',
    ];

    /**
     * Valid transaction types.
     */
    public const TRANSACTION_TYPES = [
        'opening_balance',
        'invoice',
        'payment',
        'discount',
        'adjustment',
    ];

    /**
     * Relationship: Customer associated with this ledger entry.
     * Constraint: FK customer_id -> customers.id (restrictOnDelete)
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * Relationship: Salesman credited/linked to this transaction.
     * Constraint: FK salesman_id -> users.id (nullOnDelete)
     */
    public function salesman(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    /**
     * Polymorphic Relationship: Source record (Invoice / Payment / Voucher).
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
