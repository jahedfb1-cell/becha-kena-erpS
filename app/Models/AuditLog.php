<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    use HasFactory;

    // Immutable audit logs — cannot be updated or deleted
    protected $fillable = [
        'user_id',
        'user_name',
        'action_type',
        'module',
        'reference_number',
        'reference_id',
        'old_value',
        'new_value',
        'description',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'old_value' => 'array',
        'new_value' => 'array',
    ];

    /**
     * Relationship: User who performed the action.
     * Constraint: FK user_id -> users.id (nullOnDelete)
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Helper static method to record an audit log entry easily.
     */
    public static function record(
        ?int $userId,
        ?string $userName,
        string $actionType,
        string $module,
        ?int $referenceId = null,
        ?array $oldValue = null,
        ?array $newValue = null,
        ?string $description = null,
        ?string $referenceNumber = null
    ): self {
        return static::create([
            'user_id'          => $userId,
            'user_name'        => $userName,
            'action_type'      => $actionType,
            'module'           => $module,
            'reference_id'     => $referenceId,
            'reference_number' => $referenceNumber,
            'old_value'        => $oldValue,
            'new_value'        => $newValue,
            'description'      => $description,
            'ip_address'       => request()->ip(),
            'user_agent'       => request()->userAgent(),
        ]);
    }
}
