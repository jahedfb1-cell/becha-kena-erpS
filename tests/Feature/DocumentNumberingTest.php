<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\DeliveryChallan;
use App\Models\Invoice;
use App\Models\Quotation;
use App\Models\User;
use App\Services\DeliveryChallanService;
use App\Services\QuotationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers document number generation across the services that mint them.
 *
 * The property under test is that every sequence is shared across brands
 * rather than restarting per brand. A per-brand counter would hand the
 * second brand's first document a number the first brand already used, and
 * the unique constraint on those columns turns that into a hard failure at
 * save time. This regressed once already when multi-brand support landed.
 */
class DocumentNumberingTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create([
            'role'     => 'admin',
            'brand_id' => Brand::DEFAULT_ID,
        ]);
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
    }

    private function makeInvoice(int $brandId, string $number): Invoice
    {
        $quotation = Quotation::create([
            'brand_id'         => $brandId,
            'quotation_number' => 'QT-' . $number,
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->admin->id,
            'status'           => 'invoiced',
            'subtotal'         => 1000,
            'net_amount'       => 1000,
            'created_by'       => $this->admin->id,
        ]);

        return Invoice::create([
            'brand_id'       => $brandId,
            'invoice_number' => $number,
            'quotation_id'   => $quotation->id,
            'customer_id'    => $this->customer->id,
            'subtotal'       => 1000,
            'grand_total'    => 1000,
            'due_amount'     => 1000,
            'invoice_date'   => now()->toDateString(),
            'created_by'     => $this->admin->id,
        ]);
    }

    public function test_challan_numbers_start_at_one_and_run_in_sequence(): void
    {
        $service = new DeliveryChallanService();
        $year    = now()->format('Y');

        $first  = $service->generate($this->makeInvoice(Brand::DEFAULT_ID, 'INV-1'), $this->admin->id);
        $second = $service->generate($this->makeInvoice(Brand::DEFAULT_ID, 'INV-2'), $this->admin->id);

        $this->assertSame("DC-{$year}-0001", $first->challan_number);
        $this->assertSame("DC-{$year}-0002", $second->challan_number);
    }

    /**
     * The multi-brand collision guard: a brand with no challans of its own
     * must continue the shared sequence, not restart at 0001.
     */
    public function test_a_second_brand_continues_the_challan_sequence(): void
    {
        $service = new DeliveryChallanService();
        $year    = now()->format('Y');

        $service->generate($this->makeInvoice(Brand::DEFAULT_ID, 'INV-1'), $this->admin->id);

        $westernInvoice = $this->makeInvoice(2, 'INV-2');
        $westernInvoice->brand_id = 2;
        $westernInvoice->save();

        $second = $service->generate($westernInvoice, $this->admin->id);

        $this->assertSame("DC-{$year}-0002", $second->challan_number);
        $this->assertSame(2, DeliveryChallan::withoutGlobalScope('brand')->count());
    }

    /**
     * Numbering must look past the signed-in user's own brand. With the
     * brand scope left on, the lookup for "the last number used" would miss
     * the other brand's rows and hand back one that is already taken.
     */
    public function test_numbering_is_not_blinded_by_the_signed_in_users_brand(): void
    {
        $service = new DeliveryChallanService();
        $year    = now()->format('Y');

        $service->generate($this->makeInvoice(Brand::DEFAULT_ID, 'INV-1'), $this->admin->id);

        // Sign in as a Western Blinds user, whose brand has no challans yet.
        $westernAdmin = User::factory()->create(['role' => 'admin', 'brand_id' => 2]);
        $westernAdmin->assignRole('admin');
        $this->actingAs($westernAdmin, 'sanctum');

        $this->assertSame("DC-{$year}-0002", $service->generateChallanNumber());
    }

    public function test_quotation_numbers_start_at_one_and_run_in_sequence(): void
    {
        $service = new QuotationService();
        $year    = now()->format('Y');

        $this->assertSame("QT-{$year}-0001", $service->generateQuotationNumber());

        Quotation::create([
            'brand_id'         => Brand::DEFAULT_ID,
            'quotation_number' => "QT-{$year}-0001",
            'customer_id'      => $this->customer->id,
            'salesman_id'      => $this->admin->id,
            'status'           => 'quotation',
            'subtotal'         => 100,
            'net_amount'       => 100,
            'created_by'       => $this->admin->id,
        ]);

        $this->assertSame("QT-{$year}-0002", $service->generateQuotationNumber());
    }

    /**
     * Sequences are ordered numerically, not as text. Sorted as text "0009"
     * beats "0010", which would reissue a number already on a document.
     */
    public function test_the_sequence_passes_the_ten_boundary_correctly(): void
    {
        $service = new QuotationService();
        $year    = now()->format('Y');

        foreach (range(1, 10) as $n) {
            Quotation::create([
                'brand_id'         => Brand::DEFAULT_ID,
                'quotation_number' => "QT-{$year}-" . str_pad((string) $n, 4, '0', STR_PAD_LEFT),
                'customer_id'      => $this->customer->id,
                'salesman_id'      => $this->admin->id,
                'status'           => 'quotation',
                'subtotal'         => 100,
                'net_amount'       => 100,
                'created_by'       => $this->admin->id,
            ]);
        }

        $this->assertSame("QT-{$year}-0011", $service->generateQuotationNumber());
    }
}
