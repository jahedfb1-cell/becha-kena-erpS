<?php

namespace App\Console\Commands;

use App\Models\CustomerLedger;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Console\Command;

/**
 * Rewrites the descriptions of existing invoice and payment ledger rows into
 * the statement wording the ledger now stores when it posts them:
 *
 *   invoice: "INV-2026-0058 - Color Code : WBR 201"
 *   payment: "Cash  INV-2026-0058 (PAY-2026-0041)"
 *
 * New rows are written that way from the start; this brings the old ones in
 * line, once, so a later product-code edit can never change a posted ledger.
 *
 * Only rows still carrying the old system wording are touched, so running it
 * again after a product code changed leaves already-converted rows alone.
 * Amounts, balances and dates are never changed.
 */
class FreezeLedgerDescriptions extends Command
{
    protected $signature = 'ledger:freeze-descriptions {--dry-run : List what would be written without writing}';

    protected $description = 'Rewrite old invoice/payment customer-ledger descriptions into the new statement wording';

    private const OLD_INVOICE = ['Generated invoice ', 'Restored invoice ', 'Legacy invoice '];
    private const OLD_PAYMENT = ['Payment received for invoice ', 'Advance payment received for order ', 'Legacy payment for invoice '];

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $done = 0;
        $skipped = 0;

        CustomerLedger::withoutGlobalScopes()
            ->whereIn('transaction_type', ['invoice', 'payment', 'advance_payment'])
            ->whereIn('reference_type', [Invoice::class, 'Invoice', Payment::class, 'Payment'])
            ->orderBy('id')
            ->chunkById(200, function ($rows) use ($dry, &$done, &$skipped) {
                foreach ($rows as $row) {
                    $isInvoice = in_array($row->reference_type, [Invoice::class, 'Invoice'], true);
                    $prefixes = $isInvoice ? self::OLD_INVOICE : self::OLD_PAYMENT;
                    if (!str_starts_with((string) $row->description, $prefixes[0])
                        && !str_starts_with((string) $row->description, $prefixes[1])
                        && !str_starts_with((string) $row->description, $prefixes[2])) {
                        continue;
                    }

                    $source = $isInvoice
                        ? Invoice::withoutGlobalScopes()->find($row->reference_id)
                        : Payment::withoutGlobalScopes()->find($row->reference_id);
                    if (!$source) {
                        $skipped++;
                        continue;
                    }

                    $text = $isInvoice ? CustomerLedger::invoiceText($source) : CustomerLedger::paymentText($source);
                    $this->line(sprintf('  #%-6s %s  ->  %s', $row->id, $row->description, $text));
                    if (!$dry) {
                        $row->description = $text;
                        $row->saveQuietly();
                    }
                    $done++;
                }
            });

        $this->info(($dry ? '[dry run] would update: ' : 'Updated: ') . $done . ($skipped ? " (skipped, source record missing: {$skipped})" : ''));

        return self::SUCCESS;
    }
}
