/**
 * THE ANTHROPIC CLIENT
 *
 * Turns a concept into a LessonSpec-shaped object. It is the only thing in the
 * repository that holds the API key, and it never writes the key anywhere: not
 * into a URL, not into a body, not into an error message.
 *
 * WHY RAW FETCH AND NOT THE OFFICIAL SDK
 *     `@anthropic-ai/sdk` is not a dependency here, and adding one is a
 *     stop-and-ask in CLAUDE.md. The repo already calls the API by fetch in
 *     src/practice/engine/modelProvider.ts, so this follows the pattern already
 *     in the codebase. The SDK is the better long-term choice if the dependency
 *     is approved.
 *
 * API SHAPE — checked against the current reference, not recalled
 *     `budget_tokens`, `temperature` and `top_p` were REMOVED on this model and
 *     return 400. Sending one breaks every request, and the failure reads like
 *     an outage rather than a bad parameter, so tests assert their absence.
 *
 *     A refusal arrives as a 200 with `stop_reason: "refusal"`. Reading the
 *     content without checking that first yields an empty lesson and a
 *     confusing downstream error.
 *
 * WHY THE SCHEMA IS NARROW
 *     Only prose and callout blocks are requested. That is the same restriction
 *     the Python engine already enforces at `api/emit.py` — text is the part a
 *     model writes well, and every richer block kind is something the lesson
 *     author or the renderer supplies. Widening this is a deliberate later step,
 *     not an oversight.
 */

import { LESSON_SCHEMA, SYSTEM, briefFor, type LessonBrief } from './prompt.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 16000


export interface Model {
  lesson(brief: LessonBrief): Promise<unknown>
}

/**
 * Exactly the slice of `fetch` this client uses.
 *
 * Typing the injection point as the full DOM `fetch` demanded a `Request | URL`
 * first argument and a complete `Response` back, so an honest test double could
 * not satisfy it — the pressure was to cast the double to `any` and lose the
 * checking entirely. Declaring the three members actually touched keeps the
 * double honest AND the type real.
 */
export interface FetchResponse {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
  /**
   * Response headers, when the caller has them.
   *
   * OPTIONAL SO EVERY EXISTING DOUBLE STAYS VALID. Only the Groq client reads
   * them, and only to obey the service's own rate-limit reset instead of
   * guessing a wait. A double that does not supply headers simply falls back
   * to the fixed waits, which is what it did before this existed.
   */
  readonly headers?: { get(name: string): string | null }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponse>

export interface ModelOptions {
  readonly apiKey: string
  readonly fetchImpl?: FetchLike
}




/** Extracts the first text block, or explains precisely what was missing. */
function textFrom(payload: unknown): string {
  const content = (payload as { content?: unknown }).content
  if (!Array.isArray(content)) throw new Error('model response had no content array')
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') return text
    }
  }
  throw new Error('model response contained no text block')
}

export function createModel(options: ModelOptions): Model {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    /* Built from a constant, never from the credential. */
    throw new Error('ANTHROPIC_API_KEY is not set; the server cannot reach the model')
  }
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const apiKey = options.apiKey

  return {
    async lesson(brief) {
      const response = await doFetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          /* The model decides how much reasoning the concept needs. */
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: LESSON_SCHEMA },
          },
          system: SYSTEM,
          messages: [{ role: 'user', content: briefFor(brief) }],
        }),
      })

      if (!response.ok) {
        /* The status is kept because an outage and a bad request need different
         * responses. The upstream BODY is dropped: on a 401 it contains the
         * credential that was rejected. */
        throw new Error(`the model returned status ${response.status}`)
      }

      const payload: unknown = await response.json()

      /* A refusal is a 200. Checking stop_reason first turns it into a clear
       * failure instead of an empty lesson. */
      const stop = (payload as { stop_reason?: unknown }).stop_reason
      if (stop === 'refusal') {
        const details = (payload as { stop_details?: { category?: unknown } }).stop_details
        const category = typeof details?.category === 'string' ? details.category : 'unspecified'
        throw new Error(`the model refused this request (${category})`)
      }

      const text = textFrom(payload)
      try {
        return JSON.parse(text)
      } catch {
        throw new Error('the model returned text that is not JSON')
      }
    },
  }
}
