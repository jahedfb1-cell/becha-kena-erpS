<?php

namespace App\Services;

use App\Models\Product;
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

        // Numbers are one shared sequence across every brand — not scoped
        // per brand — since quotation_number is globally unique; without
        // this, a brand with no quotations yet would restart at 0001 and
        // collide with another brand's existing number.
        $lastQuotation = Quotation::withoutGlobalScope('brand')
            ->where('quotation_number', 'LIKE', "{$prefix}%")
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

        // Same shared-sequence reasoning as generateQuotationNumber() above.
        $last = PurchaseEntry::withoutGlobalScope('brand')
            ->where('purchase_number', 'LIKE', "{$prefix}%")
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
        $unit         = $item['unit'] ?? ($item['product']['unit'] ?? '');
        $categoryName = $item['category_name'] ?? ($item['product']['category']['name'] ?? '');
        $productName  = $item['product_name'] ?? ($item['product']['name'] ?? '');

        $isPvc = str_contains(strtolower($categoryName), 'pvc') ||
                 str_contains(strtolower($unit), 'pvc') ||
                 str_contains(strtolower($productName), 'pvc') ||
                 str_contains(strtolower($productName), 'clear water');

        // Pcs-unit products (hardware, accessories, remote controls, etc.)
        // have no meaningful width/height — bill by piece count instead.
        $isPcsUnit = strtolower(trim($unit)) === 'pcs';

        // Determine min_billing_sqft up front so it's always defined,
        // regardless of which branch below actually uses it.
        $minBillingSqft = (float) ($item['min_billing_sqft'] ?? 0);
        if ($minBillingSqft <= 0 && $preferredSupplier) {
            $minBillingSqft = $preferredSupplier['min_billing_sqft'];
        }

        if ($isPcsUnit) {
            $actualSqft = $pcs;
            $minBillingSqft = 0;
            $billedSqft = $pcs;
        } elseif ($isPvc && $width > 0 && $height > 0) {
            $slatSize = (float) ($item['product_size'] ?? ($item['product']['product_size'] ?? 8));
            if ($slatSize <= 0) {
                $slatSize = 8;
            }
            // Slat count drops the fraction unless it reaches three quarters of a
            // slat (11.74 stays 11, 11.75 becomes 12). Must stay in step with
            // pvcSlatCount() in frontend/src/utils/pvc.js.
            $slats = isset($item['slats']) && $item['slats'] !== null && $item['slats'] !== ''
                ? (int) $item['slats']
                : (int) floor($width / 5.85 + 0.25);
            $calcWidth = $slats * $slatSize;
            $actualSqft = round(($width * $height) / 144, 2);
            $billedSqft = round((($calcWidth * $height) / 144) * $pcs, 2);
            $approxSlats = number_format($width / 5.85, 2, '.', '');
        } else {
            // actual_sqft = (width × height) / 144
            $actualSqft = round(($width * $height) / 144, 2);

            // billed_sqft = MAX(actual_sqft, min_billing_sqft) × pcs, rounded UP
            // to the next quarter foot. Must stay in step with billableSqft()
            // in frontend/src/utils/billing.js.
            $billedSqft = ceil((max($actualSqft, $minBillingSqft) * $pcs) / 0.25) * 0.25;
        }

        // Pricing
        $unitPrice = (float) ($item['unit_price'] ?? 0);
        $costPrice = (float) ($item['cost_price'] ?? 0);
        if ($costPrice <= 0 && $preferredSupplier) {
            $costPrice = $preferredSupplier['cost_price'];
        }

        // line_total = billed_sqft × unit_price
        $lineTotal = round($billedSqft * $unitPrice, 2);

        return [
            'slats'            => $slats ?? null,
            'approx_slats'     => $approxSlats ?? null,
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
        // Auto-heal/migrate schema if new columns are not yet in database
        if (!\Illuminate\Support\Facades\Schema::hasColumn('quotation_items', 'section_name')) {
            \Illuminate\Support\Facades\Schema::table('quotation_items', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->string('section_name')->nullable()->after('quotation_id');
                $table->string('option_group_id')->nullable()->after('section_name');
                $table->boolean('is_optional')->default(false)->after('option_group_id');
                $table->boolean('is_selected')->default(true)->after('is_optional');
                $table->boolean('is_enabled_for_print')->default(true)->after('is_selected');
            });
        }
        if (!\Illuminate\Support\Facades\Schema::hasColumn('quotation_items', 'slats')) {
            \Illuminate\Support\Facades\Schema::table('quotation_items', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->integer('slats')->nullable()->after('pcs');
                $table->string('approx_slats', 20)->nullable()->after('slats');
            });
        }

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

            // Look up the product's own unit/category/size from the DB (not
            // the client payload) so billing mode (sqft vs. PVC-strip vs.
            // per-piece) is always based on the authoritative product record.
            $product = Product::with('category')->find($productId);
            if ($product) {
                $itemData['unit']          = $itemData['unit'] ?? $product->unit;
                $itemData['category_name'] = $itemData['category_name'] ?? $product->category?->name;
                $itemData['product_name']  = $itemData['product_name'] ?? $product->name;
                $itemData['product_size']  = $itemData['product_size'] ?? $product->product_size;
            }

            // Calculate line item
            $calc = $this->calculateLineItem($itemData, $preferredSupplier);

            $isEnabledForPrint = filter_var($itemData['is_enabled_for_print'] ?? true, FILTER_VALIDATE_BOOLEAN);
            $isSelected = filter_var($itemData['is_selected'] ?? true, FILTER_VALIDATE_BOOLEAN);
            $isOptional = filter_var($itemData['is_optional'] ?? false, FILTER_VALIDATE_BOOLEAN);

            $quotation->items()->create([
                'section_name'           => $itemData['section_name'] ?? null,
                'option_group_id'        => $itemData['option_group_id'] ?? null,
                'is_optional'            => $isOptional,
                'is_selected'            => $isSelected,
                'is_enabled_for_print'   => $isEnabledForPrint,
                'product_id'             => $productId,
                'product_variant_id'     => $itemData['product_variant_id'] ?? null,
                'supplier_id'            => $supplierId,
                'width'                  => $itemData['width'] ?? 0,
                'height'                 => $itemData['height'] ?? 0,
                'pcs'                    => $itemData['pcs'] ?? 1,
                'slats'                  => $calc['slats'] ?? ($itemData['slats'] ?? null),
                'approx_slats'           => $calc['approx_slats'] ?? ($itemData['approx_slats'] ?? null),
                'actual_sqft'            => $calc['actual_sqft'],
                'min_billing_sqft'       => $calc['min_billing_sqft'],
                'billed_sqft'            => $calc['billed_sqft'],
                'unit_price'             => $calc['unit_price'],
                'cost_price'             => $calc['cost_price'],
                'line_total'             => $calc['line_total'],
                'is_supplier_overridden' => $isOverridden,
                'notes'                  => $itemData['notes'] ?? null,
            ]);

            // Only add to subtotal if item is enabled for print and selected
            if ($isEnabledForPrint && $isSelected) {
                $subtotal += $calc['line_total'];
            }
        }

        return round($subtotal, 2);
    }

    /**
     * Create Purchase Entries for a quotation (on approval).
     *
     * One Purchase Order per SUPPLIER, not per line item. Every line item
     * still gets its own row (so each window size stays visible in detail),
     * but all rows belonging to the same supplier share a single
     * purchase_number and produce exactly ONE supplier ledger credit for
     * the consolidated amount. If an order has items from two suppliers,
     * two separate POs are created — payables must stay per supplier.
     */
    public function createPurchaseEntries(Quotation $quotation, int $userId): void
    {
        $quotation->load('items');

        $eligibleItems = $quotation->items->filter(function ($item) {
            // Skip items with no supplier, or that were deselected/disabled
            return $item->supplier_id && $item->is_selected && $item->is_enabled_for_print;
        });

        foreach ($eligibleItems->groupBy('supplier_id') as $supplierId => $items) {
            $purchaseNumber = $this->generatePurchaseNumber();
            $groupTotalCost = 0;

            foreach ($items as $item) {
                $totalCost = round((float) $item->cost_price * (float) $item->billed_sqft, 2);
                $groupTotalCost += $totalCost;

                PurchaseEntry::create([
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
            }

            $groupTotalCost = round($groupTotalCost, 2);

            // ONE consolidated Supplier Ledger credit for the whole PO
            $lastLedger = SupplierLedger::where('supplier_id', $supplierId)
                ->orderBy('id', 'desc')
                ->first();
            $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;

            SupplierLedger::create([
                'supplier_id'      => $supplierId,
                'transaction_type' => 'purchase',
                'reference_type'   => PurchaseEntry::class,
                'reference_id'     => $items->first()->id,
                'description'      => "Purchase order {$purchaseNumber} for quotation {$quotation->quotation_number}",
                'debit'            => 0,
                'credit'           => $groupTotalCost,
                'balance'          => $previousBalance + $groupTotalCost,
                'transaction_date' => now()->toDateString(),
                'created_by'       => $userId,
            ]);
        }
    }

    /**
     * Reverse (mark) purchase entries when quotation is archived or rejected.
     */
    public function reversePurchaseEntries(Quotation $quotation, int $userId): void
    {
        $pes = PurchaseEntry::where('quotation_id', $quotation->id)
            ->where('is_reversed', false)
            ->get();

        // Reverse one ledger line per Purchase Order, mirroring how the credit
        // was written. Grouping by purchase_number also keeps older records
        // correct, where every row still carries its own PO number.
        foreach ($pes->groupBy('purchase_number') as $purchaseNumber => $group) {
            $groupTotalCost = 0;

            foreach ($group as $pe) {
                $pe->update(['is_reversed' => true, 'status' => 'cancelled']);
                $groupTotalCost += (float) $pe->total_cost;
            }

            $groupTotalCost = round($groupTotalCost, 2);
            $first = $group->first();

            // Reverse Supplier Ledger
            $lastLedger = SupplierLedger::where('supplier_id', $first->supplier_id)
                ->orderBy('id', 'desc')
                ->first();
            $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;

            SupplierLedger::create([
                'supplier_id'      => $first->supplier_id,
                'transaction_type' => 'adjustment',
                'reference_type'   => PurchaseEntry::class,
                'reference_id'     => $first->id,
                'description'      => "Cancelled purchase {$purchaseNumber} - reverse entry",
                'debit'            => $groupTotalCost,
                'credit'           => 0,
                'balance'          => $previousBalance - $groupTotalCost,
                'transaction_date' => now()->toDateString(),
                'created_by'       => $userId,
            ]);
        }
    }

    /**
     * Re-create purchase entries when quotation is restored.
     */
    public function restorePurchaseEntries(Quotation $quotation, int $userId): void
    {
        $pes = PurchaseEntry::where('quotation_id', $quotation->id)
            ->where('is_reversed', true)
            ->get();

        // Re-credit one ledger line per Purchase Order (see reversePurchaseEntries)
        foreach ($pes->groupBy('purchase_number') as $purchaseNumber => $group) {
            $groupTotalCost = 0;

            foreach ($group as $pe) {
                $pe->update(['is_reversed' => false, 'status' => 'pending']);
                $groupTotalCost += (float) $pe->total_cost;
            }

            $groupTotalCost = round($groupTotalCost, 2);
            $first = $group->first();

            // Re-credit Supplier Ledger
            $lastLedger = SupplierLedger::where('supplier_id', $first->supplier_id)
                ->orderBy('id', 'desc')
                ->first();
            $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;

            SupplierLedger::create([
                'supplier_id'      => $first->supplier_id,
                'transaction_type' => 'purchase',
                'reference_type'   => PurchaseEntry::class,
                'reference_id'     => $first->id,
                'description'      => "Restored purchase {$purchaseNumber}",
                'debit'            => 0,
                'credit'           => $groupTotalCost,
                'balance'          => $previousBalance + $groupTotalCost,
                'transaction_date' => now()->toDateString(),
                'created_by'       => $userId,
            ]);
        }
    }
}
