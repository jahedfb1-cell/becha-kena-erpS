<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuotationItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'quotation_id',
        'product_id',
        'product_variant_id',
        'supplier_id',
        'width',
        'height',
        'pcs',
        'actual_sqft',
        'min_billing_sqft',
        'billed_sqft',
        'unit_price',
        'cost_price',
        'line_total',
        'is_supplier_overridden',
        'notes',
    ];

    protected $casts = [
        'width'                  => 'float',
        'height'                 => 'float',
        'pcs'                    => 'integer',
        'actual_sqft'            => 'float',
        'min_billing_sqft'       => 'float',
        'billed_sqft'            => 'float',
        'unit_price'             => 'float',
        'cost_price'             => 'float',
        'line_total'             => 'float',
        'is_supplier_overridden' => 'boolean',
    ];

    /**
     * Relationship: Parent quotation.
     */
    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class, 'quotation_id');
    }

    /**
     * Relationship: Product.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    /**
     * Relationship: Selected variant.
     */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /**
     * Relationship: Supplier (auto-routed or manual).
     */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }
}
