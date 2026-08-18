<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Invoice extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'invoice_number',
        'quotation_id',
        'customer_id',
        'salesman_id',
        'subtotal',
        'discount_amount',
        'vat_amount',
        'grand_total',
        'paid_amount',
        'due_amount',
        'payment_status',
        'invoice_date',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'subtotal'        => 'float',
        'discount_amount' => 'float',
        'vat_amount'      => 'float',
        'grand_total'     => 'float',
        'paid_amount'     => 'float',
        'due_amount'      => 'float',
        'invoice_date'    => 'date',
        'is_archived'     => 'boolean',
        'archived_at'     => 'datetime',
    ];

    /**
     * Relationship: Parent quotation.
     * Constraint: FK quotation_id -> quotations.id (restrictOnDelete)
     */
    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class, 'quotation_id');
    }

    /**
     * Relationship: Customer billed for this invoice.
     * Constraint: FK customer_id -> customers.id (restrictOnDelete)
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * Relationship: Salesman who earns commission / credited.
     */
    public function salesman(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    /**
     * Relationship: Payments received for this invoice.
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    /**
     * Relationship: Delivery challans generated for this invoice.
     */
    public function deliveryChallans(): HasMany
    {
        return $this->hasMany(DeliveryChallan::class, 'invoice_id');
    }

    /**
     * Relationship: Complaint tickets logged against this invoice.
     */
    public function complaintTickets(): HasMany
    {
        return $this->hasMany(ComplaintTicket::class, 'invoice_id');
    }

    /**
     * Relationship: every NBR Mushak 6.3 VAT challan ever issued against
     * this invoice, archived ones included.
     *
     * There can be more than one row: a challan issued at the wrong rate is
     * corrected by archiving it and issuing a fresh one, and the archived
     * row stays for the audit trail. Use activeMushakInvoice() for "the
     * challan that currently stands" — this relation answers "has one ever
     * been issued", which is rarely the question worth asking.
     */
    public function mushakInvoices(): HasMany
    {
        return $this->hasMany(MushakInvoice::class, 'sales_invoice_id');
    }

    /**
     * Relationship: the VAT challan that currently stands for this invoice,
     * ignoring any that were archived and replaced. At most one of these
     * exists at a time, enforced by MushakService::assertIssuable().
     */
    public function activeMushakInvoice(): HasOne
    {
        return $this->hasOne(MushakInvoice::class, 'sales_invoice_id')
            ->where('is_archived', false);
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
