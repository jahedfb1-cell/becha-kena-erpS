<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\MobileBookEntry;
use App\Models\Voucher;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        $last = Voucher::where('voucher_number', 'LIKE', "{$prefix}%")
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

        $perPage = (int) $request->get('per_page', 15);
        $vouchers = $query->orderBy('id', 'desc')->paginate($perPage);

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
            'bank_name'        => 'nullable|string',
            'mobile_provider'  => 'nullable|string',
            'reference_number' => 'nullable|string',
            'description'      => 'nullable|string',
            'note'             => 'nullable|string',
        ]);

        $user = $request->user();

        // Enforce Admin or explicit voucher creation permission
        if ($user->role !== 'admin' && !$user->can('vouchers:create')) {
            return $this->forbiddenResponse('Only system administrators can create manual accounting vouchers.');
        }

        return DB::transaction(function () use ($request, $user) {
            $voucherNumber = $this->generateVoucherNumber();
            $amount = (float) $request->total_amount;

            $voucher = Voucher::create([
                'voucher_number'   => $voucherNumber,
                'voucher_type'     => $request->voucher_type,
                'date'             => $request->date,
                'description'      => $request->description,
                'total_amount'     => $amount,
                'payment_method'   => $request->payment_method,
                'bank_name'        => $request->bank_name,
                'mobile_provider'  => $request->mobile_provider,
                'reference_number' => $request->reference_number,
                'note'             => $request->note,
                'created_by'       => $user->id,
            ]);

            $entryType = ($request->voucher_type === 'credit') ? 'in' : (($request->voucher_type === 'debit') ? 'out' : 'adjustment');
            $desc = "Voucher [{$voucherNumber}] (" . strtoupper($request->voucher_type) . "): " . ($request->description ?: 'Accounting Adjustment');

            // Post transaction to corresponding Book
            if ($request->payment_method === 'cash') {
                $lastCash = CashBookEntry::orderBy('id', 'desc')->first();
                $prevBal = $lastCash ? (float) $lastCash->balance : 0;
                $newBal = ($entryType === 'in') ? ($prevBal + $amount) : ($prevBal - $amount);

                CashBookEntry::create([
                    'entry_type'     => $entryType,
                    'reference_type' => Voucher::class,
                    'reference_id'   => $voucher->id,
                    'description'    => $desc,
                    'amount'         => $amount,
                    'balance'        => $newBal,
                    'entry_date'     => $request->date,
                    'created_by'     => $user->id,
                ]);
            } elseif ($request->payment_method === 'bank') {
                $lastBank = BankBookEntry::orderBy('id', 'desc')->first();
                $prevBal = $lastBank ? (float) $lastBank->balance : 0;
                $newBal = ($entryType === 'in') ? ($prevBal + $amount) : ($prevBal - $amount);

                BankBookEntry::create([
                    'bank_name'      => $request->bank_name ?: 'City Bank',
                    'entry_type'     => $entryType,
                    'reference_type' => Voucher::class,
                    'reference_id'   => $voucher->id,
                    'description'    => $desc,
                    'cheque_number'  => $request->reference_number,
                    'amount'         => $amount,
                    'balance'        => $newBal,
                    'entry_date'     => $request->date,
                    'created_by'     => $user->id,
                ]);
            } elseif ($request->payment_method === 'mobile') {
                $lastMob = MobileBookEntry::orderBy('id', 'desc')->first();
                $prevBal = $lastMob ? (float) $lastMob->balance : 0;
                $newBal = ($entryType === 'in') ? ($prevBal + $amount) : ($prevBal - $amount);

                MobileBookEntry::create([
                    'provider'       => $request->mobile_provider ?: 'bKash',
                    'entry_type'     => $entryType,
                    'reference_type' => Voucher::class,
                    'reference_id'   => $voucher->id,
                    'description'    => $desc,
                    'transaction_id' => $request->reference_number,
                    'amount'         => $amount,
                    'balance'        => $newBal,
                    'entry_date'     => $request->date,
                    'created_by'     => $user->id,
                ]);
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
