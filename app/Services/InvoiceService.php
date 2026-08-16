<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Quotation;
use App\Models\CustomerLedger;
use App\Models\DeliveryChallan;

class InvoiceService
{
    /**
     * Generate next invoice number: INV-2025-0001
     */
    public function generateInvoiceNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "INV-{$year}-";

        // Numbers are one shared sequence across every brand, not scoped
        // per brand — without this a brand with no invoices yet would
        // restart at 0001 and collide with another brand's number.
        $last = Invoice::withoutGlobalScope('brand')
            ->where('invoice_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(invoice_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($last && preg_match('/INV-\d{4}-(\d+)/', $last->invoice_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Generate Invoice from Approved Quotation
     */
    public function generate(Quotation $quotation, int $userId, ?string $poNumber = null): Invoice
    {
        $invoiceNumber = $this->generateInvoiceNumber();

        $invoice = Invoice::create([
            'invoice_number'  => $invoiceNumber,
            'po_number'       => $poNumber ?? $quotation->po_number ?? null,
            'quotation_id'    => $quotation->id,
            'customer_id'     => $quotation->customer_id,
            'salesman_id'     => $quotation->salesman_id,
            'subtotal'        => $quotation->subtotal,
            'discount_amount' => $quotation->discount_amount,
            'vat_amount'      => $quotation->vat_amount,
            'grand_total'     => $quotation->net_amount,
            'paid_amount'     => 0,
            'due_amount'      => $quotation->net_amount,
            'payment_status'  => 'unpaid',
            'invoice_date'    => now()->toDateString(),
            'created_by'      => $userId,
        ]);

        // Customer Ledger debit entry
        $lastLedger = CustomerLedger::where('customer_id', $quotation->customer_id)
            ->orderBy('id', 'desc')
            ->first();
        $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;
        
        $netAmount = (float) $quotation->net_amount;

        CustomerLedger::create([
            'customer_id'      => $quotation->customer_id,
            'salesman_id'      => $quotation->salesman_id,
            'transaction_type' => 'invoice',
            'reference_type'   => Invoice::class,
            'reference_id'     => $invoice->id,
            'description'      => "Generated invoice {$invoiceNumber} for quotation {$quotation->quotation_number}",
            'debit'            => $netAmount,
            'credit'           => 0,
            'balance'          => $previousBalance + $netAmount, // debit increases customer balance
            'transaction_date' => now()->toDateString(),
            'created_by'       => $userId,
        ]);

        return $invoice;
    }

    /**
     * Archive Invoice and cascade to Challan. Reverse Ledger entry.
     */
    public function archive(Invoice $invoice, int $userId): void
    {
        // 1. Cascade archive Delivery Challans
        $challans = DeliveryChallan::where('invoice_id', $invoice->id)
            ->where('is_archived', false)
            ->get();
            
        foreach ($challans as $challan) {
            $challan->archive($userId, 'Cascaded from Invoice Archive');
        }

        // 2. Reverse Customer Ledger (credit the amount)
        $lastLedger = CustomerLedger::where('customer_id', $invoice->customer_id)
            ->orderBy('id', 'desc')
            ->first();
        $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;
        
        $grandTotal = (float) $invoice->grand_total;

        CustomerLedger::create([
            'customer_id'      => $invoice->customer_id,
            'salesman_id'      => $invoice->salesman_id,
            'transaction_type' => 'adjustment',
            'reference_type'   => Invoice::class,
            'reference_id'     => $invoice->id,
            'description'      => "Archived invoice {$invoice->invoice_number} - reverse entry",
            'debit'            => 0,
            'credit'           => $grandTotal,
            'balance'          => $previousBalance - $grandTotal,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $userId,
        ]);
        
        // 3. Unlock Quotation (set status back to approved)
        $quotation = $invoice->quotation;
        if ($quotation) {
            $quotation->update(['status' => 'approved']);
        }
    }

    /**
     * Restore Invoice and Challan, re-create ledger entry.
     */
    public function restore(Invoice $invoice, int $userId): void
    {
        // Restore Delivery Challans cascaded from this
        $challans = DeliveryChallan::where('invoice_id', $invoice->id)
            ->where('is_archived', true)
            ->get();
            
        foreach ($challans as $challan) {
            $challan->restore();
        }

        // Re-create Customer Ledger entry
        $lastLedger = CustomerLedger::where('customer_id', $invoice->customer_id)
            ->orderBy('id', 'desc')
            ->first();
        $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;
        
        $grandTotal = (float) $invoice->grand_total;

        CustomerLedger::create([
            'customer_id'      => $invoice->customer_id,
            'salesman_id'      => $invoice->salesman_id,
            'transaction_type' => 'invoice',
            'reference_type'   => Invoice::class,
            'reference_id'     => $invoice->id,
            'description'      => "Restored invoice {$invoice->invoice_number}",
            'debit'            => $grandTotal,
            'credit'           => 0,
            'balance'          => $previousBalance + $grandTotal,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $userId,
        ]);
        
        // Relock Quotation
        $quotation = $invoice->quotation;
        if ($quotation) {
            $quotation->update(['status' => 'invoiced']);
        }
    }
}
