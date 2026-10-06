<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Archives the extra invoice on an order that was invoiced twice by the
 * legacy import.
 *
 * Two imported orders carry two active invoices with the same total, date and
 * order, so the customer's dues are counted twice in the sales-due reports.
 * Normal "archive invoice" cannot be used on them: it credits the customer
 * ledger with the invoice total and re-opens the order, but these imported
 * invoices were never debited to the ledger, so that would put a credit on
 * the ledger for money that was never owed. Here only the invoice record
 * (and its delivery challan) is archived.
 *
 * Deliberately narrow, so a genuine second invoice is never touched. An order
 * qualifies only when ALL of these hold:
 *   - it has exactly two active invoices with the same grand total
 *   - the invoice to archive has no payment and no ledger line
 *   - the other invoice is kept (the one with payments, else the older one)
 *
 * Nothing is deleted; both archived rows say why. --dry-run lists only.
 */
class ArchiveDuplicateLegacyInvoices extends Command
{
    protected $signature = 'invoices:archive-duplicates {--dry-run : List what would be archived without writing}';

    protected $description = 'Archive the unpaid, never-ledgered duplicate invoice on orders invoiced twice by the legacy import';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $admin = User::withoutGlobalScopes()->where('role', 'admin')->orderBy('id')->first();
        $archived = 0;

        $orderIds = Invoice::withoutGlobalScopes()->where('is_archived', false)
            ->select('quotation_id')->groupBy('quotation_id')->havingRaw('count(*) = 2')->pluck('quotation_id');

        DB::transaction(function () use ($orderIds, $admin, $dry, &$archived) {
            foreach ($orderIds as $orderId) {
                $pair = Invoice::withoutGlobalScopes()->where('quotation_id', $orderId)->where('is_archived', false)->orderBy('id')->get();
                if (round((float) $pair[0]->grand_total, 2) !== round((float) $pair[1]->grand_total, 2)) {
                    $this->warn("  order {$orderId}: totals differ, left alone");
                    continue;
                }

                $facts = $pair->map(fn (Invoice $i) => [
                    'invoice'  => $i,
                    'payments' => DB::table('payments')->where('invoice_id', $i->id)->where('is_archived', false)->count(),
                    'ledger'   => DB::table('customer_ledgers')->where('reference_type', Invoice::class)->where('reference_id', $i->id)->where('is_archived', false)->count(),
                ]);

                // keep the one with payments, otherwise the older
                $keep = $facts->sortByDesc(fn ($f) => $f['payments'])->first();
                $drop = $facts->first(fn ($f) => $f['invoice']->id !== $keep['invoice']->id);

                if ($drop['payments'] > 0 || $drop['ledger'] > 0) {
                    $this->warn("  order {$orderId}: both invoices carry payments or ledger lines, left for a person to decide");
                    continue;
                }

                $this->line(sprintf('  order %-12s keep %s, archive %s (total %s, no payments, no ledger lines)',
                    $orderId, $keep['invoice']->invoice_number, $drop['invoice']->invoice_number, number_format((float) $drop['invoice']->grand_total, 2)));

                if (!$dry) {
                    $reason = "Duplicate of {$keep['invoice']->invoice_number} on the same order (legacy import); unpaid and never ledgered";
                    $inv = $drop['invoice'];
                    $old = $inv->toArray();
                    $inv->archive($admin->id, $reason);
                    foreach (DeliveryChallan::withoutGlobalScopes()->where('invoice_id', $inv->id)->where('is_archived', false)->get() as $challan) {
                        $challan->archive($admin->id, "Cascaded from duplicate invoice {$inv->invoice_number}");
                    }
                    AuditLog::record($admin->id, 'system', 'archive', Invoice::class, $inv->id, $old, $inv->fresh()->toArray(),
                        "Archived duplicate invoice {$inv->invoice_number} (kept {$keep['invoice']->invoice_number})", $inv->invoice_number);
                }
                $archived++;
            }
        });

        $this->info(($dry ? '[dry run] would archive: ' : 'Archived: ') . $archived);

        return self::SUCCESS;
    }
}
