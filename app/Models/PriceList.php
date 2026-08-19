<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A saved rate card.
 *
 * The customer columns here are a snapshot taken when the sheet was saved,
 * not a live read through `customer()` — see the table migration for why.
 * `customer()` exists only so the list page can show who a sheet belongs to
 * and so a reopened sheet can re-select the right customer in the form.
 */
class PriceList extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $attributes = [
        'is_archived' => false,
    ];

    protected $fillable = [
        'brand_id',
        'reference_no',
        'customer_id',
        'customer_name',
        'customer_company',
        'customer_phone',
        'customer_address',
        'issue_date',
        'subject',
        'validity',
        'terms',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'issue_date'  => 'date',
        'is_archived' => 'boolean',
        'archived_at' => 'datetime',
    ];

    /** Quoted rate lines, in printed order. */
    public function items(): HasMany
    {
        return $this->hasMany(PriceListItem::class, 'price_list_id')
                    ->orderBy('serial_no');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
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
