<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PriceList;
use App\Traits\ApiResponse;
use App\Traits\GeneratesDocumentNumbers;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Saved rate cards (price lists).
 *
 * A price list quotes rates, not windows — it never becomes an order, so
 * there is no status, approval or conversion here. What it does need is to
 * be found again, reprinted and corrected, which is all this controller is.
 *
 * Permission checks are written out at the top of each method rather than
 * applied as route middleware, matching every other controller here.
 */
class PriceListController extends Controller
{
    use ApiResponse, GeneratesDocumentNumbers;

    /**
     * Visibility, mirroring the customers and quotations lists: a salesman
     * sees only sheets they created, a manager sees their team's, an admin
     * sees everything. Brand separation is handled by the model's global
     * scope and is not repeated here.
     */
    private function applyVisibility(Builder $query, $user): void
    {
        if ($user->role === 'admin' || $user->can('price_lists:view-all')) {
            return;
        }

        if ($user->role === 'manager' || $user->can('price_lists:view-team')) {
            $teamUserIds = \App\Models\User::where('manager_id', $user->id)
                ->pluck('id')
                ->push($user->id);
            $query->whereIn('created_by', $teamUserIds);
            return;
        }

        $query->where('created_by', $user->id);
    }

    /**
     * The shape the create/update form posts and the show endpoint returns.
     *
     * `items` is required and must be non-empty: a rate card with no rates
     * is not a document, and letting one save would put an unopenable row
     * on the list page.
     */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'customer_id'            => 'nullable|integer|exists:customers,id',
            'customer_name'          => 'nullable|string|max:150',
            'customer_company'       => 'nullable|string|max:150',
            'customer_phone'         => 'nullable|string|max:30',
            'customer_address'       => 'nullable|string',
            'issue_date'             => 'required|date',
            'subject'                => 'nullable|string|max:255',
            'validity'               => 'nullable|string|max:60',
            'terms'                  => 'nullable|string',

            'items'                  => 'required|array|min:1',
            'items.*.product_id'     => 'nullable|integer|exists:products,id',
            'items.*.product_name'   => 'required|string|max:255',
            'items.*.description'    => 'nullable|string',
            'items.*.color_code'     => 'nullable|string|max:100',
            'items.*.uom'            => 'nullable|string|max:30',
            'items.*.rate'           => 'nullable|numeric|min:0',
            'items.*.remarks'        => 'nullable|string|max:255',
        ]);
    }

    /** Rewrites the whole item set; used by both store() and update(). */
    private function syncItems(PriceList $priceList, array $items): void
    {
        $priceList->items()->delete();

        foreach (array_values($items) as $index => $item) {
            $priceList->items()->create([
                'product_id'   => $item['product_id'] ?? null,
                'serial_no'    => $index + 1,
                'product_name' => $item['product_name'],
                'description'  => $item['description'] ?? null,
                'color_code'   => $item['color_code'] ?? null,
                'uom'          => $item['uom'] ?? '1 Sq.Ft',
                'rate'         => $item['rate'] ?? 0,
                'remarks'      => $item['remarks'] ?? null,
            ]);
        }
    }

    /**
     * GET /api/price-lists
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // min/max rate come from the DB rather than loading every line:
        // the list only needs the range each sheet spans, not its items.
        $query = PriceList::with(['customer:id,customer_code,name,company_name', 'creator:id,name'])
            ->withCount('items')
            ->withMin('items', 'rate')
            ->withMax('items', 'rate');

        $this->applyVisibility($query, $user);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('from_date')) {
            $query->whereDate('issue_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('issue_date', '<=', $request->to_date);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('reference_no', 'LIKE', "%{$search}%")
                  ->orWhere('customer_name', 'LIKE', "%{$search}%")
                  ->orWhere('customer_company', 'LIKE', "%{$search}%")
                  ->orWhere('customer_phone', 'LIKE', "%{$search}%")
                  ->orWhere('subject', 'LIKE', "%{$search}%");
            });
        }

        $query->orderBy('id', 'desc');

        if ($request->boolean('all')) {
            return $this->successResponse($query->get(), 'Price lists retrieved successfully.');
        }

        return $this->paginatedResponse(
            $query->paginate((int) $request->get('per_page', 15)),
            'Price lists retrieved successfully.'
        );
    }

    /**
     * GET /api/price-lists/{id}
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $query = PriceList::with(['items', 'customer:id,customer_code,name,company_name,phone,address', 'creator:id,name'])
            ->where('id', $id);
        $this->applyVisibility($query, $user);

        $priceList = $query->first();

        if (!$priceList) {
            return $this->notFoundResponse('Price list not found.');
        }

        return $this->successResponse($priceList, 'Price list retrieved successfully.');
    }

    /**
     * POST /api/price-lists
     */
    public function store(Request $request): JsonResponse
    {
        if (!$request->user()->can('price_lists:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $data = $this->validatePayload($request);

        $priceList = DB::transaction(function () use ($data, $request) {
            $priceList = PriceList::create([
                'reference_no'     => $this->nextDocumentNumber(PriceList::class, 'reference_no', 'PL'),
                'customer_id'      => $data['customer_id'] ?? null,
                'customer_name'    => $data['customer_name'] ?? null,
                'customer_company' => $data['customer_company'] ?? null,
                'customer_phone'   => $data['customer_phone'] ?? null,
                'customer_address' => $data['customer_address'] ?? null,
                'issue_date'       => $data['issue_date'],
                'subject'          => $data['subject'] ?? null,
                'validity'         => $data['validity'] ?? null,
                'terms'            => $data['terms'] ?? null,
                'created_by'       => $request->user()->id,
            ]);

            $this->syncItems($priceList, $data['items']);

            return $priceList;
        });

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'create',
            'module'           => 'PriceList',
            'reference_id'     => $priceList->id,
            'reference_number' => $priceList->reference_no,
            'new_value'        => $priceList->fresh('items')->toArray(),
            'description'      => "Created price list {$priceList->reference_no}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->createdResponse(
            $priceList->fresh(['items', 'customer:id,customer_code,name,company_name', 'creator:id,name'])
                      ->loadCount('items'),
            'Price list saved successfully.'
        );
    }

    /**
     * PUT /api/price-lists/{id}
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        if (!$user->can('price_lists:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        // Visibility doubles as the edit rule: whatever a user is allowed to
        // see, they are allowed to correct. A salesman therefore cannot
        // touch a colleague's sheet.
        $query = PriceList::with('items')->where('id', $id);
        $this->applyVisibility($query, $user);
        $priceList = $query->first();

        if (!$priceList) {
            return $this->notFoundResponse('Price list not found.');
        }

        if ($priceList->is_archived) {
            return $this->errorResponse('This price list is archived. Restore it before editing.', 422);
        }

        $data = $this->validatePayload($request);
        $oldValue = $priceList->toArray();

        DB::transaction(function () use ($priceList, $data) {
            $priceList->update([
                'customer_id'      => $data['customer_id'] ?? null,
                'customer_name'    => $data['customer_name'] ?? null,
                'customer_company' => $data['customer_company'] ?? null,
                'customer_phone'   => $data['customer_phone'] ?? null,
                'customer_address' => $data['customer_address'] ?? null,
                'issue_date'       => $data['issue_date'],
                'subject'          => $data['subject'] ?? null,
                'validity'         => $data['validity'] ?? null,
                'terms'            => $data['terms'] ?? null,
            ]);

            $this->syncItems($priceList, $data['items']);
        });

        AuditLog::create([
            'user_id'          => $user->id,
            'user_name'        => $user->name,
            'action_type'      => 'update',
            'module'           => 'PriceList',
            'reference_id'     => $priceList->id,
            'reference_number' => $priceList->reference_no,
            'old_value'        => $oldValue,
            'new_value'        => $priceList->fresh('items')->toArray(),
            'description'      => "Updated price list {$priceList->reference_no}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse(
            $priceList->fresh(['items', 'customer:id,customer_code,name,company_name', 'creator:id,name'])
                      ->loadCount('items'),
            'Price list updated successfully.'
        );
    }

    /**
     * DELETE /api/price-lists/{id}
     *
     * Archives rather than deletes, matching every other document here — a
     * sheet already sent to a client should stay reprintable.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        if (!$user->can('price_lists:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $query = PriceList::where('id', $id);
        $this->applyVisibility($query, $user);
        $priceList = $query->first();

        if (!$priceList) {
            return $this->notFoundResponse('Price list not found.');
        }

        $oldValue = $priceList->toArray();
        $priceList->archive($user->id, $request->input('archive_reason', 'Archived via API'));

        AuditLog::create([
            'user_id'          => $user->id,
            'user_name'        => $user->name,
            'action_type'      => 'archive',
            'module'           => 'PriceList',
            'reference_id'     => $priceList->id,
            'reference_number' => $priceList->reference_no,
            'old_value'        => $oldValue,
            'new_value'        => $priceList->fresh()->toArray(),
            'description'      => "Archived price list {$priceList->reference_no}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($priceList->fresh(), 'Price list archived successfully.');
    }

    /**
     * POST /api/price-lists/{id}/restore
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        if (!$user->can('price_lists:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $query = PriceList::where('id', $id);
        $this->applyVisibility($query, $user);
        $priceList = $query->first();

        if (!$priceList) {
            return $this->notFoundResponse('Price list not found.');
        }

        $priceList->restore($user->id);

        AuditLog::create([
            'user_id'          => $user->id,
            'user_name'        => $user->name,
            'action_type'      => 'restore',
            'module'           => 'PriceList',
            'reference_id'     => $priceList->id,
            'reference_number' => $priceList->reference_no,
            'new_value'        => $priceList->fresh()->toArray(),
            'description'      => "Restored price list {$priceList->reference_no}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($priceList->fresh(), 'Price list restored successfully.');
    }
}
