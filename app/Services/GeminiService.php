<?php

namespace App\Services;

use GuzzleHttp\Promise\AggregateException;
use GuzzleHttp\Promise\Utils;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
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
 *   BUSY            — model overloaded (503)
 *   TIMEOUT         — the model did not answer in time
 *   UPSTREAM        — anything else from the provider
 *   UNPARSEABLE     — provider replied, but not with usable JSON
 *
 * Why the models are raced: on the free tier any single Gemini model is, at
 * any moment, either fast, overloaded (503, sometimes only after 20+ seconds)
 * or silent until the timeout - and which one it is changes from minute to
 * minute. Asking one model, waiting, then asking the next turned a bad minute
 * into a one-minute wait followed by an error. Asking several at once and
 * taking the first usable answer makes the request as fast as the fastest
 * healthy model, and only fails when all of them fail together.
 */
class GeminiService
{
    /** Longest the whole request may take; the browser gives up at 75 seconds. */
    private const TOTAL_BUDGET_SECONDS = 58;

    /** Text-only requests are small; a model silent for this long is stuck. */
    private const TEXT_TIMEOUT_SECONDS = 20;
    private const MEDIA_TIMEOUT_SECONDS = 30;
    private const CONNECT_TIMEOUT_SECONDS = 8;

    /** A second round is only worth starting if there is time for it to finish. */
    private const MIN_SECONDS_FOR_RETRY = 12;
    private const RETRY_PAUSE_MS = 1200;

    /** When every model failed, report the most useful reason first. */
    private const FAILURE_PRIORITY = ['BUSY', 'TIMEOUT', 'QUOTA', 'UNPARSEABLE', 'UPSTREAM', 'MODEL_RETIRED'];

    public function isConfigured(): bool
    {
        return filled(config('services.gemini.key'));
    }

    public function model(): string
    {
        return (string) config('services.gemini.model');
    }

    /**
     * The models asked for each request, raced against each other.
     *
     * @return string[]
     */
    protected function models(): array
    {
        $raceCount = max(1, (int) config('services.gemini.race_count', 3));

        $models = array_merge(
            (array) config('services.gemini.models', []),
            [$this->model(), (string) config('services.gemini.fallback_model')]
        );

        $models = array_values(array_unique(array_filter(array_map('trim', $models), fn ($m) => $m !== '')));

        return array_slice($models, 0, $raceCount);
    }

    /**
     * Ask the model to return JSON matching $responseSchema.
     *
     * @param  array  $parts  Gemini "parts" array (text and/or inlineData)
     * @param  bool   $preferFast  kept for callers; every model is raced now, so order no longer matters
     * @return array  decoded JSON object
     */
    public function generateJson(array $parts, string $systemPrompt, array $responseSchema, bool $preferFast = false): array
    {
        // A model that answers with something that is not JSON must not win the
        // race - the next model's answer is used instead.
        $accept = function (string $raw): bool {
            if (!is_array(json_decode($raw, true))) {
                Log::warning('Gemini returned unparseable JSON', ['raw' => mb_substr($raw, 0, 500)]);

                return false;
            }

            return true;
        };

        $raw = $this->call($parts, [
            'responseMimeType' => 'application/json',
            'responseSchema'   => $responseSchema,
            'temperature'      => 0.1,
        ], $systemPrompt, $accept);

        return json_decode($raw, true);
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
     * Races the request across the models and returns the first usable answer.
     *
     * @param  callable|null  $accept  receives the raw answer text; false rejects it
     */
    protected function call(array $parts, array $generationConfig, string $systemPrompt, ?callable $accept = null): string
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

        $models = $this->models();
        $perCallTimeout = $this->hasInlineData($parts) ? self::MEDIA_TIMEOUT_SECONDS : self::TEXT_TIMEOUT_SECONDS;
        $perCallTimeout = min($perCallTimeout, (int) config('services.gemini.timeout', 45));

        $started = microtime(true);
        $failures = [];

        for ($round = 1; $round <= 2; $round++) {
            $remaining = self::TOTAL_BUDGET_SECONDS - (int) (microtime(true) - $started);
            $timeout = max(5, min($perCallTimeout, $remaining));

            try {
                return $this->race($models, $payload, $timeout, $accept);
            } catch (RuntimeException $e) {
                $failures[] = $e->getMessage();
            }

            $left = self::TOTAL_BUDGET_SECONDS - (int) (microtime(true) - $started);
            // Quota and retired-model failures are not going to clear in a second.
            $retryable = !in_array(end($failures), ['QUOTA', 'MODEL_RETIRED', 'NOT_CONFIGURED'], true);
            if ($round === 2 || !$retryable || $left < self::MIN_SECONDS_FOR_RETRY) {
                break;
            }

            Log::info('Gemini: every model failed, trying once more', ['failures' => $failures, 'left' => $left]);
            usleep(self::RETRY_PAUSE_MS * 1000);
        }

        throw new RuntimeException($this->mostUsefulFailure($failures));
    }

    /**
     * One round: send the request to every model at the same time and return
     * the first answer that is usable. Throws the most useful failure code when
     * none is.
     */
    protected function race(array $models, array $payload, int $timeout, ?callable $accept): string
    {
        $base = rtrim((string) config('services.gemini.base_url'), '/');
        $key = (string) config('services.gemini.key');

        $promises = [];
        foreach ($models as $model) {
            $promises[$model] = Http::timeout($timeout)
                ->connectTimeout(self::CONNECT_TIMEOUT_SECONDS)
                ->withHeaders(['x-goog-api-key' => $key])
                ->asJson()
                ->async()
                ->post($base . '/models/' . $model . ':generateContent', $payload)
                ->then(function ($response) use ($model, $accept) {
                    if (!$response instanceof Response) {
                        // The async client hands back the exception itself on a dropped connection.
                        throw $this->failureFromThrowable($response, $model);
                    }

                    return $this->usableText($response, $model, $accept);
                });
        }

        try {
            $winner = Utils::any($promises)->wait();
        } catch (AggregateException $e) {
            $codes = [];
            foreach ((array) $e->getReason() as $model => $reason) {
                $codes[] = $reason instanceof RuntimeException
                    ? $reason->getMessage()
                    : $this->failureFromThrowable($reason, (string) $model)->getMessage();
            }
            throw new RuntimeException($this->mostUsefulFailure($codes));
        }

        return $winner['text'] ?? (string) $winner;
    }

    /**
     * The answer text of a successful response, or an exception carrying the
     * failure code for this model.
     */
    protected function usableText(Response $response, string $model, ?callable $accept): array
    {
        if ($response->status() === 429) {
            throw new RuntimeException('QUOTA');
        }

        if ($response->status() === 404) {
            // A retired model name is an outage that looks like a bug — make
            // it loud and distinct so it is not mistaken for a bad request.
            Log::critical('Gemini model not found — the configured model may have been retired', ['model' => $model]);
            throw new RuntimeException('MODEL_RETIRED');
        }

        if ($response->status() === 503) {
            Log::info('Gemini model overloaded', ['model' => $model]);
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

        if ($accept !== null && $accept($text) === false) {
            throw new RuntimeException('UNPARSEABLE');
        }

        Log::info('Gemini answered', ['model' => $model]);

        return ['text' => $text, 'model' => $model];
    }

    protected function failureFromThrowable(\Throwable $e, string $model): RuntimeException
    {
        if ($e instanceof RuntimeException && in_array($e->getMessage(), self::FAILURE_PRIORITY, true)) {
            return $e;
        }

        if (str_contains($e->getMessage(), 'cURL error 28')) {
            Log::info('Gemini timed out', ['model' => $model]);

            return new RuntimeException('TIMEOUT');
        }

        Log::warning('Gemini request failed to send', ['model' => $model, 'error' => $e->getMessage()]);

        return new RuntimeException('UPSTREAM');
    }

    /** @param string[] $codes */
    protected function mostUsefulFailure(array $codes): string
    {
        foreach (self::FAILURE_PRIORITY as $code) {
            if (in_array($code, $codes, true)) {
                return $code;
            }
        }

        return 'UPSTREAM';
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
