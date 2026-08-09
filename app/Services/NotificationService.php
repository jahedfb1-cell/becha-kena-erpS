<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\NotificationSetting;
use App\Models\User;
use App\Models\Quotation;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    /**
     * Core method to dispatch an in-app notification and check Email/SMS preferences.
     */
    public function createNotification($userId, string $title, string $message, string $type, string $referenceType = null, $referenceId = null): ?Notification
    {
        if (!$userId) {
            return null;
        }

        // 1. In-App Notification (Always Enabled / Non-Optional)
        $notification = Notification::create([
            'user_id'        => $userId,
            'title'          => $title,
            'message'        => $message,
            'type'           => $type,
            'reference_type' => $referenceType,
            'reference_id'   => $referenceId,
            'is_read'        => false,
        ]);

        // 2. Check User Email & SMS Notification Preferences
        $settings = NotificationSetting::where('user_id', $userId)->first();
        $emailEnabled = $settings ? $settings->email_enabled : true;
        $smsEnabled   = $settings ? $settings->sms_enabled : false;

        if ($emailEnabled) {
            // Mock / Queue Email Notification
            Log::info("Email Notification sent to User #{$userId}: [{$title}] {$message}");
        }

        if ($smsEnabled) {
            // Mock / Queue SMS Notification
            Log::info("SMS Notification sent to User #{$userId}: [{$title}] {$message}");
        }

        return $notification;
    }

    /**
     * Event 1: Quotation Created -> Notify all Admins
     */
    public function notifyQuotationCreated(Quotation $quotation): void
    {
        $admins = User::where('role', 'admin')->get();
        $quoteNo = $quotation->quotation_number ?? "#{$quotation->id}";

        foreach ($admins as $admin) {
            $this->createNotification(
                $admin->id,
                "New Quotation Created",
                "Quotation {$quoteNo} has been created.",
                "quotation",
                "Quotation",
                $quotation->id
            );
        }
    }

    /**
     * Event 2: Order Approved / Rejected -> Notify Salesman + Linked Suppliers
     */
    public function notifyOrderApprovedOrRejected(Quotation $quotation, string $status): void
    {
        $quoteNo = $quotation->quotation_number ?? "#{$quotation->id}";
        $action = ucfirst($status); // Approved / Rejected

        // 1. Notify Salesman assigned to quotation
        if ($quotation->salesman_id) {
            $this->createNotification(
                $quotation->salesman_id,
                "Order {$action}",
                "Order {$quoteNo} has been {$status}.",
                "order",
                "Quotation",
                $quotation->id
            );
        }

        // 2. Notify linked suppliers for items in this quotation
        $quotation->loadMissing('items.product.supplierLinks.supplier');
        $notifiedSupplierIds = [];

        foreach ($quotation->items as $item) {
            $supplierId = $item->supplier_id;
            if (!$supplierId && $item->product) {
                $supplierLinksCollection = $item->product->supplierLinks;
                $priorityLink = $supplierLinksCollection ? $supplierLinksCollection->firstWhere('priority_rank', 1) : null;
                $supplierId = $priorityLink ? $priorityLink->supplier_id : null;
            }

            if ($supplierId && !in_array($supplierId, $notifiedSupplierIds)) {
                $notifiedSupplierIds[] = $supplierId;
                // Check if supplier has a user account
                $supplierUser = User::where('email', 'like', '%supplier%')->first();
                if ($supplierUser) {
                    $this->createNotification(
                        $supplierUser->id,
                        "Order {$action}",
                        "Order {$quoteNo} containing your supplied items has been {$status}.",
                        "order",
                        "Quotation",
                        $quotation->id
                    );
                }
            }
        }
    }

    /**
     * Event 3: Order Supplier-routed -> Notify specific Supplier
     */
    public function notifyOrderRoutedToSupplier($supplierId, $purchaseEntryOrOrder): void
    {
        if (!$supplierId) return;

        $supplierUser = User::where('email', 'like', '%supplier%')->first();
        if ($supplierUser) {
            $this->createNotification(
                $supplierUser->id,
                "New Order Routed",
                "A new purchase order has been routed to you.",
                "order",
                "PurchaseEntry",
                $purchaseEntryOrOrder->id ?? null
            );
        }
    }

    /**
     * Event 4: Supplier status update -> Notify Salesman & Admins
     */
    public function notifySupplierStatusUpdate($supplierId, $orderId, string $status): void
    {
        $admins = User::where('role', 'admin')->get();
        foreach ($admins as $admin) {
            $this->createNotification(
                $admin->id,
                "Supplier Status Updated",
                "Supplier updated status for Order #{$orderId} to '{$status}'.",
                "order",
                "Quotation",
                $orderId
            );
        }
    }

    /**
     * Event 5: Invoice Generated -> Notify Customer
     */
    public function notifyInvoiceGenerated(Invoice $invoice): void
    {
        $invoiceNo = $invoice->invoice_number ?? "#{$invoice->id}";
        
        // Find customer user account if exists
        $customerUser = User::where('email', 'like', '%customer%')->first();
        if ($customerUser) {
            $this->createNotification(
                $customerUser->id,
                "Invoice Generated",
                "Your Invoice {$invoiceNo} has been generated for amount ৳" . number_format($invoice->net_amount, 2),
                "invoice",
                "Invoice",
                $invoice->id
            );
        }
    }

    /**
     * Event 6: Payment Entered -> direction-aware notification.
     *
     * The recipient depends on WHO entered the payment, so nobody gets
     * notified about their own action:
     *  - Salesman enters an advance/partial/full payment on their own order
     *    -> notify Accounts (admin + manager roles), so they know money
     *    came in and needs to be reconciled/banked.
     *  - Accounts/Manager enters a payment (confirming cash in hand, a
     *    mobile transfer, or logging what a field technician collected at
     *    the customer's site) -> notify the order's salesman that the
     *    customer's payment was received. Bank/cheque payments are the one
     *    exception: the salesman isn't told yet (cheque_status=pending) -
     *    that notification fires later from clearCheque() once the cheque
     *    actually clears, per the "cq pass hoile" requirement.
     *
     * $classification is one of: 'Advance Payment', 'Partial Payment',
     * 'Full Payment', 'Final Settlement' - computed by the caller from the
     * invoice's payment_status before/after this payment.
     */
    public function notifyPaymentEvent(Payment $payment, string $classification, User $actor): void
    {
        $quotation = $payment->invoice?->quotation;
        $salesmanId = $quotation?->salesman_id;
        $orderNo = $quotation?->quotation_number ?? ($payment->invoice ? "Invoice #{$payment->invoice->invoice_number}" : "#{$payment->id}");
        $amount = number_format($payment->amount, 2);
        $paymentNo = $payment->payment_number ?? "#{$payment->id}";

        $isActorSalesman = $actor->role === 'salesman' || (method_exists($actor, 'hasRole') && $actor->hasRole('salesman'));

        if ($isActorSalesman) {
            // Flow A: salesman recorded it -> tell accounts (admin + manager),
            // skipping the actor themselves (a salesman is never also an
            // admin/manager here, but this guard keeps it safe either way).
            $accountsUsers = User::whereIn('role', ['admin', 'manager'])->where('id', '!=', $actor->id)->get();
            foreach ($accountsUsers as $user) {
                $this->createNotification(
                    $user->id,
                    "{$classification} Entered",
                    "{$actor->name} recorded a {$classification} of ৳{$amount} ({$paymentNo}) for Order {$orderNo}.",
                    "payment",
                    "Payment",
                    $payment->id
                );
            }
            return;
        }

        // Flow B: accounts/manager (or staff) entered it - this represents
        // confirmed receipt, whether handed in at the office or collected by
        // a technician on-site.
        if ($payment->payment_method === 'bank') {
            // Cheque payments wait for clearCheque() before the salesman is told.
            return;
        }

        if ($salesmanId && $salesmanId !== $actor->id) {
            $source = $payment->collection_channel === 'field_technician'
                ? " (collected on-site by {$payment->collected_by_name})"
                : '';
            $this->createNotification(
                $salesmanId,
                "{$classification} Received",
                "{$classification} of ৳{$amount} received for Order {$orderNo}{$source}.",
                "payment",
                "Payment",
                $payment->id
            );
        }
    }

    /**
     * Event 7: Cheque cleared -> now tell the salesman their customer's
     * payment actually came through (mirrors Flow B above, deferred until
     * clearance instead of firing at entry time).
     */
    public function notifyChequeCleared(Payment $payment, string $classification): void
    {
        $quotation = $payment->invoice?->quotation;
        $salesmanId = $quotation?->salesman_id;
        if (!$salesmanId) {
            return;
        }

        $orderNo = $quotation?->quotation_number ?? "Invoice #{$payment->invoice->invoice_number}";
        $amount = number_format($payment->amount, 2);

        $this->createNotification(
            $salesmanId,
            "{$classification} Received (Cheque Cleared)",
            "Cheque #{$payment->cheque_number} of ৳{$amount} for Order {$orderNo} has cleared.",
            "payment",
            "Payment",
            $payment->id
        );
    }

    /**
     * Event 8: Cheque bounced -> alert accounts + the salesman so the order
     * doesn't stay marked as paid.
     */
    public function notifyChequeBounced(Payment $payment): void
    {
        $quotation = $payment->invoice?->quotation;
        $orderNo = $quotation?->quotation_number ?? ($payment->invoice ? "Invoice #{$payment->invoice->invoice_number}" : "#{$payment->id}");
        $amount = number_format($payment->amount, 2);

        $recipients = User::whereIn('role', ['admin', 'manager'])->get();
        if ($quotation?->salesman_id) {
            $recipients->push(User::find($quotation->salesman_id));
        }

        foreach ($recipients->filter()->unique('id') as $user) {
            $this->createNotification(
                $user->id,
                "Cheque Bounced",
                "Cheque #{$payment->cheque_number} of ৳{$amount} for Order {$orderNo} has bounced. Please follow up with the customer.",
                "payment",
                "Payment",
                $payment->id
            );
        }
    }
}
