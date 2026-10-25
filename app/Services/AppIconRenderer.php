<?php

namespace App\Services;

/**
 * Turns the company's uploaded app icon / logo into the square PNGs an
 * installed app needs (home-screen icon, iOS touch icon, Android maskable icon).
 *
 * The uploaded file is usually a wide banner: the brand mark on the left and
 * the company name beside it (Dhaka Blinds is 1736 x 433). Cropping the middle
 * square out of that - what this used to do - leaves half a word on the home
 * screen ("Dh / Bli"). What a home-screen icon should carry is the mark, so a
 * wide logo is trimmed to its leading emblem (everything left of the first
 * clear gap) and fitted whole into the square. A logo with no such gap, or one
 * that is already roughly square, is fitted whole instead - nothing is ever cut.
 */
class AppIconRenderer
{
    /** Background and breathing room per style. */
    private const STYLES = [
        // Transparent corners, small margin: the normal install icon.
        'any'      => ['opaque' => false, 'padding' => 0.06],
        // iOS paints transparency black, so it gets a white square.
        'opaque'   => ['opaque' => true,  'padding' => 0.10],
        // Android may crop this to a circle or squircle: keep the mark inside the safe zone (inner 80%).
        'maskable' => ['opaque' => true,  'padding' => 0.20],
    ];

    /** A wide logo is treated as "mark + name" from this width/height ratio up. */
    private const WIDE_RATIO = 1.5;

    /**
     * @param  string  $style  'any' | 'opaque' | 'maskable'
     * @return string|null  PNG bytes, or null when the source cannot be read (no GD, corrupt file)
     */
    public function render(string $sourcePath, int $size, string $style = 'any'): ?string
    {
        if (!function_exists('imagecreatefromstring')) {
            return null; // GD extension not available
        }

        $bytes = @file_get_contents($sourcePath);
        $source = $bytes ? @imagecreatefromstring($bytes) : false;
        if (!$source) {
            return null;
        }
        imagepalettetotruecolor($source);

        [$bx, $by, $bw, $bh] = $this->markBox($source);

        $config = self::STYLES[$style] ?? self::STYLES['any'];
        $canvas = imagecreatetruecolor($size, $size);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, $config['opaque']
            ? imagecolorallocatealpha($canvas, 255, 255, 255, 0)
            : imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        imagealphablending($canvas, true);

        // Fit the mark inside the padded square, keeping its proportions.
        $inner = $size * (1 - 2 * $config['padding']);
        $scale = min($inner / $bw, $inner / $bh);
        $dw = max(1, (int) round($bw * $scale));
        $dh = max(1, (int) round($bh * $scale));
        $dx = (int) round(($size - $dw) / 2);
        $dy = (int) round(($size - $dh) / 2);

        imagecopyresampled($canvas, $source, $dx, $dy, $bx, $by, $dw, $dh, $bw, $bh);
        imagedestroy($source);

        ob_start();
        imagepng($canvas);
        $png = ob_get_clean();
        imagedestroy($canvas);

        return $png ?: null;
    }

    /**
     * The part of the image to use: [x, y, width, height].
     * The whole image, unless it is a wide "mark + name" logo, then just the mark.
     */
    private function markBox($img): array
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $whole = [0, 0, $w, $h];

        if ($w < $h * self::WIDE_RATIO) {
            return $whole;
        }

        // Which columns hold any ink (an opaque, non-white pixel)? Rows are sampled, not all read.
        $step = max(1, (int) floor($h / 90));
        $inkColumn = [];
        for ($x = 0; $x < $w; $x++) {
            $ink = false;
            for ($y = 0; $y < $h; $y += $step) {
                if ($this->isInk(imagecolorat($img, $x, $y))) {
                    $ink = true;
                    break;
                }
            }
            $inkColumn[$x] = $ink;
        }

        // The mark ends at the first clear gap (a run of empty columns) that follows some ink,
        // after it has had room to be a mark at all (30% of the height) and before it could
        // be more than a square-ish shape (160% of the height).
        $minGap = max(4, (int) round($h * 0.04));
        $from = (int) round($h * 0.30);
        $to = min($w - 1, (int) round($h * 1.60));
        $run = 0;
        $gapStart = null;
        $sawInk = false;
        for ($x = 0; $x <= $to; $x++) {
            if ($inkColumn[$x]) {
                $sawInk = true;
                $run = 0;
                continue;
            }
            if (!$sawInk || $x < $from) {
                continue;
            }
            $run++;
            if ($run === 1) {
                $gapStart = $x;
            }
            if ($run >= $minGap) {
                return $this->trimToInk($img, 0, (int) $gapStart) ?? $whole;
            }
        }

        return $whole;
    }

    /** Bounding box of the ink inside columns [x0, x1). */
    private function trimToInk($img, int $x0, int $x1): ?array
    {
        $h = imagesy($img);
        $minX = $x1;
        $maxX = $x0;
        $minY = $h;
        $maxY = 0;

        for ($y = 0; $y < $h; $y++) {
            for ($x = $x0; $x < $x1; $x++) {
                if ($this->isInk(imagecolorat($img, $x, $y))) {
                    $minX = min($minX, $x);
                    $maxX = max($maxX, $x);
                    $minY = min($minY, $y);
                    $maxY = max($maxY, $y);
                }
            }
        }

        if ($maxX < $minX || $maxY < $minY) {
            return null;
        }

        return [$minX, $minY, $maxX - $minX + 1, $maxY - $minY + 1];
    }

    /** A pixel that is part of the drawing: reasonably opaque and not (near) white. */
    private function isInk(int $rgba): bool
    {
        $alpha = ($rgba >> 24) & 0x7F; // 0 opaque .. 127 transparent
        if ($alpha > 90) {
            return false;
        }

        $r = ($rgba >> 16) & 0xFF;
        $g = ($rgba >> 8) & 0xFF;
        $b = $rgba & 0xFF;

        return min($r, $g, $b) < 235;
    }
}
