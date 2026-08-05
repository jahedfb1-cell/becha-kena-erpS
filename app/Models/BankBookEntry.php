<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class BankBookEntry extends Model
{
    use HasFactory, Archivable;

    protected $fillable = [
        'bank_name',
        'account_number',
        'entry_type',
        'reference_type',
        'reference_id',
        'description',
        'cheque_number',
        'amount',
        'balance',
        'entry_date',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'amount'     => 'decimal:2',
        'balance'    => 'decimal:2',
        'entry_date' => 'date',
        'is_archived' => 'boolean',
        'archived_at' => 'datetime',
    ];

    /**
     * Polymorphic Relationship: Source record (Payment / Voucher / Transfer).
     */
    public function reference(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'reference_type', 'reference_id');
    }

    /**
     * Relationship: Creator user.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this record.
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }
}
