<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSupplierLink extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'product_id',
        'supplier_id',
        'priority_rank',
        'cost_price',
        'min_billing_sqft',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'priority_rank'    => 'integer',
        'cost_price'       => 'decimal:2',
        'min_billing_sqft' => 'decimal:2',
        'is_archived'       => 'boolean',
        'archived_at'       => 'datetime',
    ];

    /**
     * Relationship: Parent product.
     * Constraint: FK product_id -> products.id (cascadeOnDelete)
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    /**
     * Relationship: Linked supplier.
     * Constraint: FK supplier_id -> suppliers.id (restrictOnDelete)
     */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    /**
     * Relationship: Creator user.
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
}
