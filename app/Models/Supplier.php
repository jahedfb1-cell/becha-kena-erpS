<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'supplier_code',
        'name',
        'company_name',
        'phone',
        'email',
        'address',
        'opening_balance',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'opening_balance' => 'float',
        'is_archived'     => 'boolean',
        'archived_at'     => 'datetime',
    ];

    /**
     * Relationship: User who created this supplier.
     * Constraint: FK created_by -> users.id (restrictOnDelete)
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this supplier.
     * Constraint: FK archived_by -> users.id (nullOnDelete)
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Relationship: Product supplier links for this supplier.
     */
    public function supplierLinks(): HasMany
    {
        return $this->hasMany(ProductSupplierLink::class, 'supplier_id');
    }

    /**
     * Relationship: Supplier ledger entries.
     */
    public function ledgers(): HasMany
    {
        return $this->hasMany(SupplierLedger::class, 'supplier_id');
    }
}
