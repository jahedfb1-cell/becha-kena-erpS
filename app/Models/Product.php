<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'product_code',
        'name',
        'unit',
        'product_category_id',
        'default_unit_price',
        'details',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'default_unit_price' => 'decimal:2',
        'is_archived'         => 'boolean',
        'archived_at'         => 'datetime',
    ];

    protected $appends = ['supplier_links'];

    public function getSupplierLinksAttribute()
    {
        return $this->relationLoaded('supplierLinks') ? $this->getRelation('supplierLinks') : null;
    }

    /**
     * Relationship: Category this product belongs to.
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'product_category_id');
    }

    /**
     * Relationship: User who created this product.
     * Constraint: FK created_by -> users.id (restrictOnDelete)
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this record.
     * Constraint: FK archived_by -> users.id (nullOnDelete)
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Relationship: Variants of this product.
     * Constraint: FK product_id -> products.id (cascadeOnDelete)
     */
    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class, 'product_id');
    }

    /**
     * Relationship: Suppliers linked to this product with priority ranking and cost price.
     * Constraint: FK product_id -> products.id (cascadeOnDelete)
     */
    public function supplierLinks(): HasMany
    {
        return $this->hasMany(ProductSupplierLink::class, 'product_id');
    }
}
