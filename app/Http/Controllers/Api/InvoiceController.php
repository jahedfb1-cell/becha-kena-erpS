<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\Quotation;
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

    public function __construct(InvoiceService $invoiceService, NotificationService $notificationService)
    {
        $this->invoiceService = $invoiceService;
        $this->notificationService = $notificationService;
    }

    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with(['customer:id,name,phone', 'salesman:id,name,email', 'quotation:id,quotation_number']);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('salesman_id')) {
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

        return DB::transaction(function () use ($quotation, $user) {
            $invoice = $this->invoiceService->generate($quotation, $user->id);

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

            return $this->createdResponse(
                $invoice->load(['customer', 'salesman']),
                "Invoice {$invoice->invoice_number} generated successfully."
            );
        });
    }

    public function show(int $id): JsonResponse
    {
        $invoice = Invoice::with([
            'customer',
            'salesman',
            'quotation.items.product',
            'payments',
            'deliveryChallans'
        ])->find($id);

        if (!$invoice) {
            return $this->notFoundResponse('Invoice not found.');
        }

        return $this->successResponse($invoice, 'Invoice details retrieved.');
    }

    public function destroy(int $id, Request $request): JsonResponse
    {
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
