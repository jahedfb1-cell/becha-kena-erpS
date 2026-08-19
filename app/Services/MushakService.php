<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\Invoice;
use App\Models\MushakInvoice;
use App\Traits\GeneratesDocumentNumbers;
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
    use GeneratesDocumentNumbers;

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
        return $this->nextDocumentNumber(MushakInvoice::class, 'challan_number', 'MUSHAK');
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

        // Only a challan that still stands blocks a new one. An archived
        // challan was withdrawn precisely so a correct one could replace it,
        // so it must not stand in the way of its own replacement.
        if ($invoice->activeMushakInvoice()->exists()) {
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
     * One row per product category, not per order line.
     *
     * An order of blinds is usually one kind of goods cut to a dozen
     * different window sizes. On the challan that is a single supply: the
     * NBR form wants the goods named once ("Roller Blinds") with the whole
     * area against it, the way the pads are filled in by hand — not a row
     * per window listing its measurements. So the printable lines are
     * grouped and their areas added up, which also makes the challan's
     * quantity equal the invoice's total sq.ft.
     *
     * Unit is part of the grouping key, never just the category. A category
     * can hold both sq.ft and per-piece products — "Automatic Smart Roller
     * blinds Motor" has motors sold by the piece next to track sold by the
     * foot — and adding an area to a piece count would produce a quantity
     * that means nothing.
     *
     * Optional variations the customer did not take, and lines switched off
     * for print, are skipped: they are not being supplied, so charging VAT
     * on them would overstate the challan.
     */
    private function buildItems(MushakInvoice $challan, $quotation, float $rate, bool $inclusive): void
    {
        $groups = [];

        foreach ($quotation->items as $item) {
            if ($item->is_optional && !$item->is_selected) {
                continue;
            }
            if (!$item->is_enabled_for_print) {
                continue;
            }

            // Read the unit off the product, the way QuotationService does.
            // It cannot be inferred from billed_sqft: a per-piece line stores
            // its piece count in that column too, so testing it would label
            // every motor and every bracket as sq.ft.
            $unit        = $this->unitOf($item);
            $description = $this->describe($item);
            $key         = $description . '|' . $unit;

            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'description' => $description,
                    'unit'        => $unit,
                    'quantity'    => 0.0,
                    'amount'      => 0.0,
                ];
            }

            $groups[$key]['quantity'] += (float) ($item->billed_sqft ?: $item->pcs ?: 1);
            $groups[$key]['amount']   += (float) $item->line_total;
        }

        $serial = 1;

        foreach ($groups as $group) {
            // Split the group's own total rather than each line's, so the
            // row's three money columns stay exactly consistent with each
            // other instead of carrying the sum of several roundings.
            $split = VatCalculator::split(round($group['amount'], 2), $rate, $inclusive);

            // Columns 5 and 6 of the form are both "ভ্যাট ব্যতীত": the rate
            // has to be the VAT-excluded one so that quantity x unit price
            // reconciles with the taxable total in column 6. On an inclusive
            // order the order's own unit price still has the VAT inside it,
            // so taking it as-is would leave the two columns disagreeing.
            // Deriving it from the taxable value covers both directions —
            // on an exclusive order the taxable value is the line total, so
            // this returns the order's unit price unchanged.
            $unitPrice = $group['quantity'] > 0
                ? round($split['taxable'] / $group['quantity'], 2)
                : $split['taxable'];

            $challan->items()->create([
                'serial_no'           => $serial++,
                'description'         => $group['description'],
                'unit'                => $group['unit'],
                'quantity'            => round($group['quantity'], 2),
                'unit_price'          => $unitPrice,
                'total_value'         => $split['taxable'],
                'sd_rate'             => 0,
                'sd_amount'           => 0,
                'vat_rate'            => $rate,
                'vat_amount'          => $split['vat'],
                'total_including_tax' => $split['total'],
            ]);
        }
    }

    /**
     * What the goods are called in the challan's second column, and the
     * thing lines are grouped by.
     *
     * The category is the name of the goods as the VAT office reads it, so
     * it wins over the individual product. Sizes are deliberately left out:
     * they are what makes two lines of the same goods look different, and
     * naming them here would defeat the grouping. Products with no category
     * fall back to their own name so they still group with their like.
     */
    private function describe($item): string
    {
        return $item->product?->category?->name
            ?: ($item->product?->name ?: 'Item');
    }

    /**
     * "pcs" for per-piece goods, "sqft" for anything measured by area —
     * the same test QuotationService applies when it bills the line.
     */
    private function unitOf($item): string
    {
        return strtolower(trim((string) ($item->product?->unit ?? ''))) === 'pcs'
            ? 'pcs'
            : 'sqft';
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
