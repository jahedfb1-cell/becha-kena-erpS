<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseEntry extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $attributes = [
        'is_archived' => false,
        'is_reversed' => false,
    ];

    protected $fillable = [
        'brand_id',
        'purchase_number',
        'quotation_id',
        'quotation_item_id',
        'supplier_id',
        'product_id',
        'product_variant_id',
        'width',
        'height',
        'pcs',
        'billed_sqft',
        'cost_price',
        'total_cost',
        'purchase_date',
        'status',
        'received_at',
        'received_by',
        'is_reversed',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'width'         => 'decimal:2',
        'height'        => 'decimal:2',
        'pcs'           => 'integer',
        'billed_sqft'   => 'decimal:2',
        'cost_price'    => 'decimal:2',
        'total_cost'    => 'decimal:2',
        'purchase_date' => 'date',
        'received_at'   => 'datetime',
        'is_reversed'   => 'boolean',
        'is_archived'   => 'boolean',
        'archived_at'   => 'datetime',
    ];

    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class, 'quotation_id');
    }

    public function quotationItem(): BelongsTo
    {
        return $this->belongsTo(QuotationItem::class, 'quotation_item_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
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
