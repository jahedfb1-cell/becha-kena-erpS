<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\PriceList;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Saved price lists (rate cards).
 *
 * The two things worth pinning down are that a saved sheet keeps what it
 * said when it was saved — rates are snapshotted, not read back through the
 * product master — and that a salesman cannot see or edit a colleague's
 * sheet, since these carry negotiated client rates.
 */
class PriceListApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $salesmanA;
    protected User $salesmanB;
    protected Customer $customer;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->salesmanA = User::factory()->create(['role' => 'salesman']);
        $this->salesmanA->assignRole('salesman');

        $this->salesmanB = User::factory()->create(['role' => 'salesman']);
        $this->salesmanB->assignRole('salesman');

        $category = CustomerCategory::create([
            'name'       => 'Corporate Office',
            'created_by' => $this->admin->id,
        ]);

        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Acme Interiors',
            'company_name'         => 'Acme Ltd',
            'phone'                => '01700000000',
            'address'              => '12 Gulshan Avenue, Dhaka',
            'created_by'           => $this->admin->id,
        ]);

        $productCategory = ProductCategory::create([
            'name'       => 'Roller Blinds',
            'created_by' => $this->admin->id,
        ]);

        $this->product = Product::create([
            'product_code'        => 'BL-001',
            'name'                => 'Roller Blind',
            'unit'                => 'sqft',
            'product_category_id' => $productCategory->id,
            'default_unit_price'  => 100,
            'created_by'          => $this->admin->id,
        ]);
    }

    /** An admin trading under one of the two brand names. */
    private function adminFor(int $brandId): User
    {
        $user = User::factory()->create(['role' => 'admin', 'brand_id' => $brandId]);
        $user->assignRole('admin');

        return $user;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'customer_id'      => $this->customer->id,
            'customer_name'    => $this->customer->name,
            'customer_company' => $this->customer->company_name,
            'customer_phone'   => $this->customer->phone,
            'customer_address' => $this->customer->address,
            'issue_date'       => '2026-08-19',
            'subject'          => 'Rate quotation for window blinds',
            'validity'         => '15 Days',
            'terms'            => 'Payment 50% advance.',
            'items'            => [
                [
                    'product_id'   => $this->product->id,
                    'product_name' => 'Roller Blind',
                    'description'  => 'Blackout fabric, chain operated',
                    'color_code'   => 'BL-001',
                    'uom'          => '1 Sq.Ft',
                    'rate'         => 145.50,
                    'remarks'      => 'Min billing 18 Sft',
                ],
                [
                    'product_name' => 'Custom Zebra Blind',
                    'uom'          => '1 Sq.Ft',
                    'rate'         => 210,
                ],
            ],
        ], $overrides);
    }

    public function test_a_salesman_can_save_a_price_list_with_its_lines(): void
    {
        $response = $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload());

        $response->assertCreated();

        $priceList = PriceList::with('items')->first();

        $this->assertSame('PL-' . date('Y') . '-0001', $priceList->reference_no);
        $this->assertSame($this->salesmanA->id, $priceList->created_by);
        $this->assertCount(2, $priceList->items);

        // Serial numbers are assigned by position, so the printed order is
        // reproducible no matter what the client sent.
        $this->assertSame([1, 2], $priceList->items->pluck('serial_no')->all());
        $this->assertSame(145.50, $priceList->items->first()->rate);

        // A free-hand line keeps no product link, and that is allowed.
        $this->assertNull($priceList->items->last()->product_id);
    }

    public function test_a_saved_rate_does_not_follow_a_later_price_change(): void
    {
        $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->assertCreated();

        $this->product->update(['default_unit_price' => 999]);

        $item = PriceList::with('items')->first()->items->first();

        $this->assertSame(145.50, $item->rate);
        $this->assertSame('Roller Blind', $item->product_name);
    }

    /**
     * PriceListPrintPage renders straight off this payload, so the fields it
     * reads are pinned here — a rename on the model would otherwise surface
     * as a silently blank column on a printed sheet.
     */
    public function test_show_returns_every_field_the_print_sheet_renders(): void
    {
        $id = $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->json('data.id');

        $this->actingAs($this->salesmanA)
            ->getJson("/api/price-lists/{$id}")
            ->assertOk()
            ->assertJsonPath('data.reference_no', 'PL-' . date('Y') . '-0001')
            ->assertJsonPath('data.customer_name', 'Acme Interiors')
            ->assertJsonPath('data.customer_company', 'Acme Ltd')
            ->assertJsonPath('data.customer_phone', '01700000000')
            ->assertJsonPath('data.subject', 'Rate quotation for window blinds')
            ->assertJsonPath('data.validity', '15 Days')
            ->assertJsonPath('data.items.0.product_name', 'Roller Blind')
            ->assertJsonPath('data.items.0.color_code', 'BL-001')
            ->assertJsonPath('data.items.0.uom', '1 Sq.Ft')
            ->assertJsonPath('data.items.0.remarks', 'Min billing 18 Sft')
            ->assertJsonStructure(['data' => [
                'brand_id', 'issue_date', 'terms', 'customer_address',
                'creator' => ['name'],
                'items' => [['serial_no', 'description', 'rate']],
            ]]);
    }

    public function test_a_salesman_sees_only_their_own_price_lists(): void
    {
        $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->assertCreated();

        $this->actingAs($this->salesmanB)
            ->postJson('/api/price-lists', $this->payload(['subject' => 'B sheet']))
            ->assertCreated();

        $listForA = $this->actingAs($this->salesmanA)
            ->getJson('/api/price-lists?all=1')
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $listForA);
        $this->assertSame('Rate quotation for window blinds', $listForA[0]['subject']);

        // An admin sees both.
        $listForAdmin = $this->actingAs($this->admin)
            ->getJson('/api/price-lists?all=1')
            ->assertOk()
            ->json('data');

        $this->assertCount(2, $listForAdmin);
    }

    public function test_a_salesman_cannot_open_or_edit_a_colleagues_price_list(): void
    {
        $id = $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->json('data.id');

        $this->actingAs($this->salesmanB)
            ->getJson("/api/price-lists/{$id}")
            ->assertNotFound();

        $this->actingAs($this->salesmanB)
            ->putJson("/api/price-lists/{$id}", $this->payload(['subject' => 'Hijacked']))
            ->assertNotFound();

        $this->assertSame(
            'Rate quotation for window blinds',
            PriceList::find($id)->subject
        );
    }

    public function test_updating_replaces_the_whole_line_set(): void
    {
        $id = $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->json('data.id');

        $this->actingAs($this->salesmanA)
            ->putJson("/api/price-lists/{$id}", $this->payload([
                'subject' => 'Revised rates',
                'items'   => [
                    ['product_name' => 'Vertical Blind', 'uom' => '1 Sq.Ft', 'rate' => 175],
                ],
            ]))
            ->assertOk();

        $priceList = PriceList::with('items')->find($id);

        $this->assertSame('Revised rates', $priceList->subject);
        $this->assertCount(1, $priceList->items);
        $this->assertSame('Vertical Blind', $priceList->items->first()->product_name);
        $this->assertSame(1, $priceList->items->first()->serial_no);
    }

    public function test_a_price_list_must_carry_at_least_one_line(): void
    {
        $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload(['items' => []]))
            ->assertStatus(422);
    }

    public function test_archiving_hides_a_price_list_from_the_list_but_keeps_it(): void
    {
        $id = $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->json('data.id');

        $this->actingAs($this->salesmanA)
            ->deleteJson("/api/price-lists/{$id}")
            ->assertOk();

        $this->assertCount(
            0,
            $this->actingAs($this->salesmanA)->getJson('/api/price-lists?all=1')->json('data')
        );

        $archived = $this->actingAs($this->salesmanA)
            ->getJson('/api/price-lists?all=1&archived=1')
            ->json('data');

        $this->assertCount(1, $archived);

        // Its lines survive, so the sheet stays reprintable.
        $this->assertCount(2, PriceList::with('items')->find($id)->items);

        $this->actingAs($this->salesmanA)
            ->postJson("/api/price-lists/{$id}/restore")
            ->assertOk();

        $this->assertCount(
            1,
            $this->actingAs($this->salesmanA)->getJson('/api/price-lists?all=1')->json('data')
        );
    }

    public function test_an_archived_price_list_cannot_be_edited_until_restored(): void
    {
        $id = $this->actingAs($this->salesmanA)
            ->postJson('/api/price-lists', $this->payload())
            ->json('data.id');

        $this->actingAs($this->salesmanA)->deleteJson("/api/price-lists/{$id}")->assertOk();

        $this->actingAs($this->salesmanA)
            ->putJson("/api/price-lists/{$id}", $this->payload(['subject' => 'Late edit']))
            ->assertStatus(422);
    }

    /**
     * The business trades under two names out of one system. A rate card is
     * transactional paperwork, so it belongs to the trade name that raised
     * it — and the printed sheet resolves its letterhead from that stored
     * brand_id, not from whoever happens to be logged in when it is
     * reprinted. Both halves of this have gone wrong before elsewhere in the
     * app, so they are pinned here too.
     */
    public function test_a_price_list_is_tagged_to_the_trade_name_that_raised_it(): void
    {
        foreach ([Brand::DEFAULT_ID, 2] as $brandId) {
            $admin = $this->adminFor($brandId);

            $id = $this->actingAs($admin)
                ->postJson('/api/price-lists', $this->payload())
                ->assertCreated()
                ->json('data.id');

            $this->assertSame(
                $brandId,
                PriceList::withoutGlobalScope('brand')->find($id)->brand_id,
                "price list tagged to brand {$brandId}"
            );

            // The print page reads brand_id off this payload to pick the
            // right logo, address and footer name.
            $this->actingAs($admin)
                ->getJson("/api/price-lists/{$id}")
                ->assertJsonPath('data.brand_id', $brandId);
        }
    }

    public function test_neither_trade_name_sees_the_others_price_lists(): void
    {
        $dhakaAdmin   = $this->adminFor(Brand::DEFAULT_ID);
        $westernAdmin = $this->adminFor(2);

        $dhakaRef = $this->actingAs($dhakaAdmin)
            ->postJson('/api/price-lists', $this->payload(['subject' => 'Dhaka sheet']))
            ->json('data.reference_no');

        $westernRef = $this->actingAs($westernAdmin)
            ->postJson('/api/price-lists', $this->payload(['subject' => 'Western sheet']))
            ->json('data.reference_no');

        $seenByDhaka = array_column(
            $this->actingAs($dhakaAdmin)->getJson('/api/price-lists?all=1')->json('data'),
            'reference_no'
        );
        $this->assertContains($dhakaRef, $seenByDhaka);
        $this->assertNotContains($westernRef, $seenByDhaka);

        $seenByWestern = array_column(
            $this->actingAs($westernAdmin)->getJson('/api/price-lists?all=1')->json('data'),
            'reference_no'
        );
        $this->assertContains($westernRef, $seenByWestern);
        $this->assertNotContains($dhakaRef, $seenByWestern);
    }

    /**
     * Reference numbers are drawn without the brand scope on purpose, so the
     * second trade name continues the sequence rather than restarting at
     * 0001 and colliding — the exact bug that hit quotation and invoice
     * numbering when brands were introduced.
     */
    public function test_reference_numbers_never_collide_between_the_two_trade_names(): void
    {
        $refs = [];

        foreach ([Brand::DEFAULT_ID, 2, Brand::DEFAULT_ID, 2] as $brandId) {
            $refs[] = $this->actingAs($this->adminFor($brandId))
                ->postJson('/api/price-lists', $this->payload())
                ->json('data.reference_no');
        }

        $this->assertCount(4, array_unique($refs), "duplicate reference_no across brands");
        $this->assertSame(
            ['PL-' . date('Y') . '-0001', 'PL-' . date('Y') . '-0002', 'PL-' . date('Y') . '-0003', 'PL-' . date('Y') . '-0004'],
            $refs
        );
    }
}
