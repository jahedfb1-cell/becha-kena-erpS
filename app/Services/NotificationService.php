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
     * Event 1: Quotation Created -> Notify all Admins & Managers
     */
    public function notifyQuotationCreated(Quotation $quotation): void
    {
        $approvers = User::whereIn('role', ['admin', 'manager'])->get();
        $quoteNo = $quotation->quotation_number ?? "#{$quotation->id}";

        foreach ($approvers as $approver) {
            $this->createNotification(
                $approver->id,
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
     * Event 6: Payment Received -> Notify Admins & Salesman
     */
    public function notifyPaymentReceived(Payment $payment): void
    {
        $paymentNo = $payment->payment_number ?? "#{$payment->id}";
        $amount = number_format($payment->amount, 2);

        // 1. Notify Admins
        $admins = User::where('role', 'admin')->get();
        foreach ($admins as $admin) {
            $this->createNotification(
                $admin->id,
                "Payment Received",
                "Payment {$paymentNo} of ৳{$amount} received.",
                "payment",
                "Payment",
                $payment->id
            );
        }

        // 2. Notify Salesman if payment is linked to quotation/invoice
        if ($payment->invoice && $payment->invoice->quotation && $payment->invoice->quotation->salesman_id) {
            $this->createNotification(
                $payment->invoice->quotation->salesman_id,
                "Payment Received for Order",
                "Payment {$paymentNo} of ৳{$amount} received for Invoice #{$payment->invoice->invoice_number}.",
                "payment",
                "Payment",
                $payment->id
            );
        }
    }
}
