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

/*
 * HOW MUCH ONE CONCEPT MAY COST, AND WHY IT IS NOT `MAX_TOKENS`.
 *
 * MEASURED against this account, serially, one call at a time:
 *
 *   whole lesson, SYSTEM + LESSON_SCHEMA, max_tokens 2000  ->  429 on the
 *                                                              FIRST call
 *   one concept,  conceptRequest prompt,  max_tokens 1200  ->  2708ms, taught
 *                                                              1062 in, 1064 out
 *
 * The arithmetic behind the 429 is not subtle. `SYSTEM` is 8737 characters and
 * `LESSON_SCHEMA` is another 2534 -- about 2800 input tokens -- and
 * `max_tokens` is a RESERVATION, not a measurement, so a whole-lesson request
 * claims roughly 4800 of a budget the service reports as 8000 PER MINUTE. One
 * repair turn re-sends the rejected lesson and the pair exceeds the whole
 * minute. That is why five of six questions came back 502 and one came back
 * 429: not a slow model, an over-drawn budget.
 *
 * A concept prompt is 1062 input tokens measured, and one concept is two
 * blocks. 1200 leaves room for the longest one seen without reserving a
 * quarter of the minute for output nobody writes.
 */
const CONCEPT_MAX_TOKENS = 1200

/*
 * A NEXT PART IS ONE OR TWO BLOCKS, AND IT WAS PRICED AS A WHOLE LESSON.
 *
 * `briefFor` tells the model, in its own words, "Write ONLY THE NEXT PART. One
 * or two blocks, no more." The request that carried that instruction reserved
 * 2000 output tokens and shipped a 2534-character schema alongside it -- about
 * 4800 of an 8000-per-minute budget, and roughly a fortieth of the 200000 this
 * account is allowed in a DAY, spent every time a learner presses continue.
 * Forty presses is not a lesson; it is barely one.
 *
 * The schema buys nothing, and that is measured rather than argued: the concept
 * path sends none and its replies pass the same `validateLesson` in
 * `handler.ts`, which is the gate either way. The vendor was never the gate.
 */
const NEXT_PART_MAX_TOKENS = 1200

export function createGroqModel(options: GroqOptions): Model {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    /* Built from a constant, never from the credential. */
    throw new Error('GROQ_API_KEY is not set; the server cannot reach the model')
  }
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const apiKey = options.apiKey
  const model = options.model ?? DEFAULT_GROQ_MODEL

  /*
   * ONE REQUEST LOOP, USED BY BOTH CALLS.
   *
   * `chat` and `lesson` differ only in the body they send and what they read
   * back. Everything between -- the retry policy, which failures are worth a
   * second attempt, honouring the service's own reset figure over our estimate,
   * and refusing to repeat the vendor's message because it quotes the request
   * and sometimes the credential -- is identical, and a second copy of it is a
   * second place for the retry policy to drift.
   */
  async function send(body: string): Promise<unknown> {
    let lastStatus = 0
    let lastWhy = ''
    /* What the service told us to wait, if it did. Preferred over the fixed
     * waits, because it is the truth and they are an estimate. */
    let askedToWait: number | null = null

    for (let attempt = 0; attempt <= WAIT_BEFORE_RETRY_MS.length; attempt++) {
      if (attempt > 0) {
        const wait = askedToWait ?? WAIT_BEFORE_RETRY_MS[attempt - 1] ?? 0
        await new Promise((resume) => setTimeout(resume, wait))
      }

      const response = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body,
      })

      if (response.ok) return await response.json()

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
  }

  return {
    /*
     * ONE TURN, TEXT IN, TEXT OUT -- the shape `authorConcept` asks for.
     *
     * No `response_format` and no schema. The concept prompt carries a worked
     * example of the shape it wants and `extractJson` reads the reply
     * defensively, which is what the browser-side author has always done. The
     * 2800 input tokens a schema costs buy nothing here: `handler.ts` puts
     * every reply through `validateLesson` regardless, so the vendor was never
     * the gate.
     *
     * `priorAssistant` is the repair turn. Sending back what the model wrote
     * makes "fix these problems" a correction of a document it can see;
     * omitting it makes the same message a complaint about something it has
     * never read.
     */
    async chat(system: string, user: string, priorAssistant?: string) {
      const messages: { role: string; content: string }[] = [{ role: 'system', content: system }]
      if (priorAssistant !== undefined && priorAssistant !== '') {
        messages.push({ role: 'assistant', content: priorAssistant })
      }
      messages.push({ role: 'user', content: user })

      const answered = await send(JSON.stringify({
        model,
        max_tokens: CONCEPT_MAX_TOKENS,
        /*
         * JSON MODE, WHICH IS NOT THE SAME AS A SCHEMA.
         *
         * `json_object` costs nothing to send -- it is a flag, not 2534
         * characters of schema -- and it removes the one failure this path
         * produced that had nothing to do with teaching: MEASURED,
         * "(reply): the reply contained no JSON object", where the model
         * answered in prose around the object and `extractJson` had nothing to
         * take. The concept prompt already carries a worked example of the
         * shape; this only stops the reply being wrapped in a sentence.
         *
         * NOT `json_schema`. That is the expensive one, it is what made the
         * whole-lesson request unaffordable, and `handler.ts` validates every
         * reply against `validateLesson` regardless -- so the vendor was never
         * the gate and does not need the shape.
         */
        response_format: { type: 'json_object' },
        /* The routes in `route.ts` are the variation. Sampling on top of them
           would make a measurement unrepeatable without making a lesson any
           better. */
        temperature: 0,
        messages,
      }))

      /* Read defensively at every step: this crossed a network from a vendor. */
      const choices = (answered as { choices?: unknown }).choices
      const first = Array.isArray(choices) ? choices[0] : undefined
      const content = (first as { message?: { content?: unknown } } | undefined)?.message?.content
      return typeof content === 'string' ? content : ''
    },

    /*
     * THE NEXT PART OF A LESSON IN PROGRESS.
     *
     * The SAME `SYSTEM` and the SAME `briefFor` as `lesson` -- the teaching
     * contract does not change because the reply is shorter, and a second
     * prompt would be a second place for it to drift. What changes is only what
     * is paid: `json_object` in place of the schema, and a reservation sized
     * for the one or two blocks the brief actually asks for.
     */
    async nextPart(brief: LessonBrief) {
      return lessonFrom(await send(JSON.stringify({
        model,
        max_tokens: NEXT_PART_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: briefFor(brief) },
        ],
      })))
    },

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

      /* One attempt, then up to two more for failures a retry actually fixes.
         See `send` and `worthAnotherTry`. */
      return lessonFrom(await send(body))
    },
  }
}