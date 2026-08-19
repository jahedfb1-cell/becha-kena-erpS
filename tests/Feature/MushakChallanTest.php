<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Invoice;
use App\Models\MushakInvoice;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Quotation;
use App\Models\QuotationItem;
use App\Models\User;
use App\Services\MushakService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

/**
 * Covers MushakService — the NBR Mushak 6.3 VAT challan.
 *
 * These are regulatory documents, so the tests pin down both the refusals
 * (a challan that should never have been issued) and the arithmetic that
 * ends up printed on the form.
 */
class MushakChallanTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;
    protected Product $product;
    protected MushakService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        Storage::fake();
        $this->writeSellerProfile();

        // Mushak challans belong to Western Blinds Ltd (brand 2) only.
        $this->admin = User::factory()->create([
            'role'     => 'admin',
            'brand_id' => MushakService::VAT_REGISTERED_BRAND_ID,
        ]);
        $this->admin->assignRole('admin');

        $category = CustomerCategory::create([
            'name'       => 'Corporate Office',
            'created_by' => $this->admin->id,
        ]);

        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Acme Interiors',
            'phone'                => '01700000000',
            'address'              => '12 Gulshan Avenue, Dhaka',
            'created_by'           => $this->admin->id,
        ]);

        $this->product = $this->makeProduct('BL-001', 'Roller Blind', 'sqft', 'Roller Blinds');

        $this->service = new MushakService();
    }

    /** The seller BIN lives in the brand's company-profile JSON, not the DB. */
    private function writeSellerProfile(array $overrides = []): void
    {
        Storage::put(
            Brand::profilePath(MushakService::VAT_REGISTERED_BRAND_ID),
            json_encode(array_merge([
                'company_name'    => 'Western Blinds Ltd',
                'company_address' => '99 Banani, Dhaka',
                'vat_reg_no'      => '001234567-0101',
            ], $overrides))
        );
    }

    private function makeProduct(string $code, string $name, string $unit, ?string $categoryName): Product
    {
        $categoryId = null;
        if ($categoryName) {
            $categoryId = ProductCategory::firstOrCreate(
                ['name' => $categoryName],
                ['created_by' => $this->admin->id]
            )->id;
        }

        return Product::create([
            'product_code'        => $code,
            'name'                => $name,
            'unit'                => $unit,
            'product_category_id' => $categoryId,
            'default_unit_price'  => 100,
            'created_by'          => $this->admin->id,
        ]);
    }

    /**
     * A VAT-applicable order and its invoice, on the VAT-registered brand.
     * Defaults are the happy path; each guard-rail test spoils one thing.
     */
    private function makeInvoice(array $quotationOverrides = [], array $invoiceOverrides = []): Invoice
    {
        $quotation = Quotation::create(array_merge([
            'brand_id'         => MushakService::VAT_REGISTERED_BRAND_ID,
            'quotation_number' => 'QT-2026-' . str_pad((string) (Quotation::withoutGlobalScope('brand')->count() + 1), 4, '0', STR_PAD_LEFT),
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->admin->id,
            'status'           => 'invoiced',
            'vat_enabled'      => true,
            'vat_rate'         => 15,
            'vat_inclusive'    => false,
            'subtotal'         => 1000,
            'net_amount'       => 1150,
            'created_by'       => $this->admin->id,
        ], $quotationOverrides));

        return Invoice::create(array_merge([
            'brand_id'       => MushakService::VAT_REGISTERED_BRAND_ID,
            'invoice_number' => 'INV-2026-' . str_pad((string) (Invoice::withoutGlobalScope('brand')->count() + 1), 4, '0', STR_PAD_LEFT),
            'quotation_id'   => $quotation->id,
            'customer_id'    => $this->customer->id,
            'subtotal'       => 1000,
            'grand_total'    => 1150,
            'due_amount'     => 1150,
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ], $invoiceOverrides));
    }

    private function addItem(Quotation $quotation, Product $product, array $attributes = []): QuotationItem
    {
        return QuotationItem::create(array_merge([
            'quotation_id'         => $quotation->id,
            'product_id'           => $product->id,
            'width'                => 36,
            'height'               => 48,
            'pcs'                  => 1,
            'billed_sqft'          => 12,
            'unit_price'           => 100,
            'line_total'           => 1200,
            'is_optional'          => false,
            'is_selected'          => true,
            'is_enabled_for_print' => true,
        ], $attributes));
    }

    // ── Guard rails ──────────────────────────────────────────────────

    public function test_it_refuses_to_issue_against_an_archived_invoice(): void
    {
        $invoice = $this->makeInvoice([], ['is_archived' => true]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('archived invoice');

        $this->service->assertIssuable($invoice);
    }

    public function test_it_refuses_a_second_challan_while_one_still_stands(): void
    {
        $invoice = $this->makeInvoice();
        $this->addItem($invoice->quotation, $this->product);
        $this->service->issue($invoice, $this->admin->id);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('already been issued');

        $this->service->assertIssuable($invoice->fresh());
    }

    /**
     * The reissue path: an archived challan was withdrawn so a corrected one
     * could replace it, so it must not block its own replacement.
     */
    public function test_an_archived_challan_does_not_block_a_replacement(): void
    {
        $invoice = $this->makeInvoice();
        $this->addItem($invoice->quotation, $this->product);

        $first = $this->service->issue($invoice, $this->admin->id);
        $first->archive($this->admin->id, 'Wrong rate');

        $second = $this->service->issue($invoice->fresh(), $this->admin->id);

        $this->assertNotSame($first->challan_number, $second->challan_number);
        $this->assertSame(2, MushakInvoice::withoutGlobalScope('brand')->count());
    }

    public function test_it_refuses_to_issue_for_a_non_vat_registered_brand(): void
    {
        $invoice = $this->makeInvoice(
            ['brand_id' => Brand::DEFAULT_ID],
            ['brand_id' => Brand::DEFAULT_ID]
        );

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Western Blinds Ltd');

        $this->service->assertIssuable($invoice);
    }

    public function test_it_refuses_to_issue_when_the_order_is_not_vat_applicable(): void
    {
        $invoice = $this->makeInvoice(['vat_enabled' => false]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('not marked VAT applicable');

        $this->service->assertIssuable($invoice);
    }

    public function test_it_refuses_to_issue_when_no_vat_rate_is_set(): void
    {
        $invoice = $this->makeInvoice(['vat_rate' => 0]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('no VAT rate');

        $this->service->assertIssuable($invoice);
    }

    public function test_it_refuses_to_issue_without_a_seller_bin(): void
    {
        $this->writeSellerProfile(['vat_reg_no' => '  ']);
        $invoice = $this->makeInvoice();

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Seller BIN is not configured');

        $this->service->assertIssuable($invoice);
    }

    // ── Issuing ──────────────────────────────────────────────────────

    public function test_it_snapshots_seller_buyer_and_vat_settings_onto_the_challan(): void
    {
        $invoice = $this->makeInvoice();
        $this->addItem($invoice->quotation, $this->product);

        $challan = $this->service->issue(
            $invoice,
            $this->admin->id,
            '009988776-0202',
            'Rahim Uddin',
            'Accounts Manager'
        );

        $this->assertSame('Western Blinds Ltd', $challan->seller_name);
        $this->assertSame('001234567-0101', $challan->seller_bin);
        $this->assertSame('99 Banani, Dhaka', $challan->seller_address);

        $this->assertSame('Acme Interiors', $challan->buyer_name);
        $this->assertSame('12 Gulshan Avenue, Dhaka', $challan->buyer_address);
        // The typed-in BIN wins over anything stored on the customer.
        $this->assertSame('009988776-0202', $challan->buyer_bin);

        $this->assertSame(15.0, $challan->vat_rate);
        $this->assertFalse($challan->vat_inclusive);
        $this->assertSame('Rahim Uddin', $challan->issued_by_name);
        $this->assertSame('Accounts Manager', $challan->issued_by_designation);
        $this->assertSame($invoice->id, $challan->sales_invoice_id);
    }

    public function test_challan_numbers_run_in_an_unbroken_yearly_sequence(): void
    {
        $expected = ['MUSHAK-' . now()->format('Y') . '-0001', 'MUSHAK-' . now()->format('Y') . '-0002'];

        foreach ($expected as $number) {
            $invoice = $this->makeInvoice();
            $this->addItem($invoice->quotation, $this->product);

            $this->assertSame($number, $this->service->issue($invoice, $this->admin->id)->challan_number);
        }
    }

    /**
     * The core grouping rule: an order of one kind of goods cut to several
     * window sizes is a single supply on the form, with the areas added up.
     */
    public function test_it_groups_lines_of_the_same_goods_into_one_row(): void
    {
        $invoice   = $this->makeInvoice();
        $quotation = $invoice->quotation;

        // Two different products, same category — one supply of "Roller Blinds".
        $second = $this->makeProduct('BL-002', 'Roller Blind Blackout', 'sqft', 'Roller Blinds');

        $this->addItem($quotation, $this->product, ['billed_sqft' => 12, 'line_total' => 1200]);
        $this->addItem($quotation, $second, ['billed_sqft' => 8, 'line_total' => 800]);

        $challan = $this->service->issue($invoice, $this->admin->id);

        $this->assertCount(1, $challan->items);

        $row = $challan->items->first();
        $this->assertSame('Roller Blinds', $row->description);
        $this->assertSame('sqft', $row->unit);
        $this->assertEquals(20, $row->quantity);
        $this->assertEquals(2000, $row->total_value);
        $this->assertEquals(100, $row->unit_price);
    }

    /**
     * Unit is part of the grouping key: adding a piece count to an area would
     * produce a quantity that means nothing.
     */
    public function test_it_keeps_per_piece_goods_on_their_own_row(): void
    {
        $invoice   = $this->makeInvoice();
        $quotation = $invoice->quotation;

        // Same category, different unit — a motor sold by the piece.
        $motor = $this->makeProduct('MT-001', 'Smart Motor', 'pcs', 'Roller Blinds');

        $this->addItem($quotation, $this->product, ['billed_sqft' => 12, 'line_total' => 1200]);
        $this->addItem($quotation, $motor, ['billed_sqft' => 0, 'pcs' => 2, 'line_total' => 5000]);

        $challan = $this->service->issue($invoice, $this->admin->id);

        $this->assertCount(2, $challan->items);

        $units = $challan->items->pluck('quantity', 'unit');
        $this->assertEquals(12, $units['sqft']);
        $this->assertEquals(2, $units['pcs']);
    }

    /** Goods the customer did not take must not be charged VAT. */
    public function test_it_skips_unselected_options_and_lines_switched_off_for_print(): void
    {
        $invoice   = $this->makeInvoice();
        $quotation = $invoice->quotation;

        $this->addItem($quotation, $this->product, ['billed_sqft' => 12, 'line_total' => 1200]);
        $this->addItem($quotation, $this->product, [
            'billed_sqft' => 99, 'line_total' => 9900,
            'is_optional' => true, 'is_selected' => false,
        ]);
        $this->addItem($quotation, $this->product, [
            'billed_sqft' => 77, 'line_total' => 7700,
            'is_enabled_for_print' => false,
        ]);

        $challan = $this->service->issue($invoice, $this->admin->id);

        $this->assertCount(1, $challan->items);
        $this->assertEquals(12, $challan->items->first()->quantity);
        $this->assertEquals(1200, $challan->items->first()->total_value);
    }

    public function test_an_exclusive_order_adds_vat_on_top_of_the_line_total(): void
    {
        $invoice = $this->makeInvoice(['vat_inclusive' => false]);
        $this->addItem($invoice->quotation, $this->product, ['billed_sqft' => 10, 'line_total' => 1000]);

        $challan = $this->service->issue($invoice, $this->admin->id);
        $row     = $challan->items->first();

        $this->assertEquals(1000, $row->total_value);
        $this->assertEquals(150, $row->vat_amount);
        $this->assertEquals(1150, $row->total_including_tax);
        // Columns 5 and 6 are both VAT-excluded, so they must reconcile.
        $this->assertEquals(100, $row->unit_price);
    }

    /**
     * On an inclusive order the unit price still has VAT inside it, so the
     * printed rate has to be derived from the taxable value or columns 5
     * and 6 of the form would disagree.
     */
    public function test_an_inclusive_order_extracts_vat_from_the_line_total(): void
    {
        $invoice = $this->makeInvoice(['vat_inclusive' => true]);
        $this->addItem($invoice->quotation, $this->product, ['billed_sqft' => 10, 'line_total' => 1150]);

        $challan = $this->service->issue($invoice, $this->admin->id);
        $row     = $challan->items->first();

        $this->assertEquals(1000, $row->total_value);
        $this->assertEquals(150, $row->vat_amount);
        $this->assertEquals(1150, $row->total_including_tax);
        $this->assertEquals(100, $row->unit_price);
    }

    /** The header must never disagree with the rows printed underneath it. */
    public function test_header_totals_are_summed_from_the_printed_rows(): void
    {
        $invoice   = $this->makeInvoice();
        $quotation = $invoice->quotation;

        $motor = $this->makeProduct('MT-001', 'Smart Motor', 'pcs', 'Motors');

        $this->addItem($quotation, $this->product, ['billed_sqft' => 10, 'line_total' => 1000]);
        $this->addItem($quotation, $motor, ['billed_sqft' => 0, 'pcs' => 1, 'line_total' => 2000]);

        $challan = $this->service->issue($invoice, $this->admin->id);

        $this->assertEquals(3000, $challan->taxable_amount);
        $this->assertEquals(450, $challan->vat_amount);
        $this->assertEquals(3450, $challan->grand_total);
        $this->assertEquals(0, $challan->sd_amount);

        $this->assertEquals(
            $challan->grand_total,
            round($challan->taxable_amount + $challan->vat_amount, 2)
        );
    }

    /** Products with no category fall back to their own name. */
    public function test_uncategorised_products_group_under_their_own_name(): void
    {
        $invoice = $this->makeInvoice();
        $loose   = $this->makeProduct('MISC-1', 'Custom Bracket', 'pcs', null);

        $this->addItem($invoice->quotation, $loose, ['billed_sqft' => 0, 'pcs' => 3, 'line_total' => 300]);

        $challan = $this->service->issue($invoice, $this->admin->id);

        $this->assertSame('Custom Bracket', $challan->items->first()->description);
    }
}
