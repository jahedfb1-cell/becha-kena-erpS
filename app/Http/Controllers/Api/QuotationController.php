<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuotationRequest;
use App\Models\AuditLog;
use App\Models\Quotation;
use App\Services\QuotationService;
use App\Services\NotificationService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class QuotationController extends Controller
{
    use ApiResponse;

    protected QuotationService $quotationService;
    protected NotificationService $notificationService;

    public function __construct(QuotationService $quotationService, NotificationService $notificationService)
    {
        $this->quotationService = $quotationService;
        $this->notificationService = $notificationService;
    }

    /**
     * GET /api/quotations/preferred-supplier/{productId}
     * Helper endpoint to get priority_rank=1 supplier and min_billing_sqft.
     */
    public function preferredSupplier(int $productId): JsonResponse
    {
        $supplierInfo = $this->quotationService->getPreferredSupplier($productId);

        if (!$supplierInfo) {
            return $this->errorResponse('No active supplier link found for this product.', 404);
        }

        return $this->successResponse($supplierInfo, 'Preferred supplier retrieved successfully.');
    }

    /**
     * GET /api/quotations
     * Role-based visibility and filters (status, date_range, customer, salesman).
     */
    public function index(Request $request): JsonResponse
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('quotation_items', 'section_name')) {
            \Illuminate\Support\Facades\Schema::table('quotation_items', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->string('section_name')->nullable()->after('quotation_id');
                $table->string('option_group_id')->nullable()->after('section_name');
                $table->boolean('is_optional')->default(false)->after('option_group_id');
                $table->boolean('is_selected')->default(true)->after('is_optional');
                $table->boolean('is_enabled_for_print')->default(true)->after('is_selected');
            });
        }

        $user = $request->user();
        $query = Quotation::with(['customer:id,customer_code,name,phone', 'salesman:id,name,email'])
            ->withCount('items')
            ->withSum(['items' => function($q) {
                $q->where('is_selected', true)->where('is_enabled_for_print', true);
            }], 'billed_sqft');

        // Archived filter
        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        // Role-based visibility
        $isSalesman = $user->role === 'salesman' || (method_exists($user, 'hasRole') && $user->hasRole('salesman'));
        $isManager  = $user->role === 'manager' || (method_exists($user, 'hasRole') && $user->hasRole('manager'));
        $isAdmin    = $user->role === 'admin' || (method_exists($user, 'hasRole') && $user->hasRole('admin'));

        if ($isAdmin || $request->boolean('all')) {
            // Admin or explicit all=1 parameter sees all quotations
        } elseif ($isSalesman) {
            $query->where(function ($q) use ($user) {
                $q->where('salesman_id', $user->id)
                  ->orWhere('created_by', $user->id);
            });
        } elseif ($isManager) {
            $teamUserIds = \App\Models\User::where('manager_id', $user->id)->pluck('id')->push($user->id);
            $query->whereIn('salesman_id', $teamUserIds);
        }

        // Filters
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        if ($request->filled('salesman_id')) {
            $query->where('salesman_id', $request->salesman_id);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('quotation_number', 'LIKE', "%{$search}%")
                  ->orWhereHas('customer', function ($cq) use ($search) {
                      $cq->where('name', 'LIKE', "%{$search}%")
                         ->orWhere('customer_code', 'LIKE', "%{$search}%");
                  });
            });
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            return $this->successResponse($query->get(), 'Quotations retrieved successfully.');
        }

        $perPage = (int) $request->get('per_page', 15);
        $quotations = $query->paginate($perPage);

        return $this->paginatedResponse($quotations, 'Quotations retrieved successfully.');
    }

    /**
     * POST /api/quotations
     * Store new quotation with items & calculations.
     */
    public function store(QuotationRequest $request): JsonResponse
    {
        $user = $request->user();
        $status = $request->get('status', 'quotation');

        try {
            return DB::transaction(function () use ($request, $user, $status) {
                $quotationNumber = $this->quotationService->generateQuotationNumber();

                $quotation = Quotation::create([
                    'quotation_number'   => $quotationNumber,
                    'customer_id'        => $request->customer_id,
                    'salesman_id'        => $request->get('salesman_id', $user->id),
                    'status'             => $status,
                    'convenience_charge' => $request->get('convenience_charge', 0),
                    'other_charge'       => $request->get('other_charge', 0),
                    'other_charge_label' => $request->get('other_charge_label', null),
                    'vat_percentage'     => $request->get('vat_percentage', 0),
                    'vat_enabled'        => $request->boolean('vat_enabled'),
                    'vat_rate'           => $request->boolean('vat_enabled') ? $request->get('vat_rate') : null,
                    'vat_inclusive'      => $request->boolean('vat_inclusive'),
                    'discount_type'      => $request->get('discount_type', 'flat'),
                    'discount_value'     => $request->get('discount_value', 0),
                    'note'               => $request->note,
                    'delivery_address'   => $request->delivery_address,
                    'created_by'         => $user->id,
                    'approved_by'        => $status === 'approved' ? $user->id : null,
                    'approved_at'        => $status === 'approved' ? now() : null,
                ]);

                // Save line items & get subtotal
                $subtotal = $this->quotationService->processAndSaveItems($quotation, $request->items, $user->id);

                // Summary calculations
                $summary = $this->quotationService->calculateSummary(
                    $subtotal,
                    (float) $quotation->convenience_charge,
                    (float) $quotation->other_charge,
                    (float) $quotation->vat_percentage,
                    $quotation->discount_type,
                    (float) $quotation->discount_value
                );

                $quotation->update($summary);

                // If direct order created with approved status, generate purchase entries
                if ($status === 'approved') {
                    $this->quotationService->createPurchaseEntries($quotation, $user->id);
                    $this->notificationService->notifyOrderApprovedOrRejected($quotation, 'approved');
                }

                AuditLog::record(
                    $user->id,
                    $user->name,
                    'create',
                    Quotation::class,
                    $quotation->id,
                    null,
                    $quotation->load('items')->toArray(),
                    "Created {$status} {$quotation->quotation_number}"
                );
                return $this->createdResponse(
                    $quotation->load(['items.product', 'items.variant', 'items.supplier', 'customer', 'salesman']),
                    "Record {$quotation->quotation_number} created successfully."
                );
            });
        } catch (\Throwable $e) {
            // Standardized failure path — see the matching catch in approve().
            // A "Direct Confirmed Order" (status=approved) goes through this
            // same purchase-entry auto-creation step, so it needs the same
            // safety net: the transaction already rolled back everything,
            // but the salesman still needs to see why nothing was created.
            \Illuminate\Support\Facades\Log::error('Quotation creation failed', [
                'status' => $status,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            $reason = $status === 'approved'
                ? "could not auto-create the purchase entry ({$e->getMessage()})"
                : $e->getMessage();

            return $this->errorResponse(
                "Failed to save the order: {$reason}. No changes were saved.",
                500
            );
        }
    }

    /**
     * GET /api/quotations/{id}
     * Full quotation details with items and supplier info.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::with([
            'customer',
            'salesman:id,name,email,phone',
            'creator:id,name',
            'approver:id,name',
            'items.product.category',
            'items.variant',
            'items.supplier',
            'purchaseEntries',
        ])->find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        $user = $request->user();
        $isAdmin = $user->role === 'admin' || (method_exists($user, 'hasRole') && $user->hasRole('admin'));
        $isSalesman = $user->role === 'salesman' || (method_exists($user, 'hasRole') && $user->hasRole('salesman'));
        $isManager = $user->role === 'manager' || (method_exists($user, 'hasRole') && $user->hasRole('manager'));

        if (!$isAdmin) {
            if ($isSalesman && $quotation->salesman_id !== $user->id && $quotation->created_by !== $user->id) {
                return $this->notFoundResponse('Quotation not found.');
            }
            if ($isManager) {
                $teamUserIds = \App\Models\User::where('manager_id', $user->id)->pluck('id')->push($user->id);
                if (!$teamUserIds->contains($quotation->salesman_id)) {
                    return $this->notFoundResponse('Quotation not found.');
                }
            }
        }

        return $this->successResponse($quotation, 'Quotation details retrieved.');
    }

    /**
     * PUT /api/quotations/{id}
     * Update quotation header & items with edit rules.
     */
    public function update(QuotationRequest $request, int $id): JsonResponse
    {
        $quotation = Quotation::with('items')->find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        // Edit rules
        if ($quotation->status === 'invoiced') {
            return $this->errorResponse('Invoiced quotations cannot be edited.', 422);
        }

        $user = $request->user();
        $oldSnapshot = $quotation->toArray();

        return DB::transaction(function () use ($request, $quotation, $user, $oldSnapshot) {
            $wasApproved = $quotation->status === 'approved';

            $newStatus = $request->get('status', $quotation->status);
            if ($wasApproved && !$request->has('status')) {
                $newStatus = 'pending_reapproval';
            }

            // Whatever was purchased against the old line items is reversed
            // before those items are replaced. The edit changes what was
            // ordered, so the old debt no longer describes anything real —
            // and the entries reference the very rows that are about to be
            // deleted, which the database would otherwise refuse.
            $this->quotationService->reversePurchaseEntries($quotation, $user->id);

            $quotation->update([
                'customer_id'        => $request->customer_id,
                'salesman_id'        => $request->get('salesman_id', $quotation->salesman_id),
                'status'             => $newStatus,
                'convenience_charge' => $request->get('convenience_charge', $quotation->convenience_charge),
                'other_charge'       => $request->get('other_charge', $quotation->other_charge),
                'other_charge_label' => $request->get('other_charge_label', $quotation->other_charge_label),
                'vat_percentage'     => $request->get('vat_percentage', $quotation->vat_percentage),
                'vat_enabled'        => $request->boolean('vat_enabled'),
                'vat_rate'           => $request->boolean('vat_enabled') ? $request->get('vat_rate') : null,
                'vat_inclusive'      => $request->boolean('vat_inclusive'),
                'discount_type'      => $request->get('discount_type', $quotation->discount_type),
                'discount_value'     => $request->get('discount_value', $quotation->discount_value),
                'note'               => $request->get('note', $quotation->note),
                'delivery_address'   => $request->get('delivery_address', $quotation->delivery_address),
            ]);

            // Re-process line items
            $subtotal = $this->quotationService->processAndSaveItems($quotation, $request->items, $user->id);

            // Summary calculations
            $summary = $this->quotationService->calculateSummary(
                $subtotal,
                (float) $quotation->convenience_charge,
                (float) $quotation->other_charge,
                (float) $quotation->vat_percentage,
                $quotation->discount_type,
                (float) $quotation->discount_value
            );

            $quotation->update($summary);

            // An order that still stands approved after the edit owes its
            // supplier the cost of what it now contains, so the purchase is
            // raised again against the new line items. The Orders screen
            // sends status "approved" on every save, which is how an order
            // can also arrive here straight from pending approval — that is
            // an approval in all but name, and is stamped as one so the
            // audit trail shows who allowed it.
            if ($newStatus === 'approved') {
                if (!$wasApproved) {
                    $quotation->update([
                        'approved_by' => $user->id,
                        'approved_at' => now(),
                    ]);
                }

                $this->quotationService->createPurchaseEntries($quotation, $user->id);
            }

            AuditLog::record(
                $user->id,
                $user->name,
                'update',
                Quotation::class,
                $quotation->id,
                $oldSnapshot,
                $quotation->fresh('items')->toArray(),
                "Updated quotation {$quotation->quotation_number}"
            );

            return $this->successResponse(
                $quotation->load(['items.product', 'items.variant', 'items.supplier', 'customer', 'salesman']),
                "Quotation {$quotation->quotation_number} updated successfully."
            );
        });
    }

    /**
     * POST /api/quotations/{id}/convert-to-order
     * Convert status to 'pending_approval' with optional discount update.
     */
    public function convertToOrder(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::with('items')->find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        if (in_array($quotation->status, ['invoiced', 'approved'])) {
            return $this->errorResponse("Quotation cannot be converted to order from status '{$quotation->status}'.", 422);
        }

        $request->validate([
            'discount_type'  => 'nullable|in:percentage,flat',
            'discount_value' => 'nullable|numeric|min:0',
        ]);

        $user = $request->user();
        $oldSnapshot = $quotation->toArray();

        return DB::transaction(function () use ($request, $quotation, $user, $oldSnapshot) {
            $discountType = $request->get('discount_type', $quotation->discount_type);
            $discountValue = (float) $request->get('discount_value', $quotation->discount_value);

            $summary = $this->quotationService->calculateSummary(
                (float) $quotation->subtotal,
                (float) $quotation->convenience_charge,
                (float) $quotation->other_charge,
                (float) $quotation->vat_percentage,
                $discountType,
                $discountValue
            );

            $quotation->update(array_merge($summary, [
                'status'         => 'pending_approval',
                'discount_type'  => $discountType,
                'discount_value' => $discountValue,
            ]));

            AuditLog::record(
                $user->id,
                $user->name,
                'convert',
                Quotation::class,
                $quotation->id,
                $oldSnapshot,
                $quotation->toArray(),
                "Converted quotation {$quotation->quotation_number} to order (pending approval)"
            );

            // Trigger Notification Event: Quotation Converted to Order -> Notify Admins & Managers
            $this->notificationService->notifyQuotationConvertedToOrder($quotation);

            return $this->successResponse(
                $quotation->load(['items', 'customer']),
                "Quotation {$quotation->quotation_number} converted to order pending approval."
            );
        });
    }

    /**
     * POST /api/quotations/{id}/approve
     * Admin/Manager approves quotation -> status 'approved', creates PurchaseEntries.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('quotations:approve')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $quotation = Quotation::with('items')->find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        if (!in_array($quotation->status, ['pending_approval', 'pending_reapproval', 'quotation'])) {
            return $this->errorResponse("Quotation in status '{$quotation->status}' cannot be approved.", 422);
        }

        $user = $request->user();
        $oldSnapshot = $quotation->toArray();

        try {
            return DB::transaction(function () use ($quotation, $user, $oldSnapshot) {
                $quotation->update([
                    'status'      => 'approved',
                    'approved_by' => $user->id,
                    'approved_at' => now(),
                ]);

                // Auto-create Purchase Entries & Supplier Ledger credits
                $this->quotationService->createPurchaseEntries($quotation, $user->id);

                AuditLog::record(
                    $user->id,
                    $user->name,
                    'approve',
                    Quotation::class,
                    $quotation->id,
                    $oldSnapshot,
                    $quotation->toArray(),
                    "Approved quotation {$quotation->quotation_number}"
                );

                // Trigger Notification Event: Order Approved -> Notify Salesman + Suppliers
                $this->notificationService->notifyOrderApprovedOrRejected($quotation, 'approved');

                return $this->successResponse(
                    $quotation->load(['items', 'purchaseEntries', 'customer']),
                    "Quotation {$quotation->quotation_number} approved successfully and purchase entries generated."
                );
            });
        } catch (\Throwable $e) {
            // Standardized failure path: the DB transaction already rolled
            // back everything (the order stays un-approved, no partial
            // Purchase Entry / Supplier Ledger rows survive), but that alone
            // is invisible to the salesman — without this they'd either see
            // a generic 500 page or, worse, nothing at all. Logged here for
            // whoever checks storage/logs/laravel.log, and the real reason
            // is also handed back in the response so the "Approve Order &
            // Route Purchase Entry" button's error alert can show it directly.
            \Illuminate\Support\Facades\Log::error('Order approval failed while auto-creating purchase entries', [
                'quotation_id' => $quotation->id,
                'quotation_number' => $quotation->quotation_number,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->errorResponse(
                "Order approval failed: could not auto-create the purchase entry ({$e->getMessage()}). No changes were saved — the order is still pending approval.",
                500
            );
        }
    }

    /**
     * POST /api/quotations/{id}/reject
     * Reject quotation order with reason.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('quotations:reject')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $quotation = Quotation::find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        $request->validate([
            'rejection_reason' => 'required|string|max:1000',
        ]);

        $user = $request->user();
        $oldSnapshot = $quotation->toArray();

        return DB::transaction(function () use ($request, $quotation, $user, $oldSnapshot) {
            $quotation->update([
                'status'           => 'rejected',
                'rejection_reason' => $request->rejection_reason,
            ]);

            AuditLog::record(
                $user->id,
                $user->name,
                'reject',
                Quotation::class,
                $quotation->id,
                $oldSnapshot,
                $quotation->toArray(),
                "Rejected quotation {$quotation->quotation_number}"
            );

            // Trigger Notification Event: Order Rejected -> Notify Salesman + Suppliers
            $this->notificationService->notifyOrderApprovedOrRejected($quotation, 'rejected');

            return $this->successResponse(
                $quotation,
                "Quotation {$quotation->quotation_number} has been rejected."
            );
        });
    }

    /**
     * DELETE /api/quotations/{id}
     * Archive quotation & reverse purchase entries.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        // No dedicated permission key exists for this destructive action
        // (archives the quotation and reverses purchase entries), so it's
        // restricted to admins only, same as database backups.
        if ($request->user()->role !== 'admin') {
            return $this->errorResponse('Unauthorized action. Admin access required.', 403);
        }

        $quotation = Quotation::find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        if ($quotation->status === 'invoiced') {
            return $this->errorResponse('Invoiced quotations cannot be archived.', 422);
        }

        $user = $request->user();
        $reason = $request->get('reason', 'Archived via API');

        return DB::transaction(function () use ($quotation, $user, $reason) {
            $oldSnapshot = $quotation->toArray();

            $quotation->archive($user->id, $reason);
            $this->quotationService->reversePurchaseEntries($quotation, $user->id);

            AuditLog::record(
                $user->id,
                $user->name,
                'archive',
                Quotation::class,
                $quotation->id,
                $oldSnapshot,
                $quotation->fresh()->toArray(),
                "Archived quotation {$quotation->quotation_number}"
            );

            return $this->successResponse(null, "Quotation {$quotation->quotation_number} archived successfully.");
        });
    }

    /**
     * POST /api/quotations/{id}/restore
     * Restore archived quotation & restore purchase entries.
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::archived()->find($id);

        if (!$quotation) {
            return $this->notFoundResponse('Archived quotation not found.');
        }

        $user = $request->user();

        return DB::transaction(function () use ($quotation, $user) {
            $oldSnapshot = $quotation->toArray();

            $quotation->restore();
            $this->quotationService->restorePurchaseEntries($quotation, $user->id);

            AuditLog::record(
                $user->id,
                $user->name,
                'restore',
                Quotation::class,
                $quotation->id,
                $oldSnapshot,
                $quotation->fresh()->toArray(),
                "Restored quotation {$quotation->quotation_number}"
            );

            return $this->successResponse(
                $quotation->fresh(),
                "Quotation {$quotation->quotation_number} restored successfully."
            );
        });
    }
}
