/* THE GROQ CLIENT.
 *
 * WHY A THIRD CLIENT AND NOT A FLAG ON AN EXISTING ONE.
 *   `model.ts` speaks Anthropic's Messages API; Groq speaks OpenAI's
 *   chat-completions API. The request bodies, the header that carries the
 *   credential, and the shape of the reply all differ. Bending one client to
 *   cover both would put three `if (provider === ...)` branches inside the one
 *   place a wrong branch means a student is taught by the wrong model, or a
 *   credential goes to the wrong host. Two small clients beside each other are
 *   easier to read and impossible to confuse.
 *
 * NO SDK, FOR THE SAME REASON `model.ts` HAS NONE.
 *   One POST and one JSON parse. A dependency here would be a supply-chain
 *   surface on the process that holds the key.
 *
 * WHAT IT REFUSES TO DO.
 *   It never logs the key, never puts it in an error message, and never
 *   returns the upstream error text -- an upstream 401 body routinely echoes
 *   the credential that was rejected. `index.ts` also scrubs it from responses.
 */

import { LESSON_SCHEMA, SYSTEM, briefFor, type LessonBrief } from './prompt.ts'
import type { FetchLike, FetchResponse, Model } from './model.ts'

/** OpenAI-compatible endpoint. Groq documents this path, not a bespoke one. */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * The 120-billion-parameter model, named explicitly.
 *
 * Overridable by `GROQ_MODEL` so a smaller, cheaper one can be used without a
 * code change -- but the DEFAULT is stated here rather than left to an
 * environment variable, because a server that quietly teaches with whatever
 * model happened to be exported is the quiet degradation this project keeps
 * guarding against.
 */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'

/**
 * How much the model may write in one reply.
 *
 * MEASURED AGAINST THE ACCOUNT, NOT COPIED FROM THE OTHER CLIENT.
 *
 * This was 16000, carried over from `model.ts`, and it made EVERY request
 * fail. Groq reports the account's real ceiling in its own headers:
 *
 *     x-ratelimit-limit-tokens: 8000      <- the whole per-MINUTE budget
 *     x-ratelimit-reset-tokens: 12.577s
 *
 * `max_tokens` is a RESERVATION, not a measurement of what gets used, so
 * asking for 16000 reserved twice the entire minute's allowance on every
 * request and the service refused with 413 before writing a word.
 *
 * 2000 is chosen from what the product actually needs rather than from what
 * fits: one part of a lesson is a block or two, and the longest real lesson
 * measured here came back well under it. It also leaves the input -- a long
 * system prompt plus the schema -- comfortable room inside the same 8000.
 */
const MAX_TOKENS = 2000

export interface GroqOptions {
  readonly apiKey: string
  readonly model?: string
  readonly fetchImpl?: FetchLike
}

/**
 * Pull the lesson JSON out of an OpenAI-shaped reply.
 *
 * Read defensively at every step. This crossed a network from a vendor, and a
 * shape that changed under us must fail with a sentence naming what was
 * missing, never with `undefined is not an object` in front of a student.
 */
function lessonFrom(payload: unknown): unknown {
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('the model reply carried no choices')
  }
  const message = (choices[0] as { message?: unknown }).message
  const content = (message as { content?: unknown })?.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('the model reply carried no text')
  }
  try {
    return JSON.parse(content)
  } catch {
    /* The raw text is deliberately not included. It is model output, it can be
       long, and it lands in logs. The failure is named; its body is not. */
    throw new Error('the model reply was not the JSON lesson that was asked for')
  }
}

/**
 * Failures that a second attempt genuinely fixes, and the two that do not.
 *
 * MEASURED, AGAINST THE LIVE API, NOT GUESSED.
 *
 * `json_validate_failed` -- the model wrote JSON that did not fit the lesson
 * schema. Asked the SAME off-topic question three times: the first failed this
 * way, the third produced a correct lesson that judged the question off-topic
 * and said so. It is a bad roll of the dice, not a broken request, and a re-ask
 * clears it.
 *
 * `rate_limit_exceeded` (413 / 429) -- the tokens-per-minute ceiling. Hit
 * repeatedly here just by testing quickly, so a classroom of students will hit
 * it constantly. Waiting is the entire fix.
 *
 * NOT RETRIED: 401 and 404. A wrong key and a wrong model name are the same on
 * the second attempt as the first, and retrying them turns an instant, clear
 * failure into a slow, confusing one.
 *
 * WHY THIS IS THE PRODUCT'S PROBLEM AND NOT THE VENDOR'S. Invariant I1 says
 * every question gets an answer. A child who asked something reasonable and was
 * told "I could not reach the part of me that answers that" because of one bad
 * roll has been failed by us, not by Groq.
 */
function worthAnotherTry(status: number, code: string): boolean {
  if (status === 401 || status === 404) return false
  if (code === 'json_validate_failed') return true
  if (code === 'rate_limit_exceeded') return true
  return status === 429 || status === 413 || status >= 500
}

/**
 * How long the SERVICE says to wait, read from its own headers.
 *
 * MEASURED, NOT GUESSED, AND THAT IS THE WHOLE POINT OF THIS FUNCTION. The
 * fixed waits below were picked by hand and were wrong twice: 1.2s and 4s both
 * expired before a budget that resets in 12.577s, so three attempts inside
 * five seconds amounted to one attempt spent three times.
 *
 * Groq reports the real figure on every reply -- `x-ratelimit-reset-tokens:
 * 12.577s` -- so the honest thing is to wait exactly that long. Formats seen
 * are plain seconds and `1m2.3s`, and anything unrecognised falls back rather
 * than throwing, because a wait we cannot parse must not become a crash.
 */
function waitTheServiceAsksFor(response: FetchResponse): number | null {
  const raw =
    response.headers?.get('x-ratelimit-reset-tokens') ??
    response.headers?.get('retry-after') ??
    null
  if (raw === null || raw.trim() === '') return null

  const text = raw.trim()
  /* `retry-after` is bare seconds. */
  if (/^\d+(\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000)

  const match = /^(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(text)
  if (match === null) return null
  const minutes = Number(match[1] ?? 0)
  const seconds = Number(match[2] ?? 0)
  const total = minutes * 60_000 + seconds * 1000
  if (total <= 0) return null
  /* A pause longer than this is not a retry, it is a hang in front of a child.
   * Better to fail honestly and let her ask again. */
  return Math.min(total + 500, 30_000)
}

/**
 * How long to wait before trying again, when the service does not say.
 *
 * TAKEN FROM THE SERVICE'S OWN RESET FIGURE, NOT PICKED. Groq reports
 * `x-ratelimit-reset-tokens: 12.577s`, so the first two waits were 1.2s and
 * 4s and both expired long before the budget came back -- three attempts
 * inside five seconds is one attempt, spent three times.
 *
 * A bad JSON roll is fixed by trying again at once, which is what the short
 * first wait is for. A token budget is fixed only by waiting for the minute to
 * turn, which is what the second one is for.
 */
const WAIT_BEFORE_RETRY_MS = [800, 14_000] as const

export function createGroqModel(options: GroqOptions): Model {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    /* Built from a constant, never from the credential. */
    throw new Error('GROQ_API_KEY is not set; the server cannot reach the model')
  }
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const apiKey = options.apiKey
  const model = options.model ?? DEFAULT_GROQ_MODEL

  return {
    async lesson(brief: LessonBrief) {
      const body = JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        /* THE SAME SCHEMA THE OTHER CLIENTS USE. The lesson contract is the
           product's, not a vendor's, so the shape a student's screen depends
           on cannot drift because the model behind it changed.
         *
         * NOT `strict: true`, AND THAT IS MEASURED RATHER THAN CAUTIOUS.
         *
         * It was strict for one afternoon and EVERY lesson request failed with
         * `400 invalid_request_error`, while a plain request to the same key
         * and model returned 200. Strict structured-output mode refuses the
         * keywords this schema is built out of -- `pattern`, `maxLength`,
         * `minItems`, `maxItems` -- and additionally demands that every
         * property be listed in `required`. `LESSON_SCHEMA` uses all four and
         * has optional fields by design, so strict mode rejects the SCHEMA
         * before the model ever writes a word.
         *
         * Loosening the schema to fit the vendor would have been the wrong
         * direction: those bounds are the product's rules about what a lesson
         * may contain, and a vendor flag is not a reason to weaken them.
         *
         * Nothing is lost, because the vendor was never the gate.
         * `handler.ts` puts every reply through `validateLesson` -- the same
         * check the browser runs -- and refuses anything that fails. */
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'lesson', schema: LESSON_SCHEMA },
        },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: briefFor(brief) },
        ],
      })

      let lastStatus = 0
      let lastWhy = ''
      /* What the service told us to wait, if it did. Preferred over the fixed
       * waits, because it is the truth and they are an estimate. */
      let askedToWait: number | null = null

      /* One attempt, then up to two more for failures a retry actually fixes.
       * See `worthAnotherTry`. */
      for (let attempt = 0; attempt <= WAIT_BEFORE_RETRY_MS.length; attempt++) {
        if (attempt > 0) {
          const wait = askedToWait ?? WAIT_BEFORE_RETRY_MS[attempt - 1] ?? 0
          await new Promise((resume) => setTimeout(resume, wait))
        }

        const response = await doFetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body,
        })

        if (response.ok) return lessonFrom(await response.json())

        /* THE VENDOR'S SHORT CODES ONLY. Its MESSAGE can quote the request, and
         * the request is not something this server repeats. The credential is
         * in neither, and `index.ts` scrubs the response regardless. */
        let code = ''
        let type = ''
        try {
          const failure = (await response.json()) as { error?: { type?: string; code?: string } }
          type = failure.error?.type ?? ''
          code = failure.error?.code ?? ''
        } catch {
          /* A body that is not JSON tells us nothing safe to repeat. */
        }
        lastStatus = response.status
        lastWhy = [type, code].filter((part) => part !== '').join('/')
        askedToWait = waitTheServiceAsksFor(response)

        if (!worthAnotherTry(response.status, code)) break
      }

      throw new Error(
        `the model could not be reached (${lastStatus}${lastWhy === '' ? '' : ` ${lastWhy}`})`,
      )
    },
  }
}