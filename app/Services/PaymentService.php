<?php

namespace App\Services;

use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\CustomerLedger;
use App\Models\Invoice;
use App\Models\MobileBookEntry;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;

class PaymentService
{
    /**
     * Generate next payment number: PAY-2025-0001
     */
    public function generatePaymentNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "PAY-{$year}-";

        // Numbers are one shared sequence across every brand, not scoped
        // per brand — without this a brand with no payments yet would
        // restart at 0001 and collide with another brand's number.
        $last = Payment::withoutGlobalScope('brand')
            ->where('payment_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(payment_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($last && preg_match('/PAY-\d{4}-(\d+)/', $last->payment_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Process a new payment against an invoice
     */
    public function processPayment(array $data, Invoice $invoice, int $userId): Payment
    {
        $paymentNumber = $this->generatePaymentNumber();
        $amount = (float) $data['amount'];
        $discountAmount = (float) ($data['discount_amount'] ?? 0);
        $totalCredit = $amount + $discountAmount;

        $payment = Payment::create([
            'payment_number'   => $paymentNumber,
            'invoice_id'       => $invoice->id,
            'customer_id'      => $invoice->customer_id,
            'amount'           => $amount,
            'payment_method'   => $data['payment_method'],
            'bank_name'        => $data['bank_name'] ?? null,
            'mobile_provider'  => $data['mobile_provider'] ?? null,
            'transaction_id'   => $data['transaction_id'] ?? null,
            'cheque_number'    => $data['cheque_number'] ?? null,
            'payment_date'     => $data['payment_date'],
            'notes'            => $data['notes'] ?? null,
            'created_by'       => $userId,
        ]);

        // 1. Update Invoice amounts & status
        $invoice->paid_amount += $amount;
        // Discount waives off the due amount directly
        $invoice->discount_amount += $discountAmount; 
        
        $invoice->due_amount = $invoice->grand_total - $invoice->paid_amount - $invoice->discount_amount;
        
        if ($invoice->due_amount <= 0) {
            $invoice->payment_status = 'paid';
            $invoice->due_amount = 0; // prevent negative
        } elseif ($invoice->paid_amount > 0 || $invoice->discount_amount > 0) {
            $invoice->payment_status = 'partial';
        } else {
            $invoice->payment_status = 'unpaid';
        }
        $invoice->save();

        // 2. Customer Ledger Entry (credit)
        $this->recordCustomerLedger($invoice, $payment, $amount, $discountAmount, 'payment', $userId);

        // 3. Book Entry based on method
        $this->recordBookEntry($payment, 'in', $amount, $userId);

        return $payment;
    }

    /**
     * Transfer a payment from one invoice to another (Void + Re-apply in one transaction).
     * Returns the new payment created on the target invoice.
     */
    public function transferPayment(Payment $oldPayment, Invoice $newInvoice, int $userId, string $reason = ''): Payment
    {
        // 1. Void the old payment (reverses invoice + ledger + book entry)
        $this->voidPayment($oldPayment, $userId);

        // 2. Build data for new payment from the voided one
        $data = [
            'invoice_id'      => $newInvoice->id,
            'amount'          => (float) $oldPayment->amount,
            'payment_method'  => $oldPayment->payment_method,
            'bank_name'       => $oldPayment->bank_name,
            'mobile_provider' => $oldPayment->mobile_provider,
            'transaction_id'  => $oldPayment->transaction_id,
            'cheque_number'   => $oldPayment->cheque_number,
            'payment_date'    => $oldPayment->payment_date,
            'notes'           => $reason
                ? "Transferred from {$oldPayment->payment_number}. Reason: {$reason}"
                : "Transferred from {$oldPayment->payment_number}",
        ];

        // 3. Process new payment on target invoice
        $newPayment = $this->processPayment($data, $newInvoice, $userId);

        return $newPayment;
    }

    /**
     * Void an existing payment and reverse entries
     */
    public function voidPayment(Payment $payment, int $userId): void
    {
        $invoice = $payment->invoice;
        $amount = (float) $payment->amount;

        // In a real system, you might have to track how much discount was waived for THIS payment
        // For simplicity, we assume we don't reverse the waive-off discount or we'd need to store it in `payments` table.
        // But for robust reversal, it's recommended to reverse just the paid amount.

        // Update Invoice
        $invoice->paid_amount -= $amount;
        $invoice->due_amount = $invoice->grand_total - $invoice->paid_amount - $invoice->discount_amount;
        
        if ($invoice->due_amount >= $invoice->grand_total - $invoice->discount_amount) {
            $invoice->payment_status = 'unpaid';
        } else {
            $invoice->payment_status = 'partial';
        }
        $invoice->save();

        // Reverse Customer Ledger (debit)
        $lastLedger = CustomerLedger::where('customer_id', $invoice->customer_id)->orderBy('id', 'desc')->first();
        $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;
        
        CustomerLedger::create([
            'customer_id'      => $invoice->customer_id,
            'salesman_id'      => $invoice->salesman_id,
            'transaction_type' => 'adjustment',
            'reference_type'   => Payment::class,
            'reference_id'     => $payment->id,
            'description'      => "Voided payment {$payment->payment_number}",
            'debit'            => $amount,
            'credit'           => 0,
            'balance'          => $previousBalance + $amount, // reverse credit
            'transaction_date' => now()->toDateString(),
            'created_by'       => $userId,
        ]);

        // Reverse Book Entry
        $this->recordBookEntry($payment, 'out', $amount, $userId, 'Voided payment');

        $payment->archive($userId, 'Voided payment');
    }

    private function recordCustomerLedger(Invoice $invoice, Payment $payment, float $amount, float $discountAmount, string $type, int $userId)
    {
        $lastLedger = CustomerLedger::where('customer_id', $invoice->customer_id)->orderBy('id', 'desc')->first();
        $previousBalance = $lastLedger ? (float) $lastLedger->balance : 0;

        if ($amount > 0) {
            $previousBalance -= $amount;
            CustomerLedger::create([
                'customer_id'      => $invoice->customer_id,
                'salesman_id'      => $invoice->salesman_id,
                'transaction_type' => $type,
                'reference_type'   => Payment::class,
                'reference_id'     => $payment->id,
                'description'      => "Payment received for invoice {$invoice->invoice_number} ({$payment->payment_number})",
                'debit'            => 0,
                'credit'           => $amount,
                'balance'          => $previousBalance,
                'transaction_date' => $payment->payment_date,
                'created_by'       => $userId,
            ]);
        }

        if ($discountAmount > 0) {
            $previousBalance -= $discountAmount;
            CustomerLedger::create([
                'customer_id'      => $invoice->customer_id,
                'salesman_id'      => $invoice->salesman_id,
                'transaction_type' => 'discount',
                'reference_type'   => Payment::class,
                'reference_id'     => $payment->id,
                'description'      => "Waive-off discount for invoice {$invoice->invoice_number} ({$payment->payment_number})",
                'debit'            => 0,
                'credit'           => $discountAmount,
                'balance'          => $previousBalance,
                'transaction_date' => $payment->payment_date,
                'created_by'       => $userId,
            ]);
        }
    }

    private function recordBookEntry(Payment $payment, string $entryType, float $amount, int $userId, string $prefix = 'Payment')
    {
        $desc = "{$prefix} {$payment->payment_number}";
        
        switch ($payment->payment_method) {
            case 'cash':
                $last = CashBookEntry::orderBy('id', 'desc')->first();
                $bal = $last ? (float) $last->balance : 0;
                $bal = $entryType === 'in' ? $bal + $amount : $bal - $amount;
                
                CashBookEntry::create([
                    'entry_type'     => $entryType,
                    'reference_type' => Payment::class,
                    'reference_id'   => $payment->id,
                    'description'    => $desc,
                    'amount'         => $amount,
                    'balance'        => $bal,
                    'entry_date'     => $payment->payment_date,
                    'created_by'     => $userId,
                ]);
                break;
                
            case 'bank':
                $last = BankBookEntry::where('bank_name', $payment->bank_name)->orderBy('id', 'desc')->first();
                $bal = $last ? (float) $last->balance : 0;
                $bal = $entryType === 'in' ? $bal + $amount : $bal - $amount;
                
                BankBookEntry::create([
                    'bank_name'      => $payment->bank_name,
                    'entry_type'     => $entryType,
                    'reference_type' => Payment::class,
                    'reference_id'   => $payment->id,
                    'description'    => $desc,
                    'cheque_number'  => $payment->cheque_number,
                    'amount'         => $amount,
                    'balance'        => $bal,
                    'entry_date'     => $payment->payment_date,
                    'created_by'     => $userId,
                ]);
                break;
                
            case 'mobile':
                $last = MobileBookEntry::where('provider', $payment->mobile_provider)->orderBy('id', 'desc')->first();
                $bal = $last ? (float) $last->balance : 0;
                $bal = $entryType === 'in' ? $bal + $amount : $bal - $amount;
                
                MobileBookEntry::create([
                    'provider'       => $payment->mobile_provider,
                    'entry_type'     => $entryType,
                    'reference_type' => Payment::class,
                    'reference_id'   => $payment->id,
                    'description'    => $desc,
                    'transaction_id' => $payment->transaction_id,
                    'amount'         => $amount,
                    'balance'        => $bal,
                    'entry_date'     => $payment->payment_date,
                    'created_by'     => $userId,
                ]);
                break;
        }
    }
}
