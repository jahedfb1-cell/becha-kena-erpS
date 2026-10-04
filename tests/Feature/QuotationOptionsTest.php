<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Quotation-level options: a quotation can offer Option 1 / Option 2 ...
 * (each a whole set of rooms and products, lines tagged "pkg:N"); the
 * customer picks one, and only that one becomes the order.
 */
class QuotationOptionsTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;
    protected Product $zebra;
    protected Product $roller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $category = CustomerCategory::create(['name' => 'Retail', 'created_by' => $this->admin->id]);
        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Test Customer',
            'phone'                => '01700000000',
            'created_by'           => $this->admin->id,
        ]);

        $this->zebra = Product::create(['product_code' => 'ZB-1', 'name' => 'Zebra', 'unit' => 'sqft', 'default_unit_price' => 100, 'created_by' => $this->admin->id]);
        $this->roller = Product::create(['product_code' => 'RL-1', 'name' => 'Roller', 'unit' => 'sqft', 'default_unit_price' => 80, 'created_by' => $this->admin->id]);
    }

    private function line(Product $p, string $room, ?int $option, bool $selected, float $price): array
    {
        return [
            'section_name'    => $room,
            'option_group_id' => $option ? "pkg:{$option}" : null,
            'is_optional'     => $option !== null,
            'is_selected'     => $selected,
            'product_id'      => $p->id,
            'width'           => 36,
            'height'          => 48, // 12 sq.ft
            'pcs'             => 1,
            'unit_price'      => $price,
        ];
    }

    /** Option 1: Zebra in two rooms (2,400). Option 2: Roller in two rooms (1,920). */
    private function createTwoOptionQuotation(int $selected = 1): Quotation
    {
        $res = $this->actingAs($this->admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'items'       => [
                $this->line($this->zebra, 'Bedroom', 1, $selected === 1, 100),
                $this->line($this->zebra, 'Drawing Room', 1, $selected === 1, 100),
                $this->line($this->roller, 'Bedroom', 2, $selected === 2, 80),
                $this->line($this->roller, 'Drawing Room', 2, $selected === 2, 80),
            ],
        ]);
        $res->assertStatus(201);

        return Quotation::with('items')->find($res->json('data.id'));
    }

    public function test_quotation_total_counts_only_the_selected_option(): void
    {
        $q = $this->createTwoOptionQuotation(1);
        $this->assertEquals(2400, (float) $q->subtotal);
        $this->assertCount(4, $q->items);

        $q2 = $this->createTwoOptionQuotation(2);
        $this->assertEquals(1920, (float) $q2->subtotal);
    }

    public function test_converting_requires_choosing_an_option(): void
    {
        $q = $this->createTwoOptionQuotation();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$q->id}/convert-to-order")
            ->assertStatus(422);
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$q->id}/convert-to-order", ['selected_option' => 3])
            ->assertStatus(422);

        $this->assertSame('quotation', $q->fresh()->status);
        $this->assertCount(4, $q->fresh()->items);
    }

    public function test_converting_keeps_only_the_chosen_option_as_ordinary_lines(): void
    {
        // Saved with Option 1 selected, but the customer took Option 2.
        $q = $this->createTwoOptionQuotation(1);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$q->id}/convert-to-order", ['selected_option' => 2])
            ->assertOk();

        $q->refresh()->load('items');
        $this->assertSame('pending_approval', $q->status);
        $this->assertCount(2, $q->items);
        foreach ($q->items as $item) {
            $this->assertSame($this->roller->id, $item->product_id);
            $this->assertNull($item->option_group_id);
            $this->assertTrue((bool) $item->is_selected);
            $this->assertFalse((bool) $item->is_optional);
        }
        $this->assertEqualsCanonicalizing(['Bedroom', 'Drawing Room'], $q->items->pluck('section_name')->all());
        $this->assertEquals(1920, (float) $q->subtotal);
        $this->assertEquals(1920, (float) $q->net_amount);

        // The dropped alternative is still on record.
        $log = AuditLog::where('action_type', 'convert')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertStringContainsString('pkg:1', json_encode($log->old_value));
    }

    public function test_plain_quotation_converts_exactly_as_before(): void
    {
        $res = $this->actingAs($this->admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'items'       => [$this->line($this->zebra, 'Section A: Main Items', null, true, 100)],
        ])->assertStatus(201);
        $id = $res->json('data.id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/quotations/{$id}/convert-to-order")
            ->assertOk();

        $q = Quotation::with('items')->find($id);
        $this->assertSame('pending_approval', $q->status);
        $this->assertCount(1, $q->items);
        $this->assertEquals(1200, (float) $q->net_amount);
    }

    public function test_an_order_cannot_be_saved_with_options(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $this->customer->id,
            'status'      => 'approved',
            'items'       => [
                $this->line($this->zebra, 'Bedroom', 1, true, 100),
                $this->line($this->roller, 'Bedroom', 2, false, 80),
            ],
        ])->assertStatus(422);

        $q = $this->createTwoOptionQuotation();
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/quotations/{$q->id}", [
            'customer_id' => $this->customer->id,
            'status'      => 'pending_approval',
            'items'       => [
                $this->line($this->zebra, 'Bedroom', 1, true, 100),
                $this->line($this->roller, 'Bedroom', 2, false, 80),
            ],
        ])->assertStatus(422);
        $this->assertSame('quotation', $q->fresh()->status);
    }
}
