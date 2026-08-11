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

    public function receipt(int $id): JsonResponse
    {
        $payment = Payment::with([
            'customer',
            'invoice.customer',
            'invoice.quotation.items.product',
            'invoice.quotation.items.variant',
        ])->find($id);

        if (!$payment) {
            return $this->notFoundResponse('Payment not found.');
        }

        return $this->successResponse($payment, 'Payment receipt data retrieved.');
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
    public function transferPayment(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'new_invoice_id' => 'required|exists:invoices,id',
            'reason'         => 'nullable|string|max:500',
        ]);

        $payment = Payment::active()->with(['invoice', 'customer'])->find($id);

        if (!$payment) {
            return $this->notFoundResponse('Payment not found.');
        }

        $newInvoice = Invoice::find($request->new_invoice_id);

        if (!$newInvoice) {
            return $this->notFoundResponse('Target invoice not found.');
        }

        if ($newInvoice->id === $payment->invoice_id) {
            return $this->errorResponse('Target invoice is the same as the current invoice.', 422);
        }

        if ($newInvoice->payment_status === 'paid') {
            return $this->errorResponse('Target invoice is already fully paid.', 422);
        }

        // Check: payment amount must not exceed target invoice due amount
        $transferAmount = (float) $payment->amount;
        if ($transferAmount > (float) $newInvoice->due_amount) {
            return $this->errorResponse(
                "Transfer amount ({$transferAmount}) exceeds the target invoice due amount ({$newInvoice->due_amount}).",
                422
            );
        }

        $user = $request->user();

        return DB::transaction(function () use ($payment, $newInvoice, $user, $request) {
            $oldInvoiceNumber  = $payment->invoice?->invoice_number ?? 'N/A';
            $oldPaymentNumber  = $payment->payment_number;
            $oldSnapshot       = $payment->toArray();

            $newPayment = $this->paymentService->transferPayment(
                $payment,
                $newInvoice,
                $user->id,
                $request->reason ?? ''
            );

            AuditLog::record(
                $user->id,
                $user->name,
                'transfer',
                Payment::class,
                $newPayment->id,
                $oldSnapshot,
                $newPayment->toArray(),
                "Transferred payment {$oldPaymentNumber} from invoice {$oldInvoiceNumber} to invoice {$newInvoice->invoice_number}. New payment: {$newPayment->payment_number}"
            );

            // Notify about the transfer
            $this->notificationService->notifyPaymentReceived($newPayment);

            return $this->successResponse(
                $newPayment->load(['customer', 'invoice']),
                "Payment transferred successfully. New payment: {$newPayment->payment_number}"
            );
        });
    }
}
