<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\CourierBooking;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Quotation;

class CourierBookingService
{
    /**
     * Extra parcels a category leaves in, beyond the goods themselves.
     *
     * Roller and Zebra travel as a single wrapped bundle, so they take one
     * line and appear here not at all. A Vertical Blinds order leaves as two
     * separate parcels — the fabric in a carton and the rails tied together —
     * and PVC the same way, so each of those adds a second line for the
     * hardware, which is not an order line of its own and so has no product
     * name to carry.
     *
     * Keyed by the lowercased category name so a stray capital in the master
     * data doesn't silently drop an order back to the default.
     */
    protected const EXTRA_PARCELS = [
        'vertical blinds'   => 'Channels',
        'pvc strip curtain' => 'SS channels',
    ];

    /**
     * Categories that never travel in a parcel, so they don't earn a line on
     * the courier slip. Labour lines on an order would otherwise show up as a
     * bundle the counter staff have to strike out by hand every time.
     */
    protected const NOT_SHIPPED = [
        'servicing & fitting',
    ];

    /**
     * Mint the next slip number.
     *
     * The counter staff read this number aloud and write it on the courier's
     * own book, so it stays short: two digits of year, a dash, then a serial
     * that restarts every January. Unlike the QT/INV series this one IS scoped
     * per brand, because the two brands book with different couriers and each
     * keeps its own physical book.
     */
    public function generateBookingNumber(?int $brandId = null): string
    {
        $brandId = $brandId ?: Brand::resolveIdFor(auth()->user());
        $prefix  = now()->format('y') . '-';

        // Highest serial among numbers that actually follow the "YY-NN" shape.
        // The numbers are read in PHP rather than ordered in SQL: the field is
        // hand-editable, and a typed "26-09A" sorts highest by its leading
        // digits yet cannot be parsed, which used to send the counter back to
        // 01 — onto a number already taken. A year holds a few hundred slips
        // at most, so reading them is cheap, and archived slips are included
        // because they still occupy their number in the unique index.
        $highest = 0;
        $numbers = CourierBooking::withoutGlobalScope('brand')
            ->where('brand_id', $brandId)
            ->where('booking_number', 'LIKE', "{$prefix}%")
            ->pluck('booking_number');

        foreach ($numbers as $number) {
            if (preg_match('/^' . preg_quote($prefix, '/') . '(\d+)$/', (string) $number, $m)) {
                $highest = max($highest, (int) $m[1]);
            }
        }

        return $prefix . str_pad((string) ($highest + 1), 2, '0', STR_PAD_LEFT);
    }

    /**
     * Whether a slip number is already taken within a brand's series.
     *
     * The unique index would refuse a duplicate anyway, but as a raw database
     * exception; checking first lets the form say what is wrong. Archived
     * slips count — they still hold their number.
     */
    public function numberIsTaken(?int $brandId, string $number, ?int $ignoreId = null): bool
    {
        return CourierBooking::withoutGlobalScope('brand')
            ->where('brand_id', $brandId)
            ->where('booking_number', $number)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
    }

    /**
     * Why an order cannot be booked to the courier, or null when it can.
     *
     * Only a confirmed order (approved) or one already invoiced has goods that
     * are ready to ship. The older check refused just "quotation" and
     * "rejected", which let an order still waiting for approval through.
     */
    public function whyNotBookable(Quotation $quotation): ?string
    {
        if ($quotation->is_archived) {
            return 'This order is archived — a courier booking cannot be raised for it.';
        }

        if (!in_array($quotation->status, ['approved', 'invoiced'], true)) {
            return 'This order has not been confirmed yet — a courier booking can only be raised for a confirmed order.';
        }

        return null;
    }

    /**
     * What the customer still owes on this order — the figure that goes on the
     * slip as the COD amount. Advances already collected against the order are
     * subtracted; archived (voided) ones are not, since that money never came.
     */
    public function outstandingFor(Quotation $quotation): float
    {
        // Once the order has been invoiced, the invoice is the source of truth
        // for what is still owed. Payments taken AFTER invoicing are recorded
        // against the invoice and carry no quotation_id, so the advance sum
        // below never sees them — and the slip would send the courier to
        // collect money the customer has already paid.
        $invoices = Invoice::withoutGlobalScope('brand')
            ->where('quotation_id', $quotation->id)
            ->where('is_archived', false)
            ->get(['due_amount']);

        if ($invoices->isNotEmpty()) {
            return round(max((float) $invoices->sum('due_amount'), 0), 2);
        }

        $advances = Payment::withoutGlobalScope('brand')
            ->where('quotation_id', $quotation->id)
            ->where('is_archived', false)
            ->sum('amount');

        return round(max((float) $quotation->net_amount - (float) $advances, 0), 2);
    }

    /**
     * Turn a confirmed order into the draft bundle lines for its slip.
     *
     * This is only a starting point. The real parcel count is known at packing
     * time, so every field produced here is editable afterwards — the rules
     * exist to save typing on the common orders, not to be authoritative.
     */
    public function buildDraftLines(Quotation $quotation): array
    {
        $quotation->loadMissing('items.product.category');

        // Group by category so a 40-size Roller order still prints one line,
        // and remember one product code per category for the Colour column.
        $groups = [];

        foreach ($quotation->items as $item) {
            if ($item->is_optional && !$item->is_selected) {
                continue;
            }

            $product  = $item->product;
            $category = $product?->category;
            $name     = $category?->name ?: ($product?->name ?: 'Goods');
            $key      = strtolower($name);

            if (in_array($key, self::NOT_SHIPPED, true)) {
                continue;
            }

            if (!isset($groups[$key])) {
                $groups[$key] = ['name' => $name, 'codes' => [], 'products' => [], 'pcs' => 0];
            }

            $productName = trim((string) ($product?->name ?? ''));
            if ($productName !== '' && !in_array($productName, $groups[$key]['products'], true)) {
                $groups[$key]['products'][] = $productName;
            }

            // How many pieces of this category are going out. Not printed -
            // it's shown beside the line in the form so whoever is packing can
            // see what they're dividing into bundles.
            $groups[$key]['pcs'] += (int) ($item->pcs ?: 0);

            $code = trim((string) ($product?->product_code ?? ''));
            if ($code !== '' && !in_array($code, $groups[$key]['codes'], true)) {
                $groups[$key]['codes'][] = $code;
            }
        }

        $lines = [];
        $order = 0;

        foreach ($groups as $key => $group) {
            $colour = implode(', ', $group['codes']);

            // "Roller Blinds : Roller blinds Curtain" — the category alone
            // isn't enough for whoever receives the parcel to know what's in
            // it, and the product name alone doesn't say which kind of blind
            // it is. Several products of one category are listed together,
            // since they all travel in the same bundle.
            $products = implode(', ', $group['products']);

            $lines[] = [
                'description' => $products !== '' ? "{$group['name']} : {$products}" : $group['name'],
                'colour'      => $colour ?: null,
                'bundles'     => 1,
                'sort_order'  => $order++,
                'pcs'         => $group['pcs'],
            ];

            if (isset(self::EXTRA_PARCELS[$key])) {
                $lines[] = [
                    'description' => self::EXTRA_PARCELS[$key],
                    // The hardware that goes with the fabric has no colour of
                    // its own, which is why the sample slip writes a dash.
                    'colour'      => null,
                    'bundles'     => 1,
                    'sort_order'  => $order++,
                    'pcs'         => $group['pcs'],
                ];
            }
        }

        return $lines;
    }

    /**
     * Piece count per drafted line description, so the booking form can show
     * "12 pcs" beside a line the packer is about to split into bundles.
     *
     * Keyed by description rather than carried on the line itself because the
     * lines are freely edited and re-saved - this map is rebuilt from the
     * order every time the form opens, so it stays right for a slip that was
     * saved days ago, and simply falls away for a line that's been renamed.
     *
     * @return array<string, int>
     */
    public function pieceCountsByLine(Quotation $quotation): array
    {
        $counts = [];

        foreach ($this->buildDraftLines($quotation) as $line) {
            $counts[$line['description']] = $line['pcs'];
        }

        return $counts;
    }

    /**
     * Sensible receiver defaults: the customer as we know them. Whoever
     * actually collects the parcel is filled in by hand on the slip.
     */
    public function defaultReceiverFor(Quotation $quotation): array
    {
        $customer = $quotation->customer;

        return [
            'receiver_name'    => $customer?->company_name ?: ($customer?->name ?: ''),
            'receiver_phone'   => $customer?->phone,
            'receiver_address' => $quotation->delivery_address ?: $customer?->address,
        ];
    }
}
