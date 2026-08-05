<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryChallan extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'challan_number',
        'invoice_id',
        'customer_id',
        'delivery_address',
        'driver_name',
        'driver_phone',
        'delivery_date',
        'status',
        'notes',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'delivery_date' => 'date',
        'is_archived'   => 'boolean',
        'archived_at'   => 'datetime',
    ];

    /**
     * Relationship: Invoice for which this challan was generated.
     * Constraint: FK invoice_id -> invoices.id (restrictOnDelete)
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /**
     * Relationship: Customer receiving delivery.
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
