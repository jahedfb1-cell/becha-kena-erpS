<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplaintTicket extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'ticket_number',
        'invoice_id',
        'quotation_item_id',
        'customer_id',
        'salesman_id',
        'issue_type',
        'description',
        'status',
        'resolution_type',
        'resolution_note',
        'replacement_quotation_id',
        'resolved_at',
        'resolved_by',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'is_archived'  => 'boolean',
        'archived_at'  => 'datetime',
    ];

    /**
     * Relationship: Customer raising complaint.
     * Constraint: FK customer_id -> customers.id (restrictOnDelete)
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * Relationship: Salesman assigned / credited.
     */
    public function salesman(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    /**
     * Relationship: Invoice related to complaint.
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /**
     * Relationship: Quotation item related to complaint.
     */
    public function quotationItem(): BelongsTo
    {
        return $this->belongsTo(QuotationItem::class, 'quotation_item_id');
    }

    /**
     * Relationship: Replacement quotation generated.
     */
    public function replacementQuotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class, 'replacement_quotation_id');
    }

    /**
     * Relationship: User who resolved the complaint.
     */
    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
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
