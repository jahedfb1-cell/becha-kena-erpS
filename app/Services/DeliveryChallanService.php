<?php

namespace App\Services;

use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Traits\GeneratesDocumentNumbers;

class DeliveryChallanService
{
    use GeneratesDocumentNumbers;

    /**
     * Generate next challan number: DC-2025-0001
     */
    public function generateChallanNumber(): string
    {
        return $this->nextDocumentNumber(DeliveryChallan::class, 'challan_number', 'DC');
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
