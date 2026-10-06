<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A mobile-banking wallet (bKash / Nagad / Rocket). Like BankAccount, its
 * balance is computed from the mobile book lines linked to it, never stored.
 */
class MobileAccount extends Model
{
    use Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'provider',
        'account_number',
        'account_type',
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
        return $this->hasMany(MobileBookEntry::class);
    }

    /**
     * The mobile book's provider column only allows bkash / nagad / rocket;
     * an account named "bKash Merchant" books under "bkash".
     */
    public function getBookProviderAttribute(): ?string
    {
        $p = strtolower((string) $this->provider);
        foreach (['bkash', 'nagad', 'rocket'] as $known) {
            if (str_contains($p, $known)) {
                return $known;
            }
        }

        return null;
    }

    public function getLabelAttribute(): string
    {
        return trim($this->provider . ' — ' . $this->account_number, ' —');
    }
}
