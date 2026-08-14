<?php

namespace Tests\Feature;

use App\Models\Customer;
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

class QuotationApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $salesman;
    protected Customer $customer;
    protected Product $product;
    protected Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->salesman = User::factory()->create(['role' => 'salesman']);
        $this->salesman->assignRole('salesman');

        $category = \App\Models\CustomerCategory::create([
            'name'       => 'Retail',
            'created_by' => $this->admin->id,
        ]);

        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Test Customer',
            'phone'                => '01700000000',
            'created_by'           => $this->admin->id,
        ]);

        $this->product = Product::create([
            'product_code'       => 'BL-001',
            'name'               => 'Vertical Blind Standard',
            'unit'               => 'sqft',
            'default_unit_price' => 100.00,
            'created_by'         => $this->admin->id,
        ]);

        $this->supplier = Supplier::create([
            'supplier_code' => 'SUP-0001',
            'name'          => 'Blind Fabric Ltd',
            'company_name'  => 'Blind Fabric Ltd',
            'created_by'    => $this->admin->id,
        ]);

        // Link product & supplier with min_billing_sqft = 15
        ProductSupplierLink::create([
            'product_id'       => $this->product->id,
            'supplier_id'      => $this->supplier->id,
            'cost_price'       => 50.00,
            'min_billing_sqft' => 15.00,
            'priority_rank'    => 1,
            'created_by'       => $this->admin->id,
        ]);
    }

    /** @test */
    public function helper_returns_preferred_supplier_and_min_billing_sqft()
    {
        $response = $this->actingAs($this->salesman, 'sanctum')
            ->getJson("/api/quotations/preferred-supplier/{$this->product->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.supplier_id', $this->supplier->id)
            ->assertJsonPath('data.cost_price', 50)
            ->assertJsonPath('data.min_billing_sqft', 15);
    }

    /** @test */
    public function salesman_can_create_quotation_with_sqft_calculations_and_auto_supplier_routing()
    {
        // Item specs: 36in x 48in (12 sqft actual < 15 min_billing), 2 pcs, unit_price = 100
        // actual_sqft = (36 * 48)/144 = 12
        // billed_sqft = max(12, 15) * 2 = 30 sqft
        // line_total = 30 * 100 = 3000
        $payload = [
            'customer_id'        => $this->customer->id,
            'convenience_charge' => 100,
            'other_charge'       => 50,
            'vat_percentage'     => 5,
            'discount_type'      => 'flat',
            'discount_value'     => 200,
            'items'              => [
                [
                    'product_id' => $this->product->id,
                    'width'      => 36,
                    'height'     => 48,
                    'pcs'        => 2,
                    'unit_price' => 100,
                ],
            ],
        ];

        $response = $this->actingAs($this->salesman, 'sanctum')
            ->postJson('/api/quotations', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'quotation')
            ->assertJsonPath('data.subtotal', 3000)
            ->assertJsonPath('data.vat_amount', 150) // 5% of 3000
            ->assertJsonPath('data.discount_amount', 200)
            ->assertJsonPath('data.net_amount', 3100); // 3000 + 100 + 50 + 150 - 200 = 3100

        $quotation = Quotation::with('items')->first();
        $this->assertNotNull($quotation);
        $this->assertStringStartsWith('QT-' . now()->format('Y') . '-', $quotation->quotation_number);
        $this->assertCount(1, $quotation->items);

        $item = $quotation->items->first();
        $this->assertEquals(12.00, $item->actual_sqft);
        $this->assertEquals(15.00, $item->min_billing_sqft);
        $this->assertEquals(30.00, $item->billed_sqft);
        $this->assertEquals(3000.00, $item->line_total);
        $this->assertEquals($this->supplier->id, $item->supplier_id);
        $this->assertFalse($item->is_supplier_overridden);
    }

    /** @test */
    public function quotation_can_be_converted_to_order_pending_approval()
    {
        $quotation = Quotation::create([
            'quotation_number' => 'QT-2026-0001',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'quotation',
            'subtotal'         => 1000,
            'net_amount'       => 1000,
            'created_by'       => $this->salesman->id,
        ]);

        $response = $this->actingAs($this->salesman, 'sanctum')
            ->postJson("/api/quotations/{$quotation->id}/convert-to-order", [
                'discount_type'  => 'percentage',
                'discount_value' => 10, // 10% of 1000 = 100
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'pending_approval')
            ->assertJsonPath('data.discount_amount', 100)
            ->assertJsonPath('data.net_amount', 900);
    }

    /** @test */
    public function admin_approval_creates_purchase_entries_and_supplier_ledger_records()
    {
        $quotation = Quotation::create([
            'quotation_number' => 'QT-2026-0002',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'pending_approval',
            'subtotal'         => 3000,
            'net_amount'       => 3000,
            'created_by'       => $this->salesman->id,
        ]);

        $item = $quotation->items()->create([
            'product_id'       => $this->product->id,
            'supplier_id'      => $this->supplier->id,
            'width'            => 36,
            'height'           => 48,
            'pcs'              => 2,
            'actual_sqft'      => 12,
            'min_billing_sqft' => 15,
            'billed_sqft'      => 30,
            'unit_price'       => 100,
            'cost_price'       => 50,
            'line_total'       => 3000,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$quotation->id}/approve");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'approved');

        // Verify Purchase Entry created (30 sqft * 50 cost_price = 1500 total_cost)
        $purchaseEntry = PurchaseEntry::where('quotation_id', $quotation->id)->first();
        $this->assertNotNull($purchaseEntry);
        $this->assertEquals(1500.00, $purchaseEntry->total_cost);
        $this->assertStringStartsWith('PO-' . now()->format('Y') . '-', $purchaseEntry->purchase_number);

        // Verify Supplier Ledger credit
        $ledger = SupplierLedger::where('supplier_id', $this->supplier->id)->first();
        $this->assertNotNull($ledger);
        $this->assertEquals(1500.00, $ledger->credit);
        $this->assertEquals(1500.00, $ledger->balance);
    }

    /** @test */
    public function editing_approved_quotation_changes_status_to_pending_reapproval()
    {
        $quotation = Quotation::create([
            'quotation_number' => 'QT-2026-0003',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'approved',
            'subtotal'         => 3000,
            'net_amount'       => 3000,
            'created_by'       => $this->salesman->id,
        ]);

        $quotation->items()->create([
            'product_id'       => $this->product->id,
            'supplier_id'      => $this->supplier->id,
            'width'            => 36,
            'height'           => 48,
            'pcs'              => 2,
            'actual_sqft'      => 12,
            'min_billing_sqft' => 15,
            'billed_sqft'      => 30,
            'unit_price'       => 100,
            'cost_price'       => 50,
            'line_total'       => 3000,
        ]);

        $payload = [
            'customer_id' => $this->customer->id,
            'items'       => [
                [
                    'product_id' => $this->product->id,
                    'width'      => 40,
                    'height'     => 50,
                    'pcs'        => 3,
                    'unit_price' => 120,
                ],
            ],
        ];

        $response = $this->actingAs($this->salesman, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'pending_reapproval');
    }

    /** @test */
    public function invoiced_quotation_cannot_be_edited_or_archived()
    {
        $quotation = Quotation::create([
            'quotation_number' => 'QT-2026-0004',
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->salesman->id,
            'status'           => 'invoiced',
            'subtotal'         => 1000,
            'net_amount'       => 1000,
            'created_by'       => $this->salesman->id,
        ]);

        // Attempt edit
        $editResponse = $this->actingAs($this->salesman, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", [
                'customer_id' => $this->customer->id,
                'items'       => [
                    ['product_id' => $this->product->id, 'width' => 10, 'height' => 10, 'pcs' => 1, 'unit_price' => 50],
                ],
            ]);
        $editResponse->assertStatus(422);

        // Attempt archive
        $deleteResponse = $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/quotations/{$quotation->id}");
        $deleteResponse->assertStatus(422);
    }
}
