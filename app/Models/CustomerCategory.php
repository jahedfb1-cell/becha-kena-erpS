<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerCategory extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'name',
        'description',
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

    /**
     * Relationship: User who created this category.
     * Constraint: FK created_by -> users.id (restrictOnDelete)
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this category.
     * Constraint: FK archived_by -> users.id (nullOnDelete)
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Relationship: Customers under this category.
     * Constraint: FK customer_category_id -> customer_categories.id
     */
    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'customer_category_id');
    }
}
