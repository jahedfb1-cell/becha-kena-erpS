<?php

namespace App\Traits;

/**
 * Mints the next number in a document series: QT-2026-0001, INV-2026-0002,
 * and so on.
 *
 * Six services were each carrying their own copy of this, identical but for
 * the prefix and column, which meant a correction had to be remembered in
 * six places — and the numbering bug that shipped when multi-brand support
 * landed had to be fixed in seven.
 *
 * Two details are easy to get wrong and are the reason this lives in one
 * place:
 *
 * - The series is deliberately NOT scoped by brand. Dhaka Blinds and
 *   Western Blinds share one run of numbers because the column is globally
 *   unique. Scope it per brand and the newer brand starts again at 0001,
 *   straight onto a number the other brand already used.
 *
 * - The tail is ordered as a number, not as text. Sorted as text "0009"
 *   comes after "0010", so the series would hand out 0010 a second time on
 *   the way past ten.
 *
 * Concurrency: two requests arriving together can still read the same last
 * number and both propose the same next one. The unique index on these
 * columns catches that, so the loser fails loudly rather than quietly
 * duplicating a number onto a customer's document.
 */
trait GeneratesDocumentNumbers
{
    /**
     * @param  class-string  $modelClass  Model holding the series
     * @param  string        $column      Column the number is stored in
     * @param  string        $code        Series prefix, e.g. "INV"
     */
    protected function nextDocumentNumber(string $modelClass, string $column, string $code): string
    {
        $prefix = $code . '-' . now()->format('Y') . '-';

        $last = $modelClass::withoutGlobalScope('brand')
            ->where($column, 'LIKE', "{$prefix}%")
            ->orderByRaw("CAST(SUBSTRING({$column}, " . (strlen($prefix) + 1) . ") AS UNSIGNED) DESC")
            ->first();

        $next = 1;
        if ($last && preg_match('/' . preg_quote($code, '/') . '-\d{4}-(\d+)/', (string) $last->{$column}, $m)) {
            $next = (int) $m[1] + 1;
        }

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
