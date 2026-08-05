<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SupplierRequest;
use App\Models\AuditLog;
use App\Models\Supplier;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of suppliers.
     */
    public function index(Request $request): JsonResponse
    {
        $suppliers = Supplier::with('creator:id,name')
            ->when(!$request->boolean('include_archived'), function ($q) {
                $q->active();
            })
            ->latest()
            ->get();

        return $this->successResponse($suppliers, 'Suppliers retrieved successfully.');
    }

    /**
     * Store a newly created supplier with auto-generated supplier_code (SUP-0001).
     */
    public function store(SupplierRequest $request): JsonResponse
    {
        if (!$request->user()->can('suppliers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        // Generate supplier_code (Format: S-DHA00001 or SUP-0001)
        $lastSupplier = Supplier::orderBy('id', 'desc')->first();
        $nextNumber = 1;
        if ($lastSupplier && preg_match('/(?:SUP|S-DHA)-?(\d+)/', $lastSupplier->supplier_code, $matches)) {
            $nextNumber = (int) $matches[1] + 1;
        }
        $supplierCode = 'S-DHA' . str_pad($nextNumber, 5, '0', STR_PAD_LEFT);

        $openingBalance = (float) $request->get('opening_balance', 0);

        $supplier = Supplier::create([
            'supplier_code'   => $supplierCode,
            'name'            => $request->name,
            'company_name'    => $request->company_name,
            'phone'           => $request->phone,
            'email'           => $request->email,
            'address'         => $request->address,
            'opening_balance' => $openingBalance,
            'created_by'      => $request->user()->id,
        ]);

        // Concept 4.1: Auto-create initial Supplier Ledger entry
        \App\Models\SupplierLedger::create([
            'supplier_id'      => $supplier->id,
            'transaction_type' => 'opening_balance',
            'reference_type'   => Supplier::class,
            'reference_id'     => $supplier->id,
            'description'      => 'Initial Opening Balance Ledger',
            'debit'            => 0,
            'credit'           => $openingBalance,
            'balance'          => $openingBalance,
            'transaction_date' => now()->toDateString(),
            'created_by'       => $request->user()->id,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'create',
            'module'           => 'Supplier',
            'reference_id'     => $supplier->id,
            'reference_number' => $supplier->supplier_code,
            'new_value'        => $supplier->toArray(),
            'description'      => "Created supplier {$supplier->name} [{$supplier->supplier_code}] with auto-created ledger",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($supplier, 'Supplier created successfully.', 201);
    }

    /**
     * Display the specified supplier.
     */
    public function show(int $id): JsonResponse
    {
        $supplier = Supplier::with(['creator', 'supplierLinks.product', 'ledgers'])->findOrFail($id);

        return $this->successResponse($supplier, 'Supplier details retrieved successfully.');
    }

    /**
     * Update the specified supplier.
     */
    public function update(SupplierRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->can('suppliers:edit')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $supplier = Supplier::findOrFail($id);
        $oldValue = $supplier->toArray();

        $supplier->update([
            'name'            => $request->name,
            'company_name'    => $request->company_name,
            'phone'           => $request->phone,
            'email'           => $request->email,
            'address'         => $request->address,
            'opening_balance' => $request->has('opening_balance') ? (float) $request->opening_balance : $supplier->opening_balance,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'update',
            'module'           => 'Supplier',
            'reference_id'     => $supplier->id,
            'reference_number' => $supplier->supplier_code,
            'old_value'        => $oldValue,
            'new_value'        => $supplier->toArray(),
            'description'      => "Updated supplier {$supplier->supplier_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($supplier, 'Supplier updated successfully.');
    }

    /**
     * Archive the specified supplier.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('suppliers:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $supplier = Supplier::findOrFail($id);
        $oldValue = $supplier->toArray();

        $supplier->archive($request->user()->id, $request->input('archive_reason', 'Archived via API'));

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'archive',
            'module'           => 'Supplier',
            'reference_id'     => $supplier->id,
            'reference_number' => $supplier->supplier_code,
            'old_value'        => $oldValue,
            'new_value'        => $supplier->fresh()->toArray(),
            'description'      => "Archived supplier {$supplier->supplier_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($supplier->fresh(), 'Supplier archived successfully.');
    }

    /**
     * Restore the specified archived supplier.
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('suppliers:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $supplier = Supplier::findOrFail($id);
        $oldValue = $supplier->toArray();

        $supplier->restore($request->user()->id);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'restore',
            'module'           => 'Supplier',
            'reference_id'     => $supplier->id,
            'reference_number' => $supplier->supplier_code,
            'old_value'        => $oldValue,
            'new_value'        => $supplier->fresh()->toArray(),
            'description'      => "Restored supplier {$supplier->supplier_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($supplier->fresh(), 'Supplier restored successfully.');
    }
}
