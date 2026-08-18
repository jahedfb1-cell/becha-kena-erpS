<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\Invoice;
use App\Models\MushakInvoice;
use RuntimeException;

/**
 * Issues NBR Mushak 6.3 VAT challans against sales invoices.
 *
 * Everything the challan will ever print is copied here, at issue time, out
 * of the invoice, the customer and the brand's company profile. Nothing is
 * left to be resolved later: see the migration for why an issued challan
 * must not change when those sources do.
 */
class MushakService
{
    /**
     * VAT registration belongs to Western Blinds Ltd. Dhaka Blinds does not
     * issue Mushak documents, so a challan under brand 1 would be a document
     * claiming a registration that does not exist.
     */
    public const VAT_REGISTERED_BRAND_ID = 2;

    /**
     * Next challan number: MUSHAK-2026-0001.
     *
     * Deliberately unscoped by brand, matching InvoiceService: NBR expects an
     * unbroken sequence, and a per-brand counter would restart at 0001.
     */
    public function generateChallanNumber(): string
    {
        $prefix = 'MUSHAK-' . now()->format('Y') . '-';

        $last = MushakInvoice::withoutGlobalScope('brand')
            ->where('challan_number', 'LIKE', $prefix . '%')
            ->orderByRaw('CAST(SUBSTRING(challan_number, ' . (strlen($prefix) + 1) . ') AS UNSIGNED) DESC')
            ->first();

        $next = 1;
        if ($last && preg_match('/MUSHAK-\d{4}-(\d+)/', $last->challan_number, $m)) {
            $next = (int) $m[1] + 1;
        }

        return $prefix . str_pad($next, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Everything that has to be true before a challan can exist. Each of
     * these would otherwise produce a document that is wrong rather than
     * merely incomplete, so they fail loudly instead of printing a blank.
     */
    public function assertIssuable(Invoice $invoice): void
    {
        if ($invoice->is_archived) {
            throw new RuntimeException('Cannot issue a VAT challan against an archived invoice.');
        }

        if ($invoice->mushakInvoice()->exists()) {
            throw new RuntimeException('A VAT challan has already been issued for this invoice.');
        }

        $brandId = $invoice->brand_id ?: Brand::DEFAULT_ID;
        if ($brandId !== self::VAT_REGISTERED_BRAND_ID) {
            throw new RuntimeException('VAT challans can only be issued for Western Blinds Ltd invoices.');
        }

        $quotation = $invoice->quotation;
        if (!$quotation || !$quotation->vat_enabled) {
            throw new RuntimeException('This order is not marked VAT applicable, so no VAT challan can be issued.');
        }

        if (!$quotation->vat_rate) {
            throw new RuntimeException('This order has no VAT rate set.');
        }

        if (!$this->sellerBin($brandId)) {
            throw new RuntimeException('Seller BIN is not configured. Set it in Settings > Company Profile.');
        }
    }

    /** The brand's VAT registration number, from its company profile JSON. */
    public function sellerBin(int $brandId): ?string
    {
        $profile = Brand::find($brandId)?->profileData() ?? [];

        return trim((string) ($profile['vat_reg_no'] ?? '')) ?: null;
    }

    /**
     * Build and persist the challan and its lines.
     *
     * `$buyerBin` overrides whatever the customer record holds, because the
     * BIN commonly arrives only when the invoice is presented and is typed
     * in at this point rather than during customer onboarding.
     */
    public function issue(
        Invoice $invoice,
        int $userId,
        ?string $buyerBin = null,
        ?string $issuedByName = null,
        ?string $issuedByDesignation = null
    ): MushakInvoice {
        $this->assertIssuable($invoice);

        $brandId   = $invoice->brand_id ?: Brand::DEFAULT_ID;
        $brand     = Brand::find($brandId);
        $profile   = $brand?->profileData() ?? [];
        $quotation = $invoice->quotation;
        $customer  = $invoice->customer;

        $rate      = (float) $quotation->vat_rate;
        $inclusive = (bool) $quotation->vat_inclusive;

        $challan = MushakInvoice::create([
            'brand_id'              => $brandId,
            'challan_number'        => $this->generateChallanNumber(),
            'sales_invoice_id'      => $invoice->id,
            'issue_date'            => now()->toDateString(),
            'issue_time'            => now()->format('H:i:s'),

            'seller_name'           => $profile['company_name'] ?? ($brand?->name ?? ''),
            'seller_bin'            => $this->sellerBin($brandId),
            'seller_address'        => $profile['company_address'] ?? '',

            'buyer_name'            => $customer?->company_name ?: ($customer?->name ?? ''),
            'buyer_address'         => $customer?->address,
            // Falls back to the stored BIN when nothing was typed in.
            'buyer_bin'             => $buyerBin ?: ($customer?->bin ?: null),

            'vat_rate'              => $rate,
            'vat_inclusive'         => $inclusive,

            'issued_by_name'        => $issuedByName,
            'issued_by_designation' => $issuedByDesignation,
            'created_by'            => $userId,
        ]);

        $this->buildItems($challan, $quotation, $rate, $inclusive);
        $this->applyTotals($challan);

        return $challan->fresh('items');
    }

    /**
     * One row per printable order line.
     *
     * Optional variations the customer did not take, and lines switched off
     * for print, are skipped: they are not being supplied, so charging VAT
     * on them would overstate the challan.
     */
    private function buildItems(MushakInvoice $challan, $quotation, float $rate, bool $inclusive): void
    {
        $serial = 1;

        foreach ($quotation->items as $item) {
            if ($item->is_optional && !$item->is_selected) {
                continue;
            }
            if (!$item->is_enabled_for_print) {
                continue;
            }

            $split = VatCalculator::split((float) $item->line_total, $rate, $inclusive);

            // Quantity is whatever this line was actually billed on, so the
            // challan's arithmetic matches the invoice the customer holds.
            $quantity = (float) ($item->billed_sqft ?: $item->pcs ?: 1);

            $challan->items()->create([
                'serial_no'           => $serial++,
                'description'         => $this->describe($item),
                'unit'                => $item->billed_sqft ? 'sqft' : 'pcs',
                'quantity'            => $quantity,
                'unit_price'          => (float) $item->unit_price,
                'total_value'         => $split['taxable'],
                'sd_rate'             => 0,
                'sd_amount'           => 0,
                'vat_rate'            => $rate,
                'vat_amount'          => $split['vat'],
                'total_including_tax' => $split['total'],
            ]);
        }
    }

    /** Readable goods description for the challan's second column. */
    private function describe($item): string
    {
        $size = ($item->width && $item->height)
            ? $item->width . ' x ' . $item->height . ' inch'
            : null;

        $parts = array_filter([
            $item->product?->name,
            $item->variant?->name,
            $size,
        ]);

        return implode(' - ', $parts) ?: 'Item';
    }

    /**
     * Header totals are summed from the stored lines rather than recomputed
     * from the order, so the header can never disagree with the rows printed
     * underneath it.
     */
    private function applyTotals(MushakInvoice $challan): void
    {
        $items = $challan->items()->get();

        $challan->update([
            'taxable_amount' => round($items->sum('total_value'), 2),
            'sd_amount'      => round($items->sum('sd_amount'), 2),
            'vat_amount'     => round($items->sum('vat_amount'), 2),
            'grand_total'    => round($items->sum('total_including_tax'), 2),
        ]);
    }
}
