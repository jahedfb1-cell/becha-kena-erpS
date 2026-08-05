<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'email_enabled',
        'sms_enabled',
        'events',
    ];

    protected $casts = [
        'email_enabled' => 'boolean',
        'sms_enabled'   => 'boolean',
        'events'        => 'array',
    ];

    /**
     * Relationship: Owner user.
     * Constraint: FK user_id -> users.id (unique, cascadeOnDelete)
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
