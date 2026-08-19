<?php

namespace Tests\Unit;

use App\Services\QuotationService;
use PHPUnit\Framework\TestCase;

/**
 * Covers QuotationService::calculateLineItem() — the billing arithmetic
 * every quotation, order, invoice and challan is built on.
 *
 * The same formulas are duplicated in the frontend (billing.js and pvc.js)
 * with only comments keeping the two sides in step, so these tests pin the
 * backend half down: if the maths here ever drifts, the printed documents
 * and the on-screen totals stop agreeing.
 *
 * No database is touched — the method is pure arithmetic over an array.
 */
class QuotationLineItemTest extends TestCase
{
    private QuotationService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new QuotationService();
    }

    // ── Ordinary sq.ft goods ─────────────────────────────────────────

    public function test_area_is_width_times_height_in_square_feet(): void
    {
        $result = $this->service->calculateLineItem([
            'width' => 24, 'height' => 36, 'pcs' => 1, 'unit_price' => 100,
        ]);

        // 24 x 36 = 864 sq.in / 144 = 6 sq.ft
        $this->assertSame(6.0, $result['actual_sqft']);
        $this->assertSame(6.0, $result['billed_sqft']);
        $this->assertSame(600.0, $result['line_total']);
    }

    /** Billing always rounds up to the next quarter foot, never down. */
    public function test_billed_area_rounds_up_to_the_next_quarter_foot(): void
    {
        $result = $this->service->calculateLineItem([
            'width' => 25, 'height' => 37, 'pcs' => 1, 'unit_price' => 100,
        ]);

        // 925 / 144 = 6.4236... -> actual 6.42, billed up to 6.50
        $this->assertSame(6.42, $result['actual_sqft']);
        $this->assertSame(6.5, $result['billed_sqft']);
        $this->assertSame(650.0, $result['line_total']);
    }

    public function test_a_small_window_is_billed_at_the_minimum_billing_area(): void
    {
        $result = $this->service->calculateLineItem([
            'width' => 12, 'height' => 24, 'pcs' => 1,
            'unit_price' => 100, 'min_billing_sqft' => 10,
        ]);

        // Actual is only 2 sq.ft, but the supplier bills a 10 sq.ft minimum.
        $this->assertSame(2.0, $result['actual_sqft']);
        $this->assertSame(10.0, $result['billed_sqft']);
        $this->assertSame(1000.0, $result['line_total']);
    }

    public function test_the_minimum_applies_per_piece_not_once_per_line(): void
    {
        $result = $this->service->calculateLineItem([
            'width' => 12, 'height' => 24, 'pcs' => 3,
            'unit_price' => 100, 'min_billing_sqft' => 10,
        ]);

        $this->assertSame(30.0, $result['billed_sqft']);
    }

    public function test_the_area_is_multiplied_by_the_piece_count(): void
    {
        $result = $this->service->calculateLineItem([
            'width' => 24, 'height' => 36, 'pcs' => 3, 'unit_price' => 100,
        ]);

        $this->assertSame(18.0, $result['billed_sqft']);
        $this->assertSame(1800.0, $result['line_total']);
    }

    /** A line that names no minimum inherits the preferred supplier's. */
    public function test_the_preferred_suppliers_minimum_is_used_when_the_line_names_none(): void
    {
        // Shaped exactly as getPreferredSupplier() returns it, floats included.
        $result = $this->service->calculateLineItem(
            ['width' => 12, 'height' => 24, 'pcs' => 1, 'unit_price' => 100],
            ['supplier_id' => 5, 'cost_price' => 60.0, 'min_billing_sqft' => 8.0, 'priority_rank' => 1]
        );

        $this->assertSame(8.0, $result['min_billing_sqft']);
        $this->assertSame(8.0, $result['billed_sqft']);
        // The supplier's cost price is picked up the same way.
        $this->assertSame(60.0, $result['cost_price']);
    }

    public function test_a_price_set_on_the_line_wins_over_the_suppliers(): void
    {
        $result = $this->service->calculateLineItem(
            ['width' => 24, 'height' => 36, 'pcs' => 1, 'unit_price' => 100, 'cost_price' => 75],
            ['supplier_id' => 5, 'cost_price' => 60.0, 'min_billing_sqft' => 8.0, 'priority_rank' => 1]
        );

        $this->assertSame(75.0, $result['cost_price']);
    }

    // ── Per-piece goods (motors, brackets, remotes) ──────────────────

    /**
     * Hardware has no meaningful width or height, so it bills by piece
     * count. The count is stored in billed_sqft too, which is why the unit
     * has to be read off the product rather than inferred from that column.
     */
    public function test_per_piece_goods_are_billed_by_count_not_area(): void
    {
        $result = $this->service->calculateLineItem([
            'unit' => 'pcs', 'pcs' => 5, 'unit_price' => 1200,
            'width' => 0, 'height' => 0,
        ]);

        $this->assertSame(5.0, (float) $result['actual_sqft']);
        $this->assertSame(5.0, (float) $result['billed_sqft']);
        $this->assertSame(6000.0, $result['line_total']);
    }

    /** A minimum area makes no sense for something sold by the piece. */
    public function test_per_piece_goods_ignore_any_minimum_billing_area(): void
    {
        $result = $this->service->calculateLineItem([
            'unit' => 'pcs', 'pcs' => 2, 'unit_price' => 500, 'min_billing_sqft' => 10,
        ]);

        $this->assertSame(0.0, (float) $result['min_billing_sqft']);
        $this->assertSame(2.0, (float) $result['billed_sqft']);
    }

    // ── PVC strip curtain ────────────────────────────────────────────

    /**
     * PVC is sold as whole slats, so the billed width is the slat count
     * times the slat size — not the measured opening width.
     */
    public function test_pvc_bills_whole_slats_rather_than_the_measured_width(): void
    {
        $result = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 60, 'height' => 84, 'pcs' => 1,
            'product_size' => 8, 'unit_price' => 100,
        ]);

        // 60 / 5.85 = 10.256 slats -> 10 whole slats x 8in = 80in billed width
        $this->assertSame(10, $result['slats']);
        $this->assertSame('10.26', $result['approx_slats']);
        // Actual area still reflects the real opening: 60 x 84 / 144
        $this->assertSame(35.0, $result['actual_sqft']);
        // Billed area uses the slat width: 80 x 84 / 144
        $this->assertSame(46.67, $result['billed_sqft']);
        $this->assertSame(4667.0, $result['line_total']);
    }

    /**
     * The documented rounding rule: a partial slat is dropped unless it
     * reaches three quarters, and must stay in step with pvcSlatCount()
     * in frontend/src/utils/pvc.js.
     */
    public function test_a_partial_slat_below_three_quarters_is_dropped(): void
    {
        $result = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 68.6, 'height' => 48, 'pcs' => 1, 'unit_price' => 100,
        ]);

        // 68.6 / 5.85 = 11.73 slats -> stays at 11
        $this->assertSame(11, $result['slats']);
    }

    public function test_a_partial_slat_at_three_quarters_rounds_up(): void
    {
        $result = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 68.8, 'height' => 48, 'pcs' => 1, 'unit_price' => 100,
        ]);

        // 68.8 / 5.85 = 11.76 slats -> rounds up to 12
        $this->assertSame(12, $result['slats']);
    }

    /** A hand-entered slat count overrides the calculated one. */
    public function test_an_explicit_slat_count_overrides_the_calculation(): void
    {
        $result = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 60, 'height' => 84, 'pcs' => 1,
            'slats' => 14, 'product_size' => 8, 'unit_price' => 100,
        ]);

        $this->assertSame(14, $result['slats']);
        // 14 x 8 = 112in billed width -> 112 x 84 / 144
        $this->assertSame(65.33, $result['billed_sqft']);
    }

    public function test_slat_size_falls_back_to_eight_inches_when_unset(): void
    {
        $withoutSize = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 60, 'height' => 84, 'pcs' => 1, 'unit_price' => 100,
        ]);

        $withZeroSize = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 60, 'height' => 84, 'pcs' => 1,
            'product_size' => 0, 'unit_price' => 100,
        ]);

        $this->assertSame(46.67, $withoutSize['billed_sqft']);
        $this->assertSame(46.67, $withZeroSize['billed_sqft']);
    }

    public function test_pvc_area_is_multiplied_by_the_piece_count(): void
    {
        $result = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 60, 'height' => 84, 'pcs' => 2,
            'product_size' => 8, 'unit_price' => 100,
        ]);

        $this->assertSame(93.33, $result['billed_sqft']);
    }

    /** PVC is recognised from the category, the unit or the product name. */
    public function test_pvc_is_recognised_however_it_is_labelled(): void
    {
        $byUnit = $this->service->calculateLineItem([
            'unit' => 'PVC', 'width' => 60, 'height' => 84, 'pcs' => 1, 'unit_price' => 100,
        ]);

        $byProductName = $this->service->calculateLineItem([
            'product_name' => 'Clear Water Strip', 'width' => 60, 'height' => 84,
            'pcs' => 1, 'unit_price' => 100,
        ]);

        $this->assertSame(10, $byUnit['slats']);
        $this->assertSame(10, $byProductName['slats']);
    }

    /**
     * Without both measurements there are no slats to count, so the line
     * falls back to ordinary area billing instead of producing nonsense.
     */
    public function test_pvc_without_measurements_falls_back_to_area_billing(): void
    {
        $result = $this->service->calculateLineItem([
            'category_name' => 'PVC Strip Curtain',
            'width' => 0, 'height' => 84, 'pcs' => 1, 'unit_price' => 100,
        ]);

        $this->assertNull($result['slats']);
        $this->assertSame(0.0, $result['actual_sqft']);
    }
}
