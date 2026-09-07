<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Quotation;
use App\Models\CustomerLedger;
use App\Models\DeliveryChallan;
use App\Traits\GeneratesDocumentNumbers;

class InvoiceService
{
    use GeneratesDocumentNumbers;

    public function __construct(protected PaymentService $paymentService)
    {
    }

    /**
     * Generate next invoice number: INV-2025-0001
     */
    public function generateInvoiceNumber(): string
    {
        return $this->nextDocumentNumber(Invoice::class, 'invoice_number', 'INV');
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

        // Fold in any advance payment taken against this order while it
        // was still a quotation - links each payment's invoice_id and sets
        // this invoice's own paid_amount/due_amount/payment_status
        // accordingly, without repeating the ledger/book entry each advance
        // already made when the cash actually came in.
        $this->paymentService->linkAdvancePaymentsToInvoice($quotation, $invoice);

        return $invoice->fresh();
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

        // 2. Unlink every payment tied to this invoice - both a pre-invoice
        // advance folded in at generation time (Payment::quotation_id
        // already set - see PaymentService::processAdvancePayment /
        // linkAdvancePaymentsToInvoice) and a payment taken directly against
        // this invoice afterwards via the Payments page (quotation_id null
        // there, since PaymentService::processPayment() never sets it).
        // Either way the money was genuinely received and archiving this
        // invoice - usually to correct it and regenerate - must never make
        // it disappear from the books, so invoice_id is cleared and
        // quotation_id backfilled to this invoice's order: the payment
        // becomes "a pending credit against the order" exactly like a fresh
        // advance, ready to fold into whichever invoice gets generated next
        // (see linkAdvancePaymentsToInvoice, which matches on quotation_id).
        // Its own Customer Ledger credit and Cash/Bank/Mobile Book entry are
        // left completely alone.
        Payment::where('invoice_id', $invoice->id)
            ->update([
                'invoice_id'   => null,
                'quotation_id' => $invoice->quotation_id,
            ]);

        // 3. Reverse Customer Ledger (credit the amount)
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
        
        // 4. Unlock Quotation (set status back to approved)
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

        // Re-link back any advance payment archive() had unlinked from
        // this invoice - the common case (restore right after an
        // accidental archive, nothing else changed in between) puts things
        // back exactly as they were. If a further-out advance was taken
        // against this same order while the invoice sat archived, it gets
        // pulled in here too rather than waiting on a second invoice that,
        // once this one is restored, will likely never be generated - so
        // paid_amount/due_amount/payment_status are recomputed from every
        // payment now linked, not just re-applied from before archiving.
        Payment::where('quotation_id', $invoice->quotation_id)
            ->whereNull('invoice_id')
            ->active()
            ->update(['invoice_id' => $invoice->id]);

        $paidAmount = (float) Payment::where('invoice_id', $invoice->id)->active()->sum('amount');
        $invoice->paid_amount = $paidAmount;
        $invoice->due_amount = max(0, (float) $invoice->grand_total - $paidAmount);
        $invoice->payment_status = $invoice->due_amount <= 0 ? 'paid' : ($paidAmount > 0 ? 'partial' : 'unpaid');
        $invoice->save();

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
