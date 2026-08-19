<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Models\Product;
use App\Models\ProductSupplierLink;
use App\Models\PurchaseEntry;
use App\Models\Quotation;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The whole chain, run once as Dhaka Blinds and once as Western Blinds Ltd.
 *
 * The business trades under two names out of one system. Customers, products
 * and suppliers are shared; everything transactional is not. That split is
 * enforced by a global scope rather than by each endpoint remembering to
 * filter, so the thing worth testing is the end-to-end result: a full order
 * placed under one trade name must produce its own paperwork, must not be
 * visible to the other, and must not collide with the other's numbering.
 *
 * Both halves have gone wrong before — the numbering restarted at 0001 for
 * the second brand and collided, and every list showed both brands' rows.
 */
class TwoBrandOrderFlowTest extends TestCase
{
    use RefreshDatabase;

    protected Customer $customer;
    protected Product $product;
    protected Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $seedAdmin = User::factory()->create(['role' => 'admin', 'brand_id' => Brand::DEFAULT_ID]);

        $category = CustomerCategory::create(['name' => 'Retail', 'created_by' => $seedAdmin->id]);

        // Shared across both trade names, on purpose.
        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Shared Customer',
            'phone'                => '01700000000',
            'created_by'           => $seedAdmin->id,
        ]);

        $this->product = Product::create([
            'product_code'       => 'BL-001',
            'name'               => 'Roller Blind',
            'unit'               => 'sqft',
            'default_unit_price' => 100,
            'created_by'         => $seedAdmin->id,
        ]);

        $this->supplier = Supplier::create([
            'supplier_code' => 'SUP-0001',
            'name'          => 'Blind Fabric Ltd',
            'company_name'  => 'Blind Fabric Ltd',
            'created_by'    => $seedAdmin->id,
        ]);

        ProductSupplierLink::create([
            'product_id'       => $this->product->id,
            'supplier_id'      => $this->supplier->id,
            'cost_price'       => 50,
            'min_billing_sqft' => 0,
            'priority_rank'    => 1,
            'created_by'       => $seedAdmin->id,
        ]);
    }

    private function adminFor(int $brandId): User
    {
        $user = User::factory()->create(['role' => 'admin', 'brand_id' => $brandId]);
        $user->assignRole('admin');

        return $user;
    }

    /** Places an order and takes it all the way to an invoice and challan. */
    private function runFullChain(User $admin): array
    {
        // 1. Quotation
        $created = $this->actingAs($admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'items'       => [[
                'product_id' => $this->product->id,
                'width'      => 36,
                'height'     => 48,
                'pcs'        => 1,
                'unit_price' => 100,
            ]],
        ]);
        $created->assertStatus(201);
        $quotationId = $created->json('data.id');

        // 2. Convert to order
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/quotations/{$quotationId}/convert-to-order")
            ->assertStatus(200);

        // 3. Approve — this is what raises the purchase side
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/quotations/{$quotationId}/approve")
            ->assertStatus(200);

        // 4. Invoice + delivery challan in one action
        $invoiced = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$quotationId}");
        $invoiced->assertStatus(201);

        return [
            'quotation_id'   => $quotationId,
            'quotation_no'   => Quotation::withoutGlobalScope('brand')->find($quotationId)->quotation_number,
            'invoice_id'     => $invoiced->json('data.invoice.id'),
            'invoice_number' => $invoiced->json('data.invoice.invoice_number'),
        ];
    }

    public function test_the_full_chain_runs_under_each_trade_name(): void
    {
        foreach ([Brand::DEFAULT_ID, 2] as $brandId) {
            $admin = $this->adminFor($brandId);
            $result = $this->runFullChain($admin);

            $quotation = Quotation::withoutGlobalScope('brand')->find($result['quotation_id']);
            $this->assertSame($brandId, $quotation->brand_id, "order tagged to brand {$brandId}");
            $this->assertSame('invoiced', $quotation->status);

            // The supplier is owed the cost of what was ordered: 12 sq.ft x 50
            $entries = PurchaseEntry::withoutGlobalScope('brand')
                ->where('quotation_id', $quotation->id)->where('is_reversed', false)->get();
            $this->assertCount(1, $entries, "purchase raised under brand {$brandId}");
            $this->assertEquals(600, $entries->sum('total_cost'));
            $this->assertSame($brandId, $entries->first()->brand_id);

            $ledger = SupplierLedger::withoutGlobalScope('brand')
                ->where('reference_id', $entries->first()->id)
                ->where('transaction_type', 'purchase')->first();
            $this->assertNotNull($ledger, "supplier ledger written under brand {$brandId}");
            $this->assertEquals(600, $ledger->credit);

            $invoice = Invoice::withoutGlobalScope('brand')->find($result['invoice_id']);
            $this->assertSame($brandId, $invoice->brand_id);
            $this->assertEquals(1200, $invoice->grand_total);

            $challan = DeliveryChallan::withoutGlobalScope('brand')
                ->where('invoice_id', $invoice->id)->first();
            $this->assertNotNull($challan, "challan raised under brand {$brandId}");
            $this->assertSame($brandId, $challan->brand_id);
        }
    }

    /**
     * Numbers are one sequence across both trade names. Per-brand counters
     * would hand the second brand a number the first had already issued, and
     * the unique index turns that into a hard failure at save time.
     */
    public function test_document_numbers_never_collide_between_the_two(): void
    {
        $first = $this->runFullChain($this->adminFor(Brand::DEFAULT_ID));
        $second = $this->runFullChain($this->adminFor(2));

        $this->assertNotSame($first['quotation_no'], $second['quotation_no']);
        $this->assertNotSame($first['invoice_number'], $second['invoice_number']);

        foreach ([
            ['quotations', 'quotation_number'],
            ['invoices', 'invoice_number'],
            ['delivery_challans', 'challan_number'],
        ] as [$table, $column]) {
            $total = \DB::table($table)->count();
            $distinct = \DB::table($table)->distinct()->count($column);
            $this->assertSame($total, $distinct, "duplicate {$column} across brands");
        }
    }

    /** Neither trade name may see the other's transactions in a list. */
    public function test_neither_brand_sees_the_others_orders(): void
    {
        $dhaka = $this->adminFor(Brand::DEFAULT_ID);
        $western = $this->adminFor(2);

        $dhakaOrder = $this->runFullChain($dhaka);
        $westernOrder = $this->runFullChain($western);

        $seenByDhaka = collect($this->actingAs($dhaka, 'sanctum')
            ->getJson('/api/quotations?all=1')->json('data'))->pluck('quotation_number');
        $this->assertContains($dhakaOrder['quotation_no'], $seenByDhaka);
        $this->assertNotContains($westernOrder['quotation_no'], $seenByDhaka);

        $seenByWestern = collect($this->actingAs($western, 'sanctum')
            ->getJson('/api/quotations?all=1')->json('data'))->pluck('quotation_number');
        $this->assertContains($westernOrder['quotation_no'], $seenByWestern);
        $this->assertNotContains($dhakaOrder['quotation_no'], $seenByWestern);
    }

    public function test_neither_brand_sees_the_others_invoices(): void
    {
        $dhaka = $this->adminFor(Brand::DEFAULT_ID);
        $western = $this->adminFor(2);

        $dhakaOrder = $this->runFullChain($dhaka);
        $westernOrder = $this->runFullChain($western);

        $seenByDhaka = collect($this->actingAs($dhaka, 'sanctum')
            ->getJson('/api/invoices?all=1')->json('data'))->pluck('invoice_number');
        $this->assertContains($dhakaOrder['invoice_number'], $seenByDhaka);
        $this->assertNotContains($westernOrder['invoice_number'], $seenByDhaka);
    }

    /** One brand must not be able to invoice the other's order by guessing its id. */
    public function test_one_brand_cannot_invoice_the_others_order(): void
    {
        $dhaka = $this->adminFor(Brand::DEFAULT_ID);

        // A Western Blinds order, approved and ready to invoice.
        $western = $this->adminFor(2);
        $created = $this->actingAs($western, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'status'      => 'approved',
            'items'       => [[
                'product_id' => $this->product->id,
                'width' => 36, 'height' => 48, 'pcs' => 1, 'unit_price' => 100,
            ]],
        ]);
        $westernQuotationId = $created->json('data.id');

        $this->actingAs($dhaka, 'sanctum')
            ->postJson("/api/invoices/generate/{$westernQuotationId}")
            ->assertStatus(404);

        $this->assertSame(
            0,
            Invoice::withoutGlobalScope('brand')->where('quotation_id', $westernQuotationId)->count()
        );
    }

    /** Shared master data stays shared — both trade names sell the same catalogue. */
    public function test_customers_and_products_stay_shared(): void
    {
        foreach ([Brand::DEFAULT_ID, 2] as $brandId) {
            $admin = $this->adminFor($brandId);

            $customers = collect($this->actingAs($admin, 'sanctum')
                ->getJson('/api/customers?all=1')->json('data'))->pluck('customer_code');
            $this->assertContains('CUS-0001', $customers, "customer visible to brand {$brandId}");

            $products = collect($this->actingAs($admin, 'sanctum')
                ->getJson('/api/products?all=1')->json('data'))->pluck('product_code');
            $this->assertContains('BL-001', $products, "product visible to brand {$brandId}");
        }
    }
}
