<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\ProductSupplierLink;
use App\Models\ProductVariant;
use App\Models\Quotation;
use App\Models\Supplier;
use App\Models\User;
use App\Services\CustomerOpeningBalanceService;
use App\Services\DeliveryChallanService;
use App\Services\InvoiceService;
use App\Services\PaymentService;
use App\Services\QuotationService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds realistic demo data that runs through the ENTIRE business workflow:
 *
 *   users → suppliers → products → variants → supplier-links → customers
 *        → quotations (multiple statuses) → purchase-entries (on approve)
 *        → invoices → payments (part/paid) → challans → expenses
 *
 * It reuses the real service classes so financial invariants
 * (customer/supplier ledgers, running balances, book entries) stay consistent.
 */
class DemoDataSeeder extends Seeder
{
    protected User $admin;

    protected User $manager;

    protected User $rahim;

    protected User $salma;

    /** @var Collection<string, Product> */
    protected $productsCache;

    protected QuotationService $quotationService;

    protected InvoiceService $invoiceService;

    protected PaymentService $paymentService;

    protected DeliveryChallanService $challanService;

    protected CustomerOpeningBalanceService $openingBalanceService;

    public function __construct()
    {
        $this->quotationService = app(QuotationService::class);
        $this->invoiceService = app(InvoiceService::class);
        $this->paymentService = app(PaymentService::class);
        $this->challanService = app(DeliveryChallanService::class);
        $this->openingBalanceService = app(CustomerOpeningBalanceService::class);
    }

    public function run(): void
    {
        DB::transaction(function () {
            $this->seedUsers();
            $this->seedSuppliers();
            $this->seedProducts();
            $this->seedCustomers();
            $this->seedQuotations();
            $this->seedExpenses();

            if ($this->command) {
                $this->command->info('Demo data seeded successfully.');
            }
        });
    }

    protected function seedUsers(): void
    {
        $admin = User::where('email', 'admin@bechakenarp.com')->first();
        if (! $admin) {
            throw new \RuntimeException('Run RolesAndPermissionsSeeder + AdminUserSeeder first.');
        }
        $this->admin = $admin;

        // Manager
        $this->manager = User::firstOrCreate(
            ['email' => 'kamal@bechakenarp.com'],
            [
                'name' => 'Kamal Hossain',
                'phone' => '01711111111',
                'password' => Hash::make('Manager@1234'),
                'role' => 'manager',
                'is_active' => true,
                'is_archived' => false,
            ]
        );
        $this->manager->assignRole('manager');

        // Salesmen managed by the manager
        $this->rahim = $this->makeSalesman('rahim@bechakenarp.com', 'Rahim Uddin', '01822222222');
        $this->salma = $this->makeSalesman('salma@bechakenarp.com', 'Salma Khatun', '01933333333');
        $this->makeSalesman('meheraj@dhakablinds.shop', 'Al Meheraj', '+8801876989658', '1TZYrZdeC9n4t9');
        $this->makeSalesman('absar@dhakablinds.shop', 'Nurul Absar', '+8801641667557', 'cC40i8BzhAvJuM');

        // Staff managed by the manager
        $staff = User::firstOrCreate(
            ['email' => 'staff@bechakenarp.com'],
            [
                'name' => 'Tariq Staff',
                'phone' => '01544444444',
                'password' => Hash::make('Staff@1234'),
                'role' => 'staff',
                'manager_id' => $this->manager->id,
                'is_active' => true,
                'is_archived' => false,
            ]
        );
        $staff->assignRole('staff');
    }

    protected function makeSalesman(string $email, string $name, string $phone, string $password = 'Password1234'): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'phone' => $phone,
                'password' => Hash::make($password),
                'role' => 'salesman',
                'manager_id' => $this->manager->id,
                'is_active' => true,
                'is_archived' => false,
            ]
        );
        $user->assignRole('salesman');

        return $user;
    }

    protected function seedSuppliers(): void
    {
        $suppliers = [
            ['supplier_code' => 'SUP-0001', 'name' => 'Zaman Textile & Blinds', 'phone' => '01740000001', 'email' => 'zaman@example.com',  'address' => 'Narayanganj, Dhaka'],
            ['supplier_code' => 'SUP-0002', 'name' => 'Dhaka Roller Traders',   'phone' => '01740000002', 'email' => 'roller@example.com', 'address' => 'Mirpur, Dhaka'],
            ['supplier_code' => 'SUP-0003', 'name' => 'Bengal Window Solutions', 'phone' => '01740000003', 'email' => 'bengal@example.com', 'address' => 'Gulshan, Dhaka'],
            ['supplier_code' => 'SUP-0004', 'name' => 'Chittagong Blind House', 'phone' => '01740000004', 'email' => 'cblinds@example.com', 'address' => 'Agrabad, Chattogram'],
        ];

        foreach ($suppliers as $data) {
            Supplier::firstOrCreate(['supplier_code' => $data['supplier_code']], $data + [
                'created_by' => $this->admin->id,
            ]);
        }
    }

    protected function seedProducts(): void
    {
        $products = [
            ['product_code' => 'BL-001', 'name' => 'Roman Blind',             'unit' => 'sqft', 'default_unit_price' => 420.00],
            ['product_code' => 'BL-002', 'name' => 'Roller Blind',            'unit' => 'sqft', 'default_unit_price' => 380.00],
            ['product_code' => 'BL-003', 'name' => 'Venetian Blind (Aluminium)', 'unit' => 'sqft', 'default_unit_price' => 350.00],
            ['product_code' => 'BL-004', 'name' => 'Vertical Blind',          'unit' => 'sqft', 'default_unit_price' => 300.00],
            ['product_code' => 'BL-005', 'name' => 'PVC Strip Curtain',       'unit' => 'sqft', 'default_unit_price' => 250.00],
        ];

        $variants = [
            'BL-001' => ['Ivory White', 'Pearl Grey', 'Sand Beige'],
            'BL-002' => ['Classic White', 'Dark Brown', 'Sky Blue'],
            'BL-003' => ['Silver Grey', 'Black', 'Bronze'],
            'BL-004' => ['Off White', 'Sea Green'],
            'BL-005' => ['Transparent', 'Blue Tinted'],
        ];

        $links = [
            //               ranks: [ [supplier_code, cost, min_billing], ... ]  rank = index+1
            'BL-001' => [['SUP-0001', 300.00, 10.00], ['SUP-0002', 315.00, 12.00]],
            'BL-002' => [['SUP-0002', 280.00,  8.00], ['SUP-0004', 295.00, 10.00]],
            'BL-003' => [['SUP-0003', 260.00, 10.00], ['SUP-0001', 270.00, 12.00]],
            'BL-004' => [['SUP-0001', 225.00, 12.00], ['SUP-0003', 235.00, 14.00]],
            'BL-005' => [['SUP-0004', 180.00,  6.00], ['SUP-0002', 190.00,  8.00]],
        ];

        foreach ($products as $data) {
            $product = Product::firstOrCreate(['product_code' => $data['product_code']], $data + [
                'created_by' => $this->admin->id,
            ]);

            // Variants
            foreach ($variants[$data['product_code']] as $variantName) {
                ProductVariant::firstOrCreate(
                    ['product_id' => $product->id, 'variant_name' => $variantName],
                    ['created_by' => $this->admin->id]
                );
            }

            // Supplier links (unique by product+supplier)
            foreach ($links[$data['product_code']] as $rank => [$supplierCode, $cost, $minBilling]) {
                $supplierId = Supplier::where('supplier_code', $supplierCode)->value('id');
                ProductSupplierLink::updateOrCreate(
                    ['product_id' => $product->id, 'supplier_id' => $supplierId],
                    [
                        'priority_rank' => $rank + 1,
                        'cost_price' => $cost,
                        'min_billing_sqft' => $minBilling,
                        'created_by' => $this->admin->id,
                    ]
                );
            }
        }

        // Cache products for later use during quotation seeding
        $this->productsCache = Product::query()->get()->keyBy('product_code');
    }

    protected function seedCustomers(): void
    {
        $customers = [
            ['customer_code' => 'CUS-0001', 'name' => 'Rafiqul Islam',            'company_name' => 'Rafiqul Interior',       'phone' => '01712345671', 'customer_category_name' => 'Interior Firm',            'opening_balance' => 25000,  'created_by' => 'rahim@bechakenarp.com'],
            ['customer_code' => 'CUS-0002', 'name' => 'Sultana Rahman',           'company_name' => 'Sultana Interiors',      'phone' => '01712345672', 'customer_category_name' => 'Interior Firm',            'opening_balance' => 50000,  'created_by' => 'salma@bechakenarp.com'],
            ['customer_code' => 'CUS-0003', 'name' => 'Green Tower Ltd.',         'company_name' => 'Green Tower',            'phone' => '01712345673', 'customer_category_name' => 'Corporate Office',        'opening_balance' => 0,      'created_by' => 'salma@bechakenarp.com'],
            ['customer_code' => 'CUS-0004', 'name' => 'Dhaka City Corporation',   'company_name' => 'DCC',                    'phone' => '01712345674', 'customer_category_name' => 'Government Office',       'opening_balance' => 120000, 'created_by' => 'rahim@bechakenarp.com'],
            ['customer_code' => 'CUS-0005', 'name' => 'Mizanur Rahman',           'company_name' => null,                     'phone' => '01712345675', 'customer_category_name' => 'Direct / Individual Customer', 'opening_balance' => 0,  'created_by' => 'rahim@bechakenarp.com'],
            ['customer_code' => 'CUS-0006', 'name' => 'Arctic Cold Storage',      'company_name' => 'Arctic Foods Ltd.',      'phone' => '01712345676', 'customer_category_name' => 'PVC Strip Curtain Customer', 'opening_balance' => 80000, 'created_by' => 'salma@bechakenarp.com'],
        ];

        foreach ($customers as $data) {
            $seller = User::where('email', $data['created_by'])->firstOrFail();
            $categoryId = CustomerCategory::where('name', $data['customer_category_name'])->value('id');

            $customer = Customer::firstOrCreate(
                ['customer_code' => $data['customer_code']],
                [
                    'name' => $data['name'],
                    'company_name' => $data['company_name'],
                    'phone' => $data['phone'],
                    'email' => strtolower(str_replace(' ', '.', $data['name'])).'@example.com',
                    'address' => 'Dhaka, Bangladesh',
                    'opening_balance' => $data['opening_balance'],
                    'customer_category_id' => $categoryId,
                    'created_by' => $seller->id,
                    'is_archived' => false,
                ]
            );

            if ($data['opening_balance'] > 0) {
                $this->openingBalanceService->sync($customer, $this->admin->id);
            }
        }
    }

    protected function seedQuotations(): void
    {
        // cached products
        $p = $this->productsCache;

        // 1) DRAFT quotation (status: quotation)
        $this->createQuotation([
            'customer' => 'CUS-0001',
            'salesman' => $this->rahim,
            'status' => 'quotation',
            'vat' => 5,
            'items' => [
                ['product' => $p['BL-001'], 'variant' => 'Ivory White', 'width' => 48,  'height' => 72, 'pcs' => 4],
                ['product' => $p['BL-002'], 'variant' => 'Sky Blue',     'width' => 60,  'height' => 84, 'pcs' => 2],
            ],
        ]);

        // 2) PENDING APPROVAL quotation
        $this->createQuotation([
            'customer' => 'CUS-0002',
            'salesman' => $this->salma,
            'status' => 'pending_approval',
            'discount_type' => 'percentage',
            'discount_value' => 5,
            'items' => [
                ['product' => $p['BL-003'], 'variant' => 'Silver Grey', 'width' => 50, 'height' => 90, 'pcs' => 3],
                ['product' => $p['BL-004'], 'variant' => 'Off White',   'width' => 72, 'height' => 96, 'pcs' => 2],
            ],
        ]);

        // 3) APPROVED quotation (creates purchase entries + supplier ledgers)
        $approved = $this->createQuotation([
            'customer' => 'CUS-0004',
            'salesman' => $this->rahim,
            'status' => 'approved',
            'items' => [
                ['product' => $p['BL-001'], 'variant' => 'Pearl Grey', 'width' => 54, 'height' => 80, 'pcs' => 2],
                ['product' => $p['BL-005'], 'variant' => 'Transparent', 'width' => 120, 'height' => 96, 'pcs' => 6],
            ],
        ]);
        $approved->update([
            'status' => 'approved',
            'approved_by' => $this->admin->id,
            'approved_at' => now(),
        ]);
        $this->quotationService->createPurchaseEntries($approved, $this->admin->id);

        // 4) INVOICED + FULLY PAID (+ challan)
        $this->makeInvoicedAndPaid([
            'customer' => 'CUS-0003',
            'salesman' => $this->salma,
            'items' => [
                ['product' => $p['BL-002'], 'variant' => 'Classic White', 'width' => 66, 'height' => 92, 'pcs' => 5],
                ['product' => $p['BL-004'], 'variant' => 'Sea Green',     'width' => 60, 'height' => 90, 'pcs' => 3],
            ],
            'payment' => [
                'payment_method' => 'cash',
                'payment_date' => now()->subDays(3)->toDateString(),
                'notes' => 'Full payment by cash on delivery.',
            ],
            'withChallan' => true,
        ]);

        // 5) INVOICED + PARTIAL payment
        $this->makeInvoicedAndPaid([
            'customer' => 'CUS-0005',
            'salesman' => $this->rahim,
            'items' => [
                ['product' => $p['BL-003'], 'variant' => 'Bronze',  'width' => 44, 'height' => 70, 'pcs' => 4],
                ['product' => $p['BL-005'], 'variant' => 'Blue Tinted', 'width' => 90, 'height' => 84, 'pcs' => 5],
            ],
            'payment' => [
                'payment_method' => 'bank',
                'bank_name' => 'City Bank',
                'cheque_number' => 'CHQ-884512',
                'payment_date' => now()->toDateString(),
                'notes' => 'Advance bank payment.',
                'partial' => true,
            ],
        ]);

        // 6) REJECTED quotation
        $this->createQuotation([
            'customer' => 'CUS-0006',
            'salesman' => $this->salma,
            'status' => 'rejected',
            'rejection_reason' => 'Customer changed requirements and asked for a new quotation.',
            'items' => [
                ['product' => $p['BL-005'], 'variant' => 'Transparent', 'width' => 110, 'height' => 96, 'pcs' => 10],
            ],
        ]);
    }

    /**
     * Create a quotation header + items + summary via the real QuotationService.
     */
    protected function createQuotation(array $cfg): Quotation
    {
        $customer = Customer::where('customer_code', $cfg['customer'])->firstOrFail();
        $userId = $cfg['salesman']->id;

        $quotation = Quotation::create([
            'quotation_number' => $this->quotationService->generateQuotationNumber(),
            'customer_id' => $customer->id,
            'salesman_id' => $userId,
            'status' => 'quotation',
            'convenience_charge' => 0,
            'other_charge' => 0,
            'vat_percentage' => 5,
            'discount_type' => $cfg['discount_type'] ?? 'flat',
            'discount_value' => $cfg['discount_value'] ?? 0,
            'note' => $cfg['note'] ?? null,
            'created_by' => $this->admin->id,
        ]);

        // Build item payloads
        $items = [];
        foreach ($cfg['items'] as $it) {
            $variant = $it['product']->variants->where('variant_name', $it['variant'])->first();
            $items[] = [
                'product_id' => $it['product']->id,
                'product_variant_id' => $variant ? $variant->id : null,
                'width' => $it['width'],
                'height' => $it['height'],
                'pcs' => $it['pcs'],
                'unit_price' => (float) $it['product']->default_unit_price,
            ];
        }

        $subtotal = $this->quotationService->processAndSaveItems($quotation, $items, $userId);
        $summary = $this->quotationService->calculateSummary(
            $subtotal,
            0,
            0,
            (float) $quotation->vat_percentage,
            $quotation->discount_type,
            (float) $quotation->discount_value
        );
        $quotation->update($summary);

        if (isset($cfg['status']) && $cfg['status'] !== 'quotation') {
            $quotation->update(['status' => $cfg['status']]);
        }
        if (isset($cfg['status']) && $cfg['status'] === 'rejected') {
            $quotation->update(['rejection_reason' => $cfg['rejection_reason'] ?? null]);
        }

        return $quotation;
    }

    /**
     * Create quotation → approve → invoice → (challan) → payment.
     */
    protected function makeInvoicedAndPaid(array $cfg): void
    {
        $quotation = $this->createQuotation($cfg);
        $quotation->update([
            'status' => 'approved',
            'approved_by' => $this->admin->id,
            'approved_at' => now(),
        ]);
        $this->quotationService->createPurchaseEntries($quotation, $this->admin->id);

        // Invoice
        $invoice = $this->invoiceService->generate($quotation, $this->admin->id);
        $quotation->update(['status' => 'invoiced']);

        // Optional challan
        if (! empty($cfg['withChallan'])) {
            $this->challanService->generate($invoice, $this->admin->id);
        }

        // Payment
        $pay = $cfg['payment'];
        $amount = (float) $invoice->due_amount;
        if (! empty($pay['partial'])) {
            $amount = round($amount * 0.4, 2);
        }
        $this->paymentService->processPayment([
            'amount' => $amount,
            'payment_method' => $pay['payment_method'],
            'bank_name' => $pay['bank_name'] ?? null,
            'cheque_number' => $pay['cheque_number'] ?? null,
            'mobile_provider' => $pay['mobile_provider'] ?? null,
            'transaction_id' => $pay['transaction_id'] ?? null,
            'payment_date' => $pay['payment_date'],
            'notes' => $pay['notes'] ?? null,
        ], $invoice, $this->admin->id);
    }

    protected function seedExpenses(): void
    {
        $expenses = [
            ['category' => 'Office Rent',    'amount' => 35000.00, 'method' => 'cash', 'date' => now()->subDays(5)->toDateString(), 'ref' => null,             'desc' => 'Monthly showroom rent'],
            ['category' => 'Utility Bill',   'amount' => 8200.00, 'method' => 'bank', 'date' => now()->subDays(3)->toDateString(), 'ref' => 'UTIL-0012',      'desc' => 'Electricity & internet bill'],
            ['category' => 'Transport',      'amount' => 1500.00, 'method' => 'cash', 'date' => now()->subDays(2)->toDateString(), 'ref' => null,             'desc' => 'Goods delivery personnel cost'],
            ['category' => 'Salary',         'amount' => 120000.00, 'method' => 'bank', 'date' => now()->subDays(1)->toDateString(), 'ref' => 'SAL-2026-06',    'desc' => 'Monthly staff salary'],
            ['category' => 'Miscellaneous',  'amount' => 750.00, 'method' => 'cash', 'date' => now()->toDateString(),             'ref' => null,             'desc' => 'Petty cash - tea & stationery'],
        ];

        $i = 1;
        foreach ($expenses as $data) {
            $categoryId = ExpenseCategory::where('name', $data['category'])->value('id');
            Expense::create([
                'expense_number' => 'EXP-'.date('Y').'-'.str_pad($i, 4, '0', STR_PAD_LEFT),
                'expense_category_id' => $categoryId,
                'amount' => $data['amount'],
                'payment_method' => $data['method'],
                'bank_name' => $data['method'] === 'bank' ? 'City Bank' : null,
                'reference_number' => $data['ref'],
                'description' => $data['desc'],
                'expense_date' => $data['date'],
                'created_by' => $this->admin->id,
            ]);
            $i++;
        }
    }
}
