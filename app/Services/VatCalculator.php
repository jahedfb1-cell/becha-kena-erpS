<?php

namespace App\Services;

/**
 * Splits a money amount into its taxable value and its VAT, for the NBR
 * Mushak 6.3 challan.
 *
 * Two directions, because a price can be quoted either way. Exclusive means
 * the figure on the quotation is the taxable value and VAT is added on top.
 * Inclusive means that figure is already the full amount the customer pays
 * and the VAT has to be extracted back out of it. Which one applies is
 * recorded per order in `quotations.vat_inclusive`.
 *
 * Both directions return the same three keys so callers never have to know
 * which way round the price was quoted:
 *
 *   taxable — the value VAT is charged on (Mushak 6.3 column "মূল্য")
 *   vat     — the VAT itself
 *   total   — what the customer pays
 *
 * `taxable + vat === total` always holds exactly. That is not automatic:
 * rounding each of the three independently can leave them a paisa apart,
 * and a challan whose columns do not add up is one the VAT office can
 * reject. So each direction rounds two of the figures and derives the
 * third by subtraction, which absorbs the rounding error rather than
 * letting it show. Extracting VAT from 1000.00 at 15% is the usual case:
 * the true taxable value is 869.5652..., and only deriving the VAT as
 * 1000.00 - 869.57 keeps the column sum honest.
 *
 * Money is rounded to 2 decimals, half away from zero — the ordinary
 * currency round. The unusual rounding rules this project carries for slat
 * counts and sq.ft areas are measurement rules and deliberately do not
 * apply here.
 */
class VatCalculator
{
    private const SCALE = 2;

    /**
     * VAT added on top: `$amount` is the taxable value.
     *
     * exclusive(1000.00, 10.0) => taxable 1000.00, vat 100.00, total 1100.00
     */
    public static function exclusive(float $amount, float $rate): array
    {
        $taxable = round($amount, self::SCALE);
        $vat     = round($taxable * $rate / 100, self::SCALE);

        return [
            'taxable' => $taxable,
            'vat'     => $vat,
            'total'   => round($taxable + $vat, self::SCALE),
        ];
    }

    /**
     * VAT extracted from within: `$amount` is what the customer pays.
     *
     * inclusive(1100.00, 10.0) => taxable 1000.00, vat  100.00, total 1100.00
     * inclusive(1000.00, 10.0) => taxable  909.09, vat   90.91, total 1000.00
     */
    public static function inclusive(float $amount, float $rate): array
    {
        $total   = round($amount, self::SCALE);
        $taxable = round($total / (1 + ($rate / 100)), self::SCALE);

        return [
            'taxable' => $taxable,
            // Derived, not computed from the rate: see the class docblock.
            'vat'     => round($total - $taxable, self::SCALE),
            'total'   => $total,
        ];
    }

    /**
     * Convenience wrapper for callers holding the order's `vat_inclusive`
     * flag, so they do not each repeat the same if/else.
     */
    public static function split(float $amount, float $rate, bool $inclusive): array
    {
        return $inclusive
            ? self::inclusive($amount, $rate)
            : self::exclusive($amount, $rate);
    }
}
