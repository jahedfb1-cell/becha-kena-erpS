<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the Mushak 6.3 goods table.
 *
 * No brand scope of its own: these rows are only ever reached through their
 * parent challan, which is already scoped, and adding a second global scope
 * would filter them by the reader's brand rather than the challan's.
 */
class MushakInvoiceItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'mushak_invoice_id',
        'serial_no',
        'description',
        'unit',
        'quantity',
        'unit_price',
        'total_value',
        'sd_rate',
        'sd_amount',
        'vat_rate',
        'vat_amount',
        'total_including_tax',
    ];

    protected $casts = [
        'serial_no'           => 'integer',
        'quantity'            => 'float',
        'unit_price'          => 'float',
        'total_value'         => 'float',
        'sd_rate'             => 'float',
        'sd_amount'           => 'float',
        'vat_rate'            => 'float',
        'vat_amount'          => 'float',
        'total_including_tax' => 'float',
    ];

    public function mushakInvoice(): BelongsTo
    {
        return $this->belongsTo(MushakInvoice::class, 'mushak_invoice_id');
    }
}
