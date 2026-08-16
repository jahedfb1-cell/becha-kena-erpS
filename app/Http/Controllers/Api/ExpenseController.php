<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\MobileBookEntry;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    use ApiResponse;

    /**
     * Generate next expense number: EXP-2026-0001
     */
    protected function generateExpenseNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "EXP-{$year}-";

        // Numbers are one shared sequence across every brand, not scoped
        // per brand — without this a brand with no expenses yet would
        // restart at 0001 and collide with another brand's number.
        $last = Expense::withoutGlobalScope('brand')
            ->where('expense_number', 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING(expense_number, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $nextNumber = 1;
        if ($last && preg_match('/EXP-\d{4}-(\d+)/', $last->expense_number, $m)) {
            $nextNumber = (int) $m[1] + 1;
        }

        return $prefix . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * GET /api/expenses
     */
    public function index(Request $request): JsonResponse
    {
        $query = Expense::with([
            'category:id,name,description',
            'creator:id,name',
        ]);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('expense_category_id')) {
            $query->where('expense_category_id', $request->expense_category_id);
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('expense_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('expense_date', '<=', $request->to_date);
        }

        if ($request->filled('search')) {
            $s = trim($request->search);
            $query->where(function ($q) use ($s) {
                $q->where('expense_number', 'like', "%{$s}%")
                  ->orWhere('description', 'like', "%{$s}%")
                  ->orWhere('reference_number', 'like', "%{$s}%")
                  ->orWhereHas('category', function ($q2) use ($s) {
                      $q2->where('name', 'like', "%{$s}%");
                  });
            });
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            $allExpenses = $query->get();
            $expenses = new \Illuminate\Pagination\LengthAwarePaginator(
                $allExpenses, $allExpenses->count(), max($allExpenses->count(), 1)
            );
        } else {
            $perPage = (int) $request->get('per_page', 15);
            $expenses = $query->paginate($perPage);
        }

        // Stats summary
        $totalAmount = (float) Expense::active()->sum('amount');
        $categories = ExpenseCategory::active()->get();

        return $this->successResponse([
            'expenses'     => $expenses->items(),
            'pagination'   => [
                'current_page' => $expenses->currentPage(),
                'last_page'    => $expenses->lastPage(),
                'per_page'     => $expenses->perPage(),
                'total'        => $expenses->total(),
            ],
            'total_amount' => $totalAmount,
            'categories'   => $categories,
        ], 'Expenses list retrieved successfully.');
    }

    /**
     * POST /api/expenses
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'expense_category_id' => 'required|exists:expense_categories,id',
            'amount'              => 'required|numeric|min:0.01',
            'payment_method'      => 'required|in:cash,bank,mobile',
            'expense_date'        => 'required|date',
            'bank_name'           => 'nullable|string',
            'mobile_provider'     => 'nullable|string',
            'reference_number'    => 'nullable|string',
            'description'         => 'nullable|string',
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($request, $user) {
            $expNumber = $this->generateExpenseNumber();
            $amount = (float) $request->amount;

            $expense = Expense::create([
                'expense_number'      => $expNumber,
                'expense_category_id' => $request->expense_category_id,
                'amount'              => $amount,
                'payment_method'      => $request->payment_method,
                'bank_name'           => $request->bank_name,
                'mobile_provider'     => $request->mobile_provider,
                'reference_number'    => $request->reference_number,
                'description'         => $request->description,
                'expense_date'        => $request->expense_date,
                'created_by'          => $user->id,
            ]);

            $category = ExpenseCategory::find($request->expense_category_id);
            $desc = "Expense [{$expNumber}] - {$category->name}: " . ($request->description ?: 'Company expense payout');

            // Post OUT transaction to corresponding Book
            if ($request->payment_method === 'cash') {
                $lastCash = CashBookEntry::orderBy('id', 'desc')->first();
                $prevBal = $lastCash ? (float) $lastCash->balance : 0;

                CashBookEntry::create([
                    'entry_type'     => 'out',
                    'reference_type' => Expense::class,
                    'reference_id'   => $expense->id,
                    'description'    => $desc,
                    'amount'         => $amount,
                    'balance'        => $prevBal - $amount,
                    'entry_date'     => $request->expense_date,
                    'created_by'     => $user->id,
                ]);
            } elseif ($request->payment_method === 'bank') {
                $lastBank = BankBookEntry::orderBy('id', 'desc')->first();
                $prevBal = $lastBank ? (float) $lastBank->balance : 0;

                BankBookEntry::create([
                    'bank_name'      => $request->bank_name ?: 'City Bank',
                    'entry_type'     => 'out',
                    'reference_type' => Expense::class,
                    'reference_id'   => $expense->id,
                    'description'    => $desc,
                    'cheque_number'  => $request->reference_number,
                    'amount'         => $amount,
                    'balance'        => $prevBal - $amount,
                    'entry_date'     => $request->expense_date,
                    'created_by'     => $user->id,
                ]);
            } elseif ($request->payment_method === 'mobile') {
                $lastMob = MobileBookEntry::orderBy('id', 'desc')->first();
                $prevBal = $lastMob ? (float) $lastMob->balance : 0;

                MobileBookEntry::create([
                    'provider'       => $request->mobile_provider ?: 'bKash',
                    'entry_type'     => 'out',
                    'reference_type' => Expense::class,
                    'reference_id'   => $expense->id,
                    'description'    => $desc,
                    'transaction_id' => $request->reference_number,
                    'amount'         => $amount,
                    'balance'        => $prevBal - $amount,
                    'entry_date'     => $request->expense_date,
                    'created_by'     => $user->id,
                ]);
            }

            AuditLog::record(
                $user->id,
                $user->name,
                'create',
                Expense::class,
                $expense->id,
                null,
                $expense->toArray(),
                "Created expense {$expense->expense_number} of ৳{$amount} under category '{$category->name}'"
            );

            return $this->createdResponse(
                $expense->load(['category', 'creator']),
                "Expense {$expense->expense_number} recorded successfully."
            );
        });
    }

    /**
     * DELETE /api/expenses/{id}
     */
    public function destroy(int $id, Request $request): JsonResponse
    {
        $expense = Expense::active()->find($id);

        if (!$expense) {
            return $this->notFoundResponse('Expense record not found.');
        }

        $user = $request->user();
        $reason = $request->get('reason', 'Archived via API');

        return DB::transaction(function () use ($expense, $user, $reason) {
            $oldSnapshot = $expense->toArray();
            $expense->archive($user->id, $reason);

            AuditLog::record(
                $user->id,
                $user->name,
                'archive',
                Expense::class,
                $expense->id,
                $oldSnapshot,
                $expense->fresh()->toArray(),
                "Archived expense {$expense->expense_number}"
            );

            return $this->successResponse(null, "Expense {$expense->expense_number} archived successfully.");
        });
    }
}
