<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\CourierBooking;
use App\Models\Payment;
use App\Models\Quotation;

class CourierBookingService
{
    /**
     * How each product category is packed for the courier counter.
     *
     * Roller and Zebra travel as a single wrapped bundle, so they take one
     * line. A Vertical Blinds order leaves as two separate parcels — the
     * fabric in a carton and the rails tied together — and PVC the same way,
     * so those categories produce two lines. Everything else defaults to one
     * line under its own category name.
     *
     * Keyed by the lowercased category name so a stray capital in the master
     * data doesn't silently drop an order back to the default.
     */
    protected const PACKING_RULES = [
        'roller blinds'    => ['Roller blinds'],
        'zebra blinds'     => ['Zebra double shade roller'],
        'vertical blinds'  => ['vertical blinds fabric curtoon', 'Channels'],
        'pvc strip curtain' => ['PVC rolls', 'SS channels'],
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

        $last = CourierBooking::withoutGlobalScope('brand')
            ->where('brand_id', $brandId)
            ->where('booking_number', 'LIKE', "{$prefix}%")
            ->orderByRaw('CAST(SUBSTRING(booking_number, ' . (strlen($prefix) + 1) . ') AS UNSIGNED) DESC')
            ->first();

        $next = 1;
        if ($last && preg_match('/^\d{2}-(\d+)$/', (string) $last->booking_number, $m)) {
            $next = (int) $m[1] + 1;
        }

        return $prefix . str_pad((string) $next, 2, '0', STR_PAD_LEFT);
    }

    /**
     * What the customer still owes on this order — the figure that goes on the
     * slip as the COD amount. Advances already collected against the order are
     * subtracted; archived (voided) ones are not, since that money never came.
     */
    public function outstandingFor(Quotation $quotation): float
    {
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
                $groups[$key] = ['name' => $name, 'codes' => [], 'pcs' => 0];
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
            $descriptions = self::PACKING_RULES[$key] ?? [$group['name']];
            $colour       = implode(', ', $group['codes']);

            foreach ($descriptions as $index => $description) {
                $lines[] = [
                    'description' => $description,
                    // Only the first line of a split category carries the fabric
                    // code; the channels that go with it have no colour of their
                    // own, which is why the sample slip writes a dash there.
                    'colour'      => $index === 0 ? ($colour ?: null) : null,
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
