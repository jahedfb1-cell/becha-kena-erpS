<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerLedger;
use Illuminate\Support\Facades\DB;

class CustomerOpeningBalanceService
{
    /**
     * Sync opening balance ledger entry for a customer.
     *
     * Business Rules:
     * ─────────────────────────────────────────────────────
     * 1. If opening_balance > 0 and no opening_balance row exists → CREATE
     * 2. If opening_balance changed and row exists → UPDATE same row (never duplicate)
     * 3. If opening_balance becomes 0 → update existing row to 0 (do not delete)
     * 4. After any change → recalculate all running balances for customer
     * ─────────────────────────────────────────────────────
     *
     * @param Customer $customer   The customer record
     * @param int      $adminId    Admin user performing the action
     * @return void
     */
    public function sync(Customer $customer, int $adminId): void
    {
        $openingAmount = (float) $customer->opening_balance;

        // Find existing opening balance ledger row
        $existingEntry = CustomerLedger::where('customer_id', $customer->id)
            ->where('transaction_type', 'opening_balance')
            ->first();

        if ($existingEntry) {
            // Update the existing row (never create a second one)
            $existingEntry->update([
                'debit'            => $openingAmount,
                'credit'           => 0,
                'description'      => 'Opening Balance',
                'transaction_date' => $existingEntry->transaction_date, // preserve original date
            ]);
        } else {
            // Only create if opening_balance > 0
            if ($openingAmount > 0) {
                CustomerLedger::create([
                    'customer_id'      => $customer->id,
                    'salesman_id'      => null,
                    'transaction_type' => 'opening_balance',
                    'reference_type'   => Customer::class,
                    'reference_id'     => $customer->id,
                    'description'      => 'Opening Balance',
                    'debit'            => $openingAmount,
                    'credit'           => 0,
                    'balance'          => $openingAmount, // temporary, will be recalculated
                    'transaction_date' => now()->toDateString(),
                    'created_by'       => $adminId,
                ]);
            }
        }

        // Always recalculate running balances after any change
        $this->recalculateBalances($customer->id);
    }

    /**
     * Recalculate running balances for ALL ledger entries of a customer.
     *
     * Strategy:
     * ─────────────────────────────────────────────────────
     * 1. Fetch ALL entries for this customer ordered by id ASC
     *    (opening_balance row has lowest id so it comes first naturally)
     * 2. Walk through sequentially, computing: balance = previous_balance + debit - credit
     * 3. Bulk-update each row with its correct running balance
     * ─────────────────────────────────────────────────────
     *
     * @param int $customerId
     * @return void
     */
    public function recalculateBalances(int $customerId): void
    {
        $entries = CustomerLedger::where('customer_id', $customerId)
            ->orderBy('id', 'asc')
            ->get();

        $runningBalance = 0.0;
        foreach ($entries as $entry) {
            $runningBalance = $runningBalance + (float) $entry->debit - (float) $entry->credit;
            $entry->balance = round($runningBalance, 2);
            $entry->save();
        }
    }
}
