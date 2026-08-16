<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Quotation extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $attributes = [
        'is_archived' => false,
    ];

    protected $fillable = [
        'brand_id',
        'quotation_number',
        'customer_id',
        'salesman_id',
        'status',
        'subtotal',
        'convenience_charge',
        'other_charge',
        'other_charge_label',
        'vat_percentage',
        'vat_amount',
        'discount_type',
        'discount_value',
        'discount_amount',
        'net_amount',
        'note',
        'delivery_address',
        'rejection_reason',
        'approved_by',
        'approved_at',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'subtotal'           => 'float',
        'convenience_charge' => 'float',
        'other_charge'       => 'float',
        'vat_percentage'     => 'float',
        'vat_amount'         => 'float',
        'discount_value'     => 'float',
        'discount_amount'    => 'float',
        'net_amount'         => 'float',
        'approved_at'        => 'datetime',
        'is_archived'        => 'boolean',
        'archived_at'        => 'datetime',
    ];

    /**
     * Relationship: Customer associated with this quotation.
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * Relationship: Salesman who created/owns this quotation.
     */
    public function salesman(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    /**
     * Relationship: Quotation line items.
     */
    public function items(): HasMany
    {
        return $this->hasMany(QuotationItem::class, 'quotation_id');
    }

    /**
     * Relationship: Purchase entries generated from approval.
     */
    public function purchaseEntries(): HasMany
    {
        return $this->hasMany(PurchaseEntry::class, 'quotation_id');
    }

    /**
     * Relationship: Creator user.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who approved this quotation.
     */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /**
     * Relationship: User who archived this quotation.
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Check if quotation is editable (not invoiced).
     */
    public function isEditable(): bool
    {
        return !in_array($this->status, ['invoiced']);
    }

    /**
     * Check if quotation is pending approval.
     */
    public function isPendingApproval(): bool
    {
        return in_array($this->status, ['pending_approval', 'pending_reapproval']);
    }

    /**
     * Accessor: Calculate Total from items.
     */
    public function getTotalAttribute(): float
    {
        return (float) $this->net_amount;
    }
}
