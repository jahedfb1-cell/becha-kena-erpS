<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Thin wrapper around the Google Gemini REST API.
 *
 * Everything provider-specific lives here so that swapping to a different
 * model host (self-hosted Ollama, a paid tier, another vendor) is a change
 * to this one class plus config — see AI_Assist_PRD.md §12.
 *
 * Failure modes are translated into a small set of stable exception codes
 * that the controller maps to the user-facing messages in PRD §8.3:
 *   NOT_CONFIGURED  — no API key set
 *   QUOTA           — free-tier limit hit (429)
 *   MODEL_RETIRED   — configured model no longer exists (404)
 *   BUSY            — model overloaded (503), retries exhausted
 *   UPSTREAM        — anything else from the provider
 *   UNPARSEABLE     — provider replied, but not with usable JSON
 *   TIMEOUT         — the model did not answer in time (treated like BUSY: the
 *                     next model is tried instead of waiting on a stuck one)
 */
class GeminiService
{
    /**
     * A 503 from Gemini means "this model is busy right now", not "your
     * request is wrong" — the free tier returns it regularly under load. One
     * retry with a short backoff turns most of them into a normal answer
     * instead of an error the salesman has to work around.
     */
    private const RETRY_DELAY_MS = [800, 2500];

    /**
     * Attempts on the model of last resort. The earlier models get exactly one:
     * if one is busy or stuck, waiting on it only makes the salesman wait -
     * the next model answers sooner than a retry would.
     */
    private const LAST_MODEL_ATTEMPTS = 2;

    /** Text-only requests are small and quick; a model that has not answered in this long is stuck. */
    private const TEXT_TIMEOUT_SECONDS = 25;
    private const CONNECT_TIMEOUT_SECONDS = 8;

    public function isConfigured(): bool
    {
        return filled(config('services.gemini.key'));
    }

    public function model(): string
    {
        return (string) config('services.gemini.model');
    }

    /**
     * Ask the model to return JSON matching $responseSchema.
     *
     * @param  array  $parts  Gemini "parts" array (text and/or inlineData)
     * @return array  decoded JSON object
     */
    public function generateJson(array $parts, string $systemPrompt, array $responseSchema, bool $preferFast = false): array
    {
        $raw = $this->call($parts, [
            'responseMimeType' => 'application/json',
            'responseSchema'   => $responseSchema,
            'temperature'      => 0.1,
        ], $systemPrompt, $preferFast);

        $decoded = json_decode($raw, true);

        if (!is_array($decoded)) {
            Log::warning('Gemini returned unparseable JSON', ['raw' => mb_substr($raw, 0, 500)]);
            throw new RuntimeException('UNPARSEABLE');
        }

        return $decoded;
    }

    /**
     * Ask the model for plain text (used for audio transcription).
     */
    public function generateText(array $parts, string $systemPrompt): string
    {
        return trim($this->call($parts, ['temperature' => 0.0], $systemPrompt));
    }

    /**
     * Builds a Gemini inlineData part from an uploaded file.
     */
    public function inlineFilePart(string $binary, string $mimeType): array
    {
        return [
            'inlineData' => [
                'mimeType' => $mimeType,
                'data'     => base64_encode($binary),
            ],
        ];
    }

    /**
     * Runs the request against the primary model, then the fallback model if
     * the primary is out of free-tier quota or overloaded.
     *
     * The free tier caps the good flash model at 20 requests per minute and
     * returns 503 whenever Google is busy. Both are temporary conditions that
     * a smaller sibling model can serve immediately, and a slightly weaker
     * extraction the salesman reviews anyway beats an error message.
     */
    protected function call(array $parts, array $generationConfig, string $systemPrompt, bool $preferFast = false): string
    {
        if (!$this->isConfigured()) {
            throw new RuntimeException('NOT_CONFIGURED');
        }

        $thinkingLevel = (string) config('services.gemini.thinking_level');
        if ($thinkingLevel !== '') {
            $generationConfig['thinkingConfig'] = ['thinkingLevel' => $thinkingLevel];
        }

        $payload = [
            'systemInstruction' => [
                'parts' => [['text' => $systemPrompt]],
            ],
            'contents' => [[
                'role'  => 'user',
                'parts' => $parts,
            ]],
            'generationConfig' => $generationConfig,
        ];

        $primary  = $this->model();
        $fallback = (string) config('services.gemini.fallback_model');

        // Pulling a name out of plain pasted text is easy work, so for text-only
        // requests the small fast model goes first and the stronger one is the
        // backup. Images and audio keep the stronger model first.
        $ordered = ($preferFast && $fallback !== '') ? [$fallback, $primary] : [$primary, $fallback];
        $models  = array_values(array_unique(array_filter($ordered, fn ($m) => $m !== '')));

        $hasMedia = $this->hasInlineData($parts);
        $timeout  = $hasMedia
            ? (int) config('services.gemini.timeout', 45)
            : min(self::TEXT_TIMEOUT_SECONDS, (int) config('services.gemini.timeout', 45));

        $lastFailure = 'UPSTREAM';

        foreach ($models as $index => $model) {
            $isLast = $index === count($models) - 1;

            try {
                return $this->callModel($model, $payload, $isLast ? self::LAST_MODEL_ATTEMPTS : 1, $timeout);
            } catch (RuntimeException $e) {
                $lastFailure = $e->getMessage();

                // Only capacity problems are worth another model's time. A bad
                // request or an unreadable answer will fail identically twice.
                if (!in_array($lastFailure, ['QUOTA', 'BUSY', 'MODEL_RETIRED', 'TIMEOUT'], true)) {
                    throw $e;
                }

                if ($index < count($models) - 1) {
                    Log::info('Gemini falling back to secondary model', [
                        'from'   => $model,
                        'reason' => $lastFailure,
                    ]);
                }
            }
        }

        throw new RuntimeException($lastFailure);
    }

    /**
     * One model, with a short retry on 503 before giving up on it.
     */
    protected function callModel(string $model, array $payload, int $maxAttempts = 2, int $timeout = 45): string
    {
        $url = rtrim((string) config('services.gemini.base_url'), '/')
            . '/models/' . $model . ':generateContent';

        $response = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = Http::timeout($timeout)
                    ->connectTimeout(self::CONNECT_TIMEOUT_SECONDS)
                    ->withHeaders(['x-goog-api-key' => (string) config('services.gemini.key')])
                    ->asJson()
                    ->post($url, $payload);
            } catch (\Throwable $e) {
                // No answer within the time limit: the model is stuck, so do not
                // wait on it again - hand over to the next model straight away.
                if (str_contains($e->getMessage(), 'cURL error 28')) {
                    Log::warning('Gemini timed out', ['model' => $model, 'seconds' => $timeout]);
                    throw new RuntimeException('TIMEOUT');
                }

                // A dropped connection mid-upload is common with the multi-megabyte
                // audio payloads this sends, and is exactly as transient as a 503.
                if ($attempt < $maxAttempts) {
                    Log::info('Gemini request dropped, retrying', [
                        'model'   => $model,
                        'attempt' => $attempt,
                        'error'   => $e->getMessage(),
                    ]);
                    usleep(self::RETRY_DELAY_MS[$attempt - 1] * 1000);
                    continue;
                }

                Log::error('Gemini request failed to send', ['error' => $e->getMessage()]);
                throw new RuntimeException('UPSTREAM');
            }

            // 503 is transient overload; anything else is decided on first sight.
            if ($response->status() !== 503 || $attempt === $maxAttempts) {
                break;
            }

            Log::info('Gemini overloaded, retrying', ['model' => $model, 'attempt' => $attempt]);
            usleep(self::RETRY_DELAY_MS[$attempt - 1] * 1000);
        }

        if ($response->status() === 429) {
            throw new RuntimeException('QUOTA');
        }

        if ($response->status() === 404) {
            // A retired model name is an outage that looks like a bug — make
            // it loud and distinct so it is not mistaken for a bad request.
            Log::critical('Gemini model not found — the configured model may have been retired', [
                'model' => $model,
            ]);
            throw new RuntimeException('MODEL_RETIRED');
        }

        if ($response->status() === 503) {
            Log::warning('Gemini still overloaded after retries', ['model' => $model]);
            throw new RuntimeException('BUSY');
        }

        if ($response->failed()) {
            Log::error('Gemini upstream error', [
                'status' => $response->status(),
                'model'  => $model,
                'body'   => mb_substr($response->body(), 0, 500),
            ]);
            throw new RuntimeException('UPSTREAM');
        }

        $text = $this->firstTextPart($response->json());

        if ($text === null) {
            Log::warning('Gemini returned an empty candidate', [
                'model'        => $model,
                'finishReason' => data_get($response->json(), 'candidates.0.finishReason'),
            ]);
            throw new RuntimeException('UNPARSEABLE');
        }

        return $text;
    }

    /** Whether the request carries an image or audio payload (slower to send and to read). */
    protected function hasInlineData(array $parts): bool
    {
        foreach ($parts as $part) {
            if (isset($part['inlineData'])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns the first real text part of the answer.
     *
     * Thinking models put their reasoning in the same `parts` array, flagged
     * with `thought: true`, and it is not always last — reading `parts.0.text`
     * blindly would hand the caller the model's scratchpad instead of the JSON.
     */
    protected function firstTextPart(?array $json): ?string
    {
        foreach (data_get($json, 'candidates.0.content.parts', []) ?? [] as $part) {
            if (($part['thought'] ?? false) === true) {
                continue;
            }
            if (isset($part['text']) && is_string($part['text']) && trim($part['text']) !== '') {
                return $part['text'];
            }
        }

        return null;
    }
}
