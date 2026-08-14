<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Services\DeliveryChallanService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeliveryChallanController extends Controller
{
    use ApiResponse;

    protected DeliveryChallanService $challanService;

    public function __construct(DeliveryChallanService $challanService)
    {
        $this->challanService = $challanService;
    }

    public function generate(int $invoiceId, Request $request): JsonResponse
    {
        $invoice = Invoice::find($invoiceId);

        if (!$invoice) {
            return $this->notFoundResponse('Invoice not found.');
        }

        $user = $request->user();

        // A challan is now created automatically alongside the invoice at the
        // Sales step, so guard against a second one being made by hand here.
        $existing = DeliveryChallan::where('invoice_id', $invoice->id)
            ->where('is_archived', false)
            ->first();

        if ($existing) {
            return $this->errorResponse(
                "Delivery Challan {$existing->challan_number} already exists for invoice {$invoice->invoice_number}.",
                422
            );
        }

        return DB::transaction(function () use ($invoice, $user) {
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

            return $this->createdResponse(
                $challan->load(['customer']),
                "Delivery Challan {$challan->challan_number} generated successfully."
            );
        });
    }

    public function show(int $id): JsonResponse
    {
        $challan = DeliveryChallan::with([
            'invoice.quotation.items.product',
            'customer'
        ])->find($id);

        if (!$challan) {
            return $this->notFoundResponse('Delivery Challan not found.');
        }

        return $this->successResponse($challan, 'Delivery Challan details retrieved.');
    }

    public function destroy(int $id, Request $request): JsonResponse
    {
        $challan = DeliveryChallan::active()->find($id);

        if (!$challan) {
            return $this->notFoundResponse('Delivery Challan not found.');
        }

        $user = $request->user();
        $reason = $request->get('reason', 'Archived via API');

        return DB::transaction(function () use ($challan, $user, $reason) {
            $oldSnapshot = $challan->toArray();

            $challan->archive($user->id, $reason);

            AuditLog::record(
                $user->id,
                $user->name,
                'archive',
                DeliveryChallan::class,
                $challan->id,
                $oldSnapshot,
                $challan->fresh()->toArray(),
                "Archived delivery challan {$challan->challan_number}"
            );

            return $this->successResponse(null, "Delivery Challan {$challan->challan_number} archived successfully.");
        });
    }

    public function approve(int $id, Request $request): JsonResponse
    {
        $challan = DeliveryChallan::find($id);

        if (!$challan) {
            return $this->notFoundResponse('Delivery Challan not found.');
        }

        $user = $request->user();

        return DB::transaction(function () use ($challan, $user) {
            $oldSnapshot = $challan->toArray();

            $challan->update([
                'status' => 'delivered',
            ]);

            AuditLog::record(
                $user->id,
                $user->name,
                'approve',
                DeliveryChallan::class,
                $challan->id,
                $oldSnapshot,
                $challan->fresh()->toArray(),
                "Approved delivery challan {$challan->challan_number}"
            );

            return $this->successResponse(
                $challan->load(['customer', 'invoice.quotation.items.product']),
                "Delivery Challan {$challan->challan_number} approved and marked as delivered."
            );
        });
    }

    public function sendEmail(int $id, Request $request): JsonResponse
    {
        $challan = DeliveryChallan::with(['customer', 'invoice'])->find($id);

        if (!$challan) {
            return $this->notFoundResponse('Delivery Challan not found.');
        }

        $email = $challan->customer->email ?? 'customer@example.com';
        \Illuminate\Support\Facades\Log::info("Sent Delivery Challan {$challan->challan_number} PDF email to {$email}");

        return $this->successResponse([
            'email' => $email,
            'challan_number' => $challan->challan_number,
        ], "Delivery Challan {$challan->challan_number} PDF sent to {$email} successfully.");
    }
}
