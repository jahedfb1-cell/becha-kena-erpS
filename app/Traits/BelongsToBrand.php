<?php

namespace App\Traits;

use App\Models\Brand;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stamps a record with the trade name its creator sells under.
 *
 * This hangs off the `creating` model event rather than being written out at
 * each controller's create() call. Invoices, challans, ledger rows and book
 * entries are created from a lot of different places — some of them nested
 * inside services several calls deep — and any one of those spots that got
 * missed would silently produce an untagged record that later prints under
 * the wrong logo. The event fires no matter which path built the model.
 *
 * An explicitly set brand_id always wins, so code that already knows the
 * right brand (for example a ledger row derived from an existing invoice
 * rather than from the current user) can pass it and not be overwritten.
 */
trait BelongsToBrand
{
    public static function bootBelongsToBrand(): void
    {
        static::creating(function ($model) {
            if (!empty($model->brand_id)) {
                return;
            }

            // Falls back to the default brand outside a request context —
            // console commands, seeders and queued jobs have no auth user.
            $model->brand_id = Brand::resolveIdFor(auth()->user());
        });
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }
}
