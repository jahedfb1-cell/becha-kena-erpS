<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerRequest;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\User;
use App\Services\CustomerOpeningBalanceService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    use ApiResponse;

    public function __construct(
        private readonly CustomerOpeningBalanceService $openingBalanceService
    ) {}

    /**
     * Display a listing of customers based on role-based visibility.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Customer::with(['category:id,name', 'creator:id,name']);

        if (!$request->boolean('include_archived')) {
            $query->active();
        }

        // Role-based visibility filtering
        $isAdmin    = $user->role === 'admin';
        $isManager  = $user->role === 'manager';
        $isSalesman = $user->role === 'salesman';

        if ($isAdmin || $request->boolean('all')) {
            // Admin or explicit all=1 request sees all active customers
        } elseif ($isManager) {
            // Manager sees their team's customers + own
            $teamUserIds = User::where('manager_id', $user->id)->pluck('id')->push($user->id);
            $query->whereIn('created_by', $teamUserIds);
        } elseif ($isSalesman) {
            // Salesman sees their own created customers
            $query->where('created_by', $user->id);
        }

        $customers = $query->latest()->get();

        // Append current_due to each customer
        $customers->each(function ($customer) {
            $lastLedger = $customer->ledgers()->orderBy('id', 'desc')->first();
            $customer->current_due = $lastLedger ? (float) $lastLedger->balance : 0.0;
        });

        return $this->successResponse($customers, 'Customers retrieved successfully.');
    }

    /**
     * Store a newly created customer with auto-generated customer_code.
     */
    public function store(CustomerRequest $request): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $user         = $request->user();
        $isAdmin      = $user->role === 'admin';

        return DB::transaction(function () use ($request, $user, $isAdmin) {
            // Generate customer_code (Format: CUS-0001)
            $lastCustomer = Customer::orderBy('id', 'desc')->first();
            $nextNumber   = 1;
            if ($lastCustomer && preg_match('/CUS-(\d+)/', $lastCustomer->customer_code, $matches)) {
                $nextNumber = (int) $matches[1] + 1;
            }
            $customerCode = 'CUS-' . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);

            // Opening balance: admin-only, non-admins get 0
            $openingBalance = $isAdmin ? (float) $request->get('opening_balance', 0) : 0.0;

            $customer = Customer::create([
                'customer_code'          => $customerCode,
                'name'                   => $request->name,
                'company_name'           => $request->company_name,
                'phone'                  => $request->phone,
                'second_contact_number'  => $request->second_contact_number,
                'third_contact_number'   => $request->third_contact_number,
                'email'                  => $request->email,
                'address'                => $request->address,
                'address_2'              => $request->address_2,
                'notes'                  => $request->notes,
                'contact_show_status'    => $request->get('contact_show_status', 'show_contact_number'),
                'opening_balance'        => $openingBalance,
                'customer_category_id'   => $request->customer_category_id,
                'created_by'             => $user->id,
            ]);

            // Sync opening balance ledger if admin provided a value
            if ($isAdmin && $openingBalance > 0) {
                $this->openingBalanceService->sync($customer, $user->id);
            }

            AuditLog::create([
                'user_id'          => $user->id,
                'user_name'        => $user->name,
                'action_type'      => 'create',
                'module'           => 'Customer',
                'reference_id'     => $customer->id,
                'reference_number' => $customer->customer_code,
                'new_value'        => $customer->toArray(),
                'description'      => "Created customer {$customer->name} [{$customer->customer_code}]"
                    . ($openingBalance > 0 ? " with opening balance {$openingBalance}" : ''),
                'ip_address'       => $request->ip(),
                'user_agent'       => $request->userAgent(),
            ]);

            return $this->createdResponse(
                $customer->load(['category', 'creator']),
                'Customer created successfully.'
            );
        });
    }

    /**
     * Display the specified customer with ledger.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $customer = Customer::with(['category', 'creator', 'ledgers'])->findOrFail($id);
        $user     = $request->user();

        // Role-based authorization check
        if ($user->role === 'salesman' && $customer->created_by !== $user->id) {
            return $this->errorResponse('Forbidden. You can only view your own customers.', 403);
        } elseif ($user->role === 'manager') {
            $teamUserIds = User::where('manager_id', $user->id)->pluck('id')->push($user->id);
            if (!$teamUserIds->contains($customer->created_by)) {
                return $this->errorResponse('Forbidden. You can only view customers created by your team.', 403);
            }
        }

        // Append current_due
        $lastLedger = $customer->ledgers->last();
        $customer->current_due = $lastLedger ? (float) $lastLedger->balance : 0.0;

        return $this->successResponse($customer, 'Customer details retrieved successfully.');
    }

    /**
     * Update the specified customer.
     */
    public function update(CustomerRequest $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $user     = $request->user();
        $isAdmin  = $user->role === 'admin';

        if ($user->role === 'salesman' && $customer->created_by !== $user->id) {
            return $this->errorResponse('Forbidden. You can only update your own customers.', 403);
        }

        return DB::transaction(function () use ($request, $customer, $user, $isAdmin) {
            $oldValue = $customer->toArray();

            // Build updatable fields (common for all roles)
            $fields = [
                'name'                   => $request->name,
                'company_name'           => $request->company_name,
                'phone'                  => $request->phone,
                'second_contact_number'  => $request->second_contact_number,
                'third_contact_number'   => $request->third_contact_number,
                'email'                  => $request->email,
                'address'                => $request->address,
                'address_2'              => $request->address_2,
                'notes'                  => $request->notes,
                'contact_show_status'    => $request->get('contact_show_status', $customer->contact_show_status ?? 'show_contact_number'),
                'customer_category_id'   => $request->customer_category_id,
            ];

            // Opening balance: admin-only
            $openingBalanceChanged = false;
            if ($isAdmin && $request->has('opening_balance')) {
                $newOpeningBalance = (float) $request->opening_balance;
                if ($newOpeningBalance !== (float) $customer->opening_balance) {
                    $fields['opening_balance'] = $newOpeningBalance;
                    $openingBalanceChanged     = true;
                }
            }

            $customer->update($fields);

            // Sync ledger if opening balance changed
            if ($openingBalanceChanged) {
                $this->openingBalanceService->sync($customer->fresh(), $user->id);

                AuditLog::create([
                    'user_id'          => $user->id,
                    'user_name'        => $user->name,
                    'action_type'      => 'update',
                    'module'           => 'Customer',
                    'reference_id'     => $customer->id,
                    'reference_number' => $customer->customer_code,
                    'old_value'        => ['opening_balance' => $oldValue['opening_balance']],
                    'new_value'        => ['opening_balance' => $customer->opening_balance],
                    'description'      => "Updated opening balance for {$customer->customer_code} to {$customer->opening_balance}",
                    'ip_address'       => request()->ip(),
                    'user_agent'       => request()->userAgent(),
                ]);
            }

            AuditLog::create([
                'user_id'          => $user->id,
                'user_name'        => $user->name,
                'action_type'      => 'update',
                'module'           => 'Customer',
                'reference_id'     => $customer->id,
                'reference_number' => $customer->customer_code,
                'old_value'        => $oldValue,
                'new_value'        => $customer->fresh()->toArray(),
                'description'      => "Updated customer {$customer->customer_code}",
                'ip_address'       => request()->ip(),
                'user_agent'       => request()->userAgent(),
            ]);

            return $this->successResponse(
                $customer->fresh()->load(['category', 'creator']),
                'Customer updated successfully.'
            );
        });
    }

    /**
     * Archive the specified customer.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $customer = Customer::findOrFail($id);
        $oldValue = $customer->toArray();

        $customer->archive(
            $request->user()->id,
            $request->input('archive_reason', 'Archived via API')
        );

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'archive',
            'module'           => 'Customer',
            'reference_id'     => $customer->id,
            'reference_number' => $customer->customer_code,
            'old_value'        => $oldValue,
            'new_value'        => $customer->fresh()->toArray(),
            'description'      => "Archived customer {$customer->customer_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($customer->fresh(), 'Customer archived successfully.');
    }

    /**
     * Restore the specified archived customer.
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $customer = Customer::findOrFail($id);
        $oldValue = $customer->toArray();

        $customer->restore($request->user()->id);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'restore',
            'module'           => 'Customer',
            'reference_id'     => $customer->id,
            'reference_number' => $customer->customer_code,
            'old_value'        => $oldValue,
            'new_value'        => $customer->fresh()->toArray(),
            'description'      => "Restored customer {$customer->customer_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($customer->fresh(), 'Customer restored successfully.');
    }
}
