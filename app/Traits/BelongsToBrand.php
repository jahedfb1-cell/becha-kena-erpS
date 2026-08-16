<?php

namespace App\Traits;

use App\Models\Brand;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stamps a record with the trade name its creator sells under, and keeps
 * every query on it scoped to that same trade name.
 *
 * Tagging happens on the `creating` model event rather than being written
 * out at each controller's create() call. Invoices, challans, ledger rows
 * and book entries are created from a lot of different places — some of
 * them nested inside services several calls deep — and any one of those
 * spots that got missed would silently produce an untagged record that
 * later prints under the wrong logo. The event fires no matter which path
 * built the model.
 *
 * An explicitly set brand_id always wins, so code that already knows the
 * right brand (for example a ledger row derived from an existing invoice
 * rather than from the current user) can pass it and not be overwritten.
 *
 * Reading is scoped the same way: customers, products and suppliers stay
 * shared between brands, but everything transactional (quotations,
 * invoices, payments, ledgers, book entries, purchase entries...) must
 * not leak between them — a Western Blinds login has no business seeing
 * Dhaka Blinds' quotations in a list, a report total, or a "last ledger
 * balance" lookup, and vice versa. Doing this as a global scope on the
 * model (rather than adding `->where('brand_id', ...)` to every index()/
 * report query by hand) means it can't be missed on some endpoint nobody
 * remembered to update, and it applies transparently everywhere the model
 * is queried — including nested relationship loads and service-layer
 * lookups like the running supplier balance in QuotationService.
 *
 * Outside a request context — artisan commands, tinker, queued jobs,
 * seeders, migrations — there is no authenticated user, so nothing is
 * filtered; those paths already assume they can see everything, and
 * database maintenance would be impossible otherwise.
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

        static::addGlobalScope('brand', function (Builder $query) {
            $user = auth()->user();
            if ($user && $user->brand_id) {
                $query->where($query->getModel()->qualifyColumn('brand_id'), $user->brand_id);
            }
        });
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }
}
