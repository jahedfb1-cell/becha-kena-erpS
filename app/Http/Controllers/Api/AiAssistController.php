<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiAssistLog;
use App\Services\GeminiService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * AI Assist — see AI_Assist_PRD.md for the customer-form feature, and the
 * class docblock on parseSizes() below for the quotation/order size scanner.
 *
 * Endpoints:
 *   POST /api/ai/parse-customer  card image or pasted text -> structured fields
 *   POST /api/ai/transcribe      voice note -> plain transcript
 *   POST /api/ai/parse-sizes     handwritten/screenshot image -> width/height/pcs rows
 *
 * Nothing here writes to the database. The output is a draft the salesman
 * reviews on screen before it is applied to the form, so a bad extraction
 * costs a correction, never a corrupted record.
 */
class AiAssistController extends Controller
{
    use ApiResponse;

    /**
     * The only fields AI is ever allowed to produce.
     *
     * PRD §4 forbids `opening_balance` and `customer_category` in three
     * independent layers; this schema is layer 2 (the API contract). They are
     * not listed as forbidden — they are simply absent, so the model has no
     * slot to write them into even if a prompt change asked for them.
     *
     * `notes` is absent for the same reason, but for a different rule: the
     * Notes & Remarks field only exists on the Edit Customer form, once a
     * customer has an ID — never on the New Customer form AI Assist operates
     * on. There is nowhere for an AI-produced note to be applied, so it is
     * not extracted (see the amendment at the top of AI_Assist_PRD.md).
     */
    private const RESPONSE_SCHEMA = [
        'type'       => 'OBJECT',
        'properties' => [
            'company_name'        => ['type' => 'STRING'],
            'contact_person_name' => ['type' => 'STRING'],
            'contact_number_1'    => ['type' => 'STRING'],
            'contact_number_2'    => ['type' => 'STRING'],
            'contact_number_3'    => ['type' => 'STRING'],
            'email'               => ['type' => 'STRING'],
            'address_line_1'      => ['type' => 'STRING'],
            'address_line_2'      => ['type' => 'STRING'],
            'confidence'          => ['type' => 'NUMBER'],
        ],
        'required' => [
            'company_name', 'contact_person_name',
            'contact_number_1', 'contact_number_2', 'contact_number_3',
            'email', 'address_line_1', 'address_line_2', 'confidence',
        ],
    ];

    /** Keys returned to the client, in a fixed order. */
    private const OUTPUT_KEYS = [
        'company_name', 'contact_person_name',
        'contact_number_1', 'contact_number_2', 'contact_number_3',
        'email', 'address_line_1', 'address_line_2',
    ];

    /** Response schema for the size-scan feature (parseSizes()). */
    private const SIZES_RESPONSE_SCHEMA = [
        'type'       => 'OBJECT',
        'properties' => [
            'sizes' => [
                'type'  => 'ARRAY',
                'items' => [
                    'type'       => 'OBJECT',
                    'properties' => [
                        'width'  => ['type' => 'NUMBER'],
                        'height' => ['type' => 'NUMBER'],
                        'pcs'    => ['type' => 'NUMBER'],
                    ],
                    'required' => ['width', 'height', 'pcs'],
                ],
            ],
            'confidence' => ['type' => 'NUMBER'],
        ],
        'required' => ['sizes', 'confidence'],
    ];

    /** A row this large is almost certainly a misread, not a real window. */
    private const MAX_SIZE_INCHES = 500;

    public function __construct(protected GeminiService $gemini)
    {
    }

    /**
     * POST /api/ai/parse-customer
     */
    public function parseCustomer(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessCanCreateCustomer($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'image' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:6144',
            'text'  => 'nullable|string|max:8000',
            'mode'  => 'nullable|string|in:card,text,voice',
        ]);

        $text = trim((string) ($validated['text'] ?? ''));
        $hasImage = $request->hasFile('image');

        if (!$hasImage && $text === '') {
            return $this->errorResponse('text, image or audio required', 422);
        }

        $parts = [];

        if ($hasImage) {
            $file = $request->file('image');
            $parts[] = $this->gemini->inlineFilePart(
                file_get_contents($file->getRealPath()),
                $file->getMimeType() ?: 'image/jpeg'
            );
        }

        $parts[] = ['text' => $text !== ''
            ? "Extract the customer details from this text:\n\n" . $text
            : 'Extract the customer details from this visiting card image.'];

        try {
            $draft = $this->gemini->generateJson($parts, $this->extractionPrompt(), self::RESPONSE_SCHEMA);
        } catch (RuntimeException $e) {
            return $this->mapFailure($e);
        }

        $result = $this->normalise($draft);

        $log = AiAssistLog::create([
            'user_id'    => $request->user()?->id,
            'mode'       => $validated['mode'] ?? ($hasImage ? 'card' : 'text'),
            'confidence' => $result['confidence'],
            'applied'    => false,
        ]);

        return response()->json(['data' => $result, 'log_id' => $log->id]);
    }

    /**
     * POST /api/ai/log-applied
     *
     * Flips the `applied` flag when the user accepts a draft. Kept as its own
     * call because acceptance happens on the review screen, long after the
     * extraction response has been returned.
     */
    public function logApplied(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'log_id' => 'required|integer',
        ]);

        AiAssistLog::where('id', $validated['log_id'])
            ->where('user_id', $request->user()?->id)
            ->update(['applied' => true]);

        // Always 200: a failed analytics write must never block the form.
        return response()->json(['success' => true]);
    }

    /**
     * POST /api/ai/transcribe
     *
     * Returns a transcript only. Per PRD §7.5 the transcript is shown to the
     * user in the text tab rather than applied to the form, because a
     * misheard digit reads as perfectly plausible text.
     */
    public function transcribe(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessCanCreateCustomer($request)) {
            return $denied;
        }

        $request->validate([
            'audio' => 'required|file|mimes:webm,ogg,mp3,wav,m4a,mp4|max:10240',
        ]);

        $file = $request->file('audio');

        $parts = [
            $this->gemini->inlineFilePart(
                file_get_contents($file->getRealPath()),
                $file->getMimeType() ?: 'audio/webm'
            ),
            ['text' => 'Transcribe this audio.'],
        ];

        try {
            $transcript = $this->gemini->generateText($parts, $this->transcriptionPrompt());
        } catch (RuntimeException $e) {
            return $this->mapFailure($e);
        }

        if (trim($transcript) === '') {
            return $this->errorResponse('কিছু শোনা যায়নি। আবার বলুন।', 422);
        }

        return response()->json(['text' => $transcript]);
    }

    /**
     * POST /api/ai/parse-sizes
     *
     * A site technician hands the salesman a photo of handwritten window
     * measurements, or the salesman screenshots a WhatsApp message listing
     * them. This turns that image into Width/Height/Pcs rows for the
     * Quotation/Order size builder (Quotations.jsx / Orders.jsx), the same
     * grid the Excel-paste button feeds — parse-sizes is a second way to
     * fill that grid, not a new one.
     *
     * Every row is still shown on a review table for the salesman to
     * correct or delete before anything is applied (AI_Assist_PRD.md §4.3's
     * review-before-apply rule applies here too, even though this feature
     * predates the PRD): a misread "60" as "80" is a wrong purchase order
     * and a wrong invoice, so nothing here is trusted uncritically.
     */
    public function parseSizes(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessCanCreateQuotation($request)) {
            return $denied;
        }

        $request->validate([
            'image' => 'required|file|mimes:jpg,jpeg,png,webp|max:8192',
        ]);

        $file = $request->file('image');
        $parts = [
            $this->gemini->inlineFilePart(
                file_get_contents($file->getRealPath()),
                $file->getMimeType() ?: 'image/jpeg'
            ),
            ['text' => 'Extract every window size from this image.'],
        ];

        try {
            $draft = $this->gemini->generateJson($parts, $this->sizesExtractionPrompt(), self::SIZES_RESPONSE_SCHEMA);
        } catch (RuntimeException $e) {
            return $this->mapFailure($e);
        }

        $result = $this->normaliseSizes($draft);

        $log = AiAssistLog::create([
            'user_id'    => $request->user()?->id,
            'mode'       => 'size_scan',
            'confidence' => $result['confidence'],
            'applied'    => false,
        ]);

        return response()->json(['data' => $result, 'log_id' => $log->id]);
    }

    /**
     * AI Assist is not a separate permission: anyone who may create a
     * customer may create one this way (PRD §2A). Checked in the controller
     * because this codebase gates permissions inline rather than via a
     * middleware alias.
     */
    private function denyUnlessCanCreateCustomer(Request $request): ?JsonResponse
    {
        return $request->user()?->can('customers:create')
            ? null
            : $this->errorResponse('You do not have permission to create customers.', 403);
    }

    /**
     * Same inline-permission pattern as denyUnlessCanCreateCustomer() above,
     * gated on the permission that already governs the quotation/order
     * builder these size rows are pasted into.
     */
    private function denyUnlessCanCreateQuotation(Request $request): ?JsonResponse
    {
        return $request->user()?->can('quotations:create')
            ? null
            : $this->errorResponse('You do not have permission to create quotations.', 403);
    }

    /**
     * Guarantees the response shape regardless of what the model returned:
     * every key present, every value a trimmed string, confidence a float
     * clamped to 0..1. The frontend can then render without defensive checks.
     */
    private function normalise(array $draft): array
    {
        $out = [];

        foreach (self::OUTPUT_KEYS as $key) {
            $value = $draft[$key] ?? '';
            $out[$key] = is_scalar($value) ? trim((string) $value) : '';
        }

        // PRD §6.1 — Company Name must not be empty when any name was found.
        if ($out['company_name'] === '' && $out['contact_person_name'] !== '') {
            $out['company_name'] = $out['contact_person_name'];
        }

        $confidence = is_numeric($draft['confidence'] ?? null) ? (float) $draft['confidence'] : 0.0;
        $out['confidence'] = round(max(0, min(1, $confidence)), 2);

        return $out;
    }

    /**
     * Guarantees every row is a usable positive width/height/pcs triple, or
     * is dropped rather than passed through as junk the caller has to guard
     * against. `pcs` is never left at 0 — a size line without a repeat count
     * means one window, not zero.
     */
    private function normaliseSizes(array $draft): array
    {
        $rows = [];

        foreach ((array) ($draft['sizes'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }

            $width  = is_numeric($row['width'] ?? null) ? (float) $row['width'] : 0.0;
            $height = is_numeric($row['height'] ?? null) ? (float) $row['height'] : 0.0;
            $pcs    = is_numeric($row['pcs'] ?? null) ? (int) round((float) $row['pcs']) : 1;

            if ($width <= 0 || $height <= 0) {
                continue; // never invent a missing dimension
            }
            if ($width > self::MAX_SIZE_INCHES || $height > self::MAX_SIZE_INCHES) {
                continue; // near-certain misread, not a real window
            }

            $rows[] = [
                'width'  => round($width, 2),
                'height' => round($height, 2),
                'pcs'    => max(1, $pcs),
            ];
        }

        $confidence = is_numeric($draft['confidence'] ?? null) ? (float) $draft['confidence'] : 0.0;

        return [
            'sizes'      => $rows,
            'confidence' => round(max(0, min(1, $confidence)), 2),
        ];
    }

    /**
     * Translates a provider failure code into the user-facing message and
     * HTTP status defined in PRD §8.3.
     */
    private function mapFailure(RuntimeException $e): JsonResponse
    {
        return match ($e->getMessage()) {
            'NOT_CONFIGURED' => $this->errorResponse('AI কনফিগার করা হয়নি।', 500),
            'QUOTA'          => $this->errorResponse('এই মুহূর্তে লিমিট শেষ। কিছুক্ষণ পর চেষ্টা করুন বা হাতে লিখুন।', 429),
            'MODEL_RETIRED'  => $this->errorResponse('AI মডেল আপডেট দরকার। ডেভেলপারকে জানান।', 502),
            'BUSY'           => $this->errorResponse('AI এখন ব্যস্ত। কয়েক সেকেন্ড পর আবার চেষ্টা করুন।', 503),
            'UNPARSEABLE'    => $this->errorResponse('ডেটা পড়া যায়নি।', 422),
            default          => $this->errorResponse('AI সার্ভিস এখন কাজ করছে না।', 502),
        };
    }

    /**
     * The extraction rules from PRD §6, written for the model.
     */
    private function extractionPrompt(): string
    {
        return <<<'PROMPT'
You extract B2B customer details from Bangladeshi visiting cards, WhatsApp
messages, email signatures, trade licences and similar sources, for an ERP
used by window-blind traders in Bangladesh.

Return ONLY the JSON object described by the response schema.

COMPANY vs PERSON
- The firm name goes in company_name. The human name goes in
  contact_person_name. Never merge the two into one field.
- If the source has only a person's name and no firm, put that same name in
  BOTH company_name and contact_person_name.
- A designation (Director, Proprietor, Managing Director, Manager) is not a
  name and has no field of its own — leave it out.

PHONE NUMBERS
- Convert Bengali digits ০১২৩৪৫৬৭৮৯ to English digits 0123456789 everywhere.
- Normalise every Bangladeshi mobile number to +8801XXXXXXXXX. A local form
  like 01815819840 becomes +8801815819840.
- Fill in the order found: first -> contact_number_1, second ->
  contact_number_2, third -> contact_number_3.
- Landline or office numbers: keep them as printed and place them after the
  mobile numbers, using whichever of the three slots is still empty.
- There is no field for a fourth number or later — leave any beyond the third
  out rather than overwriting one of the three slots.

ADDRESS
- address_line_1 holds the specific location: house, road, plot, floor,
  building.
- address_line_2 holds the wider area: thana, district, post code.
- If the address is a single short line, put all of it in address_line_1 and
  leave address_line_2 empty.
- Never invent a district or area that is not written in the source.

OUT OF SCOPE
Website, BIN/TIN/trade licence number, product lines, and any other detail
that has no dedicated field above are not extracted — there is nowhere to put
them. Do not fold them into company_name, contact_person_name, or the address
fields.

NEVER INVENT
- If a field is not present in the source, return an empty string "".
- Do not complete a partial phone number.
- Do not guess a district from a road name.
- Do not expand an abbreviation unless it is written in full elsewhere in the
  same source.
An empty field costs one manual entry; an invented field corrupts the record
and nobody notices.

CONFIDENCE
Set confidence between 0 and 1 for how reliable this extraction is overall.
Lower it for blurry images, partial text, or ambiguous layouts.
PROMPT;
    }

    /**
     * The extraction rules for the size-scan feature, written for the model.
     */
    private function sizesExtractionPrompt(): string
    {
        return <<<'PROMPT'
You extract window / door measurements from a photo or screenshot for a
window-blind trader's quotation builder in Bangladesh. The source is usually
a site technician's handwritten note, a hand-drawn sketch with numbers on
it, a WhatsApp message, or a simple table.

Return ONLY the JSON object described by the response schema: a "sizes"
array, one entry per distinct window/door, each with width, height and pcs.

UNITS
- All measurements are in inches unless the source explicitly writes cm, ft,
  m, or মিটার/ফুট. Convert those to inches (1 ft = 12 in, 1 m = 39.37 in,
  1 cm = 0.3937 in) before returning the number.
- Convert Bengali digits ০১২৩৪৫৬৭৮৯ to English digits everywhere.
- A pair written as "60x80", "60*80", "60 by 80", "60/80", or on two
  adjacent lines is one row: width then height, in that order — the first
  number is always width, the second is always height.

PCS / QUANTITY
- "pcs", "qty", "x2", "×2", or a repeated identical size written twice both
  mean a repeat count. Fold repeats of the exact same width+height into one
  row with pcs = the count.
- If no quantity is written for a size, pcs = 1.

MULTIPLE ROWS
- A photo may show many sizes (a table, a list, several sketched windows).
  Return one array entry per distinct size — a numbered list or table row is
  one entry each.
- Ignore anything that is not a width/height pair: room names, floor
  numbers, prices, dates, and other annotations are not sizes.

NEVER INVENT
- Only extract a pair where both a width and a height are actually written
  or clearly implied by a labelled sketch. Do not guess a missing second
  number from the first.
- If the image contains no readable size at all, return an empty sizes
  array — do not fabricate an example size.

CONFIDENCE
Set confidence between 0 and 1 for how reliable this reading is overall.
Lower it for messy handwriting, a blurry photo, or any row you are unsure
about — the salesman reviews every row before it is used, so a low score
here is not a failure, it is useful information for that review.
PROMPT;
    }

    private function transcriptionPrompt(): string
    {
        return <<<'PROMPT'
You transcribe short voice notes recorded by salesmen in Bangladesh who are
dictating a new customer's details.

- The speaker usually mixes Bengali and English. Transcribe names, company
  names, and addresses in English (Latin) script.
- Write all numbers as English digits.
- Return the transcript text only — no commentary, no labels, no formatting.
- If the audio is silent or nothing intelligible was said, return an empty
  response.
PROMPT;
    }
}
