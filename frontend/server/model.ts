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

import { instructionFor, type Strategy } from './teaching.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 16000

export interface LessonBrief {
  /** How to teach it. Decided by the server's policy, never by the browser. */
  readonly strategy?: Strategy
  readonly concept?: string
  readonly subject?: string
  readonly question?: string
}

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
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponse>

export interface ModelOptions {
  readonly apiKey: string
  readonly fetchImpl?: FetchLike
}

/**
 * The block kinds a model may produce.
 *
 * The canvas renders eight. This offers five, and the two it leaves out of the
 * teaching-useful ones are left out on purpose:
 *
 *   chart, flow, simulation  carry data a model would have to INVENT -- series
 *                            values, node graphs, physical parameters -- and an
 *                            invented number drawn as an axis is a lie a
 *                            student has no way to detect.
 *
 *   metric, equation, table  are shapes a model can fill correctly from the
 *                            topic alone. Without them every live lesson was
 *                            paragraphs on every subject: a quadratic formula
 *                            written out in a sentence, a three-way comparison
 *                            as three paragraphs.
 */
export const ALLOWED_BLOCK_KINDS = ['prose', 'callout', 'metric', 'equation', 'table'] as const

/** The subset of LessonSpec a model is allowed to produce. */
export const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'question', 'blocks'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
    question: { type: 'string', minLength: 1, maxLength: 200 },
    subject: { type: 'string', maxLength: 120 },
    blocks: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'body'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
          kind: { type: 'string', enum: [...ALLOWED_BLOCK_KINDS] },
          title: { type: 'string', maxLength: 120 },
          emphasis: { type: 'string', enum: ['primary', 'supporting', 'aside'] },
          tone: { type: 'string', enum: ['neutral', 'insight', 'warning', 'result'] },

          /* prose and callout */
          body: { type: 'string', minLength: 1, maxLength: 2000 },

          /* metric — one measured number, said once and clearly */
          value: { type: ['number', 'string'] },
          unit: { type: 'string', minLength: 1, maxLength: 120 },
          delta: { type: 'number' },
          deltaMeaning: { type: 'string', enum: ['up-is-good', 'up-is-bad', 'neutral'] },

          /* equation — LaTeX, with the TERMS to draw the eye to. `highlight`
             names substrings, never glyph positions: a position is a place on
             a screen, and the model is not allowed to know about places. */
          latex: { type: 'string', minLength: 1, maxLength: 600 },
          highlight: {
            type: 'array', maxItems: 6,
            items: { type: 'string', minLength: 1, maxLength: 40 },
          },

          /* table — no alignment field, deliberately. The renderer aligns by
             COLUMN TYPE, and letting the author align a column is how a schema
             starts carrying layout one field at a time. */
          columns: {
            type: 'array', minItems: 1, maxItems: 8,
            items: {
              type: 'object', additionalProperties: false,
              required: ['key', 'label'],
              properties: {
                key: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
                label: { type: 'string', minLength: 1, maxLength: 120 },
                type: { type: 'string', enum: ['text', 'number', 'percent', 'currency'] },
              },
            },
          },
          rows: {
            type: 'array', minItems: 1, maxItems: 200,
            items: { type: 'object' },
          },

          /* shared by metric, equation and table */
          caption: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
    },
    relations: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'kind'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          kind: { type: 'string', enum: ['supports', 'derives', 'contrasts', 'exemplifies'] },
        },
      },
    },
  },
} as const

const SYSTEM = [
  'You write one short lesson that teaches a single idea to a school student.',
  '',
  'You do not decide how anything looks. No colour, no font size, no spacing,',
  'no position, no width. Those belong to the renderer, and a lesson carrying',
  'any of them is rejected before it reaches the student.',
  '',
  'Use emphasis to say what matters most and tone to say what kind of point it',
  'is. Keep each block to one idea. Never number the parts of the lesson and',
  'never say how many there are.',
  '',
  'Choose the block kind that MATCHES THE IDEA, not the one that is easiest:',
  '  prose     running explanation, and what to use when unsure',
  '  callout   one short point that must not be missed',
  '  metric    a single measured number that carries the idea',
  '  equation  mathematics, as LaTeX. Never write a formula out in a sentence',
  '            when it is the thing being taught.',
  '  table     two or more things compared on the same criteria',
  '',
  'A comparison written as three paragraphs is harder to read than a table with',
  'three rows, and a formula spelled out in words is harder than the formula.',
].join('\n')

function briefFor(brief: LessonBrief): string {
  if (typeof brief.question === 'string' && brief.question.trim() !== '') {
    return `A student asked: ${brief.question}\n\nAnswer it directly and plainly.`
  }
  const subject = brief.subject ? ` (${brief.subject})` : ''
  /* The strategy arrives as an INSTRUCTION, never as its own name. "Use the
   * strategy worked_example" tells a model nothing it can act on, and a brief
   * the model cannot act on is a strategy that was decided and then thrown
   * away. */
  const how =
    brief.strategy === undefined ? '' : `\n\nTeach it this way: ${instructionFor(brief.strategy)}`
  return `Teach this one concept${subject}: ${brief.concept}\n\nAssume nothing beyond it has been taught yet.${how}`
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
