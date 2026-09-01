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
 * Turn a vendor's base URL into the chat-completions endpoint.
 *
 * TOLERANT OF BOTH FORMS PEOPLE ACTUALLY PASTE. A vendor's docs give either
 * `https://host/v1` or the full `https://host/v1/chat/completions`, and getting
 * it wrong produces a 404 that reads like a wrong model name. Both are
 * accepted, and a trailing slash is not a configuration error.
 */
function completionsUrl(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

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
  /**
   * WHERE TO SEND IT, BECAUSE THIS CLIENT WAS NEVER GROQ-SPECIFIC.
   *
   * Everything in this file speaks the OpenAI chat-completions shape:
   * `messages`, `max_tokens`, `response_format`, `choices[0].message.content`,
   * a 429 with `x-ratelimit-reset-tokens`. Groq is one host that speaks it, and
   * so do Moonshot (Kimi), Z.ai (GLM), DeepSeek and NVIDIA NIM.
   *
   * The URL was a constant, so reaching any of them meant copying six hundred
   * lines -- and a second copy of the retry policy, the deadline, the transport
   * catch and the secret-scrubbing is a second place for each of those to
   * drift. Every one of those was a real defect in this file within the last
   * day; none of them should be fixed twice.
   *
   * Absent keeps Groq, so nothing that already works has to change.
   */
  readonly baseUrl?: string
  /**
   * WHICH ENVIRONMENT VARIABLE HOLDS THE KEY, so a refusal can name it.
   *
   * This client is no longer Groq-only -- `provider.ts` selects it for
   * Moonshot, Z.ai, NVIDIA and DeepSeek too -- but the blank-key guard below
   * said `GROQ_API_KEY is not set` whichever of them was chosen. An operator
   * whose `MOONSHOT_API_KEY` trimmed to empty was stopped, at startup, by a
   * message about a variable they had never set, in a file whose whole doctrine
   * is that a failure must name what actually failed.
   *
   * Absent keeps `GROQ_API_KEY`, so every existing caller reads as before.
   */
  readonly keyVar?: string
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
  /*
   * THE ONE 413 THAT WAITING CANNOT FIX, NAMED RATHER THAN INFERRED.
   *
   * "Payload too large" is fixed by sending less and never by sending the
   * identical bytes again -- `MAX_TOKENS` was once 16000 against an 8000
   * ceiling and every call failed before the model wrote a word. So that case
   * is refused here, by the vendor's own code.
   *
   * EVERY OTHER 413 IS RETRIED, and dropping the status entirely was the wrong
   * way to get this. Groq answers 413 for the tokens-per-minute ceiling, which
   * waiting DOES fix, and nothing guarantees a code comes with it: an empty
   * body, a non-JSON body, or a proxy-generated 413 all leave `code` as ''.
   * Requiring the code turned a ceiling a 14-second pause clears into a hard
   * failure, and told the learner the model could not be reached.
   */
  if (code === 'request_too_large') return false
  /*
   * 413 IS RETRIED ONLY WHEN THE VENDOR SAYS IT IS A BUDGET, NEVER ON THE
   * STATUS ALONE.
   *
   * Groq answers 413 for the tokens-per-minute ceiling, which waiting fixes,
   * and that is what the paragraph above measured. But 413 means "payload too
   * large" everywhere else in HTTP, and THAT is fixed by sending less -- never
   * by sending the identical bytes again. This client has already shipped a
   * request too large to serve once: `MAX_TOKENS` was 16000 against an 8000
   * ceiling and every call failed before the model wrote a word. Retrying a
   * request of that shape is three identical failures and three times the wait
   * in front of a child, for an outcome that could not have differed.
   *
   * The vendor's own code is the only thing that can tell the two apart, so it
   * is the only thing consulted -- and it is checked ABOVE this line, where
   * `rate_limit_exceeded` already returns true whatever the status.
   */
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
  if (match !== null) {
    const minutes = Number(match[1] ?? 0)
    const seconds = Number(match[2] ?? 0)
    const total = minutes * 60_000 + seconds * 1000
    return total <= 0 ? null : capped(total)
  }

  /*
   * THE OTHER LEGAL SHAPE, WHICH THIS RETURNED `null` FOR.
   *
   * RFC 9110 allows `Retry-After` to be an HTTP-date -- `Wed, 21 Oct 2026
   * 07:28:00 GMT` -- as well as a number of seconds, and a proxy or CDN in
   * front of the vendor may rewrite one into the other without the vendor
   * knowing. Reading only the numeric form meant a perfectly good instruction
   * was discarded and the fixed estimate used instead, which is the exact
   * failure the header exists to prevent.
   *
   * A date already past reads as zero, not as a negative wait.
   */
  const when = Date.parse(text)
  if (Number.isNaN(when)) return null
  const fromNow = when - Date.now()
  return fromNow <= 0 ? null : capped(fromNow)
}

/**
 * The longest this client will pause before trying again.
 *
 * NAMED, BECAUSE THE COMMENT ABOVE PROMISED SOMETHING THIS DOES NOT DO. It
 * said "the honest thing is to wait exactly that long", and then capped the
 * wait -- so when the service asked for 45 seconds the client waited 30, tried
 * too early, and spent an attempt on a budget that had not reset.
 *
 * The cap stays: a pause longer than this is not a retry, it is a hang in
 * front of a child, and answering her honestly beats making her watch a
 * spinner. What changes is that the cap is now the STATED rule rather than a
 * contradiction hidden inside a function whose comment claimed the opposite.
 */
const LONGEST_PAUSE_MS = 30_000

function capped(wait: number): number {
  return Math.min(wait + 500, LONGEST_PAUSE_MS)
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

/**
 * The longest ONE attempt may take before it is abandoned.
 *
 * `fetch` HAS NO TIMEOUT OF ITS OWN, and that is not a detail. A vendor that
 * accepts the connection and then stops writing leaves the promise pending
 * until the socket dies, which on a healthy network can be minutes. Nothing
 * below this client could fix it: `handler.ts` races its own timer for the
 * whole-lesson path, which stops the LEARNER waiting but leaves the request in
 * flight -- and the concept path, which is the one `/api/ask` actually takes,
 * is not wrapped in that race at all.
 */
const LONGEST_ONE_ATTEMPT_MS = 20_000

/**
 * The longest the WHOLE call may take, attempts and pauses together.
 *
 * WITHOUT THIS THE WORST CASE WAS UNBOUNDED AND NOBODY HAD ADDED IT UP: two
 * pauses (0.8s + 14s), or up to 30s each when the service asks for a wait,
 * plus three attempts of unlimited length. Sixty seconds was reachable with
 * every individual number looking reasonable.
 *
 * 45 seconds is chosen from the child, not from the vendor: it is longer than
 * any measured success here by a wide margin -- the slowest real concept call
 * measured 3382ms, and the fastest 841ms -- and short enough that being told
 * plainly still beats waiting.
 */
const WHOLE_REQUEST_DEADLINE_MS = 45_000

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
/*
 * WHAT A RESERVATION COSTS, WHICH IS NOT WHAT A REPLY COSTS.
 *
 * `max_tokens` is not a cap that only bites when exceeded: a vendor DEDUCTS the
 * reservation from the rate-limit bucket at request time. Measured here, from
 * Groq's own headers and error body:
 *
 *   limit  8,000 tokens per minute, 200,000 per day
 *   spent  "Used 198032, Requested 2950" -- the account exhausted in one
 *          afternoon, after which every lesson answered "could not be reached"
 *
 * So the reservation, not the usage, decides how many lessons a day buys.
 *
 * 1000, AND THE MEASUREMENTS ABOVE ARE WHY. `CONCEPT_REASONING_EFFORT` records
 * what a real concept reply actually costs at `effort: low`: 30-272 tokens of
 * thinking and 325-519 written, so the largest total ever observed here is 791.
 * 2000 reserved 1,209 tokens beyond the worst case on every single request --
 * roughly a quarter of a minute's entire budget, spent on nothing.
 *
 * NOT 1200, WHICH THE NOTE ABOVE WARNS ABOUT, AND THE DISTINCTION IS DATED. The
 * 2-of-4 failure recorded there was measured BEFORE `reasoning_effort` was
 * added, when thinking ran to 1861-2320 tokens and ate the reply. With effort
 * low the thinking is an order of magnitude smaller and the number that failed
 * is not the number being set.
 *
 * 26% OF HEADROOM over the worst measured reply, and a truncation is not
 * silent: it arrives as `json_validate_failed`, which `worthAnotherTry` already
 * retries, and the repair turn re-asks. The failure mode of being slightly too
 * low is a second attempt; the failure mode of being far too high is a spent
 * account, which is what actually happened.
 */
const CONCEPT_MAX_TOKENS = 1000

/**
 * How hard the model is asked to think before it writes.
 *
 * THE DEFECT THIS FIXES, MEASURED TODAY, SIX REAL QUESTIONS EACH:
 *
 *   max_tokens 1200, effort default   2 of 4 answered.
 *                                     The other two: 400 json_validate_failed.
 *   max_tokens 3000, effort default   3 of 6 answered, ~3.3s each,
 *                                     1861-2320 tokens spent THINKING,
 *                                     three refused 429 -- the minute's
 *                                     budget gone on reasoning nobody reads.
 *   max_tokens 2000, effort low       6 of 6 answered, 841-1083ms each,
 *                                     30-272 tokens thinking, 325-519 written.
 *
 * `gpt-oss` reasons before it answers and the reasoning is spent from the SAME
 * `max_tokens` reservation as the reply. At 1200 the thinking ate the budget,
 * the JSON stopped mid-object, and the vendor refused its own truncated output
 * as invalid -- so the failure arrived as `json_validate_failed`, which reads
 * like a bad model rather than a budget we set too low.
 *
 * Raising the ceiling alone is the wrong fix and the middle row is why: it
 * bought room by spending four times the tokens and three times the wall clock
 * for a lesson no better, and then hit the per-minute ceiling anyway. Asking
 * for less thinking is what actually made every question answerable.
 *
 * NOT `none`, and not `high`. This is a concept prompt with a worked example
 * of the shape in it; the thinking that matters is choosing which idea to
 * teach, and 30-272 tokens is evidently enough for that.
 */
const CONCEPT_REASONING_EFFORT = 'low'

/**
 * WHICH MODELS UNDERSTAND `reasoning_effort`, AND WHAT SENDING IT ELSEWHERE DID.
 *
 * It is an OpenAI `gpt-oss` parameter. Groq accepts the field for every model
 * -- no 400, no warning -- and models that do not implement it do something
 * else with it entirely.
 *
 * MEASURED, same prompt, same model (`qwen/qwen3.8-27b`), same everything else:
 *
 *   reasoning_effort absent   200  finish=stop    out=576
 *   reasoning_effort low      200  finish=length  out=2000
 *
 * `finish=length` is the ceiling. The JSON stops mid-object and the vendor
 * refuses its own truncated output as `json_validate_failed` -- which arrives
 * looking like a bad model rather than a parameter it never understood.
 *
 * WHAT THAT COST, IN THE BROWSER. Pressing `Start` on "Fundamental Theorem of
 * Arithmetic" spent 79 seconds -- three attempts, each truncating the same way
 * -- and ended on a 502. The identical request without this field answers in
 * 1.4 seconds.
 *
 * It was added this morning because it took `gpt-oss-20b` from 2 of 4 to 6 of 6
 * and from 3.3s to 1.0s. That measurement stands, and it is a measurement about
 * `gpt-oss`. Sending it unconditionally generalised one model's fix into every
 * other model's bug, which is exactly the shape this repository keeps finding.
 *
 * A PREFIX, NOT A LIST OF NAMES. `openai/gpt-oss-120b`, `openai/gpt-oss-20b`
 * and `openai/gpt-oss-safeguard-20b` all take it, and a `gpt-oss` released
 * tomorrow will too. A hardcoded list would silently stop applying to the next
 * one and nobody would notice, because the failure is a slower lesson rather
 * than an error.
 */
function understandsReasoningEffort(model: string): boolean {
  return model.includes('gpt-oss')
}

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
    /* See `GroqOptions.keyVar`. Built from a constant and the variable's NAME,
       never from the credential. */
    const named = typeof options.keyVar === 'string' && options.keyVar.trim() !== ''
      ? options.keyVar.trim()
      : 'GROQ_API_KEY'
    throw new Error(`${named} is not set; the server cannot reach the model`)
  }
  /*
   * EVERY INPUT IS CHECKED HERE, WHERE THE FAILURE IS STILL READABLE.
   *
   * All three of these used to be taken as given, and each had a way of
   * failing far from its cause:
   *
   *   apiKey   was tested with `.trim()` and then sent UNTRIMMED. A key pasted
   *            into a shell profile with a trailing space -- which is how a
   *            key usually arrives -- passed the check and was refused by the
   *            vendor as `401 invalid_api_key`, which reads as "wrong key"
   *            rather than "wrong whitespace".
   *   model    was `options.model ?? DEFAULT`, and `??` only replaces null and
   *            undefined. `GROQ_MODEL=` in the environment is the empty
   *            string, so the request went out asking for a model named "",
   *            and the vendor's 404 blamed a name nobody had typed. MEASURED
   *            here today: the server is started with GROQ_MODEL by hand, so
   *            this is one shell typo away on every restart.
   *   fetchImpl is optional, and a caller passing `undefined` explicitly got
   *            the global -- but a caller passing a broken double got
   *            `doFetch is not a function` from inside the retry loop, three
   *            attempts and fourteen seconds later.
   */
  const rawFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  if (typeof rawFetch !== 'function') {
    throw new Error('no fetch is available; pass fetchImpl or run on a runtime that has fetch')
  }
  const doFetch: FetchLike = rawFetch
  const apiKey = options.apiKey.trim()
  /* See `GroqOptions.baseUrl`. Absent keeps Groq. */
  const url = typeof options.baseUrl === 'string' && options.baseUrl.trim() !== ''
    ? completionsUrl(options.baseUrl)
    : GROQ_URL
  const model =
    typeof options.model === 'string' && options.model.trim() !== ''
      ? options.model.trim()
      : DEFAULT_GROQ_MODEL

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

    /* Every attempt, every pause and every read comes out of this one budget.
       See `WHOLE_REQUEST_DEADLINE_MS`. */
    const giveUpAt = Date.now() + WHOLE_REQUEST_DEADLINE_MS

    for (let attempt = 0; attempt <= WAIT_BEFORE_RETRY_MS.length; attempt++) {
      if (attempt > 0) {
        const asked = askedToWait ?? WAIT_BEFORE_RETRY_MS[attempt - 1] ?? 0
        /* NEVER SLEEP PAST THE DEADLINE. A pause that outlives the budget
           spends the child's remaining time on doing nothing at all. */
        const wait = Math.min(asked, Math.max(0, giveUpAt - Date.now()))
        if (wait <= 0) break
        await new Promise((resume) => setTimeout(resume, wait))
      }

      /* THE FAILURE THIS LOOP COULD NOT SEE.
       *
       * `fetch` REJECTS on a dropped connection, a DNS failure, a reset socket
       * or a TLS error -- it does not return a response with a status. So an
       * unguarded `await doFetch(...)` threw straight out of the loop and past
       * every retry: the one class of failure that a second attempt reliably
       * fixes was the one class that never got a second attempt. A learner on
       * a train, on school wifi, or on any connection that blinks got a hard
       * failure that a 800ms pause would have cured.
       *
       * Now a thrown transport error is recorded like any other failure and
       * the loop decides, in one place, whether it is worth trying again. */
      const leftForThisTry = Math.max(0, giveUpAt - Date.now())
      if (leftForThisTry <= 0) break

      let response: FetchResponse
      const stopWaiting = new AbortController()
      const abandon = setTimeout(
        () => { stopWaiting.abort() },
        Math.min(leftForThisTry, LONGEST_ONE_ATTEMPT_MS),
      )
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body,
          signal: stopWaiting.signal,
        })
      } catch {
        /* The thrown value is not repeated: a transport error can carry the
           full request URL and, in some runtimes, the headers with it. */
        lastStatus = 0
        askedToWait = null
        /*
         * OUR OWN ABORT IS NOT A BLIP, AND RETRYING IT IS PAID FOR BY THE
         * LEARNER.
         *
         * `stopWaiting.abort()` fires when this attempt has used its whole
         * share of the budget, and that is a DIAGNOSIS: the host accepted the
         * connection and stopped writing. Treating it as a dropped packet sent
         * two more attempts into the identical stall and spent the full 45s
         * deadline discovering what the first abort had already established.
         *
         * A genuine transport error -- a reset socket, a DNS failure, school
         * wifi blinking -- is the case a second attempt reliably fixes, and it
         * still gets one. The signal is the only thing that can tell them
         * apart, so it is the only thing consulted.
         */
        if (stopWaiting.signal.aborted) {
          lastWhy = 'no reply within the time one attempt is allowed'
          break
        }
        lastWhy = 'no reply'
        continue
      } finally {
        clearTimeout(abandon)
      }

      if (response.ok) return await response.json()

      /* THE VENDOR'S SHORT CODES ONLY. Its MESSAGE can quote the request, and
       * the request is not something this server repeats. The credential is
       * in neither, and `index.ts` scrubs the response regardless. */
      let code = ''
      let type = ''
      /*
       * WHICH BUDGET RAN OUT, AND WHEN IT COMES BACK.
       *
       * A 429 was reported as `429 tokens/rate_limit_exceeded` and nothing
       * more, and those words are true of two completely different situations:
       * a per-MINUTE ceiling that clears in seconds, and a per-DAY ceiling that
       * does not clear until tomorrow. The response HEADERS cannot tell them
       * apart either -- measured on a real daily exhaustion, Groq returned
       * `x-ratelimit-remaining-tokens: 8000` and `reset: 1ms` while refusing
       * the request, because those headers describe the MINUTE bucket and the
       * DAY bucket was the one that was empty.
       *
       * MEASURED, and it cost an hour: repeated waits and retries against a
       * limit that said it had already reset. The vendor's message said so in
       * one line all along -- "tokens per day (TPD): Limit 200000, Used 198032,
       * Requested 2950. Please try again in 7m4.224s".
       *
       * PARSED, NEVER ECHOED. `groq.ts` drops vendor messages on purpose: they
       * can quote the request, and the request is not something this server
       * repeats. So nothing is copied out -- two fixed patterns are matched and
       * the FACTS are rebuilt from what they capture. The organisation id, the
       * model name and every word the vendor wrote stay dropped.
       */
      let budget = ''
      try {
        const failure = (await response.json()) as {
          error?: { type?: string; code?: string; message?: string }
        }
        /* See `budget`. Matched, not copied: only the window and the wait are
           taken, both from fixed patterns that capture nothing free-form. */
        const said = typeof failure.error?.message === 'string' ? failure.error.message : ''
        const perWhat = /\b(per day \(TPD\)|per minute \(TPM\)|per hour \(TPH\))/i.exec(said)
        const tryIn = /try again in ([\dhms.]+)/i.exec(said)
        if (perWhat !== null) {
          budget = perWhat[1]!.toLowerCase().includes('day')
            ? 'the daily token budget is spent'
            : 'the short-term token budget is spent'
          if (tryIn !== null) budget += `, try again in ${tryIn[1]}`
        }
        type = failure.error?.type ?? ''
        code = failure.error?.code ?? ''
      } catch {
        /* A body that is not JSON tells us nothing safe to repeat. */
      }
      lastStatus = response.status
      /* The vendor's short codes, and -- when it said so -- WHICH budget ran
         out and when it returns. See `budget`: rebuilt from two fixed patterns,
         never copied from the message. */
      lastWhy = [[type, code].filter((part) => part !== '').join('/'), budget]
        .filter((part) => part !== '')
        .join(' — ')
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
        /* See `CONCEPT_REASONING_EFFORT` and `understandsReasoningEffort`:
           this took gpt-oss from 2 of 4 answered to 6 of 6, and truncated
           every reply on models that do not implement it. */
        ...(understandsReasoningEffort(model)
          ? { reasoning_effort: CONCEPT_REASONING_EFFORT }
          : {}),
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

      /*
       * A REPLY WITH NO TEXT IS A FAILURE, AND IT USED TO BE RETURNED AS ''.
       *
       * `lessonFrom`, twenty lines up, throws "the model reply carried no
       * text" for exactly this shape. This returned an empty string instead --
       * one `Model` with two opposite behaviours for one upstream problem.
       *
       * WHAT THAT COST, MEASURED. `gpt-oss` writes its reasoning into a
       * separate field and fills `content` only once it stops thinking, so a
       * truncated reply arrives as `content: ""` with everything in
       * `reasoning`. That empty string travelled into `authorConcept`, was
       * judged as a lesson, failed validation for reasons that described the
       * lesson rather than the outage, and reached a learner as "that lesson
       * was refused" -- blaming the teaching for a network-shaped failure.
       *
       * Thrown, it is a transport failure like any other: `send` has already
       * decided whether it was worth another attempt, and the layer above
       * reports an outage as an outage. */
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('the model reply carried no text')
      }
      return content
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