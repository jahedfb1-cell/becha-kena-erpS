<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductVariant extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'product_id',
        'variant_name',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'is_archived' => 'boolean',
        'archived_at' => 'datetime',
    ];

    protected $appends = ['name'];

    public function getNameAttribute()
    {
        return $this->variant_name;
    }

    /**
     * Relationship: Parent product.
     * Constraint: FK product_id -> products.id (cascadeOnDelete)
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
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
