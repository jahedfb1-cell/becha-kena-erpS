<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BankAccount;
use App\Models\ExpenseCategory;
use App\Models\MobileAccount;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\AccountBookService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use App\Http\Requests\StoreUnitRequest;
use App\Http\Requests\UpdateUnitRequest;
use App\Http\Requests\StoreBankAccountRequest;
use App\Http\Requests\StoreMobileAccountRequest;
use App\Http\Requests\StoreBalanceTransferRequest;
use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\UpdatePipelineModeRequest;

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
            $bankAccountsCount = BankAccount::active()->where('is_active', true)->count();
            $mobileAccountsCount = MobileAccount::active()->where('is_active', true)->count();
            
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
        // Ensure default PVC sq.ft exists in units table
        $hasPvc = DB::table('units')->where('code', 'PVC sq.ft')->orWhere('name', 'PVC sq.ft')->exists();
        if (!$hasPvc) {
            DB::table('units')->insert([
                'name' => 'PVC sq.ft',
                'code' => 'PVC sq.ft',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $units = DB::table('units')->orderBy('id', 'asc')->get();
        return $this->successResponse($units, 'Units retrieved.');
    }

    public function storeUnit(StoreUnitRequest $request): JsonResponse
    {

        $id = DB::table('units')->insertGetId([
            'name' => $request->name,
            'code' => $request->code,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->createdResponse(DB::table('units')->find($id), 'Unit created successfully.');
    }

    public function updateUnit(UpdateUnitRequest $request, int $id): JsonResponse
    {

        DB::table('units')->where('id', $id)->update([
            'name' => $request->name,
            'code' => $request->code,
            'updated_at' => now(),
        ]);

        return $this->successResponse(DB::table('units')->find($id), 'Unit updated successfully.');
    }

    public function deleteUnit(int $id): JsonResponse
    {
        DB::table('units')->where('id', $id)->delete();
        return $this->successResponse(null, 'Unit deleted successfully.');
    }

    // ------------------------------------------------------------------------
    // BANK ACCOUNTS MANAGEMENT
    // ------------------------------------------------------------------------

    /**
     * Active bank accounts of the user's brand. current_balance is computed
     * (opening + the bank book lines linked to the account), never stored.
     */
    public function getBankAccounts(AccountBookService $books): JsonResponse
    {
        $accounts = BankAccount::active()->orderByDesc('id')->get()
            ->map(fn (BankAccount $a) => array_merge($a->toArray(), [
                'current_balance' => $books->bankBalance($a),
                'label'           => $a->label,
            ]));

        return $this->successResponse($accounts, 'Bank accounts retrieved.');
    }

    public function storeBankAccount(StoreBankAccountRequest $request): JsonResponse
    {

        $exists = BankAccount::active()
            ->whereRaw('LOWER(bank_name) = ?', [mb_strtolower(trim($request->bank_name))])
            ->where('account_number', trim($request->account_number))
            ->exists();
        if ($exists) {
            throw ValidationException::withMessages(['account_number' => ['This bank account is already registered.']]);
        }

        $user = $request->user();

        // The same account removed earlier: bring it back rather than add a
        // second row (the unique index covers archived accounts too).
        $archived = BankAccount::archived()
            ->whereRaw('LOWER(bank_name) = ?', [mb_strtolower(trim($request->bank_name))])
            ->where('account_number', trim($request->account_number))
            ->first();
        if ($archived) {
            $archived->restore($user->id);
            $archived->update(['account_name' => trim($request->account_name), 'branch' => $request->branch, 'is_active' => true]);
            AuditLog::record($user->id, $user->name, 'restore', BankAccount::class, $archived->id, null, null,
                "Restored bank account {$archived->label}");

            return $this->createdResponse($archived->fresh(), 'Bank account restored.');
        }

        $account = BankAccount::create([
            'bank_name'       => trim($request->bank_name),
            'account_name'    => trim($request->account_name),
            'account_number'  => trim($request->account_number),
            'branch'          => $request->branch,
            'opening_balance' => (float) ($request->opening_balance ?? 0),
            'is_active'       => true,
            'created_by'      => $user->id,
        ]);

        AuditLog::record($user->id, $user->name, 'create', BankAccount::class, $account->id, null, $account->toArray(),
            "Added bank account {$account->label}");

        return $this->createdResponse($account, 'Bank account added successfully.');
    }

    /**
     * Archives - never deletes - so every book line and payment that went
     * through the account can still be traced to it.
     */
    public function deleteBankAccount(Request $request, int $id): JsonResponse
    {
        $account = BankAccount::active()->find($id);
        if (!$account) {
            return $this->notFoundResponse('Bank account not found.');
        }

        $user = $request->user();
        $account->archive($user->id, $request->get('reason', 'Removed from Settings'));
        AuditLog::record($user->id, $user->name, 'archive', BankAccount::class, $account->id, null, null,
            "Archived bank account {$account->label}");

        return $this->successResponse(null, 'Bank account removed.');
    }

    // ------------------------------------------------------------------------
    // MOBILE ACCOUNTS MANAGEMENT
    // ------------------------------------------------------------------------
    public function getMobileAccounts(AccountBookService $books): JsonResponse
    {
        $accounts = MobileAccount::active()->orderByDesc('id')->get()
            ->map(fn (MobileAccount $a) => array_merge($a->toArray(), [
                'current_balance' => $books->mobileBalance($a),
                'label'           => $a->label,
            ]));

        return $this->successResponse($accounts, 'Mobile accounts retrieved.');
    }

    public function storeMobileAccount(StoreMobileAccountRequest $request): JsonResponse
    {

        // The mobile book can only file bKash, Nagad and Rocket.
        $probe = new MobileAccount(['provider' => $request->provider]);
        if ($probe->book_provider === null) {
            throw ValidationException::withMessages(['provider' => ['Provider must be bKash, Nagad or Rocket.']]);
        }

        $exists = MobileAccount::active()
            ->whereRaw('LOWER(provider) = ?', [mb_strtolower(trim($request->provider))])
            ->where('account_number', trim($request->account_number))
            ->exists();
        if ($exists) {
            throw ValidationException::withMessages(['account_number' => ['This mobile account is already registered.']]);
        }

        $user = $request->user();

        $archived = MobileAccount::archived()
            ->whereRaw('LOWER(provider) = ?', [mb_strtolower(trim($request->provider))])
            ->where('account_number', trim($request->account_number))
            ->first();
        if ($archived) {
            $archived->restore($user->id);
            $archived->update(['account_type' => $request->account_type ?? $archived->account_type, 'is_active' => true]);
            AuditLog::record($user->id, $user->name, 'restore', MobileAccount::class, $archived->id, null, null,
                "Restored mobile account {$archived->label}");

            return $this->createdResponse($archived->fresh(), 'Mobile account restored.');
        }

        $account = MobileAccount::create([
            'provider'        => trim($request->provider),
            'account_number'  => trim($request->account_number),
            'account_type'    => $request->account_type ?? 'Personal',
            'opening_balance' => (float) ($request->opening_balance ?? 0),
            'is_active'       => true,
            'created_by'      => $user->id,
        ]);

        AuditLog::record($user->id, $user->name, 'create', MobileAccount::class, $account->id, null, $account->toArray(),
            "Added mobile account {$account->label}");

        return $this->createdResponse($account, 'Mobile account added successfully.');
    }

    public function deleteMobileAccount(Request $request, int $id): JsonResponse
    {
        $account = MobileAccount::active()->find($id);
        if (!$account) {
            return $this->notFoundResponse('Mobile account not found.');
        }

        $user = $request->user();
        $account->archive($user->id, $request->get('reason', 'Removed from Settings'));
        AuditLog::record($user->id, $user->name, 'archive', MobileAccount::class, $account->id, null, null,
            "Archived mobile account {$account->label}");

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

    /**
     * Moves money between cash, a bank account and a mobile account. Each
     * side is written to its own book (an "out" line on the source, an "in"
     * line on the destination), linked to the account, so both balances -
     * which are computed from the books - move together.
     */
    public function storeBalanceTransfer(StoreBalanceTransferRequest $request, AccountBookService $books): JsonResponse
    {

        $from = $this->transferSide($books, $request->from_account_type, $request->integer('from_account_id') ?: null, 'from_account_id');
        $to = $this->transferSide($books, $request->to_account_type, $request->integer('to_account_id') ?: null, 'to_account_id');
        if ($request->from_account_type === $request->to_account_type && $from?->id === $to?->id) {
            throw ValidationException::withMessages(['to_account_id' => ['Choose a different account to transfer to.']]);
        }

        $user = $request->user();
        $transferNo = 'TRF-' . date('YmdHis');
        $amount = round((float) $request->amount, 2);

        DB::transaction(function () use ($request, $user, $transferNo, $amount, $books, $from, $to) {
            $id = DB::table('balance_transfers')->insertGetId([
                'transfer_number'   => $transferNo,
                'from_account_type' => $request->from_account_type,
                'from_account_id'   => $from?->id,
                'to_account_type'   => $request->to_account_type,
                'to_account_id'     => $to?->id,
                'amount'            => $amount,
                'transfer_date'     => $request->transfer_date,
                'note'              => $request->note,
                'created_by'        => $user->id,
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);

            $line = fn (string $type, string $desc) => [
                'entry_type'     => $type,
                'reference_type' => 'balance_transfer',
                'reference_id'   => $id,
                'description'    => $desc,
                'amount'         => $amount,
                'entry_date'     => $request->transfer_date,
                'created_by'     => $user->id,
            ];
            $this->postTransferSide($books, $request->from_account_type, $from, $line('out', "Transfer {$transferNo} out"));
            $this->postTransferSide($books, $request->to_account_type, $to, $line('in', "Transfer {$transferNo} in"));

            AuditLog::record($user->id, $user->name, 'create', 'BalanceTransfer', $id, null, [
                'from' => $request->from_account_type . ($from ? " #{$from->id}" : ''),
                'to'   => $request->to_account_type . ($to ? " #{$to->id}" : ''),
                'amount' => $amount,
            ], "Recorded balance transfer {$transferNo} of Tk. {$amount}", $transferNo);
        });

        return $this->createdResponse(null, "Balance transfer {$transferNo} recorded successfully!");
    }

    private function transferSide(AccountBookService $books, string $type, ?int $id, string $field): BankAccount|MobileAccount|null
    {
        return match ($type) {
            'bank'   => $books->resolveBank($id, null, $field),
            'mobile' => $books->resolveMobile($id, null, $field),
            default  => null,
        };
    }

    private function postTransferSide(AccountBookService $books, string $type, BankAccount|MobileAccount|null $account, array $line): void
    {
        match ($type) {
            'bank'   => $books->bankEntry($line, $account),
            'mobile' => $books->mobileEntry($line, $account),
            default  => $books->cashEntry($line),
        };
    }

    // ------------------------------------------------------------------------
    // DEPARTMENTS MANAGEMENT
    // ------------------------------------------------------------------------
    public function getDepartments(): JsonResponse
    {
        $departments = DB::table('departments')->orderBy('id', 'asc')->get();
        return $this->successResponse($departments, 'Departments retrieved.');
    }

    public function storeDepartment(StoreDepartmentRequest $request): JsonResponse
    {

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

    public function updatePipelineMode(UpdatePipelineModeRequest $request): JsonResponse
    {
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
