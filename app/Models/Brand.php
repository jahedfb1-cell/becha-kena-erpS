<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

/**
 * A trade name the business sells under (Dhaka Blinds / Western Blinds Ltd).
 *
 * The row itself only carries identity. Everything that appears on a printed
 * document — logo, office address, contact block, footer name, terms — lives
 * in a per-brand JSON profile so that CompanyProfileController's existing
 * upload/mirror handling keeps working untouched. See the brands migration.
 */
class Brand extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'short_name',
        'is_default',
        'is_active',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'is_active'  => 'boolean',
    ];

    public const DEFAULT_ID = 1;

    /**
     * Storage path of this brand's company-profile JSON.
     *
     * Brand 1 deliberately keeps the original, unsuffixed filename: that file
     * already exists in production with the real Dhaka Blinds settings, and
     * renaming it would silently reset the live profile to defaults.
     */
    public static function profilePath(int $brandId): string
    {
        return $brandId === self::DEFAULT_ID
            ? 'company_profile.json'
            : "company_profile_{$brandId}.json";
    }

    /** Raw profile array for this brand, or null when it was never saved. */
    public function profileData(): ?array
    {
        $path = self::profilePath($this->id);

        if (!Storage::exists($path)) {
            return null;
        }

        return json_decode(Storage::get($path), true) ?: null;
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /** Resolve the brand a new record should be tagged with. */
    public static function resolveIdFor(?User $user): int
    {
        return $user?->brand_id ?: self::DEFAULT_ID;
    }
}
