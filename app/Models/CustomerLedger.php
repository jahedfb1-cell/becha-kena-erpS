<?php

namespace App\Models;

use App\Traits\Archivable;
use App\Traits\BelongsToBrand;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class CustomerLedger extends Model
{
    use HasFactory, Archivable, BelongsToBrand;

    protected $fillable = [
        'brand_id',
        'customer_id',
        'salesman_id',
        'transaction_type',
        'reference_type',
        'reference_id',
        'description',
        'debit',
        'credit',
        'balance',
        'transaction_date',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'debit'            => 'float',
        'credit'           => 'float',
        'balance'          => 'float',
        'transaction_date' => 'date',
        'is_archived'      => 'boolean',
        'archived_at'      => 'datetime',
    ];

    /**
     * Valid transaction types.
     */
    public const TRANSACTION_TYPES = [
        'opening_balance',
        'invoice',
        'payment',
        'discount',
        'adjustment',
    ];

    /**
     * Relationship: Customer associated with this ledger entry.
     * Constraint: FK customer_id -> customers.id (restrictOnDelete)
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * Relationship: Salesman credited/linked to this transaction.
     * Constraint: FK salesman_id -> users.id (nullOnDelete)
     */
    public function salesman(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    /**
     * Polymorphic Relationship: Source record (Invoice / Payment / Voucher).
     */
    public function reference(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'reference_type', 'reference_id');
    }

    /**
     * Statement text for an invoice row: "INV-2026-0058 - Color Code : WBR 201"
     * (product codes of the order's selected items, comma separated). Written
     * into `description` when the row is created and never recomputed, so
     * editing a product later cannot change a ledger that was already posted.
     */
    public static function invoiceText(Invoice $invoice): string
    {
        $codes = $invoice->quotation?->items()->where('is_selected', true)->with('product:id,product_code')->get()
            ->map(fn ($i) => trim((string) $i->product?->product_code))
            ->filter()->unique()->values() ?? collect();

        return $invoice->invoice_number . ($codes->isNotEmpty() ? ' - Color Code : ' . $codes->implode(', ') : '');
    }

    /**
     * Statement text for a payment row: "Cash  INV-2026-0058 (PAY-2026-0041)".
     * Frozen into `description` at posting time, like invoiceText().
     */
    public static function paymentText(Payment $payment): string
    {
        $method = match ($payment->payment_method) {
            'cash'   => 'Cash',
            'bank'   => 'Bank' . ($payment->bank_name ? " - {$payment->bank_name}" : ''),
            'mobile' => 'Mobile Banking' . ($payment->mobile_provider ? " - {$payment->mobile_provider}" : ''),
            default  => '',
        };
        $ref = $payment->invoice?->invoice_number ?? $payment->quotation?->quotation_number ?? '';

        return trim($method . '  ' . $ref) . ' (' . $payment->payment_number . ')';
    }

    /**
     * Stamp payment-backed rows with the payment's remark as payment_note (null
     * on other rows). One query for the whole collection. The remark is read
     * live; the row's description is the frozen part.
     */
    public static function attachPaymentDetails($ledgers)
    {
        $ids = $ledgers->filter(fn ($l) => $l->reference_id && in_array($l->reference_type, [Payment::class, 'Payment'], true))
            ->pluck('reference_id')->unique()->values();
        $notes = $ids->isEmpty() ? collect() : Payment::whereIn('id', $ids)->pluck('notes', 'id');

        foreach ($ledgers as $l) {
            $isPayment = $l->reference_id && in_array($l->reference_type, [Payment::class, 'Payment'], true);
            $l->setAttribute('payment_note', $isPayment ? $notes->get($l->reference_id) : null);
        }

        return $ledgers;
    }

    /**
     * Relationship: Creator user.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this record.
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }
}
