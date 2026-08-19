<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\User;
use App\Models\Voucher;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The reports overview, with and without a date range.
 *
 * The date range is the part worth testing: every query it narrows names a
 * different date column, and one of them named a column that does not
 * exist. Nothing failed until a range was actually applied, so the page
 * looked fine on open and returned a 500 the moment anyone filtered it.
 */
class ReportOverviewTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin', 'brand_id' => Brand::DEFAULT_ID]);
        $user->assignRole('admin');

        return $user;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_the_overview_loads_without_a_date_range(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/reports/overview')
            ->assertStatus(200)
            ->assertJsonPath('status', 'success');
    }

    /** The case that was returning a 500 in production. */
    public function test_the_overview_loads_with_a_date_range(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/reports/overview?from_date=2026-08-01&to_date=2026-08-31')
            ->assertStatus(200)
            ->assertJsonPath('status', 'success');
    }

    /** Vouchers inside the range count towards the total; those outside do not. */
    public function test_vouchers_are_filtered_by_their_own_date_column(): void
    {
        $admin = $this->admin();

        Voucher::create([
            'voucher_number' => 'VOU-2026-0001',
            'voucher_type'   => 'debit',
            'date'           => '2026-08-15',
            'description'    => 'Inside the range',
            'total_amount'   => 500,
            'payment_method' => 'cash',
            'created_by'     => $admin->id,
        ]);

        Voucher::create([
            'voucher_number' => 'VOU-2026-0002',
            'voucher_type'   => 'debit',
            'date'           => '2026-09-15',
            'description'    => 'Outside the range',
            'total_amount'   => 900,
            'payment_method' => 'cash',
            'created_by'     => $admin->id,
        ]);

        // August only: the 500 counts, the September 900 does not.
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/reports/overview?from_date=2026-08-01&to_date=2026-08-31')
            ->assertStatus(200)
            ->assertJsonPath('data.voucher_report_total', 500);

        // Both months: they add up.
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/reports/overview?from_date=2026-08-01&to_date=2026-09-30')
            ->assertStatus(200)
            ->assertJsonPath('data.voucher_report_total', 1400);
    }
}
