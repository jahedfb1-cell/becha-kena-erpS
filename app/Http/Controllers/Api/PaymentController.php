<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\PaymentService;
use App\Services\NotificationService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    use ApiResponse;

    protected PaymentService $paymentService;
    protected NotificationService $notificationService;

    public function __construct(PaymentService $paymentService, NotificationService $notificationService)
    {
        $this->paymentService = $paymentService;
        $this->notificationService = $notificationService;
    }

    public function index(Request $request): JsonResponse
    {
        $query = Payment::with(['customer:id,name,phone', 'invoice:id,invoice_number']);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('invoice_id')) {
            $query->where('invoice_id', $request->invoice_id);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('payment_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('payment_date', '<=', $request->to_date);
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            return $this->successResponse($query->get(), 'Payments retrieved successfully.');
        }

        $perPage = (int) $request->get('per_page', 15);
        $payments = $query->paginate($perPage);

        return $this->paginatedResponse($payments, 'Payments retrieved successfully.');
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'invoice_id'      => 'required|exists:invoices,id',
            'amount'          => 'required|numeric|min:0.01',
            'payment_method'  => 'required|in:cash,bank,mobile',
            'payment_date'    => 'required|date',
            'discount_amount' => 'nullable|numeric|min:0',
        ]);

        $invoice = Invoice::find($request->invoice_id);

        if ($invoice->payment_status === 'paid') {
            return $this->errorResponse('Invoice is already fully paid.', 422);
        }

        // Validate amount + discount doesn't exceed due amount
        $totalCredit = (float) $request->amount + (float) ($request->discount_amount ?? 0);
        if ($totalCredit > $invoice->due_amount) {
            return $this->errorResponse("Total credit ({$totalCredit}) exceeds the due amount ({$invoice->due_amount}).", 422);
        }

        $user = $request->user();

        return DB::transaction(function () use ($request, $invoice, $user) {
            $payment = $this->paymentService->processPayment($request->all(), $invoice, $user->id);

            AuditLog::record(
                $user->id,
                $user->name,
                'create',
                Payment::class,
                $payment->id,
                null,
                $payment->toArray(),
                "Created payment {$payment->payment_number} for invoice {$invoice->invoice_number}"
            );

            // Trigger Notification Event: Payment Received -> Notify Admins & Salesman
            $this->notificationService->notifyPaymentReceived($payment);

            return $this->createdResponse(
                $payment->load(['customer', 'invoice']),
                "Payment {$payment->payment_number} processed successfully."
            );
        });
    }

    public function voidPayment(int $id, Request $request): JsonResponse
    {
        $payment = Payment::active()->find($id);

        if (!$payment) {
            return $this->notFoundResponse('Payment not found.');
        }

        $user = $request->user();

        return DB::transaction(function () use ($payment, $user) {
            $oldSnapshot = $payment->toArray();

            $this->paymentService->voidPayment($payment, $user->id);

            AuditLog::record(
                $user->id,
                $user->name,
                'void',
                Payment::class,
                $payment->id,
                $oldSnapshot,
                $payment->fresh()->toArray(),
                "Voided payment {$payment->payment_number}"
            );

            return $this->successResponse(
                $payment->fresh(),
                "Payment {$payment->payment_number} voided successfully."
            );
        });
    }
}
