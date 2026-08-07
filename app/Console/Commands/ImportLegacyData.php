<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\QuotationItem;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One-time import of the old "Dhaka Blinds" software's data
 * (customers, quotations, sales/invoices, and dues) into the new ERP.
 *
 * Reads from temporary `legacy_*` tables (already loaded from the old
 * SQL dump into the production database) and writes into the real
 * customers / quotations / quotation_items / invoices / payments /
 * customer_ledgers tables using the existing schema as-is — no schema
 * changes are made.
 *
 * Usage:
 *   php artisan legacy:import          # wipes prior demo data and imports
 *   php artisan legacy:import --dry-run
 */
class ImportLegacyData extends Command
{
    protected $signature = 'legacy:import {--dry-run : Report counts without writing}';
    protected $description = 'Import customers, quotations, invoices, and dues from the legacy software dump';

    private int $adminId;
    private int $defaultCategoryId = 4; // Direct / Individual Customer
    private int $legacyProductId;
    private array $skipped = [];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if (! DB::getSchemaBuilder()->hasTable('legacy_customers')) {
            $this->error('legacy_* tables not found. Import the legacy SQL dump first.');
            return self::FAILURE;
        }

        $admin = User::where('email', 'admin@bechakenarp.com')->first();
        if (! $admin) {
            $this->error('Admin user not found.');
            return self::FAILURE;
        }
        $this->adminId = $admin->id;

        DB::beginTransaction();

        try {
            if (! $dryRun) {
                $this->wipeExistingTransactionalData();
                $this->legacyProductId = $this->createLegacyPlaceholderProduct();
            }

            $supplierMap = [];
            $categoryMap = [];
            $productMap = [];

            if (DB::getSchemaBuilder()->hasTable('legacy_suppliers')) {
                $supplierMap = $this->importSuppliers($dryRun);
                $this->info('Suppliers imported: '.count($supplierMap));

                $categoryMap = $this->importProductCategories($dryRun);
                $this->info('Product categories imported: '.count($categoryMap));

                $productMap = $this->importProducts($categoryMap, $dryRun);
                $this->info('Products imported: '.count($productMap));

                $linkCount = $this->importProductSupplierLinks($productMap, $supplierMap, $dryRun);
                $this->info('Product-supplier links imported: '.$linkCount);
            } else {
                $this->warn('legacy_suppliers/categories/products not found — skipping product catalog import.');
            }

            $customerMap = $this->importCustomers($dryRun);
            $this->info('Customers imported: '.count($customerMap));

            $quotationMap = $this->importQuotations($customerMap, $dryRun);
            $this->info('Quotations imported: '.count($quotationMap));

            $itemCount = $this->importQuotationItems($quotationMap, $productMap, $dryRun);
            $this->info('Quotation items imported: '.$itemCount);

            $invoiceCount = $this->importInvoicesAndDues($customerMap, $quotationMap, $dryRun);
            $this->info('Invoices + dues imported: '.$invoiceCount);

            if ($dryRun) {
                DB::rollBack();
                $this->warn('Dry run — no changes were saved.');
            } else {
                DB::commit();
                $this->info('Import committed successfully.');
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Import failed and was rolled back: '.$e->getMessage());
            $this->error($e->getFile().':'.$e->getLine());
            return self::FAILURE;
        }

        if ($this->skipped) {
            $this->warn(count($this->skipped).' rows skipped:');
            foreach (array_slice($this->skipped, 0, 30) as $s) {
                $this->line(' - '.$s);
            }
            if (count($this->skipped) > 30) {
                $this->line(' ... and '.(count($this->skipped) - 30).' more');
            }
        }

        return self::SUCCESS;
    }

    private function wipeExistingTransactionalData(): void
    {
        // DELETE (not TRUNCATE) — TRUNCATE is DDL and causes an implicit commit in
        // MySQL, which would silently end the transaction this whole import runs in.
        // Children before parents.
        foreach ([
            'payments', 'customer_ledgers', 'invoices', 'quotation_items',
            'product_supplier_links', 'product_variants',
            'quotations', 'customers',
            'products', 'product_categories', 'suppliers',
        ] as $t) {
            DB::table($t)->delete();
        }
        $this->info('Cleared existing demo customers/quotations/invoices/payments/ledgers/products/suppliers.');
    }

    private function createLegacyPlaceholderProduct(): int
    {
        $existing = Product::where('product_code', 'LEGACY-IMPORT')->first();
        if ($existing) {
            return $existing->id;
        }

        return Product::create([
            'product_code' => 'LEGACY-IMPORT',
            'name' => 'Legacy Imported Item (see notes for original product)',
            'unit' => 'sqft',
            'default_unit_price' => 0,
            'created_by' => $this->adminId,
        ])->id;
    }

    /** @return array<int,int> old supid => new suppliers.id (same value, kept for clarity) */
    private function importSuppliers(bool $dryRun): array
    {
        $rows = DB::table('legacy_suppliers')->orderBy('supid')->get();
        $map = [];
        $now = now();
        $batch = [];
        $seenCodes = [];

        foreach ($rows as $row) {
            $code = $row->supCode ?: ('LEGACY-SUP-'.$row->supid);
            if (isset($seenCodes[$code])) {
                $code .= '-'.$row->supid;
            }
            $seenCodes[$code] = true;

            $batch[] = [
                'id' => $row->supid,
                'supplier_code' => $code,
                'name' => trim((string) $row->supName) ?: 'Unknown Supplier',
                'company_name' => $row->supCompany ?: null,
                'phone' => $row->supMobile ?: null,
                'email' => $row->supEmail ?: null,
                'address' => $row->supAddress ?: null,
                'opening_balance' => $row->balance ?: 0,
                'created_by' => $this->adminId,
                'is_archived' => strtolower((string) $row->status) !== 'active',
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->up_date ?: $now,
            ];
            $map[$row->supid] = $row->supid;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('suppliers')->insert($chunk);
            }
        }

        return $map;
    }

    /** @return array<int,int> old catid => new product_categories.id (same value, kept for clarity) */
    private function importProductCategories(bool $dryRun): array
    {
        $rows = DB::table('legacy_categories')->orderBy('catid')->get();
        $map = [];
        $now = now();
        $batch = [];

        foreach ($rows as $row) {
            $batch[] = [
                'id' => $row->catid,
                'name' => trim((string) $row->catName) ?: ('Category '.$row->catid),
                'created_by' => $this->adminId,
                'is_archived' => strtolower((string) $row->status) !== 'active',
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->up_date ?: $now,
            ];
            $map[$row->catid] = $row->catid;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('product_categories')->insert($chunk);
            }
        }

        return $map;
    }

    /** @return array<int,int> old pid => new products.id (same value, kept for clarity) */
    private function importProducts(array $categoryMap, bool $dryRun): array
    {
        $units = DB::table('legacy_sma_units')->pluck('untName', 'untid');
        $rows = DB::table('legacy_products')->orderBy('pid')->get();
        $map = [];
        $now = now();
        $batch = [];
        $seenCodes = [];

        foreach ($rows as $row) {
            $unitName = $units[$row->untid] ?? '';
            $unit = str_contains(strtolower($unitName), 'pcs') ? 'pcs' : 'sqft';

            $code = $row->pCode ?: ('LEGACY-PROD-'.$row->pid);
            if (isset($seenCodes[$code])) {
                $code .= '-'.$row->pid;
            }
            $seenCodes[$code] = true;

            $batch[] = [
                'id' => $row->pid,
                'product_code' => $code,
                'name' => trim((string) $row->pName) ?: ('Product '.$row->pid),
                'unit' => $unit,
                'product_category_id' => $categoryMap[$row->catid] ?? null,
                'default_unit_price' => $row->sprice ?? 0,
                'details' => $row->pDetails ? strip_tags($row->pDetails) : null,
                'created_by' => $this->adminId,
                'is_archived' => strtolower((string) $row->status) !== 'active',
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->up_date ?: $now,
            ];
            $map[$row->pid] = $row->pid;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('products')->insert($chunk);
            }
        }

        return $map;
    }

    private function importProductSupplierLinks(array $productMap, array $supplierMap, bool $dryRun): int
    {
        $rows = DB::table('legacy_products')->orderBy('pid')->get();
        $now = now();
        $batch = [];
        $count = 0;

        foreach ($rows as $row) {
            if (! isset($productMap[$row->pid]) || ! isset($supplierMap[$row->supid])) {
                $this->skipped[] = "product_supplier_link for product {$row->pid}: missing product or supplier {$row->supid}";
                continue;
            }

            $batch[] = [
                'product_id' => $row->pid,
                'supplier_id' => $row->supid,
                'priority_rank' => 1,
                'cost_price' => $row->pprice ?? 0,
                'min_billing_sqft' => $row->psfLimit ?? 0,
                'created_by' => $this->adminId,
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->up_date ?: $now,
            ];
            $count++;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('product_supplier_links')->insert($chunk);
            }
        }

        return $count;
    }

    /** @return array<int,int> old custid => new customers.id (same value, kept for clarity) */
    private function importCustomers(bool $dryRun): array
    {
        $rows = DB::table('legacy_customers')->orderBy('custid')->get();
        $map = [];
        $now = now();
        $batch = [];
        $seenCodes = [];

        foreach ($rows as $row) {
            $name = trim((string) $row->custName) ?: (trim((string) $row->custCompany) ?: 'Unknown Customer');

            $customerCode = $row->custCode ?: ('LEGACY-'.$row->custid);
            if (isset($seenCodes[$customerCode])) {
                $customerCode .= '-'.$row->custid;
            }
            $seenCodes[$customerCode] = true;

            $batch[] = [
                'id' => $row->custid,
                'customer_code' => $customerCode,
                'name' => Str::limit($name, 250, ''),
                'company_name' => $row->custCompany ?: null,
                'phone' => $row->custMobile ?: null,
                'second_contact_number' => $row->cust2Mobile ?: null,
                'third_contact_number' => $row->cust3Mobile ?: null,
                'email' => $row->custEmail ?: null,
                'address' => $row->custAddress ?: null,
                'address_2' => $row->custAddress2 ?: null,
                'notes' => $row->custNotes ?: null,
                'contact_show_status' => 'show_contact_number',
                'opening_balance' => 0,
                'customer_category_id' => $this->defaultCategoryId,
                'created_by' => $this->adminId,
                'is_archived' => strtolower((string) $row->status) !== 'active',
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->up_date ?: $now,
            ];
            $map[$row->custid] = $row->custid;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('customers')->insert($chunk);
            }
        }

        return $map;
    }

    /** @return array<int,int> old qutid => new quotations.id (same value, kept for clarity) */
    private function importQuotations(array $customerMap, bool $dryRun): array
    {
        $rows = DB::table('legacy_quotation')->orderBy('qutid')->get();
        $map = [];
        $now = now();
        $batch = [];
        $seenNumbers = [];

        foreach ($rows as $row) {
            if (! isset($customerMap[$row->custid])) {
                $this->skipped[] = "quotation {$row->qutid}: unknown customer {$row->custid}";
                continue;
            }

            // A handful of legacy rows share the same qinvoice (old software bug).
            // Keep the original for the first occurrence and disambiguate the rest.
            $quotationNumber = $row->qinvoice ?: ('LEGACY-QT-'.$row->qutid);
            if (isset($seenNumbers[$quotationNumber])) {
                $quotationNumber .= '-'.$row->qutid;
            }
            $seenNumbers[$quotationNumber] = true;

            $vat = is_numeric($row->vat) ? (float) $row->vat : 0;
            $note = trim((string) $row->note);
            if (! empty($row->fNote)) {
                $note .= ($note ? "\n\n" : '').strip_tags($row->fNote);
            }

            $batch[] = [
                'id' => $row->qutid,
                'quotation_number' => $quotationNumber,
                'customer_id' => $row->custid,
                'salesman_id' => null,
                'status' => 'quotation',
                'subtotal' => $row->tAmount ?? 0,
                'convenience_charge' => $row->cCharge ?? 0,
                'other_charge' => $row->oCharge ?? 0,
                'other_charge_label' => $row->oChargeLabel ?: null,
                'vat_percentage' => $vat,
                'vat_amount' => $row->vAmount ?? 0,
                'discount_type' => 'flat',
                'discount_value' => 0,
                'discount_amount' => 0,
                'net_amount' => $row->nAmount ?: $row->tAmount ?? 0,
                'note' => $note ?: null,
                'delivery_address' => $row->dAddress ?: null,
                'created_by' => $this->adminId,
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->up_date ?: $now,
            ];
            $map[$row->qutid] = $row->qutid;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('quotations')->insert($chunk);
            }
        }

        return $map;
    }

    private function importQuotationItems(array $quotationMap, array $productMap, bool $dryRun): int
    {
        $productNames = DB::table('legacy_products')->pluck('pName', 'pid');
        $rows = DB::table('legacy_quotation_product')->orderBy('qutpid')->get();
        $now = now();
        $batch = [];
        $count = 0;

        foreach ($rows as $row) {
            if (! isset($quotationMap[$row->qutid])) {
                $this->skipped[] = "quotation_item {$row->qutpid}: unknown quotation {$row->qutid}";
                continue;
            }

            $width = (float) $row->pLength;
            $height = (float) $row->pHeight;
            $pcs = max(1, (int) $row->pPces);
            $actualSqft = $width > 0 && $height > 0
                ? round(($width * $height * $pcs) / 144, 2)
                : (float) $row->tSFeet;

            // Use the real imported product when we have one; fall back to the
            // generic placeholder for line items whose old product id is missing.
            $productId = $productMap[$row->pid] ?? ($this->legacyProductId ?? 0);
            $productName = $productNames[$row->pid] ?? 'Unknown legacy product (id '.$row->pid.')';
            $notes = isset($productMap[$row->pid]) ? null : ('Original product: '.$productName);
            if (! empty($row->qpDetails)) {
                $stripped = strip_tags($row->qpDetails);
                $notes = $notes ? $notes."\n".$stripped : $stripped;
            }

            $batch[] = [
                'quotation_id' => $row->qutid,
                'product_id' => $productId,
                'product_variant_id' => null,
                'supplier_id' => null,
                'width' => $width,
                'height' => $height,
                'pcs' => $pcs,
                'actual_sqft' => $actualSqft,
                'min_billing_sqft' => 0,
                'billed_sqft' => $row->tSFeet ?? 0,
                'unit_price' => $row->qPrice ?? 0,
                'cost_price' => 0,
                'line_total' => $row->tPrice ?? 0,
                'is_supplier_overridden' => false,
                'notes' => $notes,
                'created_at' => $row->regdate ?: $now,
                'updated_at' => $row->regdate ?: $now,
            ];
            $count++;
        }

        if (! $dryRun) {
            foreach (array_chunk($batch, 200) as $chunk) {
                DB::table('quotation_items')->insert($chunk);
            }
        }

        return $count;
    }

    private function importInvoicesAndDues(array $customerMap, array $quotationMap, bool $dryRun): int
    {
        // Bridge: legacy_sales.oCode -> legacy_order.oCode -> legacy_order.qinvoice -> legacy_quotation.qinvoice -> qutid
        $orderToQinvoice = DB::table('legacy_order')->pluck('qinvoice', 'oCode');
        $qinvoiceToQutid = DB::table('legacy_quotation')->pluck('qutid', 'qinvoice');

        $rows = DB::table('legacy_sales')->orderBy('saDate')->orderBy('said')->get();

        // Running balance per customer for the ledger (chronological order already applied above)
        $runningBalance = [];
        $count = 0;
        $seenInvoiceNumbers = [];

        foreach ($rows as $row) {
            if (! isset($customerMap[$row->custid])) {
                $this->skipped[] = "invoice {$row->invoice}: unknown customer {$row->custid}";
                continue;
            }

            $invoiceNumber = $row->invoice ?: ('LEGACY-INV-'.$row->said);
            if (isset($seenInvoiceNumbers[$invoiceNumber])) {
                $invoiceNumber .= '-'.$row->said;
            }
            $seenInvoiceNumbers[$invoiceNumber] = true;

            $qinvoice = $orderToQinvoice[$row->oCode] ?? null;
            $qutid = $qinvoice ? ($qinvoiceToQutid[$qinvoice] ?? null) : null;

            if (! $qutid || ! isset($quotationMap[$qutid])) {
                $this->skipped[] = "invoice {$row->invoice}: no matching quotation via order {$row->oCode}";
                continue;
            }

            $grandTotal = (float) ($row->nAmount ?: 0) > 0
                ? (float) $row->nAmount
                : (float) $row->tAmount + (float) $row->cCharge;
            $paid = (float) $row->aAmount + (float) $row->pAmount;
            $due = max(round($grandTotal - $paid, 2), 0);
            $paymentStatus = $due <= 0.01 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid');

            if ($dryRun) {
                $count++;
                continue;
            }

            $invoiceId = DB::table('invoices')->insertGetId([
                'invoice_number' => $invoiceNumber,
                'quotation_id' => $qutid,
                'customer_id' => $row->custid,
                'salesman_id' => null,
                'subtotal' => $row->tAmount ?? 0,
                'discount_amount' => $row->disAmount ?? 0,
                'vat_amount' => $row->vAmount ?? 0,
                'grand_total' => $grandTotal,
                'paid_amount' => $paid,
                'due_amount' => $due,
                'payment_status' => $paymentStatus,
                'invoice_date' => $row->saDate,
                'created_by' => $this->adminId,
                'created_at' => $row->regdate ?: now(),
                'updated_at' => $row->up_date ?: now(),
            ]);

            DB::table('quotations')->where('id', $qutid)->update(['status' => 'invoiced']);

            // Ledger: debit for the invoice, credit for whatever was paid
            $balance = $runningBalance[$row->custid] ?? 0;
            $balance += $grandTotal;
            DB::table('customer_ledgers')->insert([
                'customer_id' => $row->custid,
                'salesman_id' => null,
                'transaction_type' => 'invoice',
                'reference_type' => 'Invoice',
                'reference_id' => $invoiceId,
                'description' => 'Legacy invoice '.($row->invoice ?: $invoiceId),
                'debit' => $grandTotal,
                'credit' => 0,
                'balance' => $balance,
                'transaction_date' => $row->saDate,
                'created_by' => $this->adminId,
                'created_at' => $row->regdate ?: now(),
                'updated_at' => $row->regdate ?: now(),
            ]);

            if ($paid > 0) {
                $paymentMethod = match (true) {
                    str_contains(strtolower((string) $row->accountType), 'bank') => 'bank',
                    str_contains(strtolower((string) $row->accountType), 'cash') => 'cash',
                    default => 'mobile',
                };

                $paymentId = DB::table('payments')->insertGetId([
                    'payment_number' => 'LEGACY-PAY-'.$row->said,
                    'invoice_id' => $invoiceId,
                    'customer_id' => $row->custid,
                    'amount' => $paid,
                    'payment_method' => $paymentMethod,
                    'payment_date' => $row->saDate,
                    'notes' => 'Imported from legacy system',
                    'created_by' => $this->adminId,
                    'created_at' => $row->regdate ?: now(),
                    'updated_at' => $row->regdate ?: now(),
                ]);

                $balance -= $paid;
                DB::table('customer_ledgers')->insert([
                    'customer_id' => $row->custid,
                    'salesman_id' => null,
                    'transaction_type' => 'payment',
                    'reference_type' => 'Payment',
                    'reference_id' => $paymentId,
                    'description' => 'Legacy payment for invoice '.($row->invoice ?: $invoiceId),
                    'debit' => 0,
                    'credit' => $paid,
                    'balance' => $balance,
                    'transaction_date' => $row->saDate,
                    'created_by' => $this->adminId,
                    'created_at' => $row->regdate ?: now(),
                    'updated_at' => $row->regdate ?: now(),
                ]);
            }

            $runningBalance[$row->custid] = $balance;
            $count++;
        }

        return $count;
    }
}
