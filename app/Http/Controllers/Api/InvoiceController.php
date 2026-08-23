<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Models\Quotation;
use App\Services\DeliveryChallanService;
use App\Services\InvoiceService;
use App\Services\NotificationService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    use ApiResponse;

    protected InvoiceService $invoiceService;
    protected NotificationService $notificationService;
    protected DeliveryChallanService $challanService;

    public function __construct(
        InvoiceService $invoiceService,
        NotificationService $notificationService,
        DeliveryChallanService $challanService
    ) {
        $this->invoiceService = $invoiceService;
        $this->notificationService = $notificationService;
        $this->challanService = $challanService;
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // archivedByUser is only ever populated on archived rows, but it is
        // loaded unconditionally rather than branched on the `archived`
        // filter — the eager load costs nothing extra for active rows (the
        // FK is null, so it's a no-op) and this keeps the query one shape
        // instead of two.
        $query = Invoice::with(['customer', 'salesman:id,name,email', 'archivedByUser:id,name', 'quotation.items.product', 'quotation.items.variant']);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        // Role-based visibility (mirrors QuotationController::index)
        $isAdmin = $user->role === 'admin' || (method_exists($user, 'hasRole') && $user->hasRole('admin'));
        $isSalesman = in_array($user->role, ['salesman', 'staff']) || (method_exists($user, 'hasRole') && ($user->hasRole('salesman') || $user->hasRole('staff')));
        $isManager = $user->role === 'manager' || (method_exists($user, 'hasRole') && $user->hasRole('manager'));

        if ($isAdmin) {
            // Admin sees all invoices
        } elseif ($isSalesman) {
            $query->where('salesman_id', $user->id);
        } elseif ($isManager) {
            $teamUserIds = \App\Models\User::where('manager_id', $user->id)->pluck('id')->push($user->id);
            $query->whereIn('salesman_id', $teamUserIds);
        }

        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('salesman_id') && $isAdmin) {
            $query->where('salesman_id', $request->salesman_id);
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            return $this->successResponse($query->get(), 'Invoices retrieved successfully.');
        }

        $perPage = (int) $request->get('per_page', 15);
        $invoices = $query->paginate($perPage);

        return $this->paginatedResponse($invoices, 'Invoices retrieved successfully.');
    }

    public function generate(int $quotationId, Request $request): JsonResponse
    {
        $quotation = Quotation::find($quotationId);

        if (!$quotation) {
            return $this->notFoundResponse('Quotation not found.');
        }

        if ($quotation->status !== 'approved') {
            return $this->errorResponse("Invoice can only be generated from approved quotations. Current status: {$quotation->status}", 422);
        }

        $user = $request->user();
        $poNumber = $request->input('po_number');
        // The Sales step generates the Delivery Challan alongside the invoice
        // in one action; pass with_challan=false to create the invoice only.
        $withChallan = $request->boolean('with_challan', true);

        return DB::transaction(function () use ($quotation, $user, $poNumber, $withChallan) {
            $invoice = $this->invoiceService->generate($quotation, $user->id, $poNumber);

            $quotation->update(['status' => 'invoiced']);

            AuditLog::record(
                $user->id,
                $user->name,
                'generate',
                Invoice::class,
                $invoice->id,
                null,
                $invoice->toArray(),
                "Generated invoice {$invoice->invoice_number} from quotation {$quotation->quotation_number}"
            );

            // Trigger Notification Event: Invoice Generated -> Notify Customer
            $this->notificationService->notifyInvoiceGenerated($invoice);

            $challan = null;
            if ($withChallan) {
                // Guard against duplicates in case a challan already exists.
                $challan = DeliveryChallan::where('invoice_id', $invoice->id)
                    ->where('is_archived', false)
                    ->first();

                if (!$challan) {
                    $challan = $this->challanService->generate($invoice, $user->id);

                    AuditLog::record(
                        $user->id,
                        $user->name,
                        'generate',
                        DeliveryChallan::class,
                        $challan->id,
                        null,
                        $challan->toArray(),
                        "Generated delivery challan {$challan->challan_number} for invoice {$invoice->invoice_number}"
                    );
                }
            }

            $message = $challan
                ? "Invoice {$invoice->invoice_number} and Delivery Challan {$challan->challan_number} generated successfully."
                : "Invoice {$invoice->invoice_number} generated successfully.";

            return $this->createdResponse([
                'invoice' => $invoice->load(['customer', 'salesman']),
                'challan' => $challan,
            ], $message);
        });
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::with([
            'customer',
            'salesman',
            'quotation.items.product.category',
            'quotation.items.variant',
            'payments',
            'deliveryChallans'
        ])->find($id);

        if (!$invoice) {
            return $this->notFoundResponse('Invoice not found.');
        }

        if (!$this->canAccessInvoice($request->user(), $invoice)) {
            return $this->notFoundResponse('Invoice not found.');
        }

        return $this->successResponse($invoice, 'Invoice details retrieved.');
    }

    /**
     * Whether the given user is allowed to view/act on this invoice, based on
     * the same role scoping used in index().
     */
    private function canAccessInvoice($user, Invoice $invoice): bool
    {
        $isAdmin = $user->role === 'admin' || (method_exists($user, 'hasRole') && $user->hasRole('admin'));
        if ($isAdmin) {
            return true;
        }

        $isSalesman = in_array($user->role, ['salesman', 'staff']) || (method_exists($user, 'hasRole') && ($user->hasRole('salesman') || $user->hasRole('staff')));
        if ($isSalesman) {
            return $invoice->salesman_id === $user->id;
        }

        $isManager = $user->role === 'manager' || (method_exists($user, 'hasRole') && $user->hasRole('manager'));
        if ($isManager) {
            $teamUserIds = \App\Models\User::where('manager_id', $user->id)->pluck('id')->push($user->id);
            return $teamUserIds->contains($invoice->salesman_id);
        }

        return false;
    }

    public function destroy(int $id, Request $request): JsonResponse
    {
        if (!$request->user()->can('invoices:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $invoice = Invoice::active()->with('payments')->find($id);

        if (!$invoice) {
            return $this->notFoundResponse('Invoice not found.');
        }

        // Block archive if there are payments
        if ($invoice->payments->count() > 0) {
            return $this->errorResponse('Cannot archive invoice because it has associated payments.', 422);
        }

        $user = $request->user();
        $reason = $request->get('reason', 'Archived via API');

        return DB::transaction(function () use ($invoice, $user, $reason) {
            $oldSnapshot = $invoice->toArray();

            // Archive the invoice record itself
            $invoice->archive($user->id, $reason);

            // Execute the service cascade archive
            $this->invoiceService->archive($invoice, $user->id);

            AuditLog::record(
                $user->id,
                $user->name,
                'archive',
                Invoice::class,
                $invoice->id,
                $oldSnapshot,
                $invoice->fresh()->toArray(),
                "Archived invoice {$invoice->invoice_number}"
            );

            return $this->successResponse(null, "Invoice {$invoice->invoice_number} archived successfully.");
        });
    }

    public function restore(int $id, Request $request): JsonResponse
    {
        if (!$request->user()->can('invoices:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $invoice = Invoice::archived()->find($id);

        if (!$invoice) {
            return $this->notFoundResponse('Archived invoice not found.');
        }

        $user = $request->user();

        return DB::transaction(function () use ($invoice, $user) {
            $oldSnapshot = $invoice->toArray();

            $invoice->restore();
            $this->invoiceService->restore($invoice, $user->id);

            AuditLog::record(
                $user->id,
                $user->name,
                'restore',
                Invoice::class,
                $invoice->id,
                $oldSnapshot,
                $invoice->fresh()->toArray(),
                "Restored invoice {$invoice->invoice_number}"
            );

            return $this->successResponse($invoice->fresh(), "Invoice {$invoice->invoice_number} restored successfully.");
        });
    }
}
