<?php

namespace App\Services;

use App\Models\DeliveryChallan;
use App\Models\Invoice;

class DeliveryChallanService
{
    /**
     * Generate next challan number: DC-2025-0001
     */
    public function generateChallanNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "DC-{$year}-";

        // Numbers are one shared sequence across every brand, not scoped
        // per brand — without this a brand with no challans yet would
        // restart at 0001 and collide with another brand's number.
        $last = DeliveryChallan::withoutGlobalScope('brand')
            ->where('challan_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(challan_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($last && preg_match('/DC-\d{4}-(\d+)/', $last->challan_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Generate Delivery Challan from Invoice
     */
    public function generate(Invoice $invoice, int $userId): DeliveryChallan
    {
        $challanNumber = $this->generateChallanNumber();

        $challan = DeliveryChallan::create([
            'challan_number'   => $challanNumber,
            'invoice_id'       => $invoice->id,
            'customer_id'      => $invoice->customer_id,
            'delivery_date'    => now()->toDateString(),
            'status'           => 'pending',
            'created_by'       => $userId,
        ]);

        return $challan;
    }
}
