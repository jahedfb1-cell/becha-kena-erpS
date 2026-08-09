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
        $user = $request->user();
        $query = Payment::with(['customer:id,name,phone', 'invoice:id,invoice_number']);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        // Role-based visibility (payments have no direct salesman_id, so scope
        // via the invoice they belong to — mirrors InvoiceController::index)
        $isAdmin = $user->role === 'admin' || (method_exists($user, 'hasRole') && $user->hasRole('admin'));
        $isSalesman = in_array($user->role, ['salesman', 'staff']) || (method_exists($user, 'hasRole') && ($user->hasRole('salesman') || $user->hasRole('staff')));
        $isManager = $user->role === 'manager' || (method_exists($user, 'hasRole') && $user->hasRole('manager'));

        if ($isAdmin) {
            // Admin sees all payments
        } elseif ($isSalesman) {
            $query->whereHas('invoice', fn ($q) => $q->where('salesman_id', $user->id));
        } elseif ($isManager) {
            $teamUserIds = \App\Models\User::where('manager_id', $user->id)->pluck('id')->push($user->id);
            $query->whereHas('invoice', fn ($q) => $q->whereIn('salesman_id', $teamUserIds));
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
            // Required so the bank/mobile book-entry (which has a NOT NULL
            // bank_name/provider column) never fails at the database level.
            'bank_name'       => 'required_if:payment_method,bank|string|max:100',
            'mobile_provider' => 'required_if:payment_method,mobile|string|max:100',
            'collection_channel' => 'nullable|in:office,field_technician',
            'collected_by_name'  => 'required_if:collection_channel,field_technician|nullable|string|max:100',
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

        // Classify before/after this payment so the notification can say
        // "Advance" / "Partial" / "Full" / "Final Settlement" instead of a
        // generic "Payment Received" for every entry.
        $previousStatus = $invoice->payment_status;

        return DB::transaction(function () use ($request, $invoice, $user, $previousStatus) {
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

            $invoice->refresh();
            $isNowPaid = $invoice->payment_status === 'paid';
            $classification = $previousStatus === 'unpaid'
                ? ($isNowPaid ? 'Full Payment' : 'Advance Payment')
                : ($isNowPaid ? 'Final Settlement' : 'Partial Payment');

            // Trigger Notification Event: direction-aware (see NotificationService::notifyPaymentEvent)
            $this->notificationService->notifyPaymentEvent($payment, $classification, $user);

            return $this->createdResponse(
                $payment->load(['customer', 'invoice']),
                "Payment {$payment->payment_number} processed successfully."
            );
        });
    }

    /**
     * Accounts/Manager marks a bank-cheque payment as cleared or bounced.
     * The salesman is only notified of a received payment at this point for
     * bank/cheque payments (see NotificationService::notifyPaymentEvent).
     */
    public function clearCheque(int $id, Request $request): JsonResponse
    {
        if (!$request->user()->can('payments:clear-cheque')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $request->validate([
            'status' => 'required|in:cleared,bounced',
        ]);

        $payment = Payment::active()->find($id);
        if (!$payment) {
            return $this->notFoundResponse('Payment not found.');
        }

        if ($payment->payment_method !== 'bank') {
            return $this->errorResponse('Only bank/cheque payments have a clearance status.', 422);
        }

        if ($payment->cheque_status !== 'pending') {
            return $this->errorResponse("This cheque is already marked '{$payment->cheque_status}'.", 422);
        }

        $user = $request->user();
        $oldSnapshot = $payment->toArray();

        $payment->cheque_status = $request->status;
        $payment->save();

        AuditLog::record(
            $user->id,
            $user->name,
            'update',
            Payment::class,
            $payment->id,
            $oldSnapshot,
            $payment->toArray(),
            "Marked cheque #{$payment->cheque_number} as {$request->status} for payment {$payment->payment_number}"
        );

        if ($request->status === 'cleared') {
            $invoice = $payment->invoice;
            $classification = $invoice && $invoice->payment_status === 'paid' ? 'Final Settlement' : 'Payment';
            $this->notificationService->notifyChequeCleared($payment, $classification);
        } else {
            $this->notificationService->notifyChequeBounced($payment);
        }

        return $this->successResponse($payment->fresh(), "Cheque marked as {$request->status}.");
    }

    public function voidPayment(int $id, Request $request): JsonResponse
    {
        if (!$request->user()->can('payments:void')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

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
