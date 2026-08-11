<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PurchaseEntry;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Services\NotificationService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseController extends Controller
{
    use ApiResponse;

    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * GET /api/purchases
     * Retrieve list of purchase entries with filtering and supplier ledger balance calculation.
     */
    public function index(Request $request): JsonResponse
    {
        $query = PurchaseEntry::with([
            'supplier:id,name,supplier_code,phone',
            'product:id,product_code,name',
            'variant:id,product_id,variant_name',
            'quotation:id,quotation_number,customer_id',
            'quotation.customer:id,name,company_name,address,phone',
        ]);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        // Filter by supplier_id
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }

        // Filter by search query (color code/variant name, product code, quotation/order no, customer name)
        if ($request->filled('search') || $request->filled('color_code')) {
            $searchTerm = $request->get('search') ?: $request->get('color_code');
            $searchTerm = trim($searchTerm);

            $query->where(function ($q) use ($searchTerm) {
                $q->where('purchase_number', 'like', "%{$searchTerm}%")
                  ->orWhereHas('quotation', function ($q2) use ($searchTerm) {
                      $q2->where('quotation_number', 'like', "%{$searchTerm}%")
                         ->orWhereHas('customer', function ($q3) use ($searchTerm) {
                             $q3->where('name', 'like', "%{$searchTerm}%")
                                ->orWhere('company_name', 'like', "%{$searchTerm}%");
                         });
                  })
                  ->orWhereHas('product', function ($q2) use ($searchTerm) {
                      $q2->where('product_code', 'like', "%{$searchTerm}%")
                         ->orWhere('name', 'like', "%{$searchTerm}%");
                  })
                  ->orWhereHas('variant', function ($q2) use ($searchTerm) {
                      $q2->where('variant_name', 'like', "%{$searchTerm}%");
                  });
            });
        }

        // Date range filtering
        if ($request->filled('from_date')) {
            $query->whereDate('purchase_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('purchase_date', '<=', $request->to_date);
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            $allPurchases = $query->get();
            $purchases = new \Illuminate\Pagination\LengthAwarePaginator(
                $allPurchases, $allPurchases->count(), max($allPurchases->count(), 1)
            );
        } else {
            $perPage = (int) $request->get('per_page', 15);
            $purchases = $query->paginate($perPage);
        }

        // Compute supplier ledger totals
        $suppliers = Supplier::select('id', 'name', 'supplier_code', 'opening_balance')->get();
        $supplierLedgers = [];
        foreach ($suppliers as $sup) {
            $lastEntry = SupplierLedger::where('supplier_id', $sup->id)->orderBy('id', 'desc')->first();
            $balance = $lastEntry ? (float) $lastEntry->balance : (float) $sup->opening_balance;
            
            $totalPurchases = (float) SupplierLedger::where('supplier_id', $sup->id)->sum('credit');
            $totalPaid = (float) SupplierLedger::where('supplier_id', $sup->id)->sum('debit');

            $supplierLedgers[$sup->id] = [
                'supplier_id'      => $sup->id,
                'supplier_name'    => $sup->name,
                'supplier_code'    => $sup->supplier_code,
                'total_purchases'  => $totalPurchases,
                'total_paid'       => $totalPaid,
                'due_balance'      => $balance,
            ];
        }

        return $this->successResponse([
            'purchases'        => $purchases->items(),
            'pagination'       => [
                'current_page' => $purchases->currentPage(),
                'last_page'    => $purchases->lastPage(),
                'per_page'     => $purchases->perPage(),
                'total'        => $purchases->total(),
            ],
            'suppliers_list'   => $suppliers,
            'supplier_ledgers' => $supplierLedgers,
        ], 'Purchases list retrieved successfully.');
    }

    /**
     * GET /api/purchases/{id}
     * Retrieve single purchase entry details.
     */
    public function show(int $id): JsonResponse
    {
        $purchase = PurchaseEntry::with([
            'supplier',
            'product',
            'variant',
            'quotation.customer',
            'creator',
        ])->find($id);

        if (!$purchase) {
            return $this->notFoundResponse('Purchase entry not found.');
        }

        return $this->successResponse($purchase, 'Purchase entry details retrieved.');
    }

    /**
     * POST /api/purchases/supplier-payment
     * Record payment made to a supplier and update supplier ledger balance.
     */
    public function recordSupplierPayment(Request $request): JsonResponse
    {
        $request->validate([
            'supplier_id'    => 'required|exists:suppliers,id',
            'amount'         => 'required|numeric|min:0.01',
            'payment_date'   => 'required|date',
            'payment_method' => 'required|in:cash,bank,mobile',
            'bank_name'      => 'nullable|string',
            'cheque_number'  => 'nullable|string',
            'transaction_id' => 'nullable|string',
            'notes'          => 'nullable|string',
        ]);

        $supplier = Supplier::find($request->supplier_id);
        $user = $request->user();

        return DB::transaction(function () use ($request, $supplier, $user) {
            $amount = (float) $request->amount;

            $lastLedger = SupplierLedger::where('supplier_id', $supplier->id)
                ->orderBy('id', 'desc')
                ->first();

            $previousBalance = $lastLedger ? (float) $lastLedger->balance : (float) $supplier->opening_balance;
            $newBalance = $previousBalance - $amount;

            $methodDesc = "Paid via " . strtoupper($request->payment_method);
            if ($request->payment_method === 'bank' && $request->cheque_number) {
                $methodDesc .= " ({$request->bank_name} - Cheque: {$request->cheque_number})";
            } elseif ($request->payment_method === 'mobile' && $request->transaction_id) {
                $methodDesc .= " (Txn: {$request->transaction_id})";
            }
            if ($request->notes) {
                $methodDesc .= " - " . $request->notes;
            }

            $ledgerEntry = SupplierLedger::create([
                'supplier_id'      => $supplier->id,
                'transaction_type' => 'payment',
                'reference_type'   => Supplier::class,
                'reference_id'     => $supplier->id,
                'description'      => "Payment to Supplier: {$methodDesc}",
                'debit'            => $amount,
                'credit'           => 0,
                'balance'          => $newBalance,
                'transaction_date' => $request->payment_date,
                'created_by'       => $user->id,
            ]);

            AuditLog::record(
                $user->id,
                $user->name,
                'create',
                SupplierLedger::class,
                $ledgerEntry->id,
                null,
                $ledgerEntry->toArray(),
                "Recorded payment of ৳{$amount} to supplier {$supplier->name}"
            );

            // Trigger In-App Notification for Admins & Managers
            $this->notificationService->notifySupplierPaymentRecorded($supplier, $amount, $ledgerEntry);

            return $this->createdResponse([
                'ledger_entry' => $ledgerEntry,
                'new_balance'  => $newBalance,
            ], "Supplier payment of ৳{$amount} recorded successfully.");
        });
    }
}
