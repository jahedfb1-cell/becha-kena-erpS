<?php

namespace App\Services;

use App\Models\ProductSupplierLink;
use App\Models\PurchaseEntry;
use App\Models\Quotation;
use App\Models\QuotationItem;
use App\Models\SupplierLedger;
use Illuminate\Support\Facades\DB;

class QuotationService
{
    /**
     * Generate next quotation number: QT-2025-0001
     */
    public function generateQuotationNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "QT-{$year}-";

        $lastQuotation = Quotation::where('quotation_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(quotation_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($lastQuotation && preg_match('/QT-\d{4}-(\d+)/', $lastQuotation->quotation_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Generate next purchase number: PO-2025-0001
     */
    public function generatePurchaseNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "PO-{$year}-";

        $last = PurchaseEntry::where('purchase_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(purchase_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($last && preg_match('/PO-\d{4}-(\d+)/', $last->purchase_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Get preferred supplier for a product (priority_rank = 1).
     * Returns: ['supplier_id', 'cost_price', 'min_billing_sqft'] or null
     */
    public function getPreferredSupplier(int $productId): ?array
    {
        $link = ProductSupplierLink::where('product_id', $productId)
            ->where('is_archived', false)
            ->orderBy('priority_rank', 'asc')
            ->first();

        if (!$link) {
            return null;
        }

        return [
            'supplier_id'      => $link->supplier_id,
            'cost_price'       => (float) $link->cost_price,
            'min_billing_sqft' => (float) $link->min_billing_sqft,
            'priority_rank'    => $link->priority_rank,
        ];
    }

    /**
     * Calculate a single line item's sqft and totals.
     */
    public function calculateLineItem(array $item, ?array $preferredSupplier = null): array
    {
        $width  = (float) ($item['width'] ?? 0);
        $height = (float) ($item['height'] ?? 0);
        $pcs    = (int) ($item['pcs'] ?? 1);

        // actual_sqft = (width × height) / 144
        $actualSqft = round(($width * $height) / 144, 2);

        // Determine min_billing_sqft
        $minBillingSqft = (float) ($item['min_billing_sqft'] ?? 0);
        if ($minBillingSqft <= 0 && $preferredSupplier) {
            $minBillingSqft = $preferredSupplier['min_billing_sqft'];
        }

        // billed_sqft = MAX(actual_sqft, min_billing_sqft) × pcs
        $billedSqft = round(max($actualSqft, $minBillingSqft) * $pcs, 2);

        // Pricing
        $unitPrice = (float) ($item['unit_price'] ?? 0);
        $costPrice = (float) ($item['cost_price'] ?? 0);
        if ($costPrice <= 0 && $preferredSupplier) {
            $costPrice = $preferredSupplier['cost_price'];
        }

        // line_total = billed_sqft × unit_price
        $lineTotal = round($billedSqft * $unitPrice, 2);

        return [
            'actual_sqft'      => $actualSqft,
            'min_billing_sqft' => $minBillingSqft,
            'billed_sqft'      => $billedSqft,
            'unit_price'       => $unitPrice,
            'cost_price'       => $costPrice,
            'line_total'       => $lineTotal,
        ];
    }

    /**
     * Calculate financial summary for a quotation.
     */
    public function calculateSummary(
        float $subtotal,
        float $convenienceCharge,
        float $otherCharge,
        float $vatPercentage,
        string $discountType,
        float $discountValue
    ): array {
        // VAT on subtotal
        $vatAmount = round($subtotal * $vatPercentage / 100, 2);

        // Discount on subtotal
        if ($discountType === 'percentage') {
            $discountAmount = round($subtotal * $discountValue / 100, 2);
        } else {
            $discountAmount = round($discountValue, 2);
        }

        // Net = subtotal + convenience + other + vat - discount
        $netAmount = round($subtotal + $convenienceCharge + $otherCharge + $vatAmount - $discountAmount, 2);

        return [
            'subtotal'        => $subtotal,
            'vat_amount'      => $vatAmount,
            'discount_amount' => $discountAmount,
            'net_amount'      => max($netAmount, 0),
        ];
    }

    /**
     * Process items array: auto-route suppliers, calculate fields,
     * and save to database. Returns the subtotal.
     */
    public function processAndSaveItems(Quotation $quotation, array $items, int $userId): float
    {
        // Delete existing items (for update scenario)
        $quotation->items()->delete();

        $subtotal = 0;

        foreach ($items as $itemData) {
            $productId = $itemData['product_id'];

            // Supplier auto-routing
            $preferredSupplier = $this->getPreferredSupplier($productId);
            $supplierId = $itemData['supplier_id'] ?? null;
            $isOverridden = false;

            if ($supplierId && $preferredSupplier && $supplierId != $preferredSupplier['supplier_id']) {
                $isOverridden = true;
            } elseif (!$supplierId && $preferredSupplier) {
                $supplierId = $preferredSupplier['supplier_id'];
            }

            // Calculate line item
            $calc = $this->calculateLineItem($itemData, $preferredSupplier);

            $quotation->items()->create([
                'product_id'             => $productId,
                'product_variant_id'     => $itemData['product_variant_id'] ?? null,
                'supplier_id'            => $supplierId,
                'width'                  => $itemData['width'] ?? 0,
                'height'                 => $itemData['height'] ?? 0,
                'pcs'                    => $itemData['pcs'] ?? 1,
                'actual_sqft'            => $calc['actual_sqft'],
                'min_billing_sqft'       => $calc['min_billing_sqft'],
                'billed_sqft'            => $calc['billed_sqft'],
                'unit_price'             => $calc['unit_price'],
                'cost_price'             => $calc['cost_price'],
                'line_total'             => $calc['line_total'],
                'is_supplier_overridden' => $isOverridden,
                'notes'                  => $itemData['notes'] ?? null,
            ]);

            $subtotal += $calc['line_total'];
        }

        return round($subtotal, 2);
    }

    /**
     * Create Purchase Entries for each quotation item (on approval).
     * Also creates Supplier Ledger credit entries (payable).
     */
    public function createPurchaseEntries(Quotation $quotation, int $userId): void
    {
        $quotation->load('items');

        foreach ($quotation->items as $item) {
            if (!$item->supplier_id) {
                continue;
            }

            $purchaseNumber = $this->generatePurchaseNumber();
            $totalCost = round((float) $item->cost_price * (float) $item->billed_sqft, 2);

            $pe = PurchaseEntry::create([
                'purchase_number'    => $purchaseNumber,
                'quotation_id'       => $quotation->id,
                'quotation_item_id'  => $item->id,
                'supplier_id'        => $item->supplier_id,
                'product_id'         => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                'width'              => $item->width,
                'height'             => $item->height,
                'pcs'                => $item->pcs,
                'billed_sqft'        => $item->billed_sqft,
                'cost_price'         => $item->cost_price,
                'total_cost'         => $totalCost,
                'purchase_date'      => now()->toDateString(),
                'status'             => 'pending',
                'created_by'         => $userId,
            ]);

            // Supplier Ledger credit (payable increases)
            $lastLedger = SupplierLedger::where('supplier_id', $item->supplier_id)
                ->orderBy('id', 'desc')
                ->first();
            $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;

            SupplierLedger::create([
                'supplier_id'      => $item->supplier_id,
                'transaction_type' => 'purchase',
                'reference_type'   => PurchaseEntry::class,
                'reference_id'     => $pe->id,
                'description'      => "Purchase order {$purchaseNumber} for quotation {$quotation->quotation_number}",
                'debit'            => 0,
                'credit'           => $totalCost,
                'balance'          => $previousBalance + $totalCost,
                'transaction_date' => now()->toDateString(),
                'created_by'       => $userId,
            ]);
        }
    }

    /**
     * Reverse (mark) purchase entries when quotation is archived.
     */
    public function reversePurchaseEntries(Quotation $quotation, int $userId): void
    {
        PurchaseEntry::where('quotation_id', $quotation->id)
            ->where('is_reversed', false)
            ->update(['is_reversed' => true, 'status' => 'cancelled']);
    }

    /**
     * Re-create purchase entries when quotation is restored.
     */
    public function restorePurchaseEntries(Quotation $quotation, int $userId): void
    {
        // Un-reverse existing entries
        PurchaseEntry::where('quotation_id', $quotation->id)
            ->where('is_reversed', true)
            ->update(['is_reversed' => false, 'status' => 'pending']);
    }
}
