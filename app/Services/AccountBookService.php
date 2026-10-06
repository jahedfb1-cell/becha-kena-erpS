<?php

namespace App\Services;

use App\Models\BankAccount;
use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\MobileAccount;
use App\Models\MobileBookEntry;
use Illuminate\Validation\ValidationException;

/**
 * The one place bank and mobile book lines are written and account balances
 * are worked out.
 *
 * Every line is linked to the registered account it moved money through
 * (bank_account_id / mobile_account_id), and an account's balance is always
 * computed - opening balance plus its active lines - never stored, so it
 * cannot drift the way the old current_balance column did.
 *
 * Older clients and older records only carry a typed bank name / provider.
 * Those are matched to a registered account when exactly one fits; when none
 * does the line is still written, unlinked, exactly as before.
 */
class AccountBookService
{
    // ---------------------------------------------------------------- lookup

    /**
     * The registered bank account for a request: by id when given (must be an
     * active account of the user's brand), otherwise the single account whose
     * bank name matches the typed one.
     */
    public function resolveBank(?int $id, ?string $bankName = null, string $field = 'bank_account_id'): ?BankAccount
    {
        if ($id) {
            $account = BankAccount::active()->where('is_active', true)->find($id);
            if (!$account) {
                throw ValidationException::withMessages([$field => ['Choose an active bank account from the list.']]);
            }

            return $account;
        }

        if ($bankName = trim((string) $bankName)) {
            $matches = BankAccount::active()->where('is_active', true)
                ->whereRaw('LOWER(bank_name) = ?', [mb_strtolower($bankName)])->get();

            return $matches->count() === 1 ? $matches->first() : null;
        }

        return null;
    }

    public function resolveMobile(?int $id, ?string $provider = null, string $field = 'mobile_account_id'): ?MobileAccount
    {
        if ($id) {
            $account = MobileAccount::active()->where('is_active', true)->find($id);
            if (!$account) {
                throw ValidationException::withMessages([$field => ['Choose an active mobile account from the list.']]);
            }

            return $account;
        }

        if ($provider = trim((string) $provider)) {
            $p = mb_strtolower($provider);
            $matches = MobileAccount::active()->where('is_active', true)->get()
                ->filter(fn (MobileAccount $a) => $a->book_provider !== null && str_contains($p, $a->book_provider));

            return $matches->count() === 1 ? $matches->first() : null;
        }

        return null;
    }

    // --------------------------------------------------------------- writing

    /**
     * Writes one bank book line. $attrs: entry_type (in|out), amount,
     * reference_type, reference_id, description, entry_date, created_by,
     * cheque_number?, bank_name? (used only when no account is linked).
     */
    public function bankEntry(array $attrs, ?BankAccount $account): BankBookEntry
    {
        $amount = round((float) $attrs['amount'], 2);
        $in = $attrs['entry_type'] === 'in';

        if ($account) {
            $last = BankBookEntry::where('bank_account_id', $account->id)->orderByDesc('id')->value('balance');
            $base = $last !== null ? (float) $last : (float) $account->opening_balance;
            $attrs['bank_account_id'] = $account->id;
            $attrs['bank_name'] = $account->bank_name;
            $attrs['account_number'] = $account->account_number;
        } else {
            // Legacy: a running balance per typed bank name, as before.
            $base = (float) (BankBookEntry::where('bank_name', $attrs['bank_name'] ?? null)->orderByDesc('id')->value('balance') ?? 0);
        }

        $attrs['amount'] = $amount;
        $attrs['balance'] = round($in ? $base + $amount : $base - $amount, 2);

        return BankBookEntry::create($attrs);
    }

    /**
     * Writes one mobile book line. Same $attrs as bankEntry(), with
     * transaction_id? and provider? (used only when no account is linked).
     */
    public function mobileEntry(array $attrs, ?MobileAccount $account): MobileBookEntry
    {
        $amount = round((float) $attrs['amount'], 2);
        $in = $attrs['entry_type'] === 'in';

        if ($account) {
            $last = MobileBookEntry::where('mobile_account_id', $account->id)->orderByDesc('id')->value('balance');
            $base = $last !== null ? (float) $last : (float) $account->opening_balance;
            $attrs['mobile_account_id'] = $account->id;
            $attrs['provider'] = $account->book_provider ?? ($attrs['provider'] ?? 'bkash');
            $attrs['account_number'] = $account->account_number;
        } else {
            $attrs['provider'] = $this->bookProvider($attrs['provider'] ?? null);
            if ($attrs['provider'] === null) {
                throw ValidationException::withMessages(['mobile_account_id' => ['Choose a registered bKash, Nagad or Rocket account.']]);
            }
            $base = (float) (MobileBookEntry::where('provider', $attrs['provider'])->orderByDesc('id')->value('balance') ?? 0);
        }

        $attrs['amount'] = $amount;
        $attrs['balance'] = round($in ? $base + $amount : $base - $amount, 2);

        return MobileBookEntry::create($attrs);
    }

    public function cashEntry(array $attrs): CashBookEntry
    {
        $amount = round((float) $attrs['amount'], 2);
        $base = (float) (CashBookEntry::orderByDesc('id')->value('balance') ?? 0);
        $attrs['amount'] = $amount;
        $attrs['balance'] = round($attrs['entry_type'] === 'in' ? $base + $amount : $base - $amount, 2);

        return CashBookEntry::create($attrs);
    }

    /**
     * Posts the opposite of every active cash / bank / mobile line a record
     * wrote (an expense or voucher being archived), so the money it moved is
     * put back. The original lines stay as they are - books are corrected by
     * a reversing line, never by deleting history - and each reversal goes to
     * the same account the original went through.
     */
    public function reverseEntriesFor(string $referenceType, int $referenceId, string $date, int $userId, string $reason): void
    {
        $common = fn ($line) => [
            'entry_type'     => $line->entry_type === 'in' ? 'out' : 'in',
            'reference_type' => $referenceType,
            'reference_id'   => $referenceId,
            'description'    => "Reversed ({$reason}): {$line->description}",
            'amount'         => $line->amount,
            'entry_date'     => $date,
            'created_by'     => $userId,
        ];

        foreach (CashBookEntry::where('reference_type', $referenceType)->where('reference_id', $referenceId)->where('is_archived', false)->get() as $line) {
            $this->cashEntry($common($line));
        }
        foreach (BankBookEntry::where('reference_type', $referenceType)->where('reference_id', $referenceId)->where('is_archived', false)->get() as $line) {
            $this->bankEntry($common($line) + ['bank_name' => $line->bank_name, 'cheque_number' => $line->cheque_number],
                $line->bank_account_id ? BankAccount::withoutGlobalScopes()->find($line->bank_account_id) : null);
        }
        foreach (MobileBookEntry::where('reference_type', $referenceType)->where('reference_id', $referenceId)->where('is_archived', false)->get() as $line) {
            $this->mobileEntry($common($line) + ['provider' => $line->provider, 'transaction_id' => $line->transaction_id],
                $line->mobile_account_id ? MobileAccount::withoutGlobalScopes()->find($line->mobile_account_id) : null);
        }
    }

    // -------------------------------------------------------------- balances

    public function bankBalance(BankAccount $account): float
    {
        return round((float) $account->opening_balance + $this->net(BankBookEntry::where('bank_account_id', $account->id)), 2);
    }

    public function mobileBalance(MobileAccount $account): float
    {
        return round((float) $account->opening_balance + $this->net(MobileBookEntry::where('mobile_account_id', $account->id)), 2);
    }

    private function net($query): float
    {
        $row = $query->where('is_archived', false)
            ->selectRaw("COALESCE(SUM(CASE WHEN entry_type = 'in' THEN amount ELSE -amount END), 0) AS net")
            ->first();

        return (float) ($row->net ?? 0);
    }

    /**
     * The mobile book's provider column only holds bkash / nagad / rocket;
     * anything else (e.g. "Upay") has no place in it.
     */
    private function bookProvider(?string $provider): ?string
    {
        $p = mb_strtolower((string) $provider);
        foreach (['bkash', 'nagad', 'rocket'] as $known) {
            if (str_contains($p, $known)) {
                return $known;
            }
        }

        return null;
    }
}
