<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\PurchaseEntry;
use App\Models\SupplierLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Re-points supplier ledger lines at their purchase order again.
 *
 * Every purchase line on a supplier ledger carries reference_id = the first
 * purchase entry of its PO. The purchase entries were at some point rebuilt
 * with new ids, so 105 ledger lines on the live database still point at ids
 * that no longer exist. The amounts are right (each supplier's ledger total
 * matches its live purchases less payments); only the link is broken, so a
 * ledger line cannot be opened back to its PO.
 *
 * The PO number is in every such line's description ("Purchase order
 * PO-2026-0029 for quotation QT-2026-0019", "Cancelled purchase PO-... -
 * reverse entry", "Restored purchase PO-..."), so the line is matched to the
 * first live entry of that PO for the same supplier (and the same quotation
 * when the description names one) - the same entry the code links to when it
 * writes the line. Amounts and balances are never touched.
 *
 * Safe to run more than once: only lines whose target is missing are looked
 * at. --dry-run lists what would change without writing.
 */
class RelinkSupplierLedgerPurchases extends Command
{
    protected $signature = 'ledger:relink-supplier-purchases {--dry-run : Show what would change without writing}';

    protected $description = 'Re-link supplier ledger lines whose purchase entry id no longer exists, by PO number';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $broken = SupplierLedger::withoutGlobalScopes()
            ->where('reference_type', PurchaseEntry::class)
            ->whereNotIn('reference_id', PurchaseEntry::withoutGlobalScopes()->select('id'))
            ->orderBy('id')
            ->get();

        $this->info(($dry ? '[dry run] ' : '') . "Ledger lines with a missing purchase entry: {$broken->count()}");

        $fixed = 0;
        $unmatched = [];

        DB::transaction(function () use ($broken, $dry, &$fixed, &$unmatched) {
            foreach ($broken as $line) {
                if (!preg_match('/\b(PO-\d{4}-\d+)\b/', (string) $line->description, $po)) {
                    $unmatched[] = "#{$line->id}: no PO number in \"{$line->description}\"";
                    continue;
                }

                $query = PurchaseEntry::withoutGlobalScopes()
                    ->where('purchase_number', $po[1])
                    ->where('supplier_id', $line->supplier_id);

                if (preg_match('/\b(Q[A-Z]*-\d{4}-\d+|QDB-\d+)\b/', (string) $line->description, $qt)) {
                    $query->whereHas('quotation', fn ($q) => $q->withoutGlobalScopes()->where('quotation_number', $qt[1]));
                }

                $targetId = $query->min('id');
                if (!$targetId) {
                    $unmatched[] = "#{$line->id}: no live entry for {$po[1]} / supplier {$line->supplier_id}";
                    continue;
                }

                $this->line(sprintf('  #%d  %s  %d -> %d', $line->id, $po[1], $line->reference_id, $targetId));

                if (!$dry) {
                    $old = $line->reference_id;
                    $line->forceFill(['reference_id' => $targetId])->saveQuietly();
                    AuditLog::record(
                        null,
                        'system',
                        'update',
                        SupplierLedger::class,
                        $line->id,
                        ['reference_id' => $old],
                        ['reference_id' => $targetId],
                        "Re-linked supplier ledger line #{$line->id} to purchase {$po[1]} (entry {$old} no longer exists)",
                        $po[1]
                    );
                }
                $fixed++;
            }
        });

        $this->info(($dry ? 'Would re-link: ' : 'Re-linked: ') . $fixed);
        if ($unmatched) {
            $this->warn('Left as they are (no safe match): ' . count($unmatched));
            foreach ($unmatched as $u) {
                $this->line('  ' . $u);
            }
        }

        return self::SUCCESS;
    }
}
