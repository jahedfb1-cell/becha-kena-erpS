<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A bank account the business receives or pays money through.
 *
 * The balance is never stored: it is the opening balance plus every active
 * bank book line linked to this account (see AccountBookService::bankBalance).
 * The current_balance column is legacy and no longer read.
 */
class BankAccount extends Model
{
    use Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'bank_name',
        'account_name',
        'account_number',
        'branch',
        'opening_balance',
        'is_active',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    // Legacy stored balance, no longer kept up to date - the API sends the
    // computed one (AccountBookService) instead.
    protected $hidden = ['current_balance'];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'is_active'       => 'boolean',
        'is_archived'     => 'boolean',
        'archived_at'     => 'datetime',
    ];

    public function bookEntries(): HasMany
    {
        return $this->hasMany(BankBookEntry::class);
    }

    /** "Dutch-Bangla Bank — 110.120.45892" */
    public function getLabelAttribute(): string
    {
        return trim($this->bank_name . ' — ' . $this->account_number, ' —');
    }
}
