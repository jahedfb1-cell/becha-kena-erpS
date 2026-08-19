<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One quoted rate on a saved price list.
 *
 * Not brand-scoped itself: rows are only ever reached through their parent
 * price list, which already carries the scope.
 */
class PriceListItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'price_list_id',
        'product_id',
        'serial_no',
        'product_name',
        'description',
        'color_code',
        'uom',
        'rate',
        'remarks',
    ];

    protected $casts = [
        'serial_no' => 'integer',
        'rate'      => 'float',
    ];

    public function priceList(): BelongsTo
    {
        return $this->belongsTo(PriceList::class, 'price_list_id');
    }

    /** May be null: a line can be typed free-hand, or its product archived. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
