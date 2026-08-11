<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ExpenseCategory;
use App\Models\ProductVariant;
use App\Models\User;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettingController extends Controller
{
    use ApiResponse;

    /**
     * Get summary counts for all 11 Setting cards matching the UI dashboard.
     */
    public function summary(): JsonResponse
    {
        try {
            $colorsCount = ProductVariant::count();
            $unitsCount = DB::table('units')->count();
            $productCategoriesCount = \App\Models\ProductCategory::count();
            $expenseTypesCount = ExpenseCategory::count();
            $userTypesCount = User::count();
            
            $cashAccountsCount = 1; // Primary Cash Account
            $bankAccountsCount = DB::table('bank_accounts')->where('is_active', true)->count();
            $mobileAccountsCount = DB::table('mobile_accounts')->where('is_active', true)->count();
            
            $notificationCount = DB::table('notifications')->where('is_read', false)->count();
            $balanceTransfersCount = DB::table('balance_transfers')->count();
            
            $backupsDir = storage_path('app/backups');
            $backupsCount = file_exists($backupsDir) ? count(glob($backupsDir . '/*.sql')) : 0;
            
            $hasCompanyProfile = file_exists(storage_path('app/company_profile.json'));

            return $this->successResponse([
                'colors_count' => $colorsCount,
                'units_count' => $unitsCount,
                'product_categories_count' => $productCategoriesCount,
                'expense_types_count' => $expenseTypesCount,
                'user_types_count' => $userTypesCount,
                'cash_accounts_count' => $cashAccountsCount,
                'bank_accounts_count' => $bankAccountsCount,
                'mobile_accounts_count' => $mobileAccountsCount,
                'notification_count' => $notificationCount,
                'balance_transfers_count' => $balanceTransfersCount,
                'backups_count' => $backupsCount,
                'has_company_profile' => $hasCompanyProfile,
            ], 'Settings summary retrieved successfully.');
        } catch (\Throwable $e) {
            return $this->errorResponse('Failed to load settings summary: ' . $e->getMessage(), 500);
        }
    }

    // ------------------------------------------------------------------------
    // UNITS MANAGEMENT
    // ------------------------------------------------------------------------
    public function getUnits(): JsonResponse
    {
        $units = DB::table('units')->orderBy('id', 'asc')->get();
        return $this->successResponse($units, 'Units retrieved.');
    }

    public function storeUnit(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'code' => 'required|string|max:20|unique:units,code',
        ]);

        $id = DB::table('units')->insertGetId([
            'name' => $request->name,
            'code' => $request->code,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->createdResponse(DB::table('units')->find($id), 'Unit created successfully.');
    }

    public function deleteUnit(int $id): JsonResponse
    {
        DB::table('units')->where('id', $id)->delete();
        return $this->successResponse(null, 'Unit deleted successfully.');
    }

    // ------------------------------------------------------------------------
    // BANK ACCOUNTS MANAGEMENT
    // ------------------------------------------------------------------------
    public function getBankAccounts(): JsonResponse
    {
        $accounts = DB::table('bank_accounts')->orderBy('id', 'desc')->get();
        return $this->successResponse($accounts, 'Bank accounts retrieved.');
    }

    public function storeBankAccount(Request $request): JsonResponse
    {
        $request->validate([
            'bank_name' => 'required|string|max:150',
            'account_name' => 'required|string|max:150',
            'account_number' => 'required|string|max:100',
            'branch' => 'nullable|string|max:150',
            'opening_balance' => 'numeric|min:0',
        ]);

        $openingBal = (float) ($request->opening_balance ?? 0);

        $id = DB::table('bank_accounts')->insertGetId([
            'bank_name' => $request->bank_name,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'branch' => $request->branch,
            'opening_balance' => $openingBal,
            'current_balance' => $openingBal,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->createdResponse(DB::table('bank_accounts')->find($id), 'Bank account added successfully.');
    }

    public function deleteBankAccount(int $id): JsonResponse
    {
        DB::table('bank_accounts')->where('id', $id)->delete();
        return $this->successResponse(null, 'Bank account removed.');
    }

    // ------------------------------------------------------------------------
    // MOBILE ACCOUNTS MANAGEMENT
    // ------------------------------------------------------------------------
    public function getMobileAccounts(): JsonResponse
    {
        $accounts = DB::table('mobile_accounts')->orderBy('id', 'desc')->get();
        return $this->successResponse($accounts, 'Mobile accounts retrieved.');
    }

    public function storeMobileAccount(Request $request): JsonResponse
    {
        $request->validate([
            'provider' => 'required|string|max:100',
            'account_number' => 'required|string|max:50',
            'account_type' => 'nullable|string|max:50',
            'opening_balance' => 'numeric|min:0',
        ]);

        $openingBal = (float) ($request->opening_balance ?? 0);

        $id = DB::table('mobile_accounts')->insertGetId([
            'provider' => $request->provider,
            'account_number' => $request->account_number,
            'account_type' => $request->account_type ?? 'Personal',
            'opening_balance' => $openingBal,
            'current_balance' => $openingBal,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->createdResponse(DB::table('mobile_accounts')->find($id), 'Mobile account added successfully.');
    }

    public function deleteMobileAccount(int $id): JsonResponse
    {
        DB::table('mobile_accounts')->where('id', $id)->delete();
        return $this->successResponse(null, 'Mobile account removed.');
    }

    // ------------------------------------------------------------------------
    // BALANCE TRANSFERS
    // ------------------------------------------------------------------------
    public function getBalanceTransfers(): JsonResponse
    {
        $transfers = DB::table('balance_transfers')
            ->orderBy('id', 'desc')
            ->get();
        return $this->successResponse($transfers, 'Balance transfers retrieved.');
    }

    public function storeBalanceTransfer(Request $request): JsonResponse
    {
        $request->validate([
            'from_account_type' => 'required|string|in:cash,bank,mobile',
            'from_account_id' => 'nullable|integer',
            'to_account_type' => 'required|string|in:cash,bank,mobile',
            'to_account_id' => 'nullable|integer',
            'amount' => 'required|numeric|min:1',
            'transfer_date' => 'required|date',
            'note' => 'nullable|string',
        ]);

        $user = $request->user();
        $transferNo = 'TRF-' . date('YmdHis');
        $amount = (float) $request->amount;

        DB::transaction(function () use ($request, $user, $transferNo, $amount) {
            // Deduct from Source Account
            if ($request->from_account_type === 'bank' && $request->from_account_id) {
                DB::table('bank_accounts')->where('id', $request->from_account_id)->decrement('current_balance', $amount);
            } elseif ($request->from_account_type === 'mobile' && $request->from_account_id) {
                DB::table('mobile_accounts')->where('id', $request->from_account_id)->decrement('current_balance', $amount);
            }

            // Add to Target Account
            if ($request->to_account_type === 'bank' && $request->to_account_id) {
                DB::table('bank_accounts')->where('id', $request->to_account_id)->increment('current_balance', $amount);
            } elseif ($request->to_account_type === 'mobile' && $request->to_account_id) {
                DB::table('mobile_accounts')->where('id', $request->to_account_id)->increment('current_balance', $amount);
            }

            // Record Transfer
            DB::table('balance_transfers')->insert([
                'transfer_number' => $transferNo,
                'from_account_type' => $request->from_account_type,
                'from_account_id' => $request->from_account_id,
                'to_account_type' => $request->to_account_type,
                'to_account_id' => $request->to_account_id,
                'amount' => $amount,
                'transfer_date' => $request->transfer_date,
                'note' => $request->note,
                'created_by' => $user->id ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            AuditLog::record(
                $user->id,
                $user->name,
                'create',
                'BalanceTransfer',
                null,
                $transferNo,
                null,
                ['amount' => $amount],
                "Recorded balance transfer {$transferNo} of Tk. {$amount}"
            );
        });

        return $this->createdResponse(null, "Balance transfer {$transferNo} recorded successfully!");
    }

    // ------------------------------------------------------------------------
    // DEPARTMENTS MANAGEMENT
    // ------------------------------------------------------------------------
    public function getDepartments(): JsonResponse
    {
        $departments = DB::table('departments')->orderBy('id', 'asc')->get();
        return $this->successResponse($departments, 'Departments retrieved.');
    }

    public function storeDepartment(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:150',
            'description' => 'nullable|string|max:255',
        ]);

        $id = DB::table('departments')->insertGetId([
            'name' => $request->name,
            'description' => $request->description,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->createdResponse(DB::table('departments')->find($id), 'Department created successfully.');
    }

    public function deleteDepartment(int $id): JsonResponse
    {
        DB::table('departments')->where('id', $id)->delete();
        return $this->successResponse(null, 'Department deleted successfully.');
    }

    // ------------------------------------------------------------------------
    // ORDER PIPELINE MODE SETTING
    // ------------------------------------------------------------------------
    public function getPipelineMode(): JsonResponse
    {
        $profileFile = storage_path('app/company_profile.json');
        $mode = 'role_based';
        if (file_exists($profileFile)) {
            $data = json_decode(file_get_contents($profileFile), true);
            $mode = $data['order_pipeline_mode'] ?? 'role_based';
        }
        return response()->json(['status' => 'success', 'data' => ['order_pipeline_mode' => $mode]]);
    }

    public function updatePipelineMode(Request $request): JsonResponse
    {
        $request->validate([
            'order_pipeline_mode' => 'required|in:standard,role_based',
        ]);
        $profileFile = storage_path('app/company_profile.json');
        $data = file_exists($profileFile) ? json_decode(file_get_contents($profileFile), true) : [];
        $data['order_pipeline_mode'] = $request->order_pipeline_mode;
        file_put_contents($profileFile, json_encode($data, JSON_PRETTY_PRINT));

        return response()->json([
            'status' => 'success',
            'message' => "Order pipeline mode updated to {$request->order_pipeline_mode}.",
            'data' => ['order_pipeline_mode' => $request->order_pipeline_mode]
        ]);
    }
}
