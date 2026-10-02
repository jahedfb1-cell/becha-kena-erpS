<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CourierBooking;
use App\Models\Quotation;
use App\Services\CourierBookingService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Courier booking slips — the paper that goes to the courier counter with a
 * confirmed order. Raised from the Orders page, never from an invoice, and
 * carries no product prices: the only figure on it is the COD amount.
 */
class CourierBookingController extends Controller
{
    use ApiResponse;

    protected CourierBookingService $bookingService;

    public function __construct(CourierBookingService $bookingService)
    {
        $this->bookingService = $bookingService;
    }

    /**
     * GET /api/courier-bookings
     * Optionally filtered to one order, which is how the Orders page loads
     * the slips already raised against the row being edited.
     */
    public function index(Request $request): JsonResponse
    {
        if (!$request->user()->can('courier_bookings:view')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $query = CourierBooking::active()
            ->with(['customer:id,name,company_name,phone', 'lines', 'quotation:id,quotation_number'])
            ->orderByDesc('id');

        if ($request->filled('quotation_id')) {
            $query->where('quotation_id', (int) $request->get('quotation_id'));
        }

        if ($request->filled('search')) {
            $search = $request->get('search');
            $query->where(function ($q) use ($search) {
                $q->where('booking_number', 'LIKE', "%{$search}%")
                  ->orWhere('receiver_name', 'LIKE', "%{$search}%")
                  ->orWhere('receiver_phone', 'LIKE', "%{$search}%");
            });
        }

        if ($request->boolean('all')) {
            return $this->successResponse($query->get(), 'Courier bookings retrieved successfully.');
        }

        return $this->paginatedResponse($query->paginate((int) $request->get('per_page', 20)));
    }

    /**
     * GET /api/courier-bookings/draft/{quotationId}
     * The suggested slip for an order that hasn't got one yet: receiver
     * defaults from the customer, bundle lines from the packing rules, COD
     * from the order total less any advances already taken.
     */
    public function draft(Request $request, int $quotationId): JsonResponse
    {
        if (!$request->user()->can('courier_bookings:view')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $quotation = Quotation::with('customer')->find($quotationId);

        if (!$quotation) {
            return $this->notFoundResponse('Order not found.');
        }

        return $this->successResponse([
            'quotation_id'    => $quotation->id,
            'quotation_number' => $quotation->quotation_number,
            'customer_id'     => $quotation->customer_id,
            'booking_number'  => $this->bookingService->generateBookingNumber($quotation->brand_id),
            'booking_date'    => now()->toDateString(),
            'cod_enabled'     => true,
            'cod_amount'      => $this->bookingService->outstandingFor($quotation),
            'cod_label'       => "COD 'Condition Tk",
            'lines'           => $this->bookingService->buildDraftLines($quotation),
            // Form-only hint: how many pieces sit behind each line, so the
            // packer can judge the bundle count. Never printed on the slip.
            'piece_counts'    => $this->bookingService->pieceCountsByLine($quotation),
            // Every number we hold for this customer, so the form can offer
            // them as a dropdown — the parcel is often collected on the
            // company's second or third line rather than the main one.
            'phone_options'   => array_values(array_unique(array_filter([
                $quotation->customer?->phone,
                $quotation->customer?->second_contact_number,
                $quotation->customer?->third_contact_number,
            ]))),
        ] + $this->bookingService->defaultReceiverFor($quotation), 'Draft courier booking prepared.');
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('courier_bookings:view')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $booking = CourierBooking::with([
            'lines',
            'customer',
            'quotation:id,quotation_number,net_amount,brand_id',
            'creator:id,name',
        ])->find($id);

        if (!$booking) {
            return $this->notFoundResponse('Courier booking not found.');
        }

        return $this->successResponse($booking, 'Courier booking retrieved successfully.');
    }

    /**
     * POST /api/courier-bookings
     * An order can be booked more than once (part shipments, a reshipment
     * after a courier return), so there is deliberately no "already exists"
     * guard here the way there is on delivery challans.
     */
    public function store(Request $request): JsonResponse
    {
        if (!$request->user()->can('courier_bookings:generate')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $data = $this->validatePayload($request);

        $quotation = Quotation::find($data['quotation_id']);

        if (!$quotation) {
            return $this->notFoundResponse('Order not found.');
        }

        // Booking is for goods that are on their way out, so the order has to
        // be confirmed (approved) or already invoiced — a slip is often raised
        // before the invoice is cut. Anything earlier is refused.
        if ($problem = $this->bookingService->whyNotBookable($quotation)) {
            return $this->errorResponse($problem, 422);
        }

        $number = trim((string) ($data['booking_number'] ?? ''));

        if ($number !== '' && $this->bookingService->numberIsTaken($quotation->brand_id, $number)) {
            return $this->errorResponse("Slip number {$number} is already used. Pick a different number.", 422);
        }

        $user = $request->user();

        return DB::transaction(function () use ($data, $quotation, $user, $number) {
            $lines = $data['lines'] ?? [];
            unset($data['lines'], $data['booking_number']);

            // An explicit null would reach a NOT NULL column and surface as a
            // database error; "no COD" is stored as zero.
            if (array_key_exists('cod_amount', $data)) {
                $data['cod_amount'] = (float) ($data['cod_amount'] ?? 0);
            }

            $booking = CourierBooking::create($data + [
                'customer_id'    => $quotation->customer_id,
                'brand_id'       => $quotation->brand_id,
                'booking_number' => $number !== ''
                    ? $number
                    : $this->bookingService->generateBookingNumber($quotation->brand_id),
                'created_by'     => $user->id,
            ]);

            $this->syncLines($booking, $lines);

            AuditLog::record(
                $user->id,
                $user->name,
                'create',
                CourierBooking::class,
                $booking->id,
                null,
                $booking->toArray(),
                "Created courier booking {$booking->booking_number} for order {$quotation->quotation_number}"
            );

            return $this->createdResponse(
                $booking->load(['lines', 'customer']),
                "Courier booking {$booking->booking_number} created successfully."
            );
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('courier_bookings:generate')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $booking = CourierBooking::active()->find($id);

        if (!$booking) {
            return $this->notFoundResponse('Courier booking not found.');
        }

        $data = $this->validatePayload($request, $booking);

        // Renumbering onto a number another slip holds is refused up front;
        // keeping the slip's own current number is not a collision.
        $newNumber = trim((string) ($data['booking_number'] ?? ''));
        if ($newNumber !== '' && $newNumber !== $booking->booking_number
            && $this->bookingService->numberIsTaken($booking->brand_id, $newNumber, $booking->id)) {
            return $this->errorResponse("Slip number {$newNumber} is already used. Pick a different number.", 422);
        }

        $user = $request->user();

        return DB::transaction(function () use ($booking, $data, $user) {
            $oldSnapshot = $booking->toArray();

            $lines = $data['lines'] ?? null;
            unset($data['lines'], $data['quotation_id']);

            if (array_key_exists('cod_amount', $data)) {
                $data['cod_amount'] = (float) ($data['cod_amount'] ?? 0);
            }

            // Blanking the number field on the form must not blank the slip's
            // number — the courier's book already has it written down.
            if (trim((string) ($data['booking_number'] ?? '')) === '') {
                unset($data['booking_number']);
            }

            $booking->update($data);

            if (is_array($lines)) {
                $this->syncLines($booking, $lines);
            }

            AuditLog::record(
                $user->id,
                $user->name,
                'update',
                CourierBooking::class,
                $booking->id,
                $oldSnapshot,
                $booking->fresh()->toArray(),
                "Updated courier booking {$booking->booking_number}"
            );

            return $this->successResponse(
                $booking->fresh()->load(['lines', 'customer']),
                "Courier booking {$booking->booking_number} updated successfully."
            );
        });
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('courier_bookings:generate')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $booking = CourierBooking::active()->find($id);

        if (!$booking) {
            return $this->notFoundResponse('Courier booking not found.');
        }

        $user   = $request->user();
        $reason = $request->get('reason', 'Archived via API');

        return DB::transaction(function () use ($booking, $user, $reason) {
            $oldSnapshot = $booking->toArray();

            $booking->archive($user->id, $reason);

            AuditLog::record(
                $user->id,
                $user->name,
                'archive',
                CourierBooking::class,
                $booking->id,
                $oldSnapshot,
                $booking->fresh()->toArray(),
                "Archived courier booking {$booking->booking_number}"
            );

            return $this->successResponse(null, "Courier booking {$booking->booking_number} archived successfully.");
        });
    }

    /**
     * Rewrite a booking's lines wholesale. The slip is small and fully hand
     * editable, so diffing rows buys nothing over replacing them — and the
     * lines carry no money or ledger links that a new id could break.
     */
    protected function syncLines(CourierBooking $booking, array $lines): void
    {
        $booking->lines()->delete();

        foreach (array_values($lines) as $index => $line) {
            $description = trim((string) ($line['description'] ?? ''));

            if ($description === '') {
                continue;
            }

            $booking->lines()->create([
                'description' => $description,
                'colour'      => $line['colour'] ?? null,
                'bundles'     => $line['bundles'] ?? 1,
                'sort_order'  => $line['sort_order'] ?? $index,
            ]);
        }
    }

    protected function validatePayload(Request $request, ?CourierBooking $booking = null): array
    {
        $rules = [
            'booking_number'      => 'nullable|string|max:20',
            'booking_date'        => 'required|date',
            'receiver_name'       => 'required|string|max:255',
            'receiver_phone'      => 'nullable|string|max:60',
            'receiver_address'    => 'nullable|string|max:1000',
            'receiver_is_company' => 'nullable|boolean',
            'courier_name'        => 'nullable|string|max:255',
            'cod_enabled'         => 'nullable|boolean',
            'cod_amount'          => 'nullable|numeric|min:0',
            'cod_label'           => 'nullable|string|max:100',
            'status'              => 'nullable|in:pending,booked,delivered,cancelled',
            'notes'               => 'nullable|string|max:2000',
            'lines'               => 'nullable|array',
            'lines.*.description' => 'nullable|string|max:255',
            'lines.*.colour'      => 'nullable|string|max:100',
            'lines.*.bundles'     => 'nullable|numeric|min:0',
            'lines.*.sort_order'  => 'nullable|integer|min:0',
        ];

        if (!$booking) {
            $rules['quotation_id'] = 'required|integer|exists:quotations,id';
        }

        $data = $request->validate($rules);

        $data['receiver_is_company'] = $request->boolean(
            'receiver_is_company',
            $booking ? (bool) $booking->receiver_is_company : true
        );
        $data['cod_enabled'] = $request->boolean(
            'cod_enabled',
            $booking ? (bool) $booking->cod_enabled : true
        );

        return $data;
    }
}
