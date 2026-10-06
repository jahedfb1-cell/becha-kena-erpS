<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Voucher;
use App\Services\AccountBookService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VoucherController extends Controller
{
    use ApiResponse;

    /**
     * Generate next voucher number: VOU-2026-0001
     */
    protected function generateVoucherNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "VOU-{$year}-";

        // Numbers are one shared sequence across every brand, not scoped
        // per brand — without this a brand with no vouchers yet would
        // restart at 0001 and collide with another brand's number.
        $last = Voucher::withoutGlobalScope('brand')
            ->where('voucher_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(voucher_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($last && preg_match('/VOU-\d{4}-(\d+)/', $last->voucher_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * GET /api/vouchers
     */
    public function index(Request $request): JsonResponse
    {
        $query = Voucher::with([
            'items',
            'creator:id,name',
        ]);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('voucher_type')) {
            $query->where('voucher_type', $request->voucher_type);
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('date', '<=', $request->to_date);
        }

        if ($request->filled('search')) {
            $s = trim($request->search);
            $query->where(function ($q) use ($s) {
                $q->where('voucher_number', 'like', "%{$s}%")
                  ->orWhere('description', 'like', "%{$s}%")
                  ->orWhere('reference_number', 'like', "%{$s}%")
                  ->orWhere('note', 'like', "%{$s}%");
            });
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            $allVouchers = $query->get();
            $vouchers = new \Illuminate\Pagination\LengthAwarePaginator(
                $allVouchers, $allVouchers->count(), max($allVouchers->count(), 1)
            );
        } else {
            $perPage = (int) $request->get('per_page', 15);
            $vouchers = $query->paginate($perPage);
        }

        $totalAmount = (float) Voucher::active()->sum('total_amount');

        return $this->successResponse([
            'vouchers'     => $vouchers->items(),
            'pagination'   => [
                'current_page' => $vouchers->currentPage(),
                'last_page'    => $vouchers->lastPage(),
                'per_page'     => $vouchers->perPage(),
                'total'        => $vouchers->total(),
            ],
            'total_amount' => $totalAmount,
        ], 'Vouchers list retrieved successfully.');
    }

    /**
     * POST /api/vouchers
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'voucher_type'     => 'required|in:debit,credit,journal',
            'date'             => 'required|date',
            'total_amount'     => 'required|numeric|min:0.01',
            'payment_method'   => 'required|in:cash,bank,mobile',
            'bank_account_id'   => 'nullable|integer',
            'bank_name'         => 'nullable|string',
            'mobile_account_id' => 'nullable|integer',
            'mobile_provider'   => 'nullable|string',
            'reference_number'  => 'nullable|string',
            'description'      => 'required|string|max:1000',
            'note'             => 'nullable|string',
        ]);

        $user = $request->user();

        // Enforce Admin or explicit voucher creation permission
        if ($user->role !== 'admin' && !$user->can('vouchers:create')) {
            return $this->forbiddenResponse('Only system administrators can create manual accounting vouchers.');
        }

        // The registered account this money moves through (the id the form
        // sends, or the one account matching an older client's typed name).
        $books = app(AccountBookService::class);
        $bank = $request->payment_method === 'bank'
            ? $books->resolveBank($request->integer('bank_account_id') ?: null, $request->bank_name) : null;
        $mobile = $request->payment_method === 'mobile'
            ? $books->resolveMobile($request->integer('mobile_account_id') ?: null, $request->mobile_provider) : null;
        $movesMoney = $request->voucher_type !== 'journal';
        if ($movesMoney && $request->payment_method === 'bank' && !$bank && !$request->filled('bank_name')) {
            throw ValidationException::withMessages(['bank_account_id' => ['Choose the bank account for this voucher.']]);
        }
        if ($movesMoney && $request->payment_method === 'mobile' && !$mobile && !$request->filled('mobile_provider')) {
            throw ValidationException::withMessages(['mobile_account_id' => ['Choose the mobile account for this voucher.']]);
        }

        return DB::transaction(function () use ($request, $user, $books, $bank, $mobile, $movesMoney) {
            $voucherNumber = $this->generateVoucherNumber();
            $amount = (float) $request->total_amount;

            $voucher = Voucher::create([
                'voucher_number'   => $voucherNumber,
                'voucher_type'     => $request->voucher_type,
                'date'             => $request->date,
                'description'      => $request->description,
                'total_amount'     => $amount,
                'payment_method'   => $request->payment_method,
                'bank_name'         => $bank?->bank_name ?? $request->bank_name,
                'bank_account_id'   => $bank?->id,
                'mobile_provider'   => $mobile?->provider ?? $request->mobile_provider,
                'mobile_account_id' => $mobile?->id,
                'reference_number' => $request->reference_number,
                'note'             => $request->note,
                'created_by'       => $user->id,
            ]);

            $desc = "Voucher [{$voucherNumber}] (" . strtoupper($request->voucher_type) . "): " . ($request->description ?: 'Accounting Adjustment');

            // A credit voucher brings money in, a debit voucher pays it out. A
            // journal voucher only re-classifies and moves no money, so it
            // posts nothing to the cash / bank / mobile books (the books only
            // know "in" and "out"; the old "adjustment" line could not be saved).
            if ($movesMoney) {
                $line = [
                    'entry_type'     => $request->voucher_type === 'credit' ? 'in' : 'out',
                    'reference_type' => Voucher::class,
                    'reference_id'   => $voucher->id,
                    'description'    => $desc,
                    'amount'         => $amount,
                    'entry_date'     => $request->date,
                    'created_by'     => $user->id,
                ];
                if ($request->payment_method === 'cash') {
                    $books->cashEntry($line);
                } elseif ($request->payment_method === 'bank') {
                    $books->bankEntry($line + ['bank_name' => $request->bank_name, 'cheque_number' => $request->reference_number], $bank);
                } elseif ($request->payment_method === 'mobile') {
                    $books->mobileEntry($line + ['provider' => $request->mobile_provider, 'transaction_id' => $request->reference_number], $mobile);
                }
            }

            AuditLog::record(
                $user->id,
                $user->name,
                'create',
                Voucher::class,
                $voucher->id,
                null,
                $voucher->toArray(),
                "Created {$voucher->voucher_type} voucher {$voucher->voucher_number} of ৳{$amount}"
            );

            return $this->createdResponse(
                $voucher->load(['items', 'creator']),
                "Voucher {$voucher->voucher_number} created successfully."
            );
        });
    }

    /**
     * DELETE /api/vouchers/{id}
     */
    public function destroy(int $id, Request $request): JsonResponse
    {
        $voucher = Voucher::active()->find($id);

        if (!$voucher) {
            return $this->notFoundResponse('Voucher record not found.');
        }

        $user = $request->user();

        if ($user->role !== 'admin' && !$user->can('vouchers:archive')) {
            return $this->forbiddenResponse('Only system administrators can archive vouchers.');
        }

        $reason = $request->get('reason', 'Archived via API');

        return DB::transaction(function () use ($voucher, $user, $reason) {
            $oldSnapshot = $voucher->toArray();
            $voucher->archive($user->id, $reason);
            // Undo the money the voucher moved, in the same book and account.
            app(AccountBookService::class)->reverseEntriesFor(Voucher::class, $voucher->id, now()->toDateString(), $user->id, "voucher {$voucher->voucher_number} archived");

            AuditLog::record(
                $user->id,
                $user->name,
                'archive',
                Voucher::class,
                $voucher->id,
                $oldSnapshot,
                $voucher->fresh()->toArray(),
                "Archived voucher {$voucher->voucher_number}"
            );

            return $this->successResponse(null, "Voucher {$voucher->voucher_number} archived successfully.");
        });
    }
}
