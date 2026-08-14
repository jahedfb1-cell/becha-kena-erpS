<?php

use App\Http\Controllers\Api\AiAssistController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerCategoryController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ExpenseCategoryController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductSupplierLinkController;
use App\Http\Controllers\Api\ProductVariantController;
use App\Http\Controllers\Api\SupplierController;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\DeliveryChallanController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\AccessSetupController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\VoucherController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\CompanyProfileController;
use App\Http\Controllers\Api\DatabaseBackupController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\UserController;

// Auth Routes
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->name('login');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::put('/profile', [AuthController::class, 'updateProfile']);
        Route::post('/change-password', [AuthController::class, 'changePassword']);
    });
});

// Protected Master Data & Quotation Routes
Route::middleware('auth:sanctum')->group(function () {

    // Helper Route: Preferred Supplier for Product
    Route::get('quotations/preferred-supplier/{productId}', [QuotationController::class, 'preferredSupplier']);

    // Quotations
    Route::prefix('quotations')->group(function () {
        Route::get('/', [QuotationController::class, 'index']);
        Route::post('/', [QuotationController::class, 'store']);
        Route::get('/{id}', [QuotationController::class, 'show']);
        Route::put('/{id}', [QuotationController::class, 'update']);
        Route::delete('/{id}', [QuotationController::class, 'destroy']);
        Route::post('/{id}/restore', [QuotationController::class, 'restore']);

        // Workflow Endpoints
        Route::post('/{id}/convert-to-order', [QuotationController::class, 'convertToOrder']);
        Route::post('/{id}/approve', [QuotationController::class, 'approve']);
        Route::post('/{id}/reject', [QuotationController::class, 'reject']);
    });

    // Invoices
    Route::prefix('invoices')->group(function () {
        Route::get('/', [InvoiceController::class, 'index']);
        Route::post('/generate/{quotationId}', [InvoiceController::class, 'generate']);
        Route::get('/{id}', [InvoiceController::class, 'show']);
        Route::delete('/{id}', [InvoiceController::class, 'destroy']);
        Route::post('/{id}/restore', [InvoiceController::class, 'restore']);
    });

    // Delivery Challans
    Route::prefix('challans')->group(function () {
        Route::post('/generate/{invoiceId}', [DeliveryChallanController::class, 'generate']);
        Route::get('/{id}', [DeliveryChallanController::class, 'show']);
        Route::post('/{id}/approve', [DeliveryChallanController::class, 'approve']);
        Route::post('/{id}/send-email', [DeliveryChallanController::class, 'sendEmail']);
        Route::delete('/{id}', [DeliveryChallanController::class, 'destroy']);
    });

    // Payments
    Route::prefix('payments')->group(function () {
        Route::get('/', [PaymentController::class, 'index']);
        Route::post('/', [PaymentController::class, 'store']);
        Route::get('/{id}/receipt', [PaymentController::class, 'receipt']);
        Route::post('/{id}/void', [PaymentController::class, 'voidPayment']);
        Route::post('/{id}/transfer', [PaymentController::class, 'transferPayment']);
    });

    // AI Assist (New Customer Account) — see AI_Assist_PRD.md
    // Throttled per user: all salesmen share one Gemini key, and the free
    // tier's rate limit is per project, so this caps burst usage.
    Route::prefix('ai')->middleware('throttle:20,1')->group(function () {
        Route::post('/parse-customer', [AiAssistController::class, 'parseCustomer']);
        Route::post('/transcribe', [AiAssistController::class, 'transcribe']);
        Route::post('/log-applied', [AiAssistController::class, 'logApplied']);
    });

    // Audit Logs
    Route::get('/audit-logs', [AuditLogController::class, 'index']);

    // Access Setup / RBAC Matrix
    Route::prefix('access-setup')->group(function () {
        Route::get('/', [AccessSetupController::class, 'index']);
        Route::post('/update', [AccessSetupController::class, 'update']);
    });

    // Users Management
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::post('/', [UserController::class, 'store']);
        Route::put('/{id}', [UserController::class, 'update']);
        Route::delete('/{id}', [UserController::class, 'destroy']);
    });

    // Database Backups
    Route::prefix('database-backup')->group(function () {
        Route::get('/', [DatabaseBackupController::class, 'index']);
        Route::post('/generate', [DatabaseBackupController::class, 'generate']);
        Route::get('/download/{filename}', [DatabaseBackupController::class, 'download']);
        Route::post('/restore/{filename}', [DatabaseBackupController::class, 'restore']);
        Route::delete('/{filename}', [DatabaseBackupController::class, 'destroy']);
    });

    // Central Settings Hub
    Route::prefix('settings')->group(function () {
        Route::get('/summary', [SettingController::class, 'summary']);
        
        // Units
        Route::get('/units', [SettingController::class, 'getUnits']);
        Route::post('/units', [SettingController::class, 'storeUnit']);
        Route::put('/units/{id}', [SettingController::class, 'updateUnit']);
        Route::delete('/units/{id}', [SettingController::class, 'deleteUnit']);
        
        // Bank Accounts
        Route::get('/bank-accounts', [SettingController::class, 'getBankAccounts']);
        Route::post('/bank-accounts', [SettingController::class, 'storeBankAccount']);
        Route::delete('/bank-accounts/{id}', [SettingController::class, 'deleteBankAccount']);
        
        // Mobile Accounts
        Route::get('/mobile-accounts', [SettingController::class, 'getMobileAccounts']);
        Route::post('/mobile-accounts', [SettingController::class, 'storeMobileAccount']);
        Route::delete('/mobile-accounts/{id}', [SettingController::class, 'deleteMobileAccount']);
        
        // Balance Transfers
        Route::get('/balance-transfers', [SettingController::class, 'getBalanceTransfers']);
        Route::post('/balance-transfers', [SettingController::class, 'storeBalanceTransfer']);

        // Departments
        Route::get('/departments', [SettingController::class, 'getDepartments']);
        Route::post('/departments', [SettingController::class, 'storeDepartment']);
        Route::delete('/departments/{id}', [SettingController::class, 'deleteDepartment']);
    });

    // Purchases & Supplier Ledger
    Route::prefix('purchases')->group(function () {
        Route::get('/', [PurchaseController::class, 'index']);
        Route::get('/{id}', [PurchaseController::class, 'show']);
        Route::post('/supplier-payment', [PurchaseController::class, 'recordSupplierPayment']);
        Route::post('/mark-received', [PurchaseController::class, 'markReceived']);
    });

    // Expenses & Expense Categories
    Route::prefix('expenses')->group(function () {
        Route::get('/', [ExpenseController::class, 'index']);
        Route::post('/', [ExpenseController::class, 'store']);
        Route::delete('/{id}', [ExpenseController::class, 'destroy']);
    });
    Route::prefix('master/expense-categories')->group(function () {
        Route::get('/', [ExpenseCategoryController::class, 'index']);
        Route::post('/', [ExpenseCategoryController::class, 'store']);
        Route::put('/{id}', [ExpenseCategoryController::class, 'update']);
        Route::delete('/{id}', [ExpenseCategoryController::class, 'destroy']);
    });

    // Vouchers (Debit / Credit / Journal)
    Route::prefix('vouchers')->group(function () {
        Route::get('/', [VoucherController::class, 'index']);
        Route::post('/', [VoucherController::class, 'store']);
        Route::delete('/{id}', [VoucherController::class, 'destroy']);
    });

    // Notifications & User Settings (Section 9)
    Route::prefix('notifications')->group(function () {
        Route::get('/', [NotificationController::class, 'index']);
        Route::post('/{id}/read', [NotificationController::class, 'markAsRead']);
        Route::post('/read-all', [NotificationController::class, 'markAllAsRead']);
    });
    Route::get('/notification-settings', [NotificationController::class, 'getSettings']);
    Route::put('/notification-settings', [NotificationController::class, 'updateSettings']);

    // 1. Customer Categories
    Route::prefix('master/customer-categories')->group(function () {
        Route::get('/', [CustomerCategoryController::class, 'index']);
        Route::post('/', [CustomerCategoryController::class, 'store']);
        Route::put('/{id}', [CustomerCategoryController::class, 'update']);
        Route::delete('/{id}', [CustomerCategoryController::class, 'destroy']);
        Route::post('/{id}/restore', [CustomerCategoryController::class, 'restore']);
    });

    // 2. Customers
    Route::prefix('customers')->group(function () {
        Route::get('/', [CustomerController::class, 'index']);
        Route::post('/', [CustomerController::class, 'store']);
        Route::get('/{id}', [CustomerController::class, 'show']);
        Route::put('/{id}', [CustomerController::class, 'update']);
        Route::delete('/{id}', [CustomerController::class, 'destroy']);
        Route::post('/{id}/restore', [CustomerController::class, 'restore']);
    });

    // 3. Suppliers
    Route::prefix('suppliers')->group(function () {
        Route::get('/', [SupplierController::class, 'index']);
        Route::post('/', [SupplierController::class, 'store']);
        Route::get('/{id}', [SupplierController::class, 'show']);
        Route::put('/{id}', [SupplierController::class, 'update']);
        Route::delete('/{id}', [SupplierController::class, 'destroy']);
        Route::post('/{id}/restore', [SupplierController::class, 'restore']);
    });

    // 4. Products
    Route::prefix('products')->group(function () {
        Route::get('/', [ProductController::class, 'index']);
        Route::post('/', [ProductController::class, 'store']);
        Route::get('/{id}', [ProductController::class, 'show']);
        Route::put('/{id}', [ProductController::class, 'update']);
        Route::delete('/{id}', [ProductController::class, 'destroy']);
        Route::post('/{id}/restore', [ProductController::class, 'restore']);

        // 5. Product Variants
        Route::get('/{id}/variants', [ProductVariantController::class, 'index']);
        Route::post('/{id}/variants', [ProductVariantController::class, 'store']);
        Route::put('/{productId}/variants/{id}', [ProductVariantController::class, 'update']);
        Route::delete('/{productId}/variants/{id}', [ProductVariantController::class, 'destroy']);

        // 6. Product-Supplier Links
        Route::get('/{id}/suppliers', [ProductSupplierLinkController::class, 'index']);
        Route::post('/{id}/suppliers', [ProductSupplierLinkController::class, 'store']);
        Route::put('/{productId}/suppliers/{id}', [ProductSupplierLinkController::class, 'update']);
        Route::delete('/{productId}/suppliers/{id}', [ProductSupplierLinkController::class, 'destroy']);
    });

    // 7. Product Categories
    Route::prefix('master/product-categories')->group(function () {
        Route::get('/', [ProductCategoryController::class, 'index']);
        Route::post('/', [ProductCategoryController::class, 'store']);
        Route::put('/{id}', [ProductCategoryController::class, 'update']);
        Route::delete('/{id}', [ProductCategoryController::class, 'destroy']);
    });

    // Company Profile & Pipeline Mode Settings
    Route::get('/company-profile', [CompanyProfileController::class, 'show']);
    Route::post('/company-profile', [CompanyProfileController::class, 'update']);
    Route::get('/company-profile/logo/{filename}', [CompanyProfileController::class, 'getLogoFile']);
    Route::get('/settings/pipeline-mode', [SettingController::class, 'getPipelineMode']);
    Route::post('/settings/pipeline-mode', [SettingController::class, 'updatePipelineMode']);

    // Master Reports API Endpoints (Section 13.13)
    Route::prefix('reports')->group(function () {
        // Master Overview (Populates all 22 report cards)
        Route::get('/overview', [ReportController::class, 'overview']);
        Route::get('/dashboard-stats', [ReportController::class, 'dashboardStats']);

        // Sales & Salesperson
        Route::get('/sales', [ReportController::class, 'sales']);
        Route::get('/salesperson-performance', [ReportController::class, 'salespersonPerformance']);
        Route::get('/salesperson-dues', [ReportController::class, 'salespersonDues']);
        Route::get('/order-conversion', [ReportController::class, 'orderConversion']);
        Route::get('/sales-convenience', [ReportController::class, 'salesConvenience']);

        // Purchase & Supplier
        Route::get('/purchase', [ReportController::class, 'purchase']);
        Route::get('/supplier-dues', [ReportController::class, 'supplierDues']);
        Route::get('/supplier-ledger', [ReportController::class, 'supplierLedger']);

        // Dues & Collection
        Route::get('/sales-due', [ReportController::class, 'salesDue']);
        Route::get('/collection-history', [ReportController::class, 'collectionHistory']);

        // Profit/Loss & Dashboard
        Route::get('/profit-loss', [ReportController::class, 'profitLoss']);
        Route::get('/daily', [ReportController::class, 'daily']);
        Route::get('/expenses-vouchers', [ReportController::class, 'expensesVouchers']);

        // Master Data & Stock
        Route::get('/customer-report', [ReportController::class, 'customerReport']);
        Route::get('/customer-ledger', [ReportController::class, 'customerLedger']);
        Route::get('/stock-summary', [ReportController::class, 'stockSummary']);

        // Books Statements
        Route::get('/cash-book', [ReportController::class, 'cashBook']);
        Route::get('/bank-book', [ReportController::class, 'bankBook']);
        Route::get('/mobile-book', [ReportController::class, 'mobileBook']);
    });
});
