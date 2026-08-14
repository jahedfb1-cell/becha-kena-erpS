<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per AI Assist extraction (AI_Assist_PRD.md §9.4).
 *
 * Holds no extracted content by design — only who ran it, in which mode, how
 * confident the model was, and whether the user accepted the result.
 */
class AiAssistLog extends Model
{
    protected $fillable = [
        'user_id',
        'mode',
        'confidence',
        'applied',
    ];

    protected $casts = [
        'confidence' => 'float',
        'applied'    => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
