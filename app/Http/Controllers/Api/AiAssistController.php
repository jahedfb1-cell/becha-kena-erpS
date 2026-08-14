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
 * AI Assist for the New Customer Account form — see AI_Assist_PRD.md.
 *
 * Two endpoints:
 *   POST /api/ai/parse-customer  card image or pasted text -> structured fields
 *   POST /api/ai/transcribe      voice note -> plain transcript
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
