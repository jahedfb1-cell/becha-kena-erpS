<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'payment_number',
        'invoice_id',
        'customer_id',
        'amount',
        'payment_method',
        'bank_name',
        'mobile_provider',
        'transaction_id',
        'cheque_number',
        'payment_date',
        'notes',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'amount'       => 'float',
        'payment_date' => 'date',
        'is_archived'   => 'boolean',
        'archived_at'   => 'datetime',
    ];

    /**
     * Relationship: Invoice paid for.
     * Constraint: FK invoice_id -> invoices.id (restrictOnDelete)
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /**
     * Relationship: Customer paying.
     * Constraint: FK customer_id -> customers.id (restrictOnDelete)
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
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
