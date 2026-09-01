/**
 * THE ALMANAC SERVER'S REQUEST HANDLER
 *
 * A pure function: a plain request object in, a plain response object out. The
 * model and the search engine are injected. That is what lets every error path
 * be tested without a socket, a key, or a network call — and error paths are
 * exactly where secrets escape.
 *
 * THREE THINGS THIS EXISTS TO GUARANTEE
 *
 * 1. THE KEY NEVER LEAVES. The browser cannot hold an API key, which is the
 *    whole reason this process exists. Two independent controls: upstream error
 *    text is never forwarded, and every outgoing body is scrubbed of known
 *    secrets whatever produced it. Either alone would be enough on a good day;
 *    both together survive a bad one.
 *
 * 2. THE BROWSER NEVER HAS TO TRUST THE MODEL. Every lesson is put through
 *    `validateLesson` — the SAME gate the browser uses — before it is returned.
 *    A model that invents a styled block, a dangling relation or a missing field
 *    gets a refusal, not a pass-through.
 *
 * 3. A REFUSAL DOES NOT REFLECT. Echoing the model's output inside an error
 *    would hand anyone who can steer the model a way to bounce arbitrary content
 *    off this server, so refusals carry paths and fixed wording only.
 */

import { validateLesson, type Issue, type TeachingLevel } from '../src/canvas/spec/validate.ts'
import type { Lesson } from '../src/canvas/spec/spec.ts'
import {
  noteOnly,
  onlyTeachingRules,
  PART_OF_IT,
  repairLesson,
  withNote,
  withoutRefusedBlocks,
} from './repair.ts'
import { authorConcept } from '../src/canvas/teach/concept.ts'
import type { Source } from '../src/canvas/teach/grounding.ts'
import { chooseStrategy, type Strategy } from './teaching.ts'
import { injectionSignals, stripInvisible } from '../src/websearch/guard.ts'
import { citationSupports } from '../src/websearch/quality.ts'
import { subjectsFor, SUPPORTED_CLASSES, type SchoolClass } from './almanac/curriculum.ts'
import type { Ledger } from './almanac/ledger.ts'
import {
  IDENTITY_COOKIE,
  identityCookie,
  newStudentId,
  readCookie,
  signIdentity,
  verifyIdentity,
} from './identity.ts'
import { BadMemoryKey } from './memory/key.ts'
import { NotConsistent } from './memory/progress.ts'
import { NotStorable } from './memory/record.ts'
import type { CanvasMemory } from './memory/store.ts'

export interface LessonRequest {
  readonly concept?: string
  readonly subject?: string
  readonly question?: string
  /** The lesson she was reading when she asked, so the model can judge fit. */
  readonly askedInside?: string
  /**
   * What has already been taught, and what she just said back.
   *
   * DECLARED HERE RATHER THAN SPREAD IN SILENTLY. A spread skips TypeScript's
   * excess-property check, so these reached the model at runtime while this
   * type said they did not exist -- and a type that under-reports what it
   * carries is how the next person deletes a field nothing appears to use.
   */
  readonly taught?: string
  readonly justSaid?: string
  /** How to teach it. Chosen here, never accepted from the request. */
  readonly strategy?: Strategy
}

export interface ModelPort {
  lesson(request: LessonRequest): Promise<unknown>
  /** See `Model.chat`. Present on the Groq client; absent is handled. */
  chat?(system: string, user: string, priorAssistant?: string): Promise<string>
  /** See `Model.nextPart`. Absent falls back to `lesson`, which still works. */
  nextPart?(request: LessonRequest): Promise<unknown>
}

export interface SearchResult {
  readonly url: string
  readonly content: string
}

export interface SearchPort {
  search(query: string): Promise<readonly SearchResult[]>
}

export interface ServerRequest {
  readonly method: string
  readonly path: string
  /**
   * The raw query string, without the leading "?".
   *
   * Carried because a memory READ names what it wants and changes nothing, so
   * it is a GET -- the same rule this file already states for `/api/health`.
   * `index.ts` used to drop the query on the floor while splitting the path.
   */
  readonly query?: string
  /**
   * The raw `Cookie` header, which is where the only trustworthy `studentId`
   * lives. See `identity.ts`: everything else the caller sends about who they
   * are is a claim, not a fact.
   */
  readonly cookie?: string
  readonly body?: unknown
  /** Byte length of the raw body, when the transport knows it. */
  readonly rawLength?: number
}

export interface ServerResponse {
  readonly status: number
  readonly body: Record<string, unknown>
  /**
   * A `Set-Cookie` value the transport must send, when this request had no
   * valid identity and one was minted for it.
   *
   * Carried on the response rather than written by the handler because the
   * handler does not own the socket -- the same reason `status` is a number
   * here instead of a call to `res.writeHead`.
   */
  readonly setCookie?: string
}

export interface HandlerOptions {
  readonly model: ModelPort
  readonly search: SearchPort
  /** Almanac's memory. Absent means the day routes answer 503, never a guess. */
  readonly almanac?: Ledger
  /** The canvas's memory. Absent means /api/memory answers 503, never a guess. */
  readonly memory?: CanvasMemory
  /**
   * The key this server signs identities with.
   *
   * REQUIRED, WITH NO DEFAULT. A fallback would live in the source, and a
   * signature every reader can reproduce is not a signature -- it would restore
   * the exact hole this closes while looking like it was closed. A server
   * without one must refuse to start; see `index.ts`.
   */
  readonly identitySecret: string
  /** Strings that must never appear in a response, whatever produced them. */
  readonly secrets?: readonly string[]
  readonly maxBodyBytes?: number
}

/**
 * How long the server may spend re-asking for a lesson our own gate refused.
 *
 * A ceiling on WAITING, not on attempts. Past this the honest answer is the
 * error, because a learner staring at a spinner has already been failed.
 */
const REVALIDATE_BUDGET_MS = 30_000

/**
 * How many times the model may be re-asked for a lesson our own gate refused.
 *
 * TWO, so the model gets three goes in total. Enough to ride out the occasional
 * bad roll this retry exists for, and few enough that a model which is
 * confidently and consistently wrong costs three calls rather than however many
 * fit inside thirty seconds.
 */
const MOST_REVALIDATION_ATTEMPTS = 2

/**
 * How long ONE call to the model may take before the learner is told instead.
 *
 * A VENDOR THAT NEVER ANSWERS IS A REAL STATE, AND IT WAS UNHANDLED.
 *   `REVALIDATE_BUDGET_MS` and the attempt cap both bound the RETRY loop. They
 *   cannot bound the FIRST call, because a promise that never settles never
 *   reaches the loop at all -- `await options.model.lesson(request)` simply
 *   waits forever and the socket is held open behind it.
 *
 *   MEASURED with a model that never resolves: the request produced NO REPLY
 *   for sixty seconds, at which point the test gave up. Not a slow answer -- no
 *   answer. Invariant I1 says every question gets an answer, and a reply that
 *   arrives after the browser has given up is not one.
 *
 * TWENTY SECONDS, and the number is chosen against the other clock in this
 * file, not picked. `groq.ts` already waits up to fourteen seconds for a rate
 * limit to reset, so a ceiling below that would cut off a call that was going
 * to succeed. Twenty leaves room for that and still answers a child inside the
 * time she will wait.
 */
const LONGEST_ONE_MODEL_CALL_MAY_TAKE_MS = 20_000

/** Why the model was abandoned, said in the sentence the learner's reply uses. */
class ModelTookTooLong extends Error {}

/**
 * Ask the model, but never wait forever.
 *
 * THE PENDING CALL IS ABANDONED, NOT CANCELLED, and that is worth saying out
 * loud: `ModelPort` has no abort signal, so the underlying request may still be
 * in flight when this rejects. What changes is that the LEARNER stops waiting
 * on it. Adding cancellation means changing every vendor client, which is a
 * wider change than this defect needs -- and answering her is the part that
 * cannot wait for that.
 */
async function askWithinBudget(model: ModelPort, request: LessonRequest): Promise<unknown> {
  /* A CONTINUATION IS THE CHEAP CALL WHEN THE PROVIDER HAS ONE.
   *
   * `taught` is what makes a request a continuation -- `briefFor` checks it
   * FIRST for the same reason: a brief carrying what has already been taught is
   * never a fresh question. The reply it asks for is one or two blocks, so it
   * is priced as one or two blocks. Falling back to `lesson` is not a
   * degradation; it is what every provider did until now. */
  const carriesWhatWasTaught =
    typeof request.taught === 'string' && request.taught.trim() !== ''
  const ask = carriesWhatWasTaught && model.nextPart !== undefined
    ? () => model.nextPart!(request)
    : () => model.lesson(request)

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      ask(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => { reject(new ModelTookTooLong('the model could not be reached in time')) },
          LONGEST_ONE_MODEL_CALL_MAY_TAKE_MS,
        )
      }),
    ])
  } finally {
    /* CLEARED ON EVERY PATH. A timer left pending keeps the process alive after
     * the reply has gone, which turns a fast answer into a server that will not
     * shut down. */
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** 256 KB is far above any real request and far below anything that hurts. */
const DEFAULT_MAX_BODY_BYTES = 256 * 1024

const ROUTES = new Set(['/api/lesson', '/api/ask', '/api/search', '/api/day', '/api/done', '/api/health', '/api/memory'])

/* The one route that answers a GET.
 *
 * Every other route mutates or costs money, and a GET that does either is a
 * link a browser can prefetch. This one exists so a waiting process can ask
 * "are you there" without pretending to be a student. */
const HEALTH = '/api/health'

/**
 * A real calendar date, written the one way that sorts correctly as text.
 *
 * The round trip is the point: "2026-08-32" and "2026-02-29" both match the
 * shape and are not days. A junk date would create a junk entry in the ledger
 * that no calendar ever asks for again, sitting there looking like a real day.
 */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isSchoolClass(value: unknown): value is SchoolClass {
  return typeof value === 'number' && (SUPPORTED_CLASSES as readonly number[]).includes(value)
}

/**
 * A zod message can quote the value it rejected — "received 'xyz'" — which for a
 * model-produced value is content this server would then be reflecting. Only the
 * shape of the complaint survives.
 */
function safeMessage(message: string): string {
  const cut = message.search(/\breceived\b/i)
  const trimmed = cut === -1 ? message : message.slice(0, cut).trim()
  return trimmed.replace(/["'`][^"'`]*["'`]/g, '…')
}

/** Last line of defence: no known secret leaves in any response, ever. */
function scrub(value: unknown, secrets: readonly string[]): unknown {
  if (secrets.length === 0) return value
  const json = JSON.stringify(value)
  if (json === undefined) return value
  let cleaned = json
  for (const secret of secrets) {
    if (secret.length === 0) continue
    cleaned = cleaned.split(secret).join('[redacted]')
  }
  return cleaned === json ? value : JSON.parse(cleaned)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function createHandler(options: HandlerOptions): (req: ServerRequest) => Promise<ServerResponse> {
  const secrets = options.secrets ?? []
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  const reply = (status: number, body: Record<string, unknown>): ServerResponse => ({
    status,
    body: scrub(body, secrets) as Record<string, unknown>,
  })

  /**
   * Ask the model, then put its answer through the browser's own gate.
   *
   * WHY THE TEACHING LEVEL IS A PARAMETER AND NOT A CONSTANT
   * -------------------------------------------------------
   * This one function serves two routes that owe the reader different things.
   * `/api/lesson` teaches a named concept, so it owes the whole arc: a
   * definition first, a summary last, something shown rather than told.
   * `/api/ask` answers one free question, and owes none of that -- demanding
   * an opening definition and a closing progression from a reply would refuse
   * every honest answer the model can give.
   *
   * Held at `'lesson'` for both, `/api/ask` returned 502 for every question
   * ever asked. That is the same defect already found and fixed in the doubt
   * resolver, reached by a second path; this is the other copy.
   */
  /**
   * ONE CONCEPT, WRITTEN NOW, FOR A QUESTION NOBODY HAS SEEN BEFORE.
   *
   * WHY THE REFUSAL IS NOT REPAIRED HERE. `deliverable` below is a ladder for a
   * WHOLE lesson that failed one rule, and its rungs re-judge an arc. A concept
   * has no arc to re-judge -- `authorConcept` already validated what it
   * returns, so a refusal here means the model could not write one atomic idea,
   * and the honest reply is to say so rather than to serve a fragment dressed
   * as a lesson.
   *
   * `unreachable` IS KEPT SEPARATE from a refusal, because "nothing answered"
   * and "it answered and what it wrote does not teach" want different words on
   * screen. `CanvasRoute` branches on exactly that distinction to decide
   * whether to tell her to wait or to try a different question.
   */
  async function conceptFor(
    question: string,
    alreadyUsed: readonly string[],
  ): Promise<ServerResponse> {
    const chat = options.model.chat
    if (chat === undefined) throw new Error('conceptFor called without a chat-capable model')

    /*
     * SEARCH FIRST, THEN WRITE -- the same order `CanvasRoute` uses, for the
     * reason it records beside its own search: "The gate reads shape and has no
     * opinion about truth, so an invented lesson passes every check in this
     * repository. The only defence is giving the author real text to write
     * from."
     *
     * FAILING TO FIND SOURCES IS NOT FAILING TO TEACH, and that is why this is
     * a `catch` and not a guard. A refused search, an unconfigured provider --
     * `index.ts` still throws "search is not configured" until Phase 4 wires
     * one -- or a topic the web does not cover all end here with an empty list,
     * and `groundingPreamble([])` returns '', so the prompt is exactly what it
     * was. Turning a retrieval failure into a teaching failure would be worse
     * than being honestly ungrounded.
     *
     * The seam is what was missing. `authorConcept` has taken sources since it
     * was written; this route passed `[]` and never asked, so the server could
     * not have grounded a lesson even with a provider configured.
     */
    let sources: readonly Source[] = []
    try {
      const found = await options.search.search(question)
      sources = found.map((page) => ({
        /* No title comes back on this port, and the url is the honest stand-in:
           `groundingPreamble` prints it as the citation either way, and an
           invented title would be the one part of a citation nobody checked. */
        url: page.url,
        title: page.url,
        text: page.content,
      }))
    } catch {
      /* Recorded nowhere and rethrown nowhere: see above. Ungrounded is a
         weaker lesson, not a missing one. */
    }

    let written
    try {
      written = await authorConcept(
        (system: string, user: string, priorAssistant?: string) =>
          chat(system, user, priorAssistant),
        question,
        sources,
        alreadyUsed,
      )
    } catch (thrown) {
      /* The vendor's message is still dropped -- it quotes the request and
         sometimes the credential it rejected. Our client's own sentence
         carries the status and the short code, and nothing else. */
      const reason = thrown instanceof Error
        && thrown.message.startsWith('the model could not be reached')
        ? thrown.message
        : 'the model could not be reached'
      return reply(502, { error: reason })
    }

    /*
     * THE ROUTE IS RETURNED, AND THAT IS WHAT MAKES THE ROTATION WORK.
     *
     * `authorConcept` already computes which way in it took and hands it back
     * -- `ConceptResult.route` exists precisely because a caller with no way to
     * read it had no way to fill `alreadyUsed`, "so the parameter stayed empty
     * forever and the same question always took the same route". Dropping it
     * here would restore that, one layer up, with the canvas unable to tell
     * that anything had rotated.
     */
    if (written.ok) return reply(200, { lesson: written.lesson, route: written.route })

    /*
     * A STRING, NOT A BOOLEAN, AND THE DIFFERENCE REACHED THE LEARNER.
     *
     * `ConceptResult` declares `unreachable?: string` -- it carries the
     * message, so the truthy test is "is it present". Written as `=== true` it
     * was never once satisfied, every outage fell through to the branch below,
     * and a learner whose question was never asked was told "the model returned
     * a lesson that failed validation". That is the precise wrong-blame defect
     * `authorLesson` records having already paid for, arrived at again through
     * a comparison that reads correct.
     */
    if (written.unreachable !== undefined) {
      return reply(502, { error: 'the model could not be reached' })
    }

    /* The gate's own issues, verbatim. `CanvasRoute` renders them one per line
       under "That lesson was refused", so a summary here would replace the only
       specific thing she is told with a vaguer version of it. */
    console.error(
      'concept refused by validation:',
      written.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' | '),
    )
    return reply(502, {
      error: 'the model returned a lesson that failed validation',
      issues: written.issues,
    })
  }

  async function lessonFrom(
    request: LessonRequest,
    teaching: TeachingLevel,
  ): Promise<ServerResponse> {
    /* Reported on EVERY outcome, including failure. A decision nobody can
     * observe is a decision nobody can debug, and this repo has already
     * shipped a trace that claimed capabilities were used when they had done
     * nothing at all. */
    const decided = request.strategy === undefined ? {} : { strategy: request.strategy }
    let produced: unknown
    try {
      produced = await askWithinBudget(options.model, request)
    } catch (thrown) {
      /* THE VENDOR'S MESSAGE IS STILL DROPPED. Its text routinely quotes the
       * request, and sometimes the credential that was rejected.
       *
       * What is forwarded is OUR client's own sentence, which now carries the
       * status and the vendor's short error code and nothing else. Measured
       * before that change: a working key with a schema the vendor refused
       * produced the identical message to an outage, and there was no way to
       * tell them apart from outside. A failure nobody can diagnose is a
       * failure that gets blamed on the wrong thing for a week. */
      const reason = thrown instanceof Error && thrown.message.startsWith('the model could not be reached')
        ? thrown.message
        : 'the model could not be reached'
      return reply(502, { ...decided, error: reason })
    }

    /* `{ teaching }` came from main, which added it on a SECOND
     * `const result = validateLesson(produced, { teaching })` placed after
     * the revalidation loop. That loop already reads and reassigns `result`,
     * so the second declaration could not compile -- the option was right and
     * its position was not. It belongs on the one declaration, before the loop. */
    let result = validateLesson(produced, { teaching })

    /* A LESSON THAT FAILS OUR OWN GATE IS WORTH ASKING FOR AGAIN.
     *
     * MEASURED. Asked the same question three times in a row, the third came
     * back as a lesson the validator refused, and the learner was handed a 502.
     * The model is not broken and the request is not wrong -- it wrote one bad
     * lesson, the way it occasionally writes one bad piece of JSON. The vendor
     * client already retries THAT (see `worthAnotherTry` in `groq.ts`); this is
     * the same failure one layer up, and it was not retried at all because
     * validation happens here, after the client has returned successfully.
     *
     * Invariant I1 says every question gets an answer. A child who asked
     * something reasonable and got an error because of one bad roll has been
     * failed by us, not by the model.
     *
     * The gate itself does NOT soften. A lesson that fails twice more is still
     * refused, and nothing invalid ever reaches a browser. */
    /* BOUNDED BY A CLOCK, NOT A COUNT, AND THE REASON IS MEASURED.
     *
     * The client already retries transport failures, and waits up to 14s for a
     * rate limit to reset. Stacking three validation retries on top of that
     * made the worst case nine HTTP calls and over two hundred seconds -- long
     * enough that the request timed out and the learner got NOTHING, which is
     * worse than the single error this retry was added to prevent.
     *
     * A count cannot express "do not keep a child waiting". A deadline can.
     *
     * BUT A DEADLINE ALONE CANNOT EXPRESS "DO NOT SPEND HER SCHOOL'S MONEY
     * EITHER", AND THAT WAS THE BUG. With only a clock, a model that answers
     * instantly and wrongly is re-asked as fast as the network allows for a
     * full thirty seconds. Every one of those is a paid vendor call, so ONE
     * badly-rendered concept could burn an unbounded number of them per
     * learner request -- and the request itself never returned inside any
     * reasonable client timeout. MEASURED: five tests in `handler.test.ts` sit
     * in this loop until vitest kills them at five seconds.
     *
     * So BOTH bounds, because they answer different questions:
     *   the clock  -- do not keep a child waiting
     *   the count  -- do not spend without limit, and do not spin
     * Whichever comes first ends it. Neither alone is enough, which is the
     * whole lesson of the paragraph above this one. */
    const giveUpAt = Date.now() + REVALIDATE_BUDGET_MS
    let attemptsLeft = MOST_REVALIDATION_ATTEMPTS
    while (!result.ok && attemptsLeft > 0 && Date.now() < giveUpAt) {
      attemptsLeft -= 1
      let again: unknown
      try {
        again = await askWithinBudget(options.model, request)
      } catch {
        break
      }
      /* THE SAME RULES AS THE FIRST CHECK, and the merge is why this needs
         saying. codex added this retry loop while main added `{ teaching }` to
         the one validation it had. Carrying the option onto the first check but
         not onto the retry meant a lesson was judged by `answer` rules, then
         re-judged by `lesson` rules on the next attempt -- a retry that can fail
         what the first attempt passed, for no reason the caller can see. */
      /* AND `produced` MOVES WITH IT. `again` was local to this loop, so after
         it ran, `result` described the LAST attempt while `produced` still held
         the FIRST. Nothing read `produced` afterwards, so the mismatch was
         invisible -- until the repair below started reading it, at which point
         it would have repaired one lesson against another lesson's faults. */
      produced = again
      result = validateLesson(again, { teaching })
    }

    if (!result.ok) {
      /* THE OPERATOR SEES WHAT THE BROWSER MUST NOT.
       *
       * The response keeps its redaction: `safeMessage` strips quoted content
       * because a validator message can quote model output, and reflecting that
       * to a browser hands anyone who can steer the model a way to bounce text
       * off this server.
       *
       * But redacting it EVERYWHERE made a real failure undiagnosable. Every
       * next-part request was refused with `Unrecognized key(s) in object: …`
       * and the one fact needed to fix it -- WHICH key -- was the part being
       * replaced by an ellipsis. This log is not in the response and never
       * reaches a learner; it goes to the process that an operator can read. */
      console.error(
        'lesson refused by validation:',
        result.issues
          .map((issue) => `${issue.path}: ${issue.message}${issue.rule ? ` [${issue.rule}]` : ''}`)
          .join(' | '),
      )

      /* NOW TRY TO SERVE HER SOMETHING ANYWAY. See `deliverable` below for what
         is attempted and, more importantly, what is not. */
      const rescued = deliverable(produced, result.issues, teaching, questionIn(request))
      if (rescued !== undefined) {
        return reply(200, { ...decided, lesson: rescued.lesson, partial: true })
      }

      return reply(502, {
        ...decided,
        error: 'the model returned a lesson that failed validation',
        issues: result.issues.map((issue) => ({
          path: issue.path,
          message: safeMessage(issue.message),
        })),
      })
    }
    return reply(200, { ...decided, lesson: result.lesson })
  }

  /** Whatever she actually typed, for the title of a reply built here. */
  function questionIn(request: LessonRequest): string {
    return request.question ?? request.concept ?? 'your question'
  }

  /**
   * THE LAST THING TRIED BEFORE A CHILD IS TOLD "NO".
   *
   * A ladder, and every rung ends at the SAME `validateLesson` the browser
   * uses. Nothing is served that has not passed it, so no rung is a way around
   * the gate -- each one is a different attempt to get something honest THROUGH
   * the gate.
   *
   *   0. Is this even a lesson? If ANY issue is structural, stop. Structural
   *      faults are the security and integrity controls -- an unknown key, a
   *      dangling relation, an appearance breach, a body past the schema's
   *      ceiling (which is what refuses a leaked system prompt). There is
   *      nothing safe in there to salvage, and the 502 is correct. This is the
   *      validator's own distinction, not one invented here: `validate.ts:240`
   *      only runs the teaching rules when the structural pass found nothing,
   *      so the two kinds never mix.
   *
   *   1. REPAIR, then judge it at the route's OWN level. If a blank line was
   *      all that was missing, she gets her whole lesson and the arc rules were
   *      never bent to give it to her.
   *
   *   2. Judge the repaired lesson as an ANSWER, and say so at the top of it.
   *      This is the arc-less case: a real reply that is not shaped like a
   *      taught lesson. `validate.ts` already draws this exact distinction in
   *      its own words -- "a DOUBT ANSWER owes none of that" -- and the CHUNK
   *      rules stay on, so the wall of text the arc rules were never about
   *      still cannot get through here.
   *
   *   3. Drop the blocks still being refused and show what is left.
   *
   *   4. Say, in words, that it could not be done. Nothing of the model's
   *      reaches her, and she is not left staring at a dead screen.
   *
   * WHAT IS NEVER DONE: writing a definition, inventing a summary, choosing
   * which word to mark, re-roling a block or reordering a lesson. Every one of
   * those is the server teaching her something nobody checked, and the census
   * for this change measured that all 17 arc rules need exactly that. So the
   * arc is never repaired -- only re-judged as what it actually is.
   */
  function deliverable(
    produced: unknown,
    issues: readonly Issue[],
    teaching: TeachingLevel,
    question: string,
  ): { lesson: Lesson } | undefined {
    const served = (candidate: unknown, level: TeachingLevel): Lesson | undefined => {
      const checked = validateLesson(candidate, { teaching: level })
      return checked.ok ? checked.lesson : undefined
    }

    if (onlyTeachingRules(issues)) {
      const mended = repairLesson(produced, issues)
      if (mended !== undefined) {
        console.error('lesson repaired without inventing content:', mended.rules.join(', '))

        /* 1. Good enough for the route that was asked. Whole lesson, no note. */
        const whole = served(mended.lesson, teaching)
        if (whole !== undefined) return { lesson: whole }
      }

      const best = mended?.lesson ?? produced

      /* 2. Not a lesson, but a true answer. */
      const asAnswer = served(withNote(best, PART_OF_IT), 'answer')
      if (asAnswer !== undefined) return { lesson: asAnswer }

      /* 3. Whatever survives once the refused blocks are gone. */
      const pruned = withoutRefusedBlocks(best, issues)
      if (pruned !== undefined) {
        const rest = served(withNote(pruned, PART_OF_IT), 'answer')
        if (rest !== undefined) return { lesson: rest }
      }

      /* 4. The floor: the honest sentence, and nothing of the model's. */
      return { lesson: served(noteOnly(question), 'answer') } as { lesson: Lesson } | undefined
    }
    return undefined
  }

  /** Who the server believes is asking, and whether it had to decide for itself. */
  interface Identified {
    /** The only student id any route may act on. */
    readonly studentId: string
    /** True when a valid signed cookie arrived; false when this was just minted. */
    readonly proven: boolean
    /** Set only when an identity was minted, so the browser keeps it. */
    readonly setCookie?: string
  }

  /* RESOLVED ONCE, AT THE DOOR, SO NO ROUTE CAN FORGET TO.
   *
   * The previous shape let each route read `studentId` out of the payload. That
   * is not a design that can be audited: correctness depended on every current
   * and future route remembering, and `/api/memory`, `/api/day` and `/api/done`
   * each remembered to trust the caller. Resolving here means a new route
   * receives an id it cannot influence, which is the difference between a rule
   * and a structure. */
  function resolveIdentity(req: ServerRequest): Identified {
    const offered = readCookie(req.cookie, IDENTITY_COOKIE)
    const proven = offered === undefined ? undefined : verifyIdentity(offered, options.identitySecret)
    if (proven !== undefined) return { studentId: proven, proven: true }

    /* No cookie, or one that proves nothing. A first visit and a forged cookie
     * are answered identically and deliberately: telling the two apart would
     * report whether a guessed id exists, which is the question an attacker is
     * asking. */
    const minted = newStudentId()
    return {
      studentId: minted,
      proven: false,
      setCookie: identityCookie(signIdentity(minted, options.identitySecret)),
    }
  }

  /**
   * The student id the CALLER named, if it named one at all.
   *
   * Gathered from every place a caller can put it -- the query for a GET, the
   * body for a write -- because a check that only covers one of them is not a
   * check.
   */
  function claimedStudentId(req: ServerRequest): string | undefined {
    if (req.method === 'GET') {
      const asked = new URLSearchParams(req.query ?? '').get('studentId')
      return asked === null ? undefined : asked
    }
    if (!isPlainObject(req.body)) return undefined
    const named = req.body['studentId']
    return typeof named === 'string' ? named : undefined
  }

  async function route(req: ServerRequest, who: Identified): Promise<ServerResponse> {
    if (typeof req.rawLength === 'number' && req.rawLength > maxBodyBytes) {
      return reply(413, { error: 'request too large' })
    }
    if (!ROUTES.has(req.path)) {
      return reply(404, { error: 'no such route' })
    }
    if (req.path === HEALTH && req.method === 'GET') {
      /* Enough to diagnose, and nothing more. A health endpoint is the most
         public thing a server has and the most tempting place to leak from, so
         it names CAPABILITIES and never values: no key, no path, no student. */
      return reply(200, {
        ok: true,
        planner: options.almanac !== undefined,
        model: true,
      })
    }

    /* THE CANVAS'S MEMORY. Read with GET, written with PUT, and both named by
     * the same three parts -- student, tab, lesson. Placed before the POST gate
     * because neither verb is POST: a read changes nothing, and a write to a
     * named key is a PUT by definition.
     *
     * Every refusal below says what was wrong. A memory that will not save and
     * will not say why is how a student loses an afternoon and never finds out. */
    if (req.path === '/api/memory') {
      if (options.memory === undefined) {
        return reply(503, { error: 'memory is not configured on this server' })
      }

      if (req.method === 'GET') {
        const asked = new URLSearchParams(req.query ?? '')
        try {
          const record = options.memory.read({
            /* NOT `asked.get('studentId')`. The caller does not get a say in
             * whose memory it reads; `who` came from a signature this server
             * produced. This single substitution is the whole of the fix. */
            studentId: who.studentId,
            tabId: asked.get('tabId') ?? '',
            lessonId: asked.get('lessonId') ?? '',
          })
          /* Nothing stored is `null`, not an error and not an empty object. She
           * has simply never studied this, which is an answer. */
          return reply(200, { record: record ?? null })
        } catch (thrown) {
          if (thrown instanceof BadMemoryKey) return reply(400, { error: thrown.message })
          throw thrown
        }
      }

      if (req.method === 'PUT') {
        if (!isPlainObject(req.body)) {
          return reply(400, { error: 'body must be a JSON object' })
        }
        const asked = req.body
        try {
          options.memory.write(
            {
              /* The signed identity, never the one in the body. See the GET
               * above and `identity.ts`. */
              studentId: who.studentId,
              tabId: typeof asked['tabId'] === 'string' ? asked['tabId'] : '',
              lessonId: typeof asked['lessonId'] === 'string' ? asked['lessonId'] : '',
            },
            asked['record'],
          )
          return reply(200, { saved: true })
        } catch (thrown) {
          /* Both are the caller's mistake, not ours, and both are said plainly.
           * Anything else is a real failure and must not be reported as a bad
           * request -- that would tell a student her work was wrong when the
           * disk was full. */
          if (thrown instanceof BadMemoryKey) return reply(400, { error: thrown.message })
          if (thrown instanceof NotStorable) return reply(400, { error: thrown.message })
          /* 409 CONFLICT, NOT 400. The record is well formed and storable; it
           * disagrees with what is ALREADY stored -- progress that goes
           * backwards, events out of order, a lesson id that contradicts the
           * key. 400 would tell the caller its request was malformed and send
           * it away to fix the wrong thing. 409 says "you are out of step with
           * the current state", which is exactly true and is what a client
           * needs in order to re-read and try again. */
          if (thrown instanceof NotConsistent) return reply(409, { error: thrown.message })
          throw thrown
        }
      }

      return reply(405, { error: 'memory is read with GET and written with PUT' })
    }

    if (req.method !== 'POST') {
      return reply(405, { error: 'method not allowed' })
    }
    if (!isPlainObject(req.body)) {
      return reply(400, { error: 'body must be a JSON object' })
    }

    const body = req.body

    if (req.path === '/api/lesson') {
      if (!nonEmptyString(body['concept'])) {
        return reply(400, { error: 'concept is required' })
      }
      /* The teaching decision is made HERE, from what the browser reports
       * about the student. `body['strategy']` is deliberately not read: a page
       * must not be able to pick "transfer_challenge" for a student meeting a
       * topic for the first time. Every history field is untrusted input and
       * is passed through as-is for the policy to sanitise -- it returns a
       * strategy from the vocabulary for any input at all. */
      return lessonFrom({
        concept: body['concept'],
        subject: nonEmptyString(body['subject']) ? body['subject'] : undefined,
        strategy: chooseStrategy({
          attempts: typeof body['attempts'] === 'number' ? body['attempts'] : 0,
          carriedFrom: nonEmptyString(body['carriedFrom']) ? body['carriedFrom'] : undefined,
          diagnosis: typeof body['diagnosis'] === 'string' ? body['diagnosis'] : undefined,
        }),
      }, 'lesson')
    }

    if (req.path === '/api/ask') {
      if (!nonEmptyString(body['question'])) {
        return reply(400, { error: 'question is required' })
      }
      /* `askedInside` is the lesson she was reading. It is what lets the model
       * judge whether her question belongs here, which is the judgement the
       * software used to make for it by counting shared words. Optional: the
       * tutor page asks with no lesson around it and is answered as before. */
      /*
       * A FRESH QUESTION IS AUTHORED ONE CONCEPT AT A TIME. MEASURED, not
       * preferred.
       *
       * Six questions across six subjects, through this server, against the
       * real account:
       *
       *   whole lesson in one call   1 of 6 taught; five 502s at exactly the
       *                              20s ceiling, and a 429 when the ceiling
       *                              was raised
       *   one concept per call       3 of 3 taught, in 2708ms, 4478ms, 2872ms
       *
       * The whole-lesson call sends an 8737-character system prompt plus a
       * 2534-character schema and RESERVES 2000 output tokens, which is about
       * 4800 of a budget the service reports as 8000 per minute. It could
       * therefore serve one or two lessons a minute at best, and a single
       * repair turn -- which re-sends the rejected lesson -- exceeded the
       * whole minute on its own. This is not a slow model. It is a request
       * shaped to be unaffordable.
       *
       * `authorConcept` is not new and is not written for this: it is the
       * module WORK.md records at 5 of 6 against `authorLesson`'s 0 of 6, built
       * and then never wired to anything that ships. It returns a lesson that
       * has already been through `validateLesson`, so it arrives at the same
       * gate by the same door.
       *
       * ONLY THE FRESH QUESTION. A continuation carries `taught` and
       * `justSaid`, and the next step of a lesson in progress must be written
       * against what she has already read -- which is what `briefFor` does and
       * what `authorConcept` has no parameter for. Routing that here would
       * hand her a step that ignores the one she just finished.
       */
      if (options.model.chat !== undefined && !nonEmptyString(body['taught'])) {
        /*
         * THE ROUTES SHE HAS ALREADY BEEN GIVEN, SENT BY THE CANVAS.
         *
         * `nextRoute` can only pick a way in she has not had if somebody
         * REMEMBERS the ones she has, and this server is stateless per request
         * -- so the remembering belongs where the state already is. The canvas
         * keeps exactly this, in `alreadyTaught`, for its own direct-to-model
         * path; it now sends it here too rather than a second copy being grown
         * in the memory store under a key that is not a lesson, a tab or a
         * student.
         *
         * Absent or malformed reads as "nothing spent yet", which is the state
         * every first question is in anyway. A caller cannot break the rotation
         * by omitting it; it can only fail to benefit from it.
         */
        const spent = Array.isArray(body['alreadyUsed'])
          ? (body['alreadyUsed'] as unknown[]).filter((r): r is string => typeof r === 'string')
          : []
        return await conceptFor(body['question'], spent)
      }

      return lessonFrom({
        question: body['question'],
        ...(nonEmptyString(body['askedInside']) ? { askedInside: body['askedInside'] } : {}),
        /* THE NEXT PART OF A LESSON IN PROGRESS, when the browser sends what
         * has already been taught. Without these the model writes a whole
         * lesson in one go and the learner is handed a chapter she did not ask
         * for; with them it writes ONE step, after reading what she just said.
         * See `briefFor` and invariant I3. */
        ...(nonEmptyString(body['taught']) ? { taught: body['taught'] } : {}),
        ...(nonEmptyString(body['justSaid']) ? { justSaid: body['justSaid'] } : {}),
      }, 'answer')
    }

    if (req.path === '/api/day') {
      if (options.almanac === undefined) {
        return reply(503, { error: 'the planner is not configured on this server' })
      }
      /* `studentId` is NO LONGER READ FROM THE BODY, and is no longer required
       * in it. It was both, and that was the same defect `/api/memory` had: a
       * caller with no cookie at all could name any student and plan -- or
       * finish -- that student's day. The id now comes from `who`, which came
       * from a signature. A body that still carries one is checked against it
       * in `handle` and refused if it disagrees. */
      if (!isCalendarDate(body['date'])) return reply(400, { error: 'date must be a real date, written YYYY-MM-DD' })
      if (!isSchoolClass(body['schoolClass'])) return reply(400, { error: 'schoolClass must be 9, 10, 11 or 12' })
      if (!isPositiveNumber(body['dailyMinutes'])) return reply(400, { error: 'dailyMinutes must be a positive number' })

      const subjectIds = body['subjectIds']
      if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
        return reply(400, { error: 'subjectIds must list at least one subject' })
      }

      const subjects = await subjectsFor(body['schoolClass'], subjectIds.filter(nonEmptyString))
      if (subjects.length === 0) {
        return reply(400, { error: 'none of those subjects exist in that class' })
      }

      const day = await options.almanac.dayFor({
        studentId: who.studentId,
        date: body['date'],
        dailyMinutes: body['dailyMinutes'],
        subjects,
      })
      return reply(200, { day })
    }

    if (req.path === '/api/done') {
      if (options.almanac === undefined) {
        return reply(503, { error: 'the planner is not configured on this server' })
      }
      /* Same substitution as `/api/day`: the student who finished the work is
       * the student holding the signed cookie, never the one named in the body. */
      if (!nonEmptyString(body['conceptId'])) return reply(400, { error: 'conceptId is required' })

      /* The ONLY thing in this server that marks work finished. */
      await options.almanac.markDone(who.studentId, body['conceptId'])
      return reply(200, { done: true })
    }

    /* /api/search */
    if (!nonEmptyString(body['query'])) {
      return reply(400, { error: 'query is required' })
    }
    /* Held in a const: the narrowing above does not survive into the callback
     * below, and re-reading body['query'] there is `unknown` again. */
    const query = body['query']

    let hits: readonly SearchResult[]
    try {
      hits = await options.search.search(query)
    } catch {
      return reply(502, { error: 'search could not be reached' })
    }

    /* Search results are attacker-controlled text by definition. Invisible
     * characters are stripped and injection markers are reported alongside each
     * result, so nothing downstream has to guess whether a page is hostile. */
    const results = hits.map((hit) => {
      const content = stripInvisible(hit.content)
      return {
        url: hit.url,
        content,
        signals: injectionSignals(content).map((signal) => signal.kind),
        /* A page that mentions the words but not the FIGURE is not an answer.
         * `citationSupports` checks the load-bearing parts — every number in
         * the query must appear in the page — so a caller can tell a real
         * source from a topical one. */
        supports: citationSupports(query, content),
      }
    })

    return reply(200, { results })
  }

  return async function handle(req: ServerRequest): Promise<ServerResponse> {
    const who = resolveIdentity(req)

    /* NAMING SOMEONE ELSE IS REFUSED OUT LOUD, NOT IGNORED QUIETLY.
     *
     * Only when the caller HAS a proven identity and names a different one.
     * That is the forgery case exactly, and nothing else is:
     *
     *   - A first visit has no proven identity, so there is nothing for a
     *     claim to contradict. Refusing there would 403 every new student on
     *     their first request, which is a broken product, not a secure one.
     *   - A caller naming its OWN id is simply agreeing with the server, and
     *     agreement is not an error.
     *
     * IGNORING A MISMATCH WOULD BE WORSE THAN REFUSING IT. Silently writing to
     * the trusted id after being asked for another one tells the caller its
     * write landed where it asked, when it did not -- and a store that reports
     * a save to the wrong place is the corruption this whole phase exists to
     * prevent. */
    /* AN EXPLICITLY EMPTY CLAIM IS A MALFORMED REQUEST, NOT AN ABSENT ONE.
     *
     * `studentId: ""` is not the same as omitting the field. The caller meant to
     * say who this was and said nothing, which is the shape a missing variable
     * takes in real code. Minting a fresh identity for it would answer 200 and
     * store the work somewhere the caller will never look again.
     *
     * `key.ts` already refuses an empty tab or lesson for exactly this reason
     * and says so in its own header: "REJECT, NEVER COERCE. A missing student id
     * quietly becoming `""` is how every student in a school ends up sharing one
     * row." Student is now server-assigned, so that check had nowhere left to
     * live -- this is where it moved to, not where it was dropped. */
    const claimed = claimedStudentId(req)
    if (claimed !== undefined && claimed.trim() === '') {
      return reply(400, { error: 'studentId was sent but is empty' })
    }

    const response = who.proven && claimed !== undefined && claimed !== who.studentId
      ? reply(403, { error: 'that student id is not yours' })
      : await route(req, who)

    return who.setCookie === undefined ? response : { ...response, setCookie: who.setCookie }
  }
}
