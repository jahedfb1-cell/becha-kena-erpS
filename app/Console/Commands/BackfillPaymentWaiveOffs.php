<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\CustomerLedger;
use App\Models\Payment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Records, on each payment, the waive-off that was given with it.
 *
 * payments.discount_amount (and discount_note) were added on 1 Oct. Before
 * that a waive-off taken with a payment was written to the invoice's running
 * discount and to the customer ledger as a "discount" line, but not to the
 * payment itself - so those payments' money receipts show no waive-off row.
 *
 * The waive-off is not guessed: the ledger holds a "Waive-off discount ...
 * (PAY-...)" line for exactly that payment, and that amount is copied onto
 * the payment. Only payments whose own discount is still 0 are touched, so it
 * is safe to run again, and no invoice, ledger or book figure changes.
 */
class BackfillPaymentWaiveOffs extends Command
{
    protected $signature = 'payments:backfill-waive-off {--dry-run : List what would be written without writing}';

    protected $description = 'Copy each payment\'s waive-off from its customer ledger "discount" line onto the payment';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $done = 0;

        DB::transaction(function () use ($dry, &$done) {
            $lines = CustomerLedger::withoutGlobalScopes()
                ->where('transaction_type', 'discount')
                ->where('reference_type', Payment::class)
                ->where('is_archived', false)
                ->orderBy('id')->get();

            foreach ($lines->groupBy('reference_id') as $paymentId => $group) {
                $payment = Payment::withoutGlobalScopes()->find($paymentId);
                $amount = round((float) $group->sum('credit'), 2);
                if (!$payment || $amount <= 0 || (float) $payment->discount_amount > 0) {
                    continue;
                }

                $this->line(sprintf('  %-14s waive-off %10s  (ledger #%s)', $payment->payment_number, number_format($amount, 2), $group->pluck('id')->implode(',')));
                if (!$dry) {
                    $old = ['discount_amount' => $payment->discount_amount];
                    $payment->forceFill(['discount_amount' => $amount])->saveQuietly();
                    AuditLog::record(null, 'system', 'update', Payment::class, $payment->id, $old, ['discount_amount' => $amount],
                        "Recorded the waive-off of {$amount} on {$payment->payment_number} from its customer ledger line", $payment->payment_number);
                }
                $done++;
            }
        });

        $this->info(($dry ? '[dry run] would update: ' : 'Updated: ') . $done);

        return self::SUCCESS;
    }
}
