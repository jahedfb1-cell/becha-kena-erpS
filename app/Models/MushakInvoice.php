<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An issued NBR Mushak 6.3 VAT challan.
 *
 * The seller and buyer details on this record are snapshots taken when the
 * challan was issued, not live reads through the relations — see the table
 * migration for why. Treat every column here as immutable once written.
 */
class MushakInvoice extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $attributes = [
        'is_archived' => false,
    ];

    protected $fillable = [
        'brand_id',
        'challan_number',
        'sales_invoice_id',
        'issue_date',
        'issue_time',
        'seller_name',
        'seller_bin',
        'seller_address',
        'buyer_name',
        'buyer_address',
        'buyer_bin',
        'vat_rate',
        'vat_inclusive',
        'taxable_amount',
        'sd_amount',
        'vat_amount',
        'grand_total',
        'issued_by_name',
        'issued_by_designation',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'issue_date'     => 'date',
        'vat_rate'       => 'float',
        'vat_inclusive'  => 'boolean',
        'taxable_amount' => 'float',
        'sd_amount'      => 'float',
        'vat_amount'     => 'float',
        'grand_total'    => 'float',
        'is_archived'    => 'boolean',
        'archived_at'    => 'datetime',
    ];

    /** Line rows of the Mushak 6.3 goods table, in printed order. */
    public function items(): HasMany
    {
        return $this->hasMany(MushakInvoiceItem::class, 'mushak_invoice_id')
                    ->orderBy('serial_no');
    }

    /** The sales invoice this challan was issued against (one to one). */
    public function salesInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'sales_invoice_id');
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
