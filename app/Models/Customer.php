<?php

namespace App\Models;

use App\Traits\Archivable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasFactory, Archivable;

    protected $attributes = [
        'is_archived'          => false,
        'contact_show_status'  => 'show_contact_number',
        'opening_balance'      => 0,
    ];

    protected $fillable = [
        'customer_code',
        'name',
        'company_name',
        'bin',
        'phone',
        'second_contact_number',
        'third_contact_number',
        'email',
        'address',
        'address_2',
        'notes',
        'contact_show_status',
        'opening_balance',
        'customer_category_id',
        'created_by',
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected $casts = [
        'opening_balance' => 'float',
        'is_archived'     => 'boolean',
        'archived_at'     => 'datetime',
    ];

    /**
     * Relationship: Category this customer belongs to.
     * Constraint: FK customer_category_id -> customer_categories.id (restrictOnDelete)
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(CustomerCategory::class, 'customer_category_id');
    }

    /**
     * Relationship: User (salesman) who created this customer.
     * Constraint: FK created_by -> users.id (restrictOnDelete)
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: User who archived this record.
     * Constraint: FK archived_by -> users.id (nullOnDelete)
     */
    public function archivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Relationship: Customer ledger entries, ordered by date then id.
     * Opening balance entry (transaction_type='opening_balance') will appear
     * first when sorted by id ASC (it is created before any other entries).
     */
    public function ledgers(): HasMany
    {
        return $this->hasMany(CustomerLedger::class, 'customer_id')
                    ->orderBy('id', 'asc');
    }

    /**
     * Relationship: Complaint tickets logged for this customer.
     */
    public function complaints(): HasMany
    {
        return $this->hasMany(ComplaintTicket::class, 'customer_id');
    }

    /**
     * Helper: Get current outstanding due balance.
     * Returns the balance from the last ledger entry.
     * Returns 0 if no ledger entries exist yet.
     */
    public function getCurrentDue(): float
    {
        $lastEntry = $this->hasMany(CustomerLedger::class, 'customer_id')
                          ->orderBy('id', 'desc')
                          ->first();
        return $lastEntry ? (float) $lastEntry->balance : 0.0;
    }

    /**
     * Helper: Get the opening balance ledger entry for this customer.
     * Returns null if no opening balance row exists.
     */
    public function openingBalanceLedger(): ?CustomerLedger
    {
        return $this->hasMany(CustomerLedger::class, 'customer_id')
                    ->where('transaction_type', 'opening_balance')
                    ->first();
    }

    /**
     * Helper: Find existing customer by phone number (matches normalized digits against all contact numbers).
     */
    public static function findByPhoneNormalized(string $phone, ?int $excludeId = null): ?self
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (strlen($digits) < 6) {
            return null;
        }
        $tail = substr($digits, -10);

        $query = static::query();
        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        return $query->where(function ($q) use ($tail, $phone) {
            $q->where('phone', $phone)
              ->orWhere('phone', 'LIKE', "%{$tail}")
              ->orWhere('second_contact_number', 'LIKE', "%{$tail}")
              ->orWhere('third_contact_number', 'LIKE', "%{$tail}");
        })->first();
    }
}

