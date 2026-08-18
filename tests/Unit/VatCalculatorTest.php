<?php

namespace Tests\Unit;

use App\Services\VatCalculator;
use PHPUnit\Framework\TestCase;

class VatCalculatorTest extends TestCase
{
    public function test_exclusive_adds_vat_on_top_of_the_quoted_amount(): void
    {
        $result = VatCalculator::exclusive(1000, 10);

        $this->assertSame(1000.00, $result['taxable']);
        $this->assertSame(100.00, $result['vat']);
        $this->assertSame(1100.00, $result['total']);
    }

    public function test_inclusive_extracts_vat_from_an_amount_that_divides_evenly(): void
    {
        $result = VatCalculator::inclusive(1100, 10);

        $this->assertSame(1000.00, $result['taxable']);
        $this->assertSame(100.00, $result['vat']);
        $this->assertSame(1100.00, $result['total']);
    }

    /**
     * 1000 / 1.1 is 909.0909..., so the split cannot be exact. The taxable
     * value rounds to 909.09 and the VAT is derived as the remainder, which
     * keeps the three figures adding up.
     */
    public function test_inclusive_rounds_a_recurring_split_without_losing_a_paisa(): void
    {
        $result = VatCalculator::inclusive(1000, 10);

        $this->assertSame(909.09, $result['taxable']);
        $this->assertSame(90.91, $result['vat']);
        $this->assertSame(1000.00, $result['total']);
    }

    /**
     * The property the challan depends on: whichever direction produced the
     * figures, the two columns must sum to the printed total exactly.
     */
    public function test_columns_always_sum_to_the_total(): void
    {
        foreach ([[1000, 15], [1000, 10], [333.33, 15], [0.05, 15], [12345.67, 7.5]] as [$amount, $rate]) {
            foreach ([true, false] as $inclusive) {
                $r = VatCalculator::split($amount, $rate, $inclusive);

                $this->assertSame(
                    $r['total'],
                    round($r['taxable'] + $r['vat'], 2),
                    "taxable + vat != total for {$amount} @ {$rate}%"
                );
            }
        }
    }

    public function test_a_zero_rate_leaves_the_amount_untouched_in_both_directions(): void
    {
        $this->assertSame(
            ['taxable' => 500.00, 'vat' => 0.00, 'total' => 500.00],
            VatCalculator::exclusive(500, 0)
        );

        $this->assertSame(
            ['taxable' => 500.00, 'vat' => 0.00, 'total' => 500.00],
            VatCalculator::inclusive(500, 0)
        );
    }
}
