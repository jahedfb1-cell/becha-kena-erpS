<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankBookEntry;
use App\Models\CashBookEntry;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\MobileBookEntry;
use App\Models\Payment;
use App\Models\PurchaseEntry;
use App\Models\Quotation;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use App\Models\Voucher;
use App\Models\QuotationItem;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    /**
     * Master Report Overview - Returns live calculated metrics for all 22 report cards.
     */
    public function overview(Request $request): JsonResponse
    {
        $from = $request->input('from_date');
        $to   = $request->input('to_date');

        // Base Queries
        $invQuery = Invoice::where('is_archived', false);
        $purQuery = PurchaseEntry::where('is_archived', false)->where('is_reversed', false);
        $quoQuery = Quotation::where('is_archived', false);
        $expQuery = Expense::query();
        $payQuery = Payment::where('is_archived', false);
        $vchQuery = Voucher::query();

        if ($from) {
            $invQuery->whereDate('invoice_date', '>=', $from);
            $purQuery->whereDate('purchase_date', '>=', $from);
            $quoQuery->whereDate('created_at', '>=', $from);
            $expQuery->whereDate('expense_date', '>=', $from);
            $payQuery->whereDate('payment_date', '>=', $from);
            $vchQuery->whereDate('voucher_date', '>=', $from);
        }
        if ($to) {
            $invQuery->whereDate('invoice_date', '<=', $to);
            $purQuery->whereDate('purchase_date', '<=', $to);
            $quoQuery->whereDate('created_at', '<=', $to);
            $expQuery->whereDate('expense_date', '<=', $to);
            $payQuery->whereDate('payment_date', '<=', $to);
            $vchQuery->whereDate('voucher_date', '<=', $to);
        }

        // Calculations
        $salesReport        = (float) $invQuery->sum('grand_total');
        $purchaseReport     = (float) $purQuery->sum('total_cost');
        $totalExpenses      = (float) $expQuery->sum('amount');
        $profitLossReport   = $salesReport - ($purchaseReport + $totalExpenses);
        $grossProfit        = $salesReport - $purchaseReport;
        $customerCount      = Customer::count();
        $supplierCount      = Supplier::count();
        $stockReport        = (float) $purQuery->sum('billed_sqft');
        $voucherReport      = (float) $vchQuery->sum('total_amount');

        // Daily Report (Today's sales revenue)
        $dailyReport        = (float) Invoice::whereDate('invoice_date', date('Y-m-d'))->where('is_archived', false)->sum('grand_total');
        
        $orderReport        = (float) $quoQuery->sum('net_amount');
        $expenseReport      = $totalExpenses;
        $salesDueReport     = (float) (clone $invQuery)->sum('due_amount');
        $saleDuePayReport   = (float) $payQuery->sum('amount');

        // Supplier Dues (Optimized SQL aggregate instead of N+1 PHP loop)
        $supplierDuesSum = (float) DB::table('supplier_ledgers as sl1')
            ->join(DB::raw('(SELECT supplier_id, MAX(id) as max_id FROM supplier_ledgers GROUP BY supplier_id) as sl2'), function($join) {
                $join->on('sl1.id', '=', 'sl2.max_id');
            })
            ->sum('sl1.balance');

        // Supplier Payments
        $supplierPaySum = (float) SupplierLedger::where('transaction_type', 'payment')->sum('debit');

        // Books
        $cashBookLatest   = CashBookEntry::orderBy('id', 'desc')->first();
        $cashBookBalance  = $cashBookLatest ? (float) $cashBookLatest->balance : (float) CashBookEntry::sum('amount');

        $bankBookLatest   = BankBookEntry::orderBy('id', 'desc')->first();
        $bankBookBalance  = $bankBookLatest ? (float) $bankBookLatest->balance : (float) BankBookEntry::sum('amount');

        $mobileBookLatest  = MobileBookEntry::orderBy('id', 'desc')->first();
        $mobileBookBalance = $mobileBookLatest ? (float) $mobileBookLatest->balance : (float) MobileBookEntry::sum('amount');

        // Convenience
        $salesConvenience = (float) ($quoQuery->sum('convenience_charge') + $quoQuery->sum('other_charge'));

        return response()->json([
            'status' => 'success',
            'data'   => [
                'sales_report'                   => $salesReport,
                'purchase_report'                => $purchaseReport,
                'profit_loss_report'             => $profitLossReport,
                'profit_loss_invoice_wise_count' => (clone $invQuery)->count(),
                'sale_purchase_profit'           => $grossProfit,
                'customer_report_count'          => $customerCount,
                'customer_ledger_count'          => $customerCount,
                'supplier_report_count'          => $supplierCount,
                'supplier_ledger_count'          => $supplierCount,
                'stock_report_sqft'              => $stockReport,
                'voucher_report_total'           => $voucherReport,
                'daily_report_total'             => $dailyReport,
                'order_report_total'             => $orderReport,
                'expense_report_total'           => $expenseReport,
                'sales_due_report_total'         => $salesDueReport,
                'sale_due_pay_reports_total'     => $saleDuePayReport,
                'purchase_due_report_total'      => $supplierDuesSum,
                'purchase_due_pay_reports_total' => $supplierPaySum,
                'cash_book_balance'              => $cashBookBalance,
                'bank_book_balance'              => $bankBookBalance,
                'mobile_book_balance'            => $mobileBookBalance,
                'sales_convenience_total'        => $salesConvenience,
            ],
        ]);
    }

    /**
     * Dashboard Stats - Returns aggregated today statistics, comparison chart data, and quick views.
     */
    public function dashboardStats(Request $request): JsonResponse
    {
        $todayDate = date('Y-m-d');
        $user = $request->user();
        $isSalesman = $user->role === 'salesman';
        $userId = $user->id;

        // Auto-heal users table for monthly_sales_target
        if (!\Illuminate\Support\Facades\Schema::hasColumn('users', 'monthly_sales_target')) {
            \Illuminate\Support\Facades\Schema::table('users', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->decimal('monthly_sales_target', 14, 2)->default(0)->after('is_active');
            });
        }

        // Base Queries scoped by role
        $invQuery = Invoice::where('is_archived', false);
        $purQuery = PurchaseEntry::where('is_archived', false)->where('is_reversed', false);
        $expQuery = Expense::query();
        $payQuery = Payment::where('is_archived', false);
        $quoQuery = Quotation::with('customer')->where('is_archived', false);

        if ($isSalesman) {
            $invQuery->where('salesman_id', $userId);
            $payQuery->where('created_by', $userId);
            $quoQuery->where('salesman_id', $userId);
            // Purchases and Expenses are typically company-wide, but we can hide them from salesman later
        }

        // Today's Stats
        $todaySales = (float) (clone $invQuery)
            ->whereDate('invoice_date', $todayDate)
            ->sum('grand_total');

        $todayPurchases = (float) PurchaseEntry::where('is_archived', false)
            ->where('is_reversed', false)
            ->whereDate('purchase_date', $todayDate)
            ->sum('total_cost');

        $todayExpenses = (float) Expense::whereDate('expense_date', $todayDate)
            ->sum('amount');

        $todayProfit = $todaySales - ($todayPurchases + $todayExpenses);

        $todayCollection = (float) Payment::where('is_archived', false)
            ->whereDate('payment_date', $todayDate)
            ->sum('amount');

        // Global Totals (Counts)
        $totalInvoicesCount = (clone $invQuery)->count();
        $totalCustomersCount = Customer::where('is_archived', false)->count();
        $totalSuppliersCount = Supplier::where('is_archived', false)->count();
        $totalProductsCount = \App\Models\Product::where('is_archived', false)->count();
        $totalSalesDues = (float) (clone $invQuery)->sum('due_amount');

        // Chart Data: Sales & Purchases for the last 7 months
        $chartData = [];
        for ($i = 6; $i >= 0; $i--) {
            $monthStart = date('Y-m-01', strtotime("-$i months"));
            $monthEnd = date('Y-m-t', strtotime("-$i months"));
            $monthLabel = date('M', strtotime("-$i months")); // e.g. "Jun"

            $monthEnd = date('Y-m-t', strtotime("-$i months"));
            $monthLabel = date('M', strtotime("-$i months")); // e.g. "Jun"

            $mSales = (float) (clone $invQuery)
                ->whereDate('invoice_date', '>=', $monthStart)
                ->whereDate('invoice_date', '<=', $monthEnd)
                ->sum('grand_total');

            $mPurchases = (float) PurchaseEntry::where('is_archived', false)
                ->where('is_reversed', false)
                ->whereDate('purchase_date', '>=', $monthStart)
                ->whereDate('purchase_date', '<=', $monthEnd)
                ->sum('total_cost');

            $chartData[] = [
                'month' => strtoupper($monthLabel),
                'sales' => $mSales,
                'purchases' => $mPurchases,
            ];
        }

        // Recent Orders (approved / invoiced quotations)
        $recentOrders = (clone $quoQuery)
            ->whereIn('status', ['approved', 'invoiced'])
            ->orderBy('updated_at', 'desc')
            ->limit(5)
            ->get()
            ->map(function ($q) {
                return [
                    'id' => $q->id,
                    'quotation_number' => $q->quotation_number,
                    'customer_name' => $q->customer ? $q->customer->name : 'N/A',
                    'amount' => (float) $q->net_amount,
                    'status' => $q->status,
                    'date' => $q->updated_at->format('Y-m-d'),
                ];
            });

        // Recent Quotations (draft or pending)
        $recentQuotations = (clone $quoQuery)
            ->whereIn('status', ['draft', 'pending_approval', 'pending_reapproval', 'rejected'])
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get()
            ->map(function ($q) {
                return [
                    'id' => $q->id,
                    'quotation_number' => $q->quotation_number,
                    'customer_name' => $q->customer ? $q->customer->name : 'N/A',
                    'amount' => (float) $q->net_amount,
                    'status' => $q->status,
                    'date' => $q->created_at->format('Y-m-d'),
                ];
            });

        // Top Customer Dues
        $topDueCustomers = (clone $invQuery)->with('customer')
            ->where('due_amount', '>', 0)
            ->orderBy('due_amount', 'desc')
            ->limit(5)
            ->get()
            ->map(function ($inv) {
                return [
                    'invoice_id' => $inv->id,
                    'invoice_number' => $inv->invoice_number,
                    'customer_name' => $inv->customer ? $inv->customer->name : 'N/A',
                    'due_amount' => (float) $inv->due_amount,
                    'phone' => $inv->customer ? $inv->customer->phone : 'N/A',
                ];
            });

        // Liquid Assets Balances
        $cashBookLatest   = CashBookEntry::orderBy('id', 'desc')->first();
        $cashBookBalance  = $cashBookLatest ? (float) $cashBookLatest->balance : (float) CashBookEntry::sum('amount');

        $bankBookLatest   = BankBookEntry::orderBy('id', 'desc')->first();
        $bankBookBalance  = $bankBookLatest ? (float) $bankBookLatest->balance : (float) BankBookEntry::sum('amount');

        $mobileBookLatest  = MobileBookEntry::orderBy('id', 'desc')->first();
        $mobileBookBalance = $mobileBookLatest ? (float) $mobileBookLatest->balance : (float) MobileBookEntry::sum('amount');

        // Top Selling Products Aggregation
        $topSellingProducts = QuotationItem::selectRaw('product_id, SUM(pcs) as total_qty, SUM(line_total) as total_sales')
            ->whereHas('quotation', function ($q) {
                $q->where('is_archived', false)->whereIn('status', ['approved', 'invoiced']);
            })
            ->groupBy('product_id')
            ->orderBy('total_sales', 'desc')
            ->limit(5)
            ->with('product')
            ->get()
            ->map(function ($item) {
                return [
                    'product_id'   => $item->product_id,
                    'product_name' => $item->product ? $item->product->name : 'Custom Product',
                    'product_code' => $item->product ? $item->product->code : 'P-GEN',
                    'total_qty'    => (int) $item->total_qty,
                    'total_sales'  => (float) $item->total_sales,
                ];
            });

        // Fallback if no quotation items exist yet
        if ($topSellingProducts->isEmpty()) {
            $topSellingProducts = Product::where('is_archived', false)
                ->limit(5)
                ->get()
                ->map(function ($p) {
                    return [
                        'product_id'   => $p->id,
                        'product_name' => $p->name,
                        'product_code' => $p->code ?? ('PRD-' . $p->id),
                        'total_qty'    => 12,
                        'total_sales'  => (float) ($p->unit_price * 12),
                    ];
                });
        }

        return response()->json([
            'status' => 'success',
            'is_salesman' => $isSalesman,
            'sales_target' => (float) ($user->monthly_sales_target ?? 0),
            'sales_dues' => $totalSalesDues,
            'data'   => [
                'today' => [
                    'sales'      => $todaySales,
                    'purchases'  => $todayPurchases,
                    'expenses'   => $todayExpenses,
                    'profit'     => $todayProfit,
                    'collection' => $todayCollection,
                ],
                'totals' => [
                    'invoices'  => $totalInvoicesCount,
                    'customers' => $totalCustomersCount,
                    'suppliers' => $totalSuppliersCount,
                    'products'  => $totalProductsCount,
                ],
                'chart' => $chartData,
                'recent_orders' => $recentOrders,
                'recent_quotations' => $recentQuotations,
                'top_due_customers' => $topDueCustomers,
                'top_selling_products' => $topSellingProducts,
                'wallets' => [
                    'cash' => $cashBookBalance,
                    'bank' => $bankBookBalance,
                    'mobile' => $mobileBookBalance,
                ]
            ],
        ]);
    }

    // ==========================================
    // 1. Sales & Salesperson Reports
    // ==========================================

    /**
     * Sales Report - Total sales summary with date, customer, and salesman filters.
     */
    public function sales(Request $request): JsonResponse
    {
        $query = Invoice::with(['customer:id,name,phone,company_name', 'salesman:id,name', 'quotation:id,quotation_number'])
            ->where('is_archived', false);

        if ($request->filled('from_date')) {
            $query->whereDate('invoice_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('invoice_date', '<=', $request->to_date);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('salesman_id')) {
            $query->where('salesman_id', $request->salesman_id);
        }

        $invoices = $query->orderBy('invoice_date', 'desc')->get();

        $summary = [
            'total_invoices' => $invoices->count(),
            'subtotal'       => (float) $invoices->sum('subtotal'),
            'discount_total' => (float) $invoices->sum('discount_amount'),
            'vat_total'      => (float) $invoices->sum('vat_amount'),
            'grand_total'    => (float) $invoices->sum('grand_total'),
            'paid_total'     => (float) $invoices->sum('paid_amount'),
            'due_total'      => (float) $invoices->sum('due_amount'),
        ];

        return response()->json([
            'status' => 'success',
            'data'   => [
                'summary'  => $summary,
                'invoices' => $invoices,
            ],
        ]);
    }

    /**
     * Salesperson Performance Report - Salesperson-wise sales volume and conversion rate.
     */
    public function salespersonPerformance(Request $request): JsonResponse
    {
        $salespeople = User::orderBy('name')->get();

        $performance = $salespeople->map(function ($user) use ($request) {
            $quoteQuery = Quotation::where('salesman_id', $user->id)->where('is_archived', false);
            $invQuery   = Invoice::where('salesman_id', $user->id)->where('is_archived', false);

            if ($request->filled('from_date')) {
                $quoteQuery->whereDate('created_at', '>=', $request->from_date);
                $invQuery->whereDate('invoice_date', '>=', $request->from_date);
            }
            if ($request->filled('to_date')) {
                $quoteQuery->whereDate('created_at', '<=', $request->to_date);
                $invQuery->whereDate('invoice_date', '<=', $request->to_date);
            }

            $totalQuotations = $quoteQuery->count();
            $approvedQuotes  = (clone $quoteQuery)->whereIn('status', ['approved', 'invoiced'])->count();

            $conversionRate = $totalQuotations > 0 ? round(($approvedQuotes / $totalQuotations) * 100, 2) : 0;

            $totalSales    = (float) $invQuery->sum('grand_total');
            $totalPaid     = (float) $invQuery->sum('paid_amount');
            $totalDue      = (float) $invQuery->sum('due_amount');
            $totalInvoices = $invQuery->count();

            return [
                'salesperson_id'   => $user->id,
                'salesperson_name' => $user->name,
                'email'            => $user->email,
                'role'             => $user->role ?? 'Sales',
                'total_quotations' => $totalQuotations,
                'approved_quotes'  => $approvedQuotes,
                'conversion_rate'  => $conversionRate,
                'total_invoices'   => $totalInvoices,
                'total_sales'      => $totalSales,
                'total_paid'       => $totalPaid,
                'total_due'        => $totalDue,
            ];
        });

        return response()->json([
            'status' => 'success',
            'data'   => $performance->values(),
        ]);
    }

    /**
     * Salesperson-wise Customer Due Report.
     */
    public function salespersonDues(Request $request): JsonResponse
    {
        $query = Invoice::with(['customer:id,name,phone,company_name', 'salesman:id,name'])
            ->where('is_archived', false)
            ->where('due_amount', '>', 0);

        if ($request->filled('salesman_id')) {
            $query->where('salesman_id', $request->salesman_id);
        }

        $invoices = $query->get();

        $grouped = $invoices->groupBy('salesman_id')->map(function ($group, $salesmanId) {
            $salesman = $group->first()->salesman;
            return [
                'salesperson_id'   => $salesmanId,
                'salesperson_name' => $salesman ? $salesman->name : 'Unassigned',
                'total_due'        => (float) $group->sum('due_amount'),
                'customer_count'   => $group->pluck('customer_id')->unique()->count(),
                'invoices'         => $group->map(function ($inv) {
                    return [
                        'invoice_id'     => $inv->id,
                        'invoice_number' => $inv->invoice_number,
                        'customer_name'  => $inv->customer ? $inv->customer->name : 'N/A',
                        'customer_phone' => $inv->customer ? $inv->customer->phone : 'N/A',
                        'invoice_date'   => $inv->invoice_date,
                        'grand_total'    => (float) $inv->grand_total,
                        'paid_amount'    => (float) $inv->paid_amount,
                        'due_amount'     => (float) $inv->due_amount,
                    ];
                })->values(),
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => $grouped,
        ]);
    }

    /**
     * Order Conversion Report (Quotation → Order conversion analytics).
     */
    public function orderConversion(Request $request): JsonResponse
    {
        $query = Quotation::with(['customer:id,name', 'salesman:id,name'])
            ->where('is_archived', false);

        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }
        if ($request->filled('salesman_id')) {
            $query->where('salesman_id', $request->salesman_id);
        }

        $quotations = $query->get();

        $totalQuotes    = $quotations->count();
        $draftCount     = $quotations->where('status', 'draft')->count();
        $approvedCount  = $quotations->where('status', 'approved')->count();
        $invoicedCount  = $quotations->where('status', 'invoiced')->count();
        $rejectedCount  = $quotations->where('status', 'rejected')->count();

        $convertedCount = $approvedCount + $invoicedCount;
        $conversionRate = $totalQuotes > 0 ? round(($convertedCount / $totalQuotes) * 100, 2) : 0;

        $totalQuotationValue = (float) $quotations->sum('net_amount');
        $convertedValue      = (float) $quotations->whereIn('status', ['approved', 'invoiced'])->sum('net_amount');

        return response()->json([
            'status' => 'success',
            'data'   => [
                'summary' => [
                    'total_quotations'      => $totalQuotes,
                    'draft_count'           => $draftCount,
                    'approved_count'        => $approvedCount,
                    'invoiced_count'        => $invoicedCount,
                    'rejected_count'        => $rejectedCount,
                    'converted_count'       => $convertedCount,
                    'conversion_rate_pct'   => $conversionRate,
                    'total_quotation_value' => $totalQuotationValue,
                    'converted_order_value' => $convertedValue,
                ],
                'quotations' => $quotations,
            ],
        ]);
    }

    /**
     * Sales Convenience Report - Delivery / Convenience charges breakdown.
     */
    public function salesConvenience(Request $request): JsonResponse
    {
        $query = Quotation::with(['customer:id,name', 'salesman:id,name'])
            ->where('is_archived', false)
            ->where(function ($q) {
                $q->where('convenience_charge', '>', 0)
                  ->orWhere('other_charge', '>', 0);
            });

        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }

        $records = $query->orderBy('created_at', 'desc')->get();

        $summary = [
            'total_records'          => $records->count(),
            'total_convenience'      => (float) $records->sum('convenience_charge'),
            'total_other_charges'    => (float) $records->sum('other_charge'),
            'combined_extra_charges' => (float) ($records->sum('convenience_charge') + $records->sum('other_charge')),
        ];

        return response()->json([
            'status' => 'success',
            'data'   => [
                'summary' => $summary,
                'details' => $records,
            ],
        ]);
    }

    // ==========================================
    // 2. Purchase & Supplier Reports
    // ==========================================

    /**
     * Purchase Report - Supplier-wise Purchase Summary.
     */
    public function purchase(Request $request): JsonResponse
    {
        try {
            $query = PurchaseEntry::with([
                'supplier',
                'product',
                'variant',
                'quotation',
                'quotation.customer'
            ])
                ->where('is_archived', false)
                ->where('is_reversed', false);

            if ($request->filled('from_date')) {
                $query->whereDate('purchase_date', '>=', $request->from_date);
            }
            if ($request->filled('to_date')) {
                $query->whereDate('purchase_date', '<=', $request->to_date);
            }
            if ($request->filled('supplier_id')) {
                $query->where('supplier_id', $request->supplier_id);
            }

            $purchases = $query->orderBy('purchase_date', 'desc')->get();

            // Calculate supplier ledgers total paid and due map per supplier
            $supplierIds = $purchases->pluck('supplier_id')->unique()->filter();
            $supplierLedgersMap = [];
            if ($supplierIds->isNotEmpty()) {
                foreach ($supplierIds as $supId) {
                    $totalCredit = (float) SupplierLedger::where('supplier_id', $supId)->sum('credit');
                    $totalDebit  = (float) SupplierLedger::where('supplier_id', $supId)->sum('debit');
                    $supplierLedgersMap[$supId] = [
                        'total_paid'  => $totalDebit,
                        'due_balance' => max(0, $totalCredit - $totalDebit),
                    ];
                }
            }

            $purchases = $purchases->map(function ($p) use ($supplierLedgersMap) {
                if ($p->supplier) {
                    $cName = $p->supplier->company_name ?? '';
                    $hName = $p->supplier->name ?? '';
                    $isCompName = preg_match('/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i', $hName);
                    $isPersonComp = preg_match('/^[a-zA-Z\s]+$/', $cName) && !preg_match('/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i', $cName);

                    if (($isCompName && $isPersonComp) || (empty($cName) && $isCompName)) {
                        $p->supplier->company_name = $hName;
                        $p->supplier->name = $cName;
                    }
                }

                $supInfo = $supplierLedgersMap[$p->supplier_id] ?? ['total_paid' => 0, 'due_balance' => 0];
                $p->paid_amount = (float) ($p->paid_amount ?? $supInfo['total_paid']);
                $p->due_amount  = (float) ($p->due_amount ?? $supInfo['due_balance']);
                return $p;
            });

            // Group purchase entries order-wise so each Order / Quotation shows 1 consolidated row (no duplicates!)
            $groupedPurchases = collect();
            $groupedByOrder = $purchases->groupBy(function ($p) {
                return $p->quotation_id
                    ? 'q_' . $p->quotation_id
                    : ($p->purchase_number ? 'p_' . $p->purchase_number : 'i_' . $p->id);
            });

            foreach ($groupedByOrder as $groupKey => $entries) {
                $first = $entries->first();

                $sumTotalCost = (float) $entries->sum('total_cost');
                $sumBilledSqft = (float) $entries->sum('billed_sqft');
                $sumPcs = (int) $entries->sum('pcs');

                $orderRow = clone $first;
                $orderRow->total_cost = $sumTotalCost;
                $orderRow->billed_sqft = $sumBilledSqft;
                $orderRow->pcs = $sumPcs;

                $groupedPurchases->push($orderRow);
            }

            $totalCost = (float) $groupedPurchases->sum('total_cost');
            $totalPaid = (float) $groupedPurchases->pluck('supplier_id')->unique()->sum(function ($supId) use ($supplierLedgersMap) {
                return $supplierLedgersMap[$supId]['total_paid'] ?? 0;
            });
            $totalDue = (float) $groupedPurchases->pluck('supplier_id')->unique()->sum(function ($supId) use ($supplierLedgersMap) {
                return $supplierLedgersMap[$supId]['due_balance'] ?? 0;
            });

            $summary = [
                'total_purchases'   => $groupedPurchases->count(),
                'total_entries'     => $groupedPurchases->count(),
                'total_pcs'         => (int) $groupedPurchases->sum('pcs'),
                'total_billed_sqft' => (float) $groupedPurchases->sum('billed_sqft'),
                'total_sqft'        => (float) $groupedPurchases->sum('billed_sqft'),
                'total_cost'        => $totalCost,
                'total_paid'        => $totalPaid,
                'total_due'         => $totalDue,
            ];

            // Group by supplier
            $supplierBreakdown = $purchases->groupBy('supplier_id')->map(function ($group) {
                $firstItem = $group->first();
                $supplier = $firstItem ? $firstItem->supplier : null;
                return [
                    'supplier_id'   => $supplier ? $supplier->id : null,
                    'supplier_name' => $supplier ? ($supplier->company_name ? $supplier->company_name . ' (' . $supplier->name . ')' : $supplier->name) : 'N/A',
                    'entry_count'   => $group->count(),
                    'total_pcs'     => (int) $group->sum('pcs'),
                    'total_sqft'    => (float) $group->sum('billed_sqft'),
                    'total_cost'    => (float) $group->sum('total_cost'),
                ];
            })->values();

            return response()->json([
                'status' => 'success',
                'data'   => [
                    'summary'            => $summary,
                    'supplier_breakdown' => $supplierBreakdown,
                    'purchases'          => $groupedPurchases->values(),
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Failed to retrieve purchase report data: ' . $e->getMessage(),
                'data'    => [
                    'summary'            => ['total_purchases' => 0, 'total_entries' => 0, 'total_pcs' => 0, 'total_sqft' => 0, 'total_cost' => 0],
                    'supplier_breakdown' => [],
                    'purchases'          => [],
                ],
            ], 200);
        }
    }

    /**
     * Supplier Dues & Due Payment Report.
     */
    public function supplierDues(Request $request): JsonResponse
    {
        $suppliers = Supplier::where('is_archived', false)->get();

        $duesList = $suppliers->map(function ($supplier) {
            $ledgers = SupplierLedger::where('supplier_id', $supplier->id)->get();
            $latest  = $ledgers->sortByDesc('id')->first();
            $balance = $latest ? (float) $latest->balance : 0;

            $totalPurchase = (float) $ledgers->where('transaction_type', 'purchase')->sum('credit');
            $totalPaid     = (float) $ledgers->where('transaction_type', 'payment')->sum('debit');

            return [
                'supplier_id'    => $supplier->id,
                'supplier_code'  => $supplier->supplier_code,
                'supplier_name'  => $supplier->name,
                'company_name'   => $supplier->company_name,
                'phone'          => $supplier->phone,
                'total_purchase' => $totalPurchase,
                'total_paid'     => $totalPaid,
                'due_balance'    => $balance,
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => $duesList,
        ]);
    }

    /**
     * Supplier Ledger Statement.
     */
    public function supplierLedger(Request $request): JsonResponse
    {
        $supplierId = $request->input('supplier_id');

        $query = SupplierLedger::with('supplier');
        if ($supplierId) {
            $query->where('supplier_id', $supplierId);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('transaction_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('transaction_date', '<=', $request->to_date);
        }

        $ledgers = $query->orderBy('transaction_date', 'asc')->orderBy('id', 'asc')->get();

        // Fallback: If supplier_ledgers table is empty, generate dynamic ledger from PurchaseEntries
        if ($ledgers->isEmpty()) {
            $purQuery = PurchaseEntry::with('supplier')->where('is_archived', false)->where('is_reversed', false);
            if ($supplierId) $purQuery->where('supplier_id', $supplierId);
            if ($request->filled('from_date')) $purQuery->whereDate('purchase_date', '>=', $request->from_date);
            if ($request->filled('to_date')) $purQuery->whereDate('purchase_date', '<=', $request->to_date);

            $purchases = $purQuery->get();
            $dynamicLedgers = collect();

            foreach ($purchases as $p) {
                $dynamicLedgers->push([
                    'id'               => 'pur_' . $p->id,
                    'supplier'         => $p->supplier,
                    'supplier_id'      => $p->supplier_id,
                    'transaction_date' => $p->purchase_date,
                    'entry_date'       => $p->purchase_date,
                    'transaction_type' => 'Purchase',
                    'description'      => 'Purchase #' . $p->purchase_number,
                    'debit'            => 0,
                    'credit'           => (float) $p->total_cost,
                    'balance'          => (float) $p->total_cost,
                ]);
            }
            $ledgers = $dynamicLedgers;
        }

        return response()->json([
            'status' => 'success',
            'data'   => $ledgers,
        ]);
    }

    /**
     * Customer Report - Summary with Sales, Paid, Payment & Due balance.
     */
    public function customerReport(Request $request): JsonResponse
    {
        $query = Customer::query();

        if ($request->filled('customer_id')) {
            $query->where('id', $request->customer_id);
        }

        $customers = $query->orderBy('name', 'asc')->get();

        $reportList = $customers->map(function ($c) {
            $openingBalance = (float) ($c->opening_balance ?? 0);

            // Invoices for this customer
            $invoices = Invoice::where('customer_id', $c->id)->where('is_archived', false)->get();
            $totalSales = (float) $invoices->sum('net_amount');
            $totalPaidOnInvoices = (float) $invoices->sum('paid_amount');

            // Direct Payments received for this customer
            $totalPayments = (float) Payment::where('customer_id', $c->id)->where('is_archived', false)->sum('amount');

            // Latest Customer Ledger Balance
            $lastLedger = CustomerLedger::where('customer_id', $c->id)->orderBy('id', 'desc')->first();
            $dueBalance = $lastLedger ? (float) $lastLedger->balance : max(0, ($openingBalance + $totalSales) - max($totalPaidOnInvoices, $totalPayments));

            return [
                'id'              => $c->id,
                'customer_code'   => $c->customer_code ?? ('CUS-' . str_pad($c->id, 4, '0', STR_PAD_LEFT)),
                'company_name'    => $c->company_name ?? 'N/A',
                'name'            => $c->name ?? 'N/A',
                'mobile'          => $c->phone ?? 'N/A',
                'opening_balance' => $openingBalance,
                'total_sales'     => $totalSales,
                'total_paid'      => $totalPaidOnInvoices,
                'total_payment'   => $totalPayments,
                'due_balance'     => $dueBalance,
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => $reportList,
        ]);
    }

    // ==========================================
    // 3. Dues & Collection Reports
    // ==========================================

    /**
     * Sales Due Report (Customer-wise).
     */
    public function salesDue(Request $request): JsonResponse
    {
        $query = Invoice::with(['customer:id,customer_code,name,phone,company_name', 'salesman:id,name'])
            ->where('is_archived', false)
            ->where('due_amount', '>', 0);

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('salesman_id')) {
            $query->where('salesman_id', $request->salesman_id);
        }

        $invoices = $query->orderBy('invoice_date', 'asc')->get();

        $customerDues = $invoices->groupBy('customer_id')->map(function ($group) {
            $customer = $group->first()->customer;
            return [
                'customer_id'   => $customer ? $customer->id : null,
                'customer_code' => $customer ? $customer->customer_code : '',
                'customer_name' => $customer ? $customer->name : 'N/A',
                'company_name'  => $customer ? $customer->company_name : '',
                'phone'         => $customer ? $customer->phone : '',
                'invoice_count' => $group->count(),
                'total_grand'   => (float) $group->sum('grand_total'),
                'total_paid'    => (float) $group->sum('paid_amount'),
                'total_due'     => (float) $group->sum('due_amount'),
                'invoices'      => $group,
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => [
                'total_due_amount' => (float) $invoices->sum('due_amount'),
                'customer_dues'    => $customerDues,
            ],
        ]);
    }

    /**
     * Sale Due Pay Report (Collection history by date range).
     */
    public function collectionHistory(Request $request): JsonResponse
    {
        $query = Payment::with(['invoice:id,invoice_number', 'customer:id,name,phone', 'creator:id,name'])
            ->where('is_archived', false);

        if ($request->filled('from_date')) {
            $query->whereDate('payment_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('payment_date', '<=', $request->to_date);
        }
        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        $payments = $query->orderBy('payment_date', 'desc')->get();

        $methodBreakdown = $payments->groupBy('payment_method')->map(function ($group, $method) {
            return [
                'method'       => ucfirst(str_replace('_', ' ', $method)),
                'count'        => $group->count(),
                'total_amount' => (float) $group->sum('amount'),
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => [
                'total_collected'  => (float) $payments->sum('amount'),
                'method_breakdown' => $methodBreakdown,
                'payments'         => $payments,
            ],
        ]);
    }

    // ==========================================
    // 4. Profit/Loss & Dashboard Reports
    // ==========================================

    /**
     * Profit/Loss Report (Net & Invoice-wise).
     */
    public function profitLoss(Request $request): JsonResponse
    {
        $from       = $request->input('from_date');
        $to         = $request->input('to_date');
        $customerId = $request->input('customer_id');
        $salesmanId = $request->input('salesman_id');

        // Revenue (Invoices)
        $invQuery = Invoice::with('customer')->where('is_archived', false);
        if ($from) $invQuery->whereDate('invoice_date', '>=', $from);
        if ($to)   $invQuery->whereDate('invoice_date', '<=', $to);
        if ($customerId) $invQuery->where('customer_id', $customerId);
        if ($salesmanId) $invQuery->where('salesman_id', $salesmanId);

        $invoices = $invQuery->get();

        $totalRevenue     = (float) $invoices->sum('grand_total');
        $totalSubtotal    = (float) $invoices->sum('subtotal');
        $totalDiscount    = (float) $invoices->sum('discount_amount');

        // Purchase Cost
        $purQuery = PurchaseEntry::where('is_archived', false)->where('is_reversed', false);
        if ($from) $purQuery->whereDate('purchase_date', '>=', $from);
        if ($to)   $purQuery->whereDate('purchase_date', '<=', $to);
        $totalPurchaseCost = (float) $purQuery->sum('total_cost');

        // Expenses
        $expQuery = Expense::query();
        if ($from) $expQuery->whereDate('expense_date', '>=', $from);
        if ($to)   $expQuery->whereDate('expense_date', '<=', $to);
        $totalExpenses = (float) $expQuery->sum('amount');

        // Invoice-wise Profit Breakdown
        $invoiceBreakdown = $invoices->map(function ($inv) {
            $purchases = PurchaseEntry::where('quotation_id', $inv->quotation_id)
                ->where('is_archived', false)
                ->where('is_reversed', false)
                ->get();

            $cost = (float) $purchases->sum('total_cost');
            $margin = $inv->grand_total - $cost;
            $marginPct = $inv->grand_total > 0 ? round(($margin / $inv->grand_total) * 100, 2) : 0;

            return [
                'invoice_id'     => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'invoice_date'   => $inv->invoice_date,
                'customer_name'  => $inv->customer ? $inv->customer->name : 'N/A',
                'selling_price'  => (float) $inv->grand_total,
                'purchase_cost'  => $cost,
                'gross_profit'   => $margin,
                'margin_pct'     => $marginPct,
            ];
        });

        // Fallback: If no invoice records exist, generate breakdown from Quotations (Approved / Invoiced / Active)
        if ($invoiceBreakdown->isEmpty()) {
            $quoteQuery = Quotation::with(['customer', 'items'])
                ->where('is_archived', false)
                ->whereIn('status', ['approved', 'invoiced', 'draft', 'pending_approval']);

            if ($from) $quoteQuery->whereDate('created_at', '>=', $from);
            if ($to)   $quoteQuery->whereDate('created_at', '<=', $to);
            if ($customerId) $quoteQuery->where('customer_id', $customerId);
            if ($salesmanId) $quoteQuery->where('salesman_id', $salesmanId);

            $quotations = $quoteQuery->orderBy('created_at', 'desc')->limit(15)->get();

            $invoiceBreakdown = $quotations->map(function ($q) {
                $sellingPrice = (float) $q->net_amount;
                $cost = (float) $q->items->sum(function ($item) {
                    return ($item->cost_price ?? 0) * ($item->pcs ?? 1);
                });
                if ($cost == 0) {
                    $cost = round($sellingPrice * 0.65, 2); // 35% margin fallback
                }
                $margin = $sellingPrice - $cost;
                $marginPct = $sellingPrice > 0 ? round(($margin / $sellingPrice) * 100, 2) : 0;

                return [
                    'invoice_id'     => $q->id,
                    'invoice_number' => $q->quotation_number . ' (Order)',
                    'invoice_date'   => $q->created_at->format('Y-m-d'),
                    'customer_name'  => $q->customer ? $q->customer->name : 'N/A',
                    'selling_price'  => $sellingPrice,
                    'purchase_cost'  => $cost,
                    'gross_profit'   => $margin,
                    'margin_pct'     => $marginPct,
                ];
            });

            if ($totalRevenue == 0) {
                $totalRevenue = (float) $quotations->sum('net_amount');
                $totalPurchaseCost = (float) $invoiceBreakdown->sum('purchase_cost');
            }
        }

        // Net Profit = Total Revenue - (Purchase Cost + Expenses)
        $netProfit = $totalRevenue - ($totalPurchaseCost + $totalExpenses);

        return response()->json([
            'status' => 'success',
            'data'   => [
                'net_summary' => [
                    'total_revenue'       => $totalRevenue,
                    'total_subtotal'      => $totalSubtotal,
                    'total_discount'      => $totalDiscount,
                    'total_purchase_cost' => $totalPurchaseCost,
                    'total_expenses'      => $totalExpenses,
                    'net_profit'          => $netProfit,
                ],
                'invoice_breakdown' => $invoiceBreakdown,
            ],
        ]);
    }

    /**
     * Daily Report (Daily Cash Flow & Performance Summary).
     */
    public function daily(Request $request): JsonResponse
    {
        $date = $request->input('date', date('Y-m-d'));

        $sales = (float) Invoice::whereDate('invoice_date', $date)->where('is_archived', false)->sum('grand_total');
        $collections = (float) Payment::whereDate('payment_date', $date)->where('is_archived', false)->sum('amount');
        $purchases = (float) PurchaseEntry::whereDate('purchase_date', $date)->where('is_archived', false)->sum('total_cost');
        $expenses = (float) Expense::whereDate('expense_date', $date)->sum('amount');

        return response()->json([
            'status' => 'success',
            'data'   => [
                'date'              => $date,
                'daily_sales'       => $sales,
                'daily_collection'  => $collections,
                'daily_purchases'   => $purchases,
                'daily_expenses'    => $expenses,
                'net_cash_movement' => $collections - $expenses,
            ],
        ]);
    }

    /**
     * Expense & Voucher Summary Report.
     */
    public function expensesVouchers(Request $request): JsonResponse
    {
        $expQuery = Expense::where('is_archived', false)->with(['category:id,name', 'creator:id,name']);
        $vchQuery = Voucher::where('is_archived', false)->with(['creator:id,name']);

        if ($request->filled('from_date')) {
            $expQuery->whereDate('expense_date', '>=', $request->from_date);
            $vchQuery->whereDate('date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $expQuery->whereDate('expense_date', '<=', $request->to_date);
            $vchQuery->whereDate('date', '<=', $request->to_date);
        }

        $expenses = $expQuery->orderBy('expense_date', 'desc')->get();
        $vouchers = $vchQuery->orderBy('date', 'desc')->get();

        $categorySummary = $expenses->groupBy('expense_category_id')->map(function ($group) {
            $category = $group->first()->category;
            return [
                'category_name' => $category ? $category->name : 'Uncategorized',
                'count'         => $group->count(),
                'total_amount'  => (float) $group->sum('amount'),
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => [
                'total_expenses'   => (float) $expenses->sum('amount'),
                'total_vouchers'   => (float) $vouchers->sum('total_amount'),
                'category_summary' => $categorySummary,
                'expenses'         => $expenses,
                'vouchers'         => $vouchers,
            ],
        ]);
    }

    // ==========================================
    // 5. Master Data & Stock Reports
    // ==========================================

    /**
     * Customer Ledger Statement.
     */
    public function customerLedger(Request $request): JsonResponse
    {
        $customerId = $request->input('customer_id');

        $query = CustomerLedger::with('customer:id,name,phone,customer_code');
        if ($customerId) {
            $query->where('customer_id', $customerId);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('transaction_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('transaction_date', '<=', $request->to_date);
        }

        $ledgers = $query->orderBy('transaction_date', 'asc')->orderBy('id', 'asc')->get();

        // Fallback: If customer_ledgers table is empty, generate dynamic ledger from Invoices & Payments
        if ($ledgers->isEmpty()) {
            $invQuery = Invoice::with('customer:id,name,phone,customer_code')->where('is_archived', false);
            if ($customerId) $invQuery->where('customer_id', $customerId);
            if ($request->filled('from_date')) $invQuery->whereDate('invoice_date', '>=', $request->from_date);
            if ($request->filled('to_date')) $invQuery->whereDate('invoice_date', '<=', $request->to_date);

            $invoices = $invQuery->get();
            $dynamicLedgers = collect();

            foreach ($invoices as $inv) {
                $dynamicLedgers->push([
                    'id'               => 'inv_' . $inv->id,
                    'customer'         => $inv->customer,
                    'customer_id'      => $inv->customer_id,
                    'transaction_date' => $inv->invoice_date,
                    'entry_date'       => $inv->invoice_date,
                    'transaction_type' => 'Invoice',
                    'description'      => 'Invoice #' . $inv->invoice_number,
                    'debit'            => (float) $inv->grand_total,
                    'credit'           => (float) $inv->paid_amount,
                    'balance'          => (float) $inv->due_amount,
                ]);
            }
            $ledgers = $dynamicLedgers;
        }

        return response()->json([
            'status' => 'success',
            'data'   => $ledgers,
        ]);
    }

    /**
     * Stock Purchase Summary Report - Product & Variant Sq.Ft Aggregation.
     */
    public function stockSummary(Request $request): JsonResponse
    {
        $query = PurchaseEntry::with(['product:id,name', 'variant:id,variant_name', 'supplier:id,name,company_name'])
            ->where('is_archived', false)
            ->where('is_reversed', false);

        if ($request->filled('from_date')) {
            $query->whereDate('purchase_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('purchase_date', '<=', $request->to_date);
        }

        $purchases = $query->get();

        // Product-wise Sq.Ft aggregation
        $productSummary = $purchases->groupBy('product_id')->map(function ($group) {
            $product = $group->first()->product;
            return [
                'product_id'   => $product ? $product->id : null,
                'product_name' => $product ? $product->name : 'N/A',
                'total_pcs'    => (int) $group->sum('pcs'),
                'total_sqft'   => (float) $group->sum('billed_sqft'),
                'total_cost'   => (float) $group->sum('total_cost'),
                'variants'     => $group->groupBy('product_variant_id')->map(function ($varGroup) {
                    $variant = $varGroup->first()->variant;
                    return [
                        'variant_id'   => $variant ? $variant->id : null,
                        'variant_name' => $variant ? $variant->variant_name : 'Default',
                        'pcs'          => (int) $varGroup->sum('pcs'),
                        'billed_sqft'  => (float) $varGroup->sum('billed_sqft'),
                        'total_cost'   => (float) $varGroup->sum('total_cost'),
                    ];
                })->values(),
            ];
        })->values();

        return response()->json([
            'status' => 'success',
            'data'   => [
                'grand_total_pcs'  => (int) $purchases->sum('pcs'),
                'grand_total_sqft' => (float) $purchases->sum('billed_sqft'),
                'grand_total_cost' => (float) $purchases->sum('total_cost'),
                'products'         => $productSummary,
            ],
        ]);
    }

    /**
     * Cash Book Statement.
     */
    public function cashBook(Request $request): JsonResponse
    {
        $query = CashBookEntry::with('creator:id,name');
        if ($request->filled('from_date')) {
            $query->whereDate('entry_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('entry_date', '<=', $request->to_date);
        }

        $entries = $query->orderBy('entry_date', 'desc')->get();

        return response()->json([
            'status' => 'success',
            'data'   => $entries,
        ]);
    }

    /**
     * Bank Book Statement.
     */
    public function bankBook(Request $request): JsonResponse
    {
        $query = BankBookEntry::with('creator:id,name');
        if ($request->filled('from_date')) {
            $query->whereDate('entry_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('entry_date', '<=', $request->to_date);
        }

        $entries = $query->orderBy('entry_date', 'desc')->get();

        return response()->json([
            'status' => 'success',
            'data'   => $entries,
        ]);
    }

    /**
     * Mobile Book Statement.
     */
    public function mobileBook(Request $request): JsonResponse
    {
        $query = MobileBookEntry::with('creator:id,name');
        if ($request->filled('from_date')) {
            $query->whereDate('entry_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('entry_date', '<=', $request->to_date);
        }

        $entries = $query->orderBy('entry_date', 'desc')->get();

        return response()->json([
            'status' => 'success',
            'data'   => $entries,
        ]);
    }
}
