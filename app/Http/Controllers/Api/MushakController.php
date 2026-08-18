<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\MushakInvoice;
use App\Services\MushakService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * NBR Mushak 6.3 VAT challans.
 *
 * Permission checks are written out at the top of each method rather than
 * applied as route middleware, matching every other controller here.
 */
class MushakController extends Controller
{
    use ApiResponse;

    public function __construct(protected MushakService $mushakService)
    {
    }

    /**
     * GET /api/mushak
     *
     * Brand scoping is handled by the model's global scope, so a Dhaka
     * Blinds login sees an empty list rather than another brand's challans.
     */
    public function index(Request $request): JsonResponse
    {
        if (!$request->user()->can('mushak:view')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $query = MushakInvoice::with(['salesInvoice:id,invoice_number,customer_id', 'items']);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('from_date')) {
            $query->whereDate('issue_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('issue_date', '<=', $request->to_date);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('challan_number', 'LIKE', "%{$search}%")
                  ->orWhere('buyer_name', 'LIKE', "%{$search}%")
                  ->orWhere('buyer_bin', 'LIKE', "%{$search}%");
            });
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            return $this->successResponse($query->get(), 'VAT challans retrieved successfully.');
        }

        return $this->paginatedResponse(
            $query->paginate((int) $request->get('per_page', 15)),
            'VAT challans retrieved successfully.'
        );
    }

    /**
     * GET /api/mushak/issuable
     *
     * Invoices that could have a challan issued against them, for the
     * "issue" picker. Mirrors MushakService::assertIssuable so the list does
     * not offer something that would be refused on submit.
     */
    public function issuable(Request $request): JsonResponse
    {
        if (!$request->user()->can('mushak:issue')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $invoices = Invoice::with(['customer:id,name,company_name,bin', 'quotation:id,vat_enabled,vat_rate'])
            ->active()
            ->where('brand_id', MushakService::VAT_REGISTERED_BRAND_ID)
            ->whereDoesntHave('mushakInvoice')
            ->whereHas('quotation', fn ($q) => $q->where('vat_enabled', true))
            ->orderBy('id', 'desc')
            ->get();

        return $this->successResponse($invoices, 'Issuable invoices retrieved successfully.');
    }

    /**
     * POST /api/mushak/issue/{invoiceId}
     */
    public function issue(int $invoiceId, Request $request): JsonResponse
    {
        if (!$request->user()->can('mushak:issue')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $request->validate([
            'buyer_bin'             => 'nullable|string|max:30',
            'save_bin_to_customer'  => 'nullable|boolean',
            'issued_by_name'        => 'nullable|string|max:150',
            'issued_by_designation' => 'nullable|string|max:150',
        ]);

        $invoice = Invoice::with(['quotation.items.product.category', 'quotation.items.variant', 'customer'])
            ->find($invoiceId);

        if (!$invoice) {
            return $this->notFoundResponse('Invoice not found.');
        }

        $user = $request->user();

        try {
            return DB::transaction(function () use ($invoice, $user, $request) {
                $challan = $this->mushakService->issue(
                    $invoice,
                    $user->id,
                    $request->input('buyer_bin'),
                    $request->input('issued_by_name', $user->name),
                    $request->input('issued_by_designation')
                );

                // The BIN usually arrives at this moment rather than during
                // onboarding, so offer to keep it for next time.
                if ($request->boolean('save_bin_to_customer') && $request->filled('buyer_bin') && $invoice->customer) {
                    $invoice->customer->update(['bin' => $request->input('buyer_bin')]);
                }

                AuditLog::record(
                    $user->id,
                    $user->name,
                    // 'generate', not 'issue': audit_logs.action_type is an
                    // enum and has no 'issue' member, so anything else aborts
                    // the surrounding transaction and loses the challan.
                    // InvoiceController logs invoice creation the same way.
                    'generate',
                    MushakInvoice::class,
                    $challan->id,
                    null,
                    $challan->toArray(),
                    "Issued VAT challan {$challan->challan_number} for invoice {$invoice->invoice_number}"
                );

                return $this->createdResponse(
                    $challan->load('items'),
                    "VAT challan {$challan->challan_number} issued successfully."
                );
            });
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }
    }

    /**
     * GET /api/mushak/{id}
     */
    public function show(int $id, Request $request): JsonResponse
    {
        if (!$request->user()->can('mushak:view')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $challan = MushakInvoice::with(['items', 'salesInvoice', 'creator:id,name'])->find($id);

        if (!$challan) {
            return $this->notFoundResponse('VAT challan not found.');
        }

        return $this->successResponse($challan, 'VAT challan retrieved successfully.');
    }

    /**
     * DELETE /api/mushak/{id}
     *
     * Archive, never hard delete: an issued VAT document has to remain
     * accounted for even after it is superseded.
     */
    public function destroy(int $id, Request $request): JsonResponse
    {
        if (!$request->user()->can('mushak:issue')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $request->validate(['archive_reason' => 'required|string|max:1000']);

        $challan = MushakInvoice::find($id);

        if (!$challan) {
            return $this->notFoundResponse('VAT challan not found.');
        }

        $user = $request->user();
        $challan->archive($user->id, $request->input('archive_reason'));

        AuditLog::record(
            $user->id,
            $user->name,
            'archive',
            MushakInvoice::class,
            $challan->id,
            null,
            $challan->fresh()->toArray(),
            "Archived VAT challan {$challan->challan_number}"
        );

        return $this->successResponse(null, 'VAT challan archived successfully.');
    }
}
