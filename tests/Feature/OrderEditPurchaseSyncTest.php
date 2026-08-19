<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerCategory;
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
 * The purchase side of an order must always match the order itself.
 *
 * Every approved order owes its supplier the cost of what was ordered, and
 * that debt is recorded as purchase entries plus a supplier ledger credit.
 * The Orders screen submits the same payload for creating and for editing,
 * and that payload always carries status "approved" (the Direct Confirmed
 * Order flow), so the edit path has to keep the purchase side in step just
 * as the create and approve paths do.
 *
 * Without that, an order can reach "approved" — and then be invoiced —
 * while the business never records what it owes the supplier for it.
 */
class OrderEditPurchaseSyncTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;
    protected Product $product;
    protected Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $category = CustomerCategory::create([
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

        ProductSupplierLink::create([
            'product_id'       => $this->product->id,
            'supplier_id'      => $this->supplier->id,
            'cost_price'       => 50.00,
            'min_billing_sqft' => 0,
            'priority_rank'    => 1,
            'created_by'       => $this->admin->id,
        ]);
    }

    /** The payload the Orders screen sends, for both create and edit. */
    private function orderPayload(array $overrides = [], float $height = 48): array
    {
        return array_merge([
            'customer_id' => $this->customer->id,
            'status'      => 'approved', // Direct Confirmed Order
            'items'       => [[
                'product_id' => $this->product->id,
                'width'      => 36,
                'height'     => $height,
                'pcs'        => 1,
                'unit_price' => 100,
            ]],
        ], $overrides);
    }

    private function activeEntries(Quotation $q)
    {
        return PurchaseEntry::where('quotation_id', $q->id)->where('is_reversed', false)->get();
    }

    /**
     * An order that arrives at "approved" through the edit screen owes its
     * supplier exactly as much as one approved through the approve button.
     */
    public function test_editing_a_pending_order_into_approved_records_the_purchase(): void
    {
        // Created as a plain quotation, then converted — no purchase yet.
        $create = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->orderPayload(['status' => 'quotation']));
        $create->assertStatus(201);
        $quotation = Quotation::find($create->json('data.id'));

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$quotation->id}/convert-to-order")
            ->assertStatus(200);

        $this->assertCount(0, $this->activeEntries($quotation));

        // Editing it on the Orders screen sends status "approved".
        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", $this->orderPayload())
            ->assertStatus(200);

        $this->assertSame('approved', $quotation->fresh()->status);

        $entries = $this->activeEntries($quotation);
        $this->assertCount(1, $entries, 'Approving through the edit screen must record the purchase.');
        // 36 x 48 = 12 sq.ft at cost 50
        $this->assertEquals(600, $entries->sum('total_cost'));

        $this->assertEquals(
            600,
            SupplierLedger::where('supplier_id', $this->supplier->id)->sum('credit'),
            'The supplier is owed the cost of what was ordered.'
        );
    }

    /** Approving through an edit must leave the same audit trail as approving. */
    public function test_editing_a_pending_order_into_approved_stamps_who_approved_it(): void
    {
        $create = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->orderPayload(['status' => 'quotation']));
        $quotation = Quotation::find($create->json('data.id'));

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$quotation->id}/convert-to-order");

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", $this->orderPayload())
            ->assertStatus(200);

        $this->assertSame($this->admin->id, $quotation->fresh()->approved_by);
        $this->assertNotNull($quotation->fresh()->approved_at);
    }

    /**
     * Changing the sizes on an approved order changes what it costs, so the
     * recorded debt has to follow. Otherwise the supplier ledger keeps
     * charging for the sizes that were replaced.
     */
    public function test_resizing_an_approved_order_resyncs_what_the_supplier_is_owed(): void
    {
        $create = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->orderPayload());
        $create->assertStatus(201);
        $quotation = Quotation::find($create->json('data.id'));

        // 36 x 48 = 12 sq.ft at cost 50 = 600
        $this->assertEquals(600, $this->activeEntries($quotation)->sum('total_cost'));

        // Re-cut to double the height: 36 x 96 = 24 sq.ft at cost 50 = 1200
        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", $this->orderPayload([], 96))
            ->assertStatus(200);

        $this->assertEquals(
            1200,
            $this->activeEntries($quotation)->sum('total_cost'),
            'The live purchase must reflect the sizes now on the order.'
        );

        // The old debt is reversed rather than left standing alongside the new.
        $ledger = SupplierLedger::where('supplier_id', $this->supplier->id)->orderBy('id', 'desc')->first();
        $this->assertEquals(1200, $ledger->balance, 'Net payable must equal the current order cost.');
    }

    /**
     * An order must not be able to reach "invoiced" without its purchase
     * being on record — that is how the cost side goes missing entirely.
     */
    public function test_an_order_cannot_reach_invoiced_without_a_purchase_on_record(): void
    {
        $create = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->orderPayload(['status' => 'quotation']));
        $quotation = Quotation::find($create->json('data.id'));

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$quotation->id}/convert-to-order");

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", $this->orderPayload());

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/invoices/generate/{$quotation->id}")
            ->assertStatus(201);

        $this->assertGreaterThan(
            0,
            $this->activeEntries($quotation->fresh())->count(),
            'An invoiced order with no purchase entry means the supplier cost was never recorded.'
        );
    }

    /** Editing without touching status keeps the documented re-approval flow. */
    public function test_editing_an_approved_order_without_a_status_still_needs_reapproval(): void
    {
        $create = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->orderPayload());
        $quotation = Quotation::find($create->json('data.id'));

        $payload = $this->orderPayload([], 96);
        unset($payload['status']);

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$quotation->id}", $payload)
            ->assertStatus(200);

        $this->assertSame('pending_reapproval', $quotation->fresh()->status);
        $this->assertCount(0, $this->activeEntries($quotation), 'Purchases are held until re-approval.');
    }
}
