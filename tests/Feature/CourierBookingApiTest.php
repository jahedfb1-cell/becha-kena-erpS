<?php

namespace Tests\Feature;

use App\Models\CourierBooking;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Quotation;
use App\Models\QuotationItem;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Courier booking slips: the paper that travels with a confirmed order to the
 * courier counter. The rules worth pinning down here are the ones that would
 * quietly cost money or embarrass us on a customer's doorstep - the COD figure
 * net of advances, the receiver who isn't the customer, and the fact that a
 * slip carries no prices.
 */
class CourierBookingApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;

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
            'name'                 => 'Lucerne Chocolate Ltd',
            'company_name'         => 'Lucerne Chocolate Ltd',
            'phone'                => '01700000000',
            'address'              => 'Gulshan, Dhaka',
            'created_by'           => $this->admin->id,
        ]);
    }

    /**
     * Builds an order carrying one item from each named product category.
     */
    protected function makeOrder(array $categoryNames, string $status = 'approved', float $netAmount = 50000): Quotation
    {
        $quotation = Quotation::create([
            'quotation_number' => 'QT-TEST-' . uniqid(),
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->admin->id,
            'status'           => $status,
            'subtotal'         => $netAmount,
            'net_amount'       => $netAmount,
            'created_by'       => $this->admin->id,
        ]);

        foreach ($categoryNames as $index => $name) {
            $category = ProductCategory::firstOrCreate(
                ['name' => $name],
                ['created_by' => $this->admin->id]
            );

            $product = Product::create([
                'product_code'        => 'PC-' . $index . '-' . uniqid(),
                'name'                => $name . ' item',
                'unit'                => 'sqft',
                'product_category_id' => $category->id,
                'default_unit_price'  => 100,
                'created_by'          => $this->admin->id,
            ]);

            QuotationItem::create([
                'quotation_id' => $quotation->id,
                'product_id'   => $product->id,
                'width'        => 36,
                'height'       => 60,
                'pcs'          => 1,
                'billed_sqft'  => 15,
                'unit_price'   => 100,
                'line_total'   => 1500,
            ]);
        }

        return $quotation->fresh();
    }

    /** @test */
    public function vertical_and_pvc_orders_draft_two_bundle_lines_while_roller_drafts_one(): void
    {
        $order = $this->makeOrder(['Roller Blinds', 'Vertical Blinds', 'PVC Strip Curtain']);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/courier-bookings/draft/{$order->id}");

        $response->assertStatus(200);

        $descriptions = array_column($response->json('data.lines'), 'description');

        $this->assertContains('Roller blinds', $descriptions);
        $this->assertContains('vertical blinds fabric curtoon', $descriptions);
        $this->assertContains('Channels', $descriptions);
        $this->assertContains('PVC rolls', $descriptions);
        $this->assertContains('SS channels', $descriptions);

        // One line for Roller, two each for Vertical and PVC - a mixed order
        // goes out on one slip, not three.
        $this->assertCount(5, $descriptions);
    }

    /** @test */
    public function the_draft_reports_how_many_pieces_sit_behind_each_line(): void
    {
        $order = $this->makeOrder(['Vertical Blinds']);
        $order->items()->update(['pcs' => 7]);

        $counts = $this->actingAs($this->admin)
            ->getJson("/api/courier-bookings/draft/{$order->id}")
            ->json('data.piece_counts');

        // Both halves of a split category report the category's own piece
        // count - the fabric and its channels came off the same 7 windows.
        $this->assertSame(7, $counts['vertical blinds fabric curtoon']);
        $this->assertSame(7, $counts['Channels']);
    }

    /** @test */
    public function labour_only_lines_are_left_off_the_slip(): void
    {
        $order = $this->makeOrder(['Roller Blinds', 'Servicing & fitting']);

        $descriptions = array_column(
            $this->actingAs($this->admin)
                ->getJson("/api/courier-bookings/draft/{$order->id}")
                ->json('data.lines'),
            'description'
        );

        $this->assertSame(['Roller blinds'], $descriptions);
    }

    /** @test */
    public function the_suggested_cod_is_the_order_total_less_advances_already_taken(): void
    {
        $order = $this->makeOrder(['Roller Blinds'], 'approved', 50000);

        $this->actingAs($this->admin)->postJson("/api/quotations/{$order->id}/advance-payments", [
            'amount'         => 12000,
            'payment_method' => 'cash',
            'payment_date'   => now()->toDateString(),
        ])->assertStatus(201);

        $this->assertEquals(
            38000,
            $this->actingAs($this->admin)
                ->getJson("/api/courier-bookings/draft/{$order->id}")
                ->json('data.cod_amount')
        );
    }

    /** @test */
    public function a_slip_cannot_be_raised_for_an_order_that_is_still_only_a_quotation(): void
    {
        $order = $this->makeOrder(['Roller Blinds'], 'quotation');

        $this->actingAs($this->admin)->postJson('/api/courier-bookings', [
            'quotation_id'  => $order->id,
            'booking_date'  => now()->toDateString(),
            'receiver_name' => 'Anwar Hossain Anik',
            'lines'         => [['description' => 'Roller blinds', 'bundles' => 1]],
        ])->assertStatus(422);

        $this->assertDatabaseCount('courier_bookings', 0);
    }

    /** @test */
    public function a_slip_records_a_staff_receiver_without_touching_the_customer_record(): void
    {
        $order = $this->makeOrder(['Roller Blinds']);

        $response = $this->actingAs($this->admin)->postJson('/api/courier-bookings', [
            'quotation_id'        => $order->id,
            'booking_date'        => '2026-09-26',
            'receiver_name'       => 'Anwar Hossain Anik',
            'receiver_phone'      => '01843151791',
            'receiver_address'    => 'Rangamati',
            'receiver_is_company' => false,
            'cod_enabled'         => true,
            'cod_amount'          => 20727,
            'lines'               => [
                ['description' => 'Zebra double shade roller', 'colour' => 'WBR 202', 'bundles' => 1],
                ['description' => 'Channels', 'bundles' => 2],
            ],
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.receiver_name', 'Anwar Hossain Anik');
        $response->assertJsonPath('data.receiver_is_company', false);

        // The customer master must be untouched - the same company books
        // through a different staff member every time, and overwriting it
        // would put the wrong name on their invoices and ledger.
        $this->customer->refresh();
        $this->assertSame('Lucerne Chocolate Ltd', $this->customer->name);
        $this->assertSame('01700000000', $this->customer->phone);
        $this->assertSame('Gulshan, Dhaka', $this->customer->address);
    }

    /** @test */
    public function slip_numbers_run_in_their_own_short_yearly_series(): void
    {
        $order = $this->makeOrder(['Roller Blinds']);
        $prefix = now()->format('y');

        foreach (['01', '02', '03'] as $expected) {
            $this->actingAs($this->admin)->postJson('/api/courier-bookings', [
                'quotation_id'  => $order->id,
                'booking_date'  => now()->toDateString(),
                'receiver_name' => 'Receiver',
                'lines'         => [['description' => 'Roller blinds', 'bundles' => 1]],
            ])->assertJsonPath('data.booking_number', "{$prefix}-{$expected}");
        }
    }

    /** @test */
    public function editing_a_slip_replaces_its_lines_and_keeps_its_number(): void
    {
        $order = $this->makeOrder(['Roller Blinds']);

        $id = $this->actingAs($this->admin)->postJson('/api/courier-bookings', [
            'quotation_id'  => $order->id,
            'booking_date'  => now()->toDateString(),
            'receiver_name' => 'Receiver',
            'lines'         => [['description' => 'Roller blinds', 'bundles' => 1]],
        ])->json('data.id');

        $number = CourierBooking::find($id)->booking_number;

        $response = $this->actingAs($this->admin)->putJson("/api/courier-bookings/{$id}", [
            // Blanked on the form - the courier's own book already has the
            // number written down, so it must survive.
            'booking_number' => '',
            'booking_date'   => now()->toDateString(),
            'receiver_name'  => 'Receiver',
            'cod_enabled'    => false,
            'lines'          => [
                ['description' => 'PVC rolls', 'colour' => 'Clear 2mm', 'bundles' => 4],
                ['description' => '', 'bundles' => 9],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.booking_number', $number);
        $response->assertJsonPath('data.cod_enabled', false);

        $booking = CourierBooking::with('lines')->find($id);
        $this->assertCount(1, $booking->lines, 'A blank description must not become a printed line.');
        $this->assertSame('PVC rolls', $booking->lines->first()->description);
        $this->assertEquals(4, $booking->lines->first()->bundles);
    }

    /** @test */
    public function an_archived_slip_drops_off_the_order(): void
    {
        $order = $this->makeOrder(['Roller Blinds']);

        $id = $this->actingAs($this->admin)->postJson('/api/courier-bookings', [
            'quotation_id'  => $order->id,
            'booking_date'  => now()->toDateString(),
            'receiver_name' => 'Receiver',
            'lines'         => [['description' => 'Roller blinds', 'bundles' => 1]],
        ])->json('data.id');

        $this->actingAs($this->admin)->deleteJson("/api/courier-bookings/{$id}")->assertStatus(200);

        $listed = $this->actingAs($this->admin)
            ->getJson("/api/courier-bookings?quotation_id={$order->id}&all=1")
            ->json('data');

        $this->assertCount(0, $listed);
    }
}
