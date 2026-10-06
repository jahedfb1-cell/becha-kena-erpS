<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\CustomerLedger;
use App\Models\MobileBookEntry;
use App\Models\User;
use App\Services\AccountBookService;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Cancels cash / bank / mobile book lines and customer ledger lines whose
 * source document (payment, invoice, expense, voucher) no longer exists.
 *
 * Such a line moves money no document supports - e.g. the 7 Aug demo
 * payments were deleted but their cash and bank lines stayed, overstating
 * both balances. Books are never corrected by deleting history: each orphan
 * gets a reversing line (same amount, opposite direction, same book and
 * customer) with the reason in its description, and both lines are then
 * archived so they drop out of the active statements as a cancelled pair.
 * Every pair is written to the audit log.
 *
 * Safe to run again (archived lines are skipped). --dry-run lists only.
 */
class ReverseOrphanBookEntries extends Command
{
    protected $signature = 'books:reverse-orphan-entries {--dry-run : List what would be reversed without writing}';

    protected $description = 'Reverse and archive book / customer ledger lines whose source record no longer exists';

    public function handle(AccountBookService $books): int
    {
        $dry = (bool) $this->option('dry-run');
        $admin = User::withoutGlobalScopes()->where('role', 'admin')->orderBy('id')->first();
        if (!$admin) {
            $this->error('No admin user to record the reversals under.');

            return self::FAILURE;
        }

        $found = 0;
        $tables = [
            CashBookEntry::class   => 'cash',
            BankBookEntry::class   => 'bank',
            MobileBookEntry::class => 'mobile',
            CustomerLedger::class  => 'ledger',
        ];

        DB::transaction(function () use ($tables, $books, $admin, $dry, &$found) {
            foreach ($tables as $class => $kind) {
                foreach ($class::withoutGlobalScopes()->where('is_archived', false)->orderBy('id')->get() as $line) {
                    if (!$this->sourceMissing($line)) {
                        continue;
                    }
                    $found++;
                    $amount = $kind === 'ledger' ? max((float) $line->debit, (float) $line->credit) : (float) $line->amount;
                    $this->line(sprintf('  %-6s #%-5d %s %s  %s', $kind, $line->id, class_basename($line->reference_type), $line->reference_id,
                        number_format($amount, 2) . ' | ' . $line->description));
                    if (!$dry) {
                        $this->reverse($kind, $line, $books, $admin);
                    }
                }
            }
        });

        $this->info(($dry ? '[dry run] would reverse: ' : 'Reversed: ') . $found);

        return self::SUCCESS;
    }

    private function sourceMissing(Model $line): bool
    {
        $type = $line->reference_type;
        if (!$type || !class_exists($type) || !is_subclass_of($type, Model::class) || !$line->reference_id) {
            return false;
        }

        return !$type::withoutGlobalScopes()->whereKey($line->reference_id)->exists();
    }

    private function reverse(string $kind, Model $line, AccountBookService $books, User $admin): void
    {
        $reason = 'source ' . class_basename($line->reference_type) . " #{$line->reference_id} no longer exists";
        $today = now()->toDateString();

        if ($kind === 'ledger') {
            $last = CustomerLedger::withoutGlobalScopes()
                ->where('customer_id', $line->customer_id)->where('brand_id', $line->brand_id)
                ->orderByDesc('id')->value('balance');
            $debit = (float) $line->credit;   // swap sides
            $credit = (float) $line->debit;
            $reversal = CustomerLedger::withoutGlobalScopes()->create([
                'brand_id'         => $line->brand_id,
                'customer_id'      => $line->customer_id,
                'salesman_id'      => $line->salesman_id,
                'transaction_type' => 'adjustment',
                'reference_type'   => $line->reference_type,
                'reference_id'     => $line->reference_id,
                'description'      => "Reversal of ledger #{$line->id} ({$reason}): {$line->description}",
                'debit'            => $debit,
                'credit'           => $credit,
                'balance'          => round((float) $last + $debit - $credit, 2),
                'transaction_date' => $today,
                'created_by'       => $admin->id,
            ]);
        } else {
            $attrs = [
                'brand_id'       => $line->brand_id,
                'entry_type'     => $line->entry_type === 'in' ? 'out' : 'in',
                'reference_type' => $line->reference_type,
                'reference_id'   => $line->reference_id,
                'description'    => "Reversal of {$kind} book #{$line->id} ({$reason}): {$line->description}",
                'amount'         => $line->amount,
                'entry_date'     => $today,
                'created_by'     => $admin->id,
            ];
            $reversal = match ($kind) {
                'cash'   => $books->cashEntry($attrs),
                'bank'   => $books->bankEntry($attrs + ['bank_name' => $line->bank_name, 'cheque_number' => $line->cheque_number],
                    $line->bank_account_id ? \App\Models\BankAccount::withoutGlobalScopes()->find($line->bank_account_id) : null),
                'mobile' => $books->mobileEntry($attrs + ['provider' => $line->provider, 'transaction_id' => $line->transaction_id],
                    $line->mobile_account_id ? \App\Models\MobileAccount::withoutGlobalScopes()->find($line->mobile_account_id) : null),
            };
        }

        // A cancelled pair: both kept, both out of the active statements.
        $line->archive($admin->id, "Reversed by #{$reversal->id}: {$reason}");
        $reversal->archive($admin->id, "Reverses #{$line->id}: {$reason}");

        AuditLog::record($admin->id, 'system', 'archive', get_class($line), $line->id, $line->toArray(), $reversal->toArray(),
            "Reversed orphan {$kind} line #{$line->id} with #{$reversal->id}: {$reason}");
    }
}
