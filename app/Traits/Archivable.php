<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Builder;

trait Archivable
{
    /**
     * Scope a query to only include active (non-archived) records.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_archived', false);
    }

    /**
     * Scope a query to only include archived records.
     */
    public function scopeArchived(Builder $query): Builder
    {
        return $query->where('is_archived', true);
    }

    /**
     * Archive the record.
     */
    public function archive(int $userId, ?string $reason = null): bool
    {
        return $this->update([
            'is_archived'    => true,
            'archived_at'    => now(),
            'archived_by'    => $userId,
            'archive_reason' => $reason,
        ]);
    }

    /**
     * Restore the archived record.
     */
    public function restore(?int $userId = null): bool
    {
        return $this->update([
            'is_archived'    => false,
            'archived_at'    => null,
            'archived_by'    => null,
            'archive_reason' => null,
        ]);
    }
}
