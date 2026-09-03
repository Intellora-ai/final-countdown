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
import { authorConcept, type ConceptResult } from '../src/canvas/teach/concept.ts'
import { decideNext, namesASubject, permitted, type Action, type Situation } from './controller.ts'
import { readableText } from '../src/canvas/spec/readable.ts'
import { extractJson } from '../src/canvas/teach/authorLesson.ts'
import type { Source } from '../src/canvas/teach/grounding.ts'
import { levelScope } from '../src/canvas/teach/level.ts'
import { chooseStrategy, type Strategy } from './teaching.ts'
import { subjectsFor, SUPPORTED_CLASSES, type SchoolClass } from './almanac/curriculum.ts'
import type { Ledger } from './almanac/ledger.ts'
import type { OpenLoops } from './openLoops.ts'
import { ENDPOINT as SEARCH_ROUTE } from './openweb.ts'
import {
  IDENTITY_COOKIE,
  identityCookie,
  newStudentId,
  readCookie,
  signIdentity,
  verifyIdentity,
} from './identity.ts'
import { BadMemoryKey, type MemoryOwner } from './memory/key.ts'
import { needsAnotherLook, type OnCanvas, type Suspicion } from './assurance.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import { lessonStream, type StreamEvent } from './lessonStream.ts'
import { SMALL_TALK_REPLY, smallTalk } from './smallTalk.ts'
import type { Explanation, Explanations } from './memory/explanations.ts'
import { type EvidenceStore } from './memory/evidence.ts'
import { type MisconceptionStore } from './memory/misconceptions.ts'
import { diagnose } from './diagnose.ts'
import { blocking, type Listed } from './prerequisites.ts'
import { whatToDoNext, type Syllabus } from './priority.ts'
import { type ConceptIndex } from './memory/concepts.ts'
import { isPlea } from '../src/canvas/teach/turn.ts'
import type { Written, WrittenLessons } from './memory/lessons.ts'
import type { SubjectAliases } from './memory/aliases.ts'
import { noveltyAgainst } from './memory/variation.ts'
import { NotConsistent } from './memory/progress.ts'
import { NotStorable } from './memory/record.ts'
import type { CanvasMemory } from './memory/store.ts'
import { candidateIntelligence } from './intelligence/candidate.ts'
import { legacyIntelligence } from './intelligence/legacy.ts'
import type { LearningIntelligence, Proposal } from './intelligence/LearningIntelligence.ts'
import type { ShadowRun, ShadowRuns } from './intelligence/runs.ts'
import { shadowObserver } from './intelligence/shadow.ts'
import { costsFrom } from './intelligence/cost.ts'
import { evaluateRuns } from './intelligence/evaluate.ts'
import { experienceOf } from './intelligence/experience.ts'
import { candidateTakes, serveFromCandidate } from './intelligence/canary.ts'
import { criticOn } from './intelligence/critic.ts'
import { capabilityRegistry } from './intelligence/registry.ts'
import { sufficientPath } from './intelligence/sufficiency.ts'
import { askOf } from './memory/lessons.ts'
import { readTheAsk } from '../src/canvas/teach/intent.ts'
import { createHmac } from 'node:crypto'
import { knownTopicCount } from '../src/knowledge/load.ts'

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
  /** C3: her plea, verbatim, when `justSaid` was one. See `prompt.ts`. */
  readonly notUnderstood?: string
  /** C4: wrong beliefs she may hold, from misconception memory. */
  readonly mayHold?: readonly string[]
  /** D3: prerequisites her own evidence says are blocking; see `prerequisites.ts`. */
  readonly teachFirst?: readonly { readonly id: string; readonly name: string }[]
  /** How to teach it. Chosen here, never accepted from the request. */
  readonly strategy?: Strategy
}

export interface ModelPort {
  lesson(request: LessonRequest): Promise<unknown>
  /** See `Model.chat`. Present on the Groq client; absent is handled.
      `budget` is the caller's `max_tokens` reservation; see `groq.ts`. */
  chat?(system: string, user: string, priorAssistant?: string, budget?: number): Promise<string>
  /** See `Model.chatStream`. Present on the local client and the failover wrapper. */
  chatStream?(system: string, user: string, onDelta: (text: string) => void, priorAssistant?: string, budget?: number): Promise<string>
  /** The controller DECISION alone -- a short JSON verdict -- when a different,
      faster model makes it (`OLLAMA_CONTROLLER_MODEL`). Absent, `chat` decides. */
  decide?(system: string, user: string, priorAssistant?: string, budget?: number): Promise<string>
  /** See `Model.nextPart`. Absent falls back to `lesson`, which still works. */
  nextPart?(request: LessonRequest): Promise<unknown>
}

export interface SearchResult {
  readonly url: string
  readonly content: string
  /** F2: how well the sources agree, in words. Absent when nothing was checked. */
  readonly agreement?: string
}

export interface SearchPort {
  /**
   * `scope` is the reading level to bias the ENGINE with -- "class 10 school
   * level, simple language" -- and it is a SECOND ARGUMENT rather than part of
   * the query on purpose.
   *
   * MEASURED LIVE 2026-09-03: glued onto the question, the level words were
   * read as part of the subject, and a Class 10 photosynthesis search came
   * back with "Bantu languages", "Baldwin Class 10-12-D" and Harvard's
   * "Language" page -- every one of them an honest match for words the scope
   * had added. Kept apart, the engine still gets the hint and nothing
   * downstream mistakes it for what she asked about.
   */
  search(query: string, scope?: string): Promise<readonly SearchResult[]>
}

/**
 * What the open-web pipeline answers with: a status and a body it has already
 * serialized. Declared structurally here rather than imported from
 * `vite-plugin-search.ts` for the same reason `webResolver.ts` declares its
 * retrieval shapes: this file depends on WHAT it needs, and
 * `canvasContract.test.ts` shows what closes the drift such a declaration
 * opens -- here the passthrough test does, by running the real core.
 */
export interface OpenWebReply {
  readonly status: number
  readonly body: string
}

export interface ServerRequest {
  readonly method: string
  readonly path: string
  /** The raw `Accept` header. `text/event-stream` on /api/ask asks for the words as they are written. */
  readonly accept?: string
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
  /** Present only when the caller asked for an event stream: the lesson as it
      is written, ending with `done`, which carries the reply `body` above
      would otherwise have been. */
  readonly stream?: AsyncIterable<StreamEvent>
}

export interface HandlerOptions {
  readonly model: ModelPort
  readonly search: SearchPort
  /**
   * The open-web pipeline behind /api/search. Absent means the route answers
   * 503 and the browser's Wikipedia rung takes over -- honest degradation, the
   * same shape `almanac` and `memory` already follow. `index.ts` wires the
   * real `searchTheOpenWeb`; tests inject fakes.
   */
  readonly openWeb?: (requestBody: string) => Promise<OpenWebReply>
  /**
   * The open-loop ledger behind /api/situation. Absent means the route answers
   * 503 and the canvas simply shows no card -- the same honest degradation as
   * `memory` and `almanac`.
   */
  readonly loops?: OpenLoops
  /** Almanac's memory. Absent means the day routes answer 503, never a guess. */
  readonly almanac?: Ledger
  /** The canvas's memory. Absent means /api/memory answers 503, never a guess. */
  readonly memory?: CanvasMemory
  /**
   * What she has already been told, per concept. Phase 3's storage.
   *
   * OPTIONAL, AND ABSENT IS NOT A REFUSAL. Without it the server falls back to
   * the routes the CALLER sent, which is exactly how it behaved before this
   * existed -- a page still gets taught, it simply forgets across a reload.
   * Refusing to teach because a history store is unconfigured would turn a
   * missing nicety into a missing lesson.
   */
  readonly explanations?: Explanations
  /** C3: what the learner typed, filed under the topic; see `memory/evidence.ts`. */
  readonly evidence?: EvidenceStore
  /** C4: misconceptions as evidence-backed hypotheses; see `memory/misconceptions.ts`. */
  readonly misconceptions?: MisconceptionStore
  /** D4: questions resolved to concepts by meaning; see `memory/concepts.ts`. */
  readonly concepts?: ConceptIndex
  /**
   * Lessons already written for a concept, readable by anyone who has not seen
   * them. See `memory/lessons.ts`.
   *
   * OPTIONAL, AND ABSENT MEANS EVERY ASK IS AUTHORED. Without it the server
   * behaves exactly as it did: a cache that can only save work must never be
   * the reason a learner is not taught.
   */
  readonly lessons?: WrittenLessons
  /**
   * WHAT A PHRASING WAS ALREADY DECIDED TO MEAN. See `memory/aliases.ts`.
   *
   * OPTIONAL, AND ABSENT ONLY COSTS TIME. Without it every ask pays for the
   * controller call before the shelf can be read, which is exactly how this
   * behaved before the memo existed. A store that can only make things faster
   * must never be the reason a learner is not taught.
   */
  readonly aliases?: SubjectAliases
  /**
   * The key this server signs identities with.
   *
   * REQUIRED, WITH NO DEFAULT. A fallback would live in the source, and a
   * signature every reader can reproduce is not a signature -- it would restore
   * the exact hole this closes while looking like it was closed. A server
   * without one must refuse to start; see `index.ts`.
   */
  readonly identitySecret: string
  /** The two brains the shadow bridge compares. Absent, the real candidate and the real legacy chooser, on this server's model. */
  readonly intelligence?: {
    readonly candidate: LearningIntelligence
    readonly legacy: LearningIntelligence
    readonly log?: (line: string) => void
  }
  /** Where shadow runs are kept. Absent, the log line is all there is. */
  readonly shadowRuns?: ShadowRuns
  /**
   * Plant the identity cookie with `Secure`, so a browser only ever sends it
   * over TLS. Off by default because this server speaks plain HTTP on a
   * development machine, where a `Secure` cookie is silently dropped and every
   * request would mint a new student. The deployment that terminates TLS turns
   * it on; see `IDENTITY_COOKIE_SECURE` in `index.ts` and `identityCookie`.
   */
  readonly secureCookies?: boolean
  /** Strings that must never appear in a response, whatever produced them. */
  readonly secrets?: readonly string[]
  /** Whether any hosted vendor is configured. A boolean; /api/health names no vendor. */
  readonly cloudConfigured?: boolean
  /** Whether a model on this machine is configured, as primary or as the last resort. */
  readonly localConfigured?: boolean
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

/* `SEARCH_ROUTE` is imported from `openweb.ts` rather than spelled again: the
 * dev middleware mounts on that constant (vite-plugin-search.ts) and this set
 * is what lets the production server answer the same path, so a route that
 * exists twice as prose is a route that can drift. One declaration, two
 * servers. */
/* The one piece of request-scoped state in this file: where the words go as
 * the model writes them, for the request that asked for them. Carried on the
 * async context rather than threaded through eleven signatures, and read in
 * exactly one place -- the authoring model inside `conceptFor`. */
const streaming = new AsyncLocalStorage<(text: string) => void>()

/** How long a canary student waits for the candidate before the live brain answers. */
const CANDIDATE_BUDGET_MS = 20_000

const ROUTES = new Set(['/api/lesson', '/api/ask', SEARCH_ROUTE, '/api/day', '/api/done', '/api/health', '/api/memory', '/api/canvas', '/api/situation', '/api/evidence', '/api/next', '/api/intelligence/report'])

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

/**
 * WHAT ONE DECISION IS ALLOWED TO RESERVE.
 *
 * The controller answers with one JSON object -- five short fields, measured at
 * roughly sixty tokens. It reserved `CONCEPT_MAX_TOKENS` (1400) because one
 * `chat` served both it and the authoring call, and a vendor DEDUCTS the
 * reservation from a per-minute allowance whatever the reply costs. Against
 * Groq's 8,000 per minute that is a lesson's worth of budget spent to write a
 * sentence, and the 429s -- each one a multi-second retry pause a learner sits
 * through -- arrived four times sooner than they had to.
 *
 * GENEROUS ON PURPOSE, ~10x the measured reply. A truncated decision is not a
 * slow decision, it is a WRONG one: `decisionFrom` cannot read half an object,
 * falls back, and a fallback target is `guessed`, which stops the lesson being
 * filed and stops the alias being learned -- so a budget shaved too fine would
 * quietly switch the whole shelf off. The saving is in the 800 tokens this
 * still gives back, not in the last hundred.
 */
const DECISION_MAX_TOKENS = 600

export function createHandler(options: HandlerOptions): (req: ServerRequest) => Promise<ServerResponse> {
  /* THE SHADOW BRIDGE. Off unless `INTELLIGENCE_MODE=shadow`; read on every
     call so a running server can be switched. Asked only after a reply is
     formed, so nothing here can reach the student. */
  const theCandidate = options.intelligence?.candidate ?? candidateIntelligence({
      model: options.model,
      search: options.search,
      /* What THIS server has, so every contract's availability is honest. */
      registry: capabilityRegistry({
        model: options.model.chat !== undefined ? (options.model.decide !== undefined ? 'chat-and-decide' : 'chat') : options.model.decide !== undefined ? 'decide' : 'none',
        search: true,
        aliases: options.aliases !== undefined,
        lessons: options.lessons !== undefined,
        evidence: options.evidence !== undefined,
        misconceptions: options.misconceptions !== undefined,
        concepts: options.concepts !== undefined,
        verifiedTopics: knownTopicCount(),
      }, () => costsFrom(options.shadowRuns?.list() ?? [])),
    })
  const theCritic = options.model.chat === undefined ? undefined : criticOn(options.model.chat)
  const shadowLog = options.intelligence?.log ?? ((line: string) => console.log(line))
  const observeInShadow = shadowObserver({
    candidate: theCandidate,
    legacy: options.intelligence?.legacy ?? legacyIntelligence({ model: options.model }),
    mode: () => process.env['INTELLIGENCE_MODE'] ?? 'off',
    log: shadowLog,
    now: Date.now,
    ...(options.shadowRuns === undefined ? {} : { record: (run: ShadowRun) => { options.shadowRuns?.record(run) } }),
    /* The critic is the reasoner in a second mode, on the same JSON-mode chat. */
    ...(theCritic === undefined ? {} : { critic: theCritic }),
    /* The gate looks exactly where the live path looks. A store that is not
       configured is a shelf with nothing on it, which is also what the live
       path sees. */
    sufficiency: (request) => sufficientPath(request, {
      smallTalk,
      isPlea,
      subjectFor: (context, said) => options.aliases?.subjectFor(context, said) ?? null,
      unseenOnShelf: (subject, spent, ask) => (options.lessons?.findUnseen(subject, spent, ask) ?? null) !== null,
    }),
  })
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
  /* The reader is `src/canvas/spec/readable.ts`, shared with the browser. It
     lived here and the client had a SECOND, narrower one, so the words this
     stored as "what she was told" and the words the screen actually rendered
     were different sets -- novelty judged against text nobody saw. */

  async function conceptFor(
    question: string,
    alreadyUsed: readonly string[],
    /** Who is asking. The history is hers, and nobody else's. */
    who: Identified,
    /**
     * WHICH CONTEXT ASKED, AND WHY IT IS NOT ALWAYS `'ask'`.
     *
     * This was hardcoded, and then `/api/lesson` started calling here too --
     * so a concept opened from today's plan and a question typed into the
     * canvas box wrote to and read from ONE bucket. Pressing Start on
     * "Photosynthesis" spent `numbers-first`, and typing "photosynthesis" was
     * then denied a way in it had never actually been given. Two contexts ate
     * each other's twelve-route budget, which is the opposite of the "keyed by
     * lesson + concept" the store's own header states.
     */
    askedFrom: string,
    /**
     * The teaching decision, when the caller made one.
     *
     * `/api/lesson` chooses a strategy from what the browser reports about the
     * student and the screen renders it. Routing fresh concepts here dropped
     * that field from the reply, so the label vanished and a student meeting
     * an idea for the first time and one revisiting it were answered
     * identically. Carried through rather than re-derived: the decision stays
     * where it is documented to be made.
     */
    strategy?: string,
    /**
     * The level to search at: the student's class, and the exam she is sitting.
     *
     * PASSED IN RATHER THAN READ FROM THE BODY, because this function serves
     * both `/api/lesson` and `/api/ask` and neither owns the other's shape.
     * Absent means the query is the bare question, exactly as it always was.
     */
    level?: { readonly classId: string | null; readonly examId: string | null },
  ): Promise<ServerResponse> {
    const chat = options.model.chat
    if (chat === undefined) throw new Error('conceptFor called without a chat-capable model')
    /* WORDS AS THEY ARE WRITTEN, ON THE FIRST ATTEMPT ONLY. A repair re-sends
       the rejected document and asks for a correction; its words would
       overwrite what is already on screen mid-sentence, so the repair -- and
       the second authoring that `noveltyAgainst` may order -- are written
       whole. `streaming.getStore()` is set only for a request that asked for
       the stream, so every other caller gets exactly the model it always had. */
    let streamedOnce = false
    const authoring = () => (system: string, user: string, priorAssistant?: string): Promise<string> => {
      const onDelta = streaming.getStore()
      const stream = options.model.chatStream
      if (onDelta !== undefined && stream !== undefined && !streamedOnce) {
        streamedOnce = true
        return stream.call(options.model, system, user, onDelta, priorAssistant)
      }
      return chat(system, user, priorAssistant)
    }

    /*
     * WHOSE HISTORY, AND AT WHAT GRAIN.
     *
     * PER STUDENT AND PER CONCEPT. Not per tab: if she read an explanation in
     * one tab, giving her the same one in a second tab is still repeating
     * herself, so a tab-scoped history would defeat the rule it exists to keep.
     * `tabId` is therefore fixed rather than read from the request -- and it
     * cannot be blank, because `key.ts` refuses an empty part on purpose.
     *
     * `ask` as the lesson, because a free question belongs to no lesson. The
     * concept part carries the question itself, so two different questions are
     * two different histories inside it.
     */
    const owner = { studentId: who.studentId, tabId: 'any', lessonId: askedFrom }

    /*
     * THE SERVER'S OWN RECORD FIRST, THE CALLER'S SECOND.
     *
     * `alreadyUsed` arrives in the request body, filled from a `useRef` Map in
     * `CanvasRoute` that dies on reload -- so trusting it alone meant a refresh
     * erased every explanation she had ever had, and a caller that simply left
     * it out was taught the same way forever. The stored history is the one
     * that survives both.
     *
     * BOTH, NOT EITHER. The caller's list is still honoured because the canvas
     * has a direct-to-model path that never touches this server, and dropping
     * its list would let those explanations repeat. A route in either list is
     * spent.
     */
    /* READ AFTER THE FAST PATH, NOT BEFORE IT. Its only consumer is
       `situation.told`, which is only ever sent to the controller -- so on a
       shelf hit this was a SQLite read and a JSON parse of a row nobody looks
       at, on the one path whose entire purpose is to touch nothing. */
    const spentLater = (): readonly string[] => [
      ...new Set([...(options.explanations?.routesSpent(owner, question) ?? []), ...alreadyUsed]),
    ]

    /**
     * Hand back a lesson that is already on the shelf.
     *
     * ONE PLACE, BECAUSE THERE ARE NOW TWO WAYS TO REACH THE SHELF -- before
     * the controller through the alias, and after it through the decided
     * target -- and a lesson served without being RECORDED as served is the
     * repeat this whole subsystem exists to prevent. Two copies of that
     * recording is one copy that eventually stops being made.
     */
    function offShelf(ready: Written, key: string, memo: boolean): ServerResponse {
      /* Recorded as shown, exactly as an authored one is: it IS what she was
         shown, so her history and her spent routes must reflect it or the next
         asking will offer the same way in again. */
      const at = new Date().toISOString()
      try {
        options.explanations?.remember(owner, key, {
          route: ready.route,
          text: readableText(ready.lesson),
          at,
        })
      } catch {
        /* A failed write costs her a repeat later, never this answer. */
      }
      /*
       * ITS OWN TRY, AND THE SEPARATION IS THE POINT. These two writes fail for
       * the same reasons -- a locked row, a full disk -- and cost completely
       * different things. Sharing one `try` meant a failed history write
       * skipped the memo that had not been attempted yet, so one unlucky
       * request cost EVERY later learner the controller call this one paid for,
       * silently and for as long as nothing else succeeded. A catch documented
       * as costing "a repeat later" must not also be able to cost the speed.
       *
       * ONLY WHEN IT IS NEW, AND ONLY WHEN IT IS FILEABLE. Reaching the shelf
       * through the controller is the one case where the app has learned a
       * mapping it did not already have; reaching it through the alias taught
       * nothing, and rewriting the row it just read would put a store write
       * back on the one path that has none.
       *
       * THE CALLER DECIDES, because the caller is the only one that can. This
       * took a bare "is it new" and wrote the alias on the strength of it,
       * skipping the `!guessed && subjectNamed && !appSupplied` gate that the
       * IDENTICAL write obeys on the authoring path -- so a guessed target that
       * happened to hit an old shelf row was memoed as a subject on the one
       * path where the app knows least. Two writes of one fact must share one
       * condition or the weaker path reintroduces what the stronger refuses.
       */
      if (memo) {
        try {
          options.aliases?.learn(askedFrom, question, key, at)
        } catch {
          /* The next learner pays for a decision. Nobody goes untaught. */
        }
      }
      return reply(200, {
        lesson: ready.lesson,
        route: ready.route,
        ...(ready.checkpoint === undefined ? {} : { checkpoint: ready.checkpoint }),
        ...(ready.next === undefined ? {} : { next: ready.next }),
        ...(strategy === undefined ? {} : { strategy }),
      })
    }

    /*
     * THE ANSWER THAT COSTS NOTHING, REACHED WITHOUT SPENDING ANYTHING.
     *
     * THE BOTTLENECK THIS REMOVES, AND IT WAS THE PRODUCT'S WHOLE LATENCY
     * STORY. A lesson already on the shelf is served from one SQLite row --
     * measured at 11ms end to end. But the shelf is keyed by the SUBJECT, and
     * until now only the controller could turn `wat is fotosynthesis` into
     * `photosynthesis` -- so the cheapest answer the product can give still sat
     * behind a model round trip: 6-10s measured on `gemini-2.5-flash-lite`,
     * 15-30s on `gemini-2.5-flash`, and longer again whenever a 429 bought a
     * retry pause. A cache that costs a network call is not a cache.
     *
     * `aliases` holds the subject THE MODEL ITSELF named for this exact
     * phrasing, written only where a lesson was filed. So this is not the fast
     * path that was removed: nothing here reads the message or judges what it
     * means, and a phrasing that has never produced a filed lesson -- every
     * greeting, every unreadable sentence -- has no entry and falls straight
     * through to the controller, veto included.
     *
     * IT CANNOT SERVE A REPEAT. The lookup is filtered by this learner's own
     * spent routes for that subject, which is the same filter the slow path
     * applies. A miss here costs one extra SQLite read and nothing else.
     */
    const meant = options.aliases?.subjectFor(askedFrom, question) ?? null
    if (meant !== null) {
      const had = options.explanations?.priorFor(owner, meant).explanations ?? []
      /* OF THE SHAPE SHE ASKED FOR. The memo decided what this phrasing MEANS;
         `readTheAsk` reads what it WANTS -- a definition, an example, a
         comparison, the whole thing -- and the shelf is asked for that. A
         whole lesson no longer answers "what is it". See `Written.asked`. */
      const onShelf =
        options.lessons?.findUnseen(meant, [
          ...new Set([...had.map((one) => one.route), ...alreadyUsed]),
        ], readTheAsk(question).ask) ?? null
      if (onShelf !== null) {
        console.log(`[controller] SHELF target="${meant}" (phrasing already decided, no model call)`)
        return offShelf(onShelf, meant, false)
      }
    }

    /*
     * THE SEARCH STARTS NOW, NOT AFTER THE DECISION.
     *
     * It is grounding for the AUTHORING call and it is keyed by what the
     * learner typed -- `options.search.search(question)` -- so it has never
     * depended on the controller's answer in any way. Awaiting it after the
     * decision made two independent network calls into a queue, and a learner
     * waited for the sum of them; started here they overlap and the same
     * learner waits for the longer one.
     *
     * WHAT THIS COSTS, STATED RATHER THAN HIDDEN. A request that ends in
     * ASK_CLARIFICATION, or that finds its lesson on the shelf after the
     * controller has run, has issued a search whose result is discarded. That
     * is one wasted lookup on the two paths that author nothing, bought to take
     * a whole round trip out of the path that does.
     *
     * FAILING TO FIND SOURCES IS STILL NOT FAILING TO TEACH. The catch that
     * used to sit at the await sits here instead and does the same thing: an
     * unreachable or unconfigured provider becomes an empty list, and
     * `groundingPreamble([])` returns '' -- so the prompt is exactly what it
     * was. Turning a retrieval failure into a teaching failure would be worse
     * than being honestly ungrounded.
     */
    /* THE QUERY IS PITCHED AT HER LEVEL, NOT AT NOBODY'S.
     *
     * MEASURED 2026-09-03: this searched the RAW question. A Class 9 student
     * and a JEE candidate typing "trigonometric ratios" were sent to the same
     * pages, and a Class 9 student reading a research paper has been failed by
     * the search, not by the model that then had to teach from it.
     *
     * `scopedQuery` was written for exactly this and existed the whole time --
     * reachable only on the local-model path in the browser, which almost
     * nobody is on. The one thing missing was that the class never left the
     * page. It does now (see `WhichCanvas` in `CanvasRoute.tsx`), so the
     * function that was always right is finally on the path every student
     * takes. Told neither a class nor an exam, this is the bare question,
     * exactly as before: a guessed level is worse than none. */
    const searchedAt = levelScope(level?.examId ?? null, level?.classId ?? null)
    const lookUp = async (): Promise<readonly SearchResult[]> => {
      try {
        return await options.search.search(question, searchedAt)
      } catch {
        return []
      }
    }
    /*
     * NOT FOR A MESSAGE THAT NAMES NOTHING.
     *
     * Started unconditionally, every greeting bought a web search for the word
     * "hi" whose result was thrown away when the veto turned the decision into
     * ASK_CLARIFICATION -- and that branch is common enough to have its own
     * test file.
     *
     * THIS IS NOT THE APP DECIDING FROM TEXT, and the distinction is the one
     * `controller.ts` draws. `namesASubject` does not choose the ACTION, does
     * not name a target, and nothing downstream reads its answer. It decides
     * only whether to START FETCHING EARLY, and both ways of being wrong cost
     * exactly one thing: a message it wrongly calls empty simply falls back to
     * `lookUp()` below and waits for the search as it always did. A guess that
     * can only cost latency, never correctness, is allowed to be a guess.
     */
    const searching = namesASubject(question) ? lookUp() : null

    /*
     * READ ONCE, USED THREE TIMES.
     *
     * This was read twice -- here to build the prompt, and again below for the
     * novelty check -- which is two `store.read` calls and two `JSON.parse`
     * passes over the same blob on the hot path of the product's main teaching
     * route. Worse than the cost: two reads can observe two different lists if
     * another tab writes in between, so the wording SHOWN to the model and the
     * wording it was JUDGED against were not guaranteed to be the same history.
     * One read cannot disagree with itself.
     */

    /*
     * ALREADY WRITTEN, AND NEW TO THIS LEARNER: SERVE IT FOR NOTHING.
     *
     * THE CHEAPEST MODEL CALL IS THE ONE NOT MADE. A concept request reserves
     * ~1,778 tokens of prompt plus a 1,000-token reply against 8,000 per minute
     * and 200,000 per day -- this account reached `Used 198032` in an afternoon.
     * A class working one syllabus asks the same concepts, and every ask was
     * authored from scratch: the same truth written once per student.
     *
     * `spent` IS THE WHOLE SAFETY ARGUMENT. It is this learner's own list of
     * ways in -- their stored history merged with the caller's -- so a hit is
     * always an axis they have never been given. "Never repeat" is a property
     * of a learner, not of the corpus, and this cannot return a repeat any more
     * than `nextRoute` can hand back a spent route.
     *
     * BEFORE THE SEARCH, TOO. A cache hit needs no grounding, so the web call
     * below is skipped as well -- the saving is the whole request, not just the
     * authoring turn.
     */
    /*
     * WHAT SHOULD HAPPEN NEXT, DECIDED BY THE MODEL AND APPROVED BY US.
     *
     * THE FRAME THIS BREAKS. Every earlier version answered a smaller question
     * -- "is this a question?", "which of seven shapes is it?" -- with rules,
     * and a sentence nobody anticipated fell through to a lecture. `controller.ts`
     * asks the one question a tutor actually asks, and five actions cover
     * greetings, doubts, requests, confusion and off-topic messages without any
     * of them being enumerated.
     *
     * AND THE APPLICATION KEEPS CONTROL. `permitted` runs on every decision
     * before anything happens: the model may choose EXPLAIN for someone who has
     * been told nothing, and the app knows better because `told` is ours. A
     * refusal always carries what happens instead, so a decision can be
     * overruled and the learner still gets taught.
     *
     * ONE SMALL CALL, AND IT CAN REMOVE A LARGE ONE. ~250 tokens in, ~60 out,
     * against an authoring call of ~1,420 in and 1,000 reserved -- and when the
     * answer is ASK_CLARIFICATION nothing is authored at all.
     */
    /*
     * WHAT THE APP CAN HONESTLY TELL THE CONTROLLER BEFORE IT HAS DECIDED.
     *
     * `told` used to carry a count read against the RAW MESSAGE, because the
     * subject is not known until the controller answers. That count is wrong
     * the moment a learner rephrases: taught `photosynthesis` twice, they type
     * `wat is fotosynthesis`, the lookup finds nothing, and the controller is
     * told nobody has ever explained this -- so `permitted` turns their EXPLAIN
     * into START_LESSON and begins from the beginning, which is the opposite of
     * what they asked for.
     *
     * The count cannot be keyed correctly before the subject exists, so it is
     * not sent at all. Nothing is lost: the same fact is enforced AFTER the
     * decision, in `permitted`, against the subject-keyed history -- which is
     * where a fact the app owns belongs anyway.
     */
    /*
     * A HINT FOR THE MODEL, NOT THE AUTHORITY.
     *
     * `told` was emptied because it could not be keyed correctly before the
     * subject was known -- true, and it went too far: `situationText` only
     * prints the "already explained N times" line when the list is non-empty,
     * so the controller was never told anything had been taught and could not
     * choose EXPLAIN on any basis but wording. `permitted` can correct an
     * EXPLAIN with no history; nothing corrects a START_LESSON chosen because
     * the model was told nothing.
     *
     * So the best available reading is sent -- the count against what they
     * typed -- and it is explicitly a hint: it UNDERCOUNTS when a learner
     * rephrases, never overcounts, so its only failure is to withhold
     * information the model would have used. The authoritative check runs after
     * the decision, against the subject-keyed history, in `permitted`.
     */
    const situation: Situation = {
      said: question,
      ...(askedFrom === 'ask' ? {} : { lesson: askedFrom }),
      told: spentLater(),
    }
    /*
     * THE CONTROLLER IS SPENT WHERE IT EARNS ITS PLACE, AND SKIPPED WHERE IT
     * DOES NOT.
     *
     * Two calls per lesson is two REQUESTS, and Gemini's free tier is limited
     * by requests per minute far more tightly than by tokens -- measured here
     * as repeated 429s, including one where the rate budget went on a decision
     * whose tutor call then failed, so the learner waited for a call that could
     * never be executed.
     *
     * The controller exists because the patterns cannot read a misspelling, a
     * greeting or Hinglish -- and those all fall through to `teach`. When the
     * patterns DID place the message and it names a subject, the model is being
     * asked to re-derive something already in hand, and the action for a clean
     * request naming a subject is START_LESSON either way.
     *
     * NO NEW VOCABULARY. The shape still comes from `readTheAsk` through the
     * `asked` parameter, exactly as it does on the model path; this decides
     * only whether a request is worth spending on.
     */
    /*
     * THE DECISION IS ALWAYS THE MODEL'S. THERE IS NO FAST PATH.
     *
     * There was one: when `readTheAsk` placed the message and a word list said
     * it named a subject, the app built the decision itself and skipped the
     * call. It was added to halve requests-per-minute, and it was wrong twice
     * over.
     *
     * It did not save what it claimed. "teach me logarithms", "explain X" and a
     * bare topic all read as `teach`, which was the exempted case -- so the
     * commonest phrasings still paid for the call and the saving landed on
     * traffic the limit does not bind on.
     *
     * And it asserted something the app cannot know. It hardcoded
     * START_LESSON, so `quiz me on tenses` -- read correctly as `practice` --
     * was recorded, vetoed and logged as a request to start a lesson. The
     * action drives `permitted`'s rules and is what `controller.ts` documents
     * as the product's real capability; only the prompt shape came from the
     * reading.
     *
     * Both faults have the same root: the app deciding from text. It cannot.
     * Latency is bought instead where it is actually available -- a smaller
     * model (6-10s rather than 15-30) and a shelf that makes a repeat free.
     */
    const decidingAt = Date.now()
    const proposed = await decideNext(
      (system: string, user: string) => (options.model.decide ?? chat)(system, user, undefined, DECISION_MAX_TOKENS),
      situation,
    )
    /* SAID, SO THE WAIT CAN BE ATTRIBUTED. MEASURED 2026-09-02 on a laptop
       model: the first streamed word arrived 22 s after the request, and
       nothing in the log said how much of that was this decision. */
    console.log(`[timing] controller decided in ${Date.now() - decidingAt}ms`)
    const shelved = proposed.target.trim()
    /*
     * ONE READ, AND IT IS TAKEN HERE RATHER THAN REUSED FROM THE FAST PATH.
     *
     * `routesSpent` and `wordsShown` each read and parse the same row;
     * `priorFor` returns it once and both lists come off it.
     *
     * REUSING THE ALIAS'S READ WAS A REAL SAVING AND THE WRONG TRADE. That read
     * happens at the TOP of the request, before a controller call measured at
     * 6-10 seconds. Handing it to `permitted` and to the tutor prompt would
     * mean judging "has she had this?" against a list that predates the whole
     * model call -- so a second tab finishing inside that window is invisible,
     * and she can be handed the way in it just gave her. The row costs
     * microseconds; the window costs seconds. Freshness wins.
     */
    const history = options.explanations?.priorFor(owner, shelved).explanations ?? []
    const spentOnSubject = [...new Set([...history.map((one) => one.route), ...alreadyUsed])]
    const wordsOnSubject = history.map((one) => one.text)

    /* Judged against the history for the SUBJECT the controller just named,
       which is the only key under which "has this been explained" is a real
       question. See `situation.told`. */
    const verdict = permitted(proposed, { ...situation, told: spentOnSubject })
    const decision = verdict.ok ? verdict.decision : verdict.instead

    /*
     * THE VETO CAN CHANGE THE SUBJECT, SO THE HISTORY IS RE-READ WHEN IT DOES.
     *
     * `permitted` may replace the target -- with the topic on screen, or with
     * the learner's own words when the model named something they never
     * mentioned. Reading the history once against the PROPOSED target and then
     * filing against the DECIDED one would put the two back out of step, which
     * is the mismatch this whole key unification exists to remove. Re-read only
     * when it actually moved; on the common path nothing changed and nothing is
     * re-read.
     */
    const finalKey = decision.target.trim()
    const moved = finalKey !== shelved
    /*
     * WHOSE WORDS THE TARGET IS, WHICH DECIDES WHETHER IT MAY BE SHARED.
     *
     * `permitted` substitutes `situation.said` when the model names a subject
     * the learner never mentioned -- so `finalKey` is then the learner's whole
     * sentence, exactly as it is when the controller could not be reached and
     * `fallbackDecision` guessed. The `guessed` case is already refused a place
     * on the SHARED shelf, for a reason that is stated there and applies word
     * for word here: "a fallback target is the learner's whole sentence, and
     * filing under it creates a key no second learner will ever produce".
     *
     * The two paths produce the identical thing and only one of them was
     * guarded, which was survivable while the shelf was the only consumer. It
     * stopped being survivable when the alias made such a key answerable with
     * NO model call: `i still dont get it` would be filed as a subject, memoed
     * as a phrasing, and served to the next learner who typed those words
     * without the veto ever running again.
     *
     * IT IS STILL TAUGHT, AND STILL REMEMBERED FOR HER. Only the two SHARED
     * stores refuse it. Her own history is written either way, because what she
     * was shown is a fact about her whatever the target was made of.
     */
    /*
     * `moved`, NOT `!verdict.ok`, AND THE DIFFERENCE IS THE WHOLE MEANING.
     *
     * This asked "was the decision refused, and does the target happen to equal
     * the message?" -- which is true whenever the veto corrected the ACTION and
     * left the target alone. A learner typing a bare `photosynthesis` gets
     * EXPLAIN with target `photosynthesis`, `permitted` rewrites the action to
     * START_LESSON because nothing has been explained yet, and the target never
     * moved: the model named that subject itself. It was then refused the
     * shared shelf and the memo, so the commonest veto in the file silently
     * switched off the caching for the commonest phrasing there is.
     *
     * What actually has to be excluded is a target the APP supplied, and the
     * app supplies one only by SUBSTITUTION -- which is exactly what `moved`
     * already records one line above.
     */
    const appSupplied = moved && finalKey === question.trim()
    const movedHistory = moved
      ? (options.explanations?.priorFor(owner, finalKey).explanations ?? [])
      : history
    const spentFinal = moved
      ? [...new Set([...movedHistory.map((one) => one.route), ...alreadyUsed])]
      : spentOnSubject
    const wordsFinal = moved ? movedHistory.map((one) => one.text) : wordsOnSubject
    /*
     * EVERY DECISION IS READABLE, NOT JUST THE OVERRULED ONES.
     *
     * This logged only overrides, and that made the system's own judgement
     * invisible: a lesson came back titled "How do you say 'hi'?" with nothing
     * in the log, because the controller had named a target that passed the
     * veto and no one could see what it was. A component given autonomy has to
     * be legible or its mistakes are unattributable -- which is the failure
     * this whole file was written in response to.
     *
     * One line, at info level, carrying the model's own reason. It is the only
     * record of WHY the product did what it did for a given learner.
     */
    console.log(
      `[controller] ${proposed.action} target="${proposed.target}" (${proposed.reason})` +
        (verdict.ok ? '' : ` -> OVERRULED to ${decision.action}: ${verdict.why}`),
    )

    /*
     * THE ONE ACTION THAT NEEDS NO TUTOR. They have said something nobody can
     * act on, so the honest move is to ask -- and asking is free. Authoring a
     * lesson about a sentence we could not read would spend the budget to guess.
     */
    if (decision.action === 'ASK_CLARIFICATION') {
      return reply(200, {
        clarify: true,
        question:
          'I want to get this right — what would you like me to do? Teach you something new, ' +
          'go over something again, answer a question, or give you problems to practise?',
        ...(strategy === undefined ? {} : { strategy }),
      })
    }

    /* The action decides the SHAPE the tutor is asked for. One vocabulary
       reaches the prompt; `controller.ts` owns what the product can do. */
    const shape: Record<Exclude<Action, 'ASK_CLARIFICATION'>, string> = {
      START_LESSON: 'teach',
      EXPLAIN: 'stuck',
      ANSWER: 'define',
      PRACTICE: 'practice',
    }
    /*
     * ALREADY WRITTEN, AND NEW TO THIS LEARNER: NO TUTOR IS ASKED ANYTHING.
     *
     * KEYED BY THE SUBJECT THE CONTROLLER DECIDED, NOT BY WHAT WAS TYPED, and
     * that is the fix rather than a refinement. Keyed by the raw message the
     * shelf was both too narrow and too permissive at once: "photosynthesis",
     * "what is photosynthesis?" and "wat is fotosynthesis" were three separate
     * entries for one subject, so real hits were missed -- and a junk key like
     * "wat is fotosynthesis" was stored for ever, which is how a lesson written
     * before a bug fix was still being served at 11ms afterwards. A library
     * catalogues by subject, not by the sentence somebody said at the desk.
     *
     * THE COST OF THE MOVE, AND WHY IT IS WORTH IT. The lookup now happens
     * after the controller, so a hit costs one small decision call (~250
     * tokens) instead of none. It saves the authoring call (~1,420 in, 1,000
     * reserved), which is the dominant one, and every phrasing of a subject now
     * shares an entry -- so the hit RATE rises far more than the hit price.
     *
     * `spent` is still this learner's own list, so a hit can only ever be an
     * axis they have not had.
     */


    /* KEYED AND FILTERED BY THE SAME TARGET. This asked the shelf for
       `finalKey` while passing the spent list read against the PROPOSED one, so
       on the veto's override path the two disagreed: an overruled target read
       an empty history and the shelf handed back a route the learner had
       already been given -- the mismatch `spentFinal` exists to close. */
    const ready = options.lessons?.findUnseen(finalKey, spentFinal, readTheAsk(question).ask) ?? null
    if (ready !== null) {
      return offShelf(ready, finalKey, !decision.guessed && decision.subjectNamed && !appSupplied)
    }

    const asked = shape[decision.action as Exclude<Action, 'ASK_CLARIFICATION'>]

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
    /* STARTED BEFORE THE DECISION, COLLECTED HERE. See `searching`: this is
       the only place the result is needed, and by now it has been in flight for
       the whole of the controller call rather than beginning after it. */
    const sources: readonly Source[] = (await (searching ?? lookUp())).map((page) => ({
      /* No title comes back on this port, and the url is the honest stand-in:
         `groundingPreamble` prints it as the citation either way, and an
         invented title would be the one part of a citation nobody checked. */
      url: page.url,
      title: page.url,
      /* F2: the verdict on how well the sources agree, read off the pages by
         `checkClaims` and carried here by `groundingPort`. It used to be
         computed and dropped, so a lesson resting on one shaky page reached
         the author looking exactly like one resting on two that agree. */
      text: page.agreement === undefined ? page.content : `${page.content}\n\n[${page.agreement}]`,
    }))
    /* SAID IN THE LOG, BECAUSE NOTHING ELSE SAYS IT. The reply carries the
       lesson, never its sources, so the one way to know a lesson was grounded
       -- rather than written by the model alone -- is this line. Measured
       2026-09-02: the port was a throw for the server's whole life and no
       line anywhere recorded that every lesson had zero sources. */
    console.log(
      `[grounding] ${sources.length} source(s) from ${new Set(sources.map((s) => s.url.replace(/^https?:\/\//, '').split('/')[0])).size} domain(s) for "${question.slice(0, 60)}"`,
    )

    /* ANNOTATED, AND THAT IS THE POINT. Declared bare, this was an evolving
       `any`: TypeScript never narrowed it to the refusal variant and never
       checked a single property read on it, so `written.route` below compiled
       for months against a field that did not exist there. The type is the
       thing that catches the next one. */
    let written: ConceptResult
    try {
      written = await authorConcept(
        authoring(),
        /*
         * THE SUBJECT THE CONTROLLER DECIDED, NOT THE RAW MESSAGE.
         *
         * This passed `question` -- what the learner typed -- so the entire
         * controller was decorative for the target: it read the message, chose
         * a subject, had that subject approved by `permitted`, logged it, and
         * then the tutor was handed the original string anyway.
         *
         * MEASURED, and it is exactly the reported defect:
         *
         *   [controller] START_LESSON target="math" (no topic given)
         *   lesson       "How do you say 'hi'?"
         *
         * The controller had already done its job correctly. Nothing consumed
         * the answer. `decision.target` is the whole point of ACTION + TARGET.
         */
        decision.target,
        sources,
        /* The merged history for the SUBJECT, not the raw message. See
           `spentOnSubject`. */
        spentFinal,
        undefined,
        /*
         * AND THE WORDS THEMSELVES, NOT ONLY WHICH ROUTE THEY TOOK.
         *
         * These rows have been written on every successful concept since Phase
         * 3, and only their `route` field was ever read back -- so the model was
         * told which WAY IN was spent and never what it had actually said. A
         * different opening over the same sentences is the repeat the rotation
         * exists to prevent, and `noveltyAgainst` below was left to catch it
         * afterwards at the cost of a second authoring turn.
         *
         * Shown to the model BEFORE it writes, which is the only place a repeat
         * can be prevented rather than detected. `conceptRequest` caps how many
         * and how much of each reach the prompt.
         */
        wordsFinal,
        /* The shape the controller's action calls for. See `shape` above. */
        asked as never,
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
    if (written.ok) {
      /*
       * R2 — "A NEW EXPLANATION MUST DIFFER FROM ALL PRIOR ONES", CHECKED.
       *
       * The store had a writer and no reader. Every successful concept was
       * persisted with its wording through `remember`, and nothing ever
       * compared a new one against it -- so the phase's done condition,
       * "asking for the same concept twice never yields the same explanation",
       * was written to disk and never once enforced. `route.ts` has twelve
       * axes and `nextRoute` restarts the cycle once they are spent, so the
       * thirteenth asking could legitimately be handed the same way in again.
       *
       * ONE MORE ATTEMPT, NOT A REFUSAL. Invariant R3 is that every input gets
       * a reply, and an explanation she has read before is worth more than a
       * blank screen -- so a repeat costs one further write with that route
       * also spent, and whatever comes back is served either way. Judged on
       * `readableText`, which is the same text `remember` stores, so this
       * cannot disagree with what the next asking will be compared against.
       */
      if (noveltyAgainst(readableText(written.lesson), wordsFinal).isRepeat) {
        try {
          const afresh = await authorConcept(
            authoring(),
            /*
             * THE SUBJECT, EXACTLY AS THE FIRST ATTEMPT HAD IT.
             *
             * This passed `question` -- the raw message -- while the call it is
             * retrying passed `decision.target`. So the one authoring call
             * whose entire job is to produce something BETTER was the only one
             * asked about a different thing: `wat is fotosynthesis` instead of
             * `photosynthesis`, after the controller had already read it,
             * decided it and had that decision approved.
             *
             * It is the same defect this file records one screen above -- "the
             * entire controller was decorative for the target" -- fixed on the
             * first call and left standing on the second, which is the call the
             * learner waits an extra 6-10 seconds for. A retry that changes the
             * subject is not a retry.
             */
            decision.target,
            sources,
            /* The way in that produced the repeat is spent too, so `nextRoute`
               cannot hand back the one that just failed to be new. */
            [...spentFinal, written.route],
            undefined,
            /*
             * AND THE WORDING, INCLUDING THE REPEAT THAT CAUSED THIS.
             *
             * This call passed route ids and nothing else, so the ONE authoring
             * call whose entire purpose is to produce something different was
             * the only one writing blind: it knew which way in to avoid and not
             * a single sentence it must not say again. It could -- and on a
             * second failure would -- repeat, `if (afresh.ok)` would accept it
             * because it parsed and passed the gate, and the learner would be
             * served the repeat after paying for two model calls.
             *
             * The draft that just repeated is appended LAST, so it is the most
             * recent thing in the list and survives `MOST_PRIOR_SHOWN`'s
             * newest-first trim. It is the single most relevant text there is:
             * it is the exact wording that was judged too close.
             */
            [...wordsFinal, readableText(written.lesson)],
          )
          /* Only if it ARRIVED. A second attempt that is refused, or that
             repeats as well, leaves the first lesson standing -- she is
             answered with something true rather than with the failure of an
             improvement she never asked for. */
          if (afresh.ok) written = afresh
        } catch {
          /* Recorded nowhere and rethrown nowhere: the lesson in hand is
             correct and she is owed it. */
        }
      }

      /*
       * RECORDED ONLY AFTER IT PASSED THE GATE, AND ONLY WHAT SHE SAW.
       *
       * `authorConcept` returns `ok` after `validateLesson`, so nothing refused
       * is ever written -- a rejected draft would spend a route the learner
       * never actually received, and she would be denied the one good way in
       * because a bad attempt had already used it.
       *
       * A FAILED WRITE MUST NOT COST HER THE LESSON. The lesson is in hand and
       * correct; a full disk or a locked row is a reason to forget, not a
       * reason to answer 500 to a child who is owed an answer. The consequence
       * of the catch is stated rather than swallowed: she may be taught this
       * way twice.
       */
      try {
        const at = new Date().toISOString()
        options.explanations?.remember(owner, finalKey, {
          route: written.route,
          /* The words, in block order -- what `noveltyAgainst` judges on. */
          text: readableText(written.lesson),
          at,
        })
        /* AND ON THE SHARED SHELF, so the next learner to ask this concept
           reads it instead of paying to have it written again. Only a lesson
           that passed the gate WHOLE gets here -- a salvaged one is worth
           serving to the person who waited for it and is not worth handing to
           somebody else as the real thing. */
        /* NOT WHEN THE TARGET WAS GUESSED. See `Decision.guessed`: a fallback
           target is the learner's whole sentence, and filing under it creates
           a key no second learner will ever produce -- so the shelf fills with
           one-off rows exactly while the provider is struggling. */
        /* FILED ONLY WHEN SOMETHING NAMED IT. A guessed target is the learner's
           sentence, and a decision that reported no subject has nothing to file
           under -- both produce keys no second learner ever asks for. */
        if (!decision.guessed && decision.subjectNamed && !appSupplied) {
          /* AND THE PHRASING THAT PRODUCED IT, under the same condition and for
             the same reason: a target nothing named is a key no second learner
             ever asks for, and an alias to it would send them to an empty
             shelf. Filed together so the two can never disagree about which
             subject this sentence meant. See `memory/aliases.ts`. */
          options.aliases?.learn(askedFrom, question, finalKey, at)
          options.lessons?.keep(finalKey, {
            route: written.route,
            lesson: written.lesson,
            checkpoint: written.concept.checkpoint,
            /* THE SHAPE THE MODEL SAID IT WROTE, so the shelf can serve it
               only to an ask of that shape. `conceptIssues` already refused
               anything outside the readings; absent reads as `teach`. */
            ...askOf(written.concept.asked),
            next: written.concept.next,
            at,
          })
        }
      } catch {
        /* Recorded nowhere and rethrown nowhere: see above. */
      }
      /*
       * THE TUTOR'S OWN TURN, WHICH WAS BUILT, ENFORCED, AND THEN THROWN AWAY.
       *
       * `conceptIssues` REFUSES a concept that has no `checkpoint` and no two
       * named `next` branches -- "the step ends by asserting, not by asking",
       * and "only N branches offered. Give at least two, so what comes next is
       * a choice". So the model writes both on every request and the gate will
       * not pass one without them.
       *
       * Then `validateLesson` drops them, correctly: a `Lesson` has no such
       * fields and the schema is `.strict()`. The reply carried `lesson` alone,
       * so the question that finds out whether the idea landed, and the two
       * ways the learner could go next, were generated, required, and deleted
       * one line before they would have reached anybody.
       *
       * MEASURED on this build, `/api/ask` for "how a fridge works":
       *   lesson keys : blocks, id, question, relations, technicalTerms
       *   checkpoint  : None
       *   next        : None
       *
       * Carried BESIDE the lesson rather than inside it, so `validateLesson`
       * judges exactly what it judged before and no gate is loosened to let a
       * tutor ask a question.
       */
      return reply(200, {
        lesson: written.lesson,
        route: written.route,
        checkpoint: written.concept.checkpoint,
        next: written.concept.next,
        ...(strategy === undefined ? {} : { strategy }),
      })
    }

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
      /* THE REASON IS KEPT, THE SAME WAY THE CATCH ABOVE KEEPS IT.
       *
       * This branch used to answer the bare sentence and drop `unreachable`
       * entirely, while the `catch` twenty lines up preserved the identical
       * message when it started with the same words. Two branches, one
       * failure, opposite behaviour -- and this is the branch the concept
       * path takes, so in practice the reason was ALWAYS discarded.
       *
       * MEASURED, and this is what it cost: every failed question for a whole
       * day answered `{"error":"the model could not be reached"}` with no
       * status and no code, while the client had already written
       * `the model could not be reached (429 tokens/rate_limit_exceeded)` and
       * handed it over. Reading the account's daily-token exhaustion out of
       * that took hours of probing the vendor by hand; the server had been
       * told, in one line, on the first request.
       *
       * SAFE TO REPEAT, for the same reason line 397 is: `groq.ts:273` builds
       * this string from the STATUS and the vendor's SHORT CODE only, never
       * its message -- the message is the part that can quote the request and
       * the credential, and it is dropped there rather than here. */
      const named = written.unreachable.startsWith('the model could not be reached')
        ? written.unreachable
        : 'the model could not be reached'
      return reply(502, { error: named })
    }

    /* The gate's own issues, verbatim. `CanvasRoute` renders them one per line
       under "That lesson was refused", so a summary here would replace the only
       specific thing she is told with a vaguer version of it. */
    console.error(
      'concept refused by validation:',
      written.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' | '),
    )
    /* AND THE VALUE THAT WAS REFUSED. A discriminator error names the twelve
       legal kinds and never the one the model wrote, and that one word is the
       whole diagnosis -- measured 2026-09-02, when every block came back with
       a representation name where its kind belonged. */
    console.log(`  kinds written: ${JSON.stringify((((extractJson(written.raw) as { blocks?: { kind?: unknown }[] } | null)?.blocks) ?? []).map((one) => one?.kind))}`)

    /*
     * A REFUSAL BY OUR OWN GATE MUST STILL ANSWER HER.
     *
     * INVARIANT R3 / PHASE 4 ITEM 1, in the owner's words: "every input gets a
     * reply; never blank, dropped, or refused." This branch broke it. The model
     * had written something, `authorConcept` handed it back as `raw`, and this
     * threw it away and sent a 502 -- so a child who asked a fair question, of
     * a model that answered, was shown nothing because OUR checker disliked the
     * shape.
     *
     * MEASURED: one question in ten came back this way -- "how does a fridge
     * work?" produced a real explanation that failed one arc rule, and she got
     * a dead screen for it.
     *
     * `deliverable` IS NOT NEW AND IS NOT WRITTEN FOR THIS. It is the ladder
     * the whole-lesson path has used all along: repair without inventing, then
     * re-judge as an ANSWER (which owes no arc), then drop only the refused
     * blocks, then the honest sentence. It was simply never reachable from the
     * path `/api/ask` actually takes -- the same orphan shape this repository
     * built a reachability gate to catch, one layer above where that gate
     * looks.
     *
     * NOTHING IS INVENTED. Every rung either keeps the model's own words or
     * removes some of them. The server never writes a definition, a summary or
     * a marked term on the model's behalf, so a salvaged lesson is a smaller
     * true thing and never a fuller invented one.
     */
    /*
     * PARSED FIRST. `ConceptResult.raw` is the model's REPLY TEXT -- the string
     * `authorConcept` kept so a failure could be inspected -- and `deliverable`
     * works on a parsed lesson. Handing it the string produced
     * `Cannot create property 'blocks' on string`, which is a crash where an
     * answer was owed.
     *
     * `extractJson` is the same reader `authorConcept` used to parse it in the
     * first place, so this cannot disagree with what the gate judged. A reply
     * that will not parse has nothing to salvage and falls through to the
     * honest refusal below.
     */
    let parsed: unknown
    try {
      parsed = extractJson(written.raw)
    } catch {
      parsed = undefined
    }

    /*
     * A CONCEPT IS NOT A LESSON, AND HANDING ONE OVER WHOLE THREW HER ANSWER
     * AWAY.
     *
     * A concept carries `checkpoint` and `next` -- the question that finds out
     * whether it landed, and the branches offered afterwards. A `Lesson` has
     * neither, and `validateLesson` is `.strict()`, so the extra keys are a
     * STRUCTURAL failure: "the thing is not a lesson". `deliverable` refuses to
     * salvage anything structural, correctly, and fell to its last rung -- the
     * honest sentence, with none of the model's words in it.
     *
     * MEASURED: the reply came back 200 and `partial: true`, and contained "I
     * could not put this one together properly" instead of the explanation the
     * model had written. Answering with nothing of hers is barely better than
     * the 502 this replaced.
     *
     * The four fields kept are exactly the four `judge` keeps when a concept
     * PASSES -- see `concept.ts` -- so the salvaged shape is the same shape the
     * gate already judged, and this cannot disagree with it.
     */
    /*
     * SUBTRACTIVE, NOT A WHITELIST.
     *
     * Listing the fields to KEEP dropped `subject` from every salvaged answer
     * -- so the route bar lost its subject chip -- and would drop the next
     * field added to `LessonSpec` just as silently, with no test to notice.
     *
     * What makes a concept not a lesson is the two keys it ADDS: `checkpoint`
     * and `next`. `validateLesson` is `.strict()`, so those two are the whole
     * of the structural failure. Removing exactly them, and keeping everything
     * else the model wrote, cannot fall behind the schema.
     */
    const asLesson = (value: unknown): unknown => {
      if (typeof value !== 'object' || value === null) return undefined
      const { checkpoint: _checkpoint, next: _next, ...rest } = value as Record<string, unknown>
      return { ...rest, relations: rest['relations'] ?? [] }
    }

    const shaped = parsed === undefined ? undefined : asLesson(parsed)
    const salvaged = shaped === undefined
      ? undefined
      : deliverable(shaped, written.issues, 'answer', question)
    if (salvaged !== undefined) {
      /* NOT REMEMBERED, DELIBERATELY. A salvaged answer is less than the route
         promised, so spending the route on it would deny her the good version
         of that same way in later. She keeps the route. */
      /* THE REAL ROUTE, NOT ''. Both clients read a non-empty `route` as "the
         server wrote a CONCEPT, judge it at 'answer'"; `''` meant 'lesson', and
         a salvaged answer refused by the arc rules it was salvaged from is the
         ladder failing at its last step. See `ConceptResult.route`. */
      /*
       * THE TUTOR TURN SURVIVES A SALVAGE, AND IT DID NOT.
       *
       * `checkpoint` and `next` were added to the SUCCESS branch only, so a
       * rescued answer arrived with neither: the reply ended and offered
       * nothing. That is the wrong way round. A learner who has just been told
       * "part of this did not pass the check" is the one who most needs a
       * question to test what did land and two named ways on -- the complete
       * answer is the one that can afford to end quietly.
       *
       * READ OFF `parsed`, NOT `written.concept`. On this branch the result is
       * `ok: false` and carries no concept; `parsed` is the same reply text
       * `deliverable` just salvaged the blocks from, so these are the model's
       * own checkpoint and branches for this very answer. Absent or malformed
       * simply means no turn -- `tutorTurnFrom` in `CanvasRoute` already treats
       * that as "nothing to show" rather than as an error.
       */
      const rescued = parsed as { checkpoint?: unknown; next?: unknown } | undefined
      /* SHE WAS SHOWN THIS WAY IN, SO IT IS SPENT. Measured 2026-09-02 by the
         gibberish law: most answers come back salvaged, because the model's
         first draft is imperfect most of the time -- and this path wrote
         nothing to her history, so asking the same thing again returned the
         same way in, forever.
         HER history only. The shared shelf stays clean: a salvaged lesson is
         worth serving to the person who waited for it and is not worth handing
         to somebody else as the real thing (see `offShelf` above). */
      try {
        options.explanations?.remember(owner, finalKey, {
          route: written.route,
          text: readableText(salvaged.lesson),
          at: new Date().toISOString(),
        })
      } catch {
        /* A failed write must not cost her the lesson; see the note below. */
      }
      return reply(200, {
        lesson: salvaged.lesson,
        route: written.route,
        partial: true,
        ...(typeof rescued?.checkpoint === 'string' ? { checkpoint: rescued.checkpoint } : {}),
        ...(Array.isArray(rescued?.next) ? { next: rescued.next } : {}),
        ...(strategy === undefined ? {} : { strategy }),
      })
    }

    /* The floor. Nothing of the model's survived a check that only removes, so
       there is genuinely nothing true to show -- and saying so is the honest
       last rung rather than a silent blank. */
    /* Redacted the same way `lessonFrom` redacts its 502: `judge` interpolates
       values from the model's reply into these messages, and a browser must
       never be handed the model's words through an error field. The operator
       already has the full text on the console above. */
    return reply(502, {
      error: 'the model returned a lesson that failed validation',
      issues: written.issues.map((issue) => ({
        path: issue.path,
        message: safeMessage(issue.message),
      })),
    })
  }

  /* C3: the ONE question the tutor was asked to end with, when it wrote one.
     `validateLesson` strips it from the lesson; the canvas shows it below. */
  function checkpointIn(produced: unknown): { checkpoint?: string } {
    const checkpoint = typeof produced === 'object' && produced !== null ? (produced as Record<string, unknown>)['checkpoint'] : undefined
    return typeof checkpoint === 'string' && checkpoint.trim() !== '' ? { checkpoint: checkpoint.trim() } : {}
  }

  /* QUESTIONS ARE RARE, AND THAT IS THE SOFTWARE'S RULE, NOT THE MODEL'S.
     A question goes out only when she said it did not land; a checkpoint the
     model wrote unasked stays with the model. */
  function questionOnlyIfAsked(request: LessonRequest, produced: unknown): { checkpoint?: string } {
    return typeof request.notUnderstood === 'string' && request.notUnderstood.trim() !== '' ? checkpointIn(produced) : {}
  }

  /* The lesson without the turn: `checkpoint` and `next` are the tutor's, not
     the lesson's, and the strict lesson schema refuses them. */
  function withoutTurn(produced: unknown): unknown {
    if (typeof produced !== 'object' || produced === null || Array.isArray(produced)) return produced
    const { checkpoint: _checkpoint, next: _next, ...rest } = produced as Record<string, unknown>
    void _checkpoint
    void _next
    return rest
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
    let latest: unknown = produced
    let result = validateLesson(withoutTurn(produced), { teaching })

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
      latest = again
      result = validateLesson(withoutTurn(again), { teaching })
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
      const rescued = deliverable(withoutTurn(latest), result.issues, teaching, questionIn(request))
      if (rescued !== undefined) {
        return reply(200, { ...decided, lesson: rescued.lesson, partial: true, ...questionOnlyIfAsked(request, latest) })
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
    return reply(200, { ...decided, lesson: result.lesson, ...questionOnlyIfAsked(request, latest) })
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

      /* 4. The floor: the honest sentence, and nothing of the model's.
         Said as `undefined` when even the note does not validate, never as
         `{ lesson: undefined }`: the cast that used to sit here turned that
         case into a 200 carrying no lesson at all. */
      const floor = served(noteOnly(question), 'answer')
      return floor === undefined ? undefined : { lesson: floor }
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
      setCookie: identityCookie(signIdentity(minted, options.identitySecret), {
        secure: options.secureCookies === true,
      }),
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
    /* THE SHADOW'S REPORT. Not a route at all while the shadow is off, so a
       server that never ran it shows nothing. Counts only; no student's words. */
    if (req.path === '/api/intelligence/report') {
      const mode = process.env['INTELLIGENCE_MODE'] ?? 'off'
      if (mode === 'off') return reply(404, { error: 'no such route' })
      if (req.method !== 'GET') return reply(405, { error: 'the report is read with GET' })
      return reply(200, { ...evaluateRuns(options.shadowRuns?.list() ?? []) })
    }
    if (req.path === HEALTH && req.method === 'GET') {
      /* Enough to diagnose, and nothing more. A health endpoint is the most
         public thing a server has and the most tempting place to leak from, so
         it names CAPABILITIES and never values: no key, no path, no student. */
      return reply(200, {
        ok: true,
        planner: options.almanac !== undefined,
        model: true,
        /* WHETHER a cloud is configured and whether a local model is, and not
           one word about WHICH. `model: true` alone could not say that the
           laptop was answering in place of a spent cloud budget, and that
           silence is the one thing a silent fallback must never add to --
           `cloud: false, local: true` says it and names nothing.
           This route carried `vendors: ['groq', 'ollama (qwen2.5:7b)']` from
           Part I until 2026-09-03, which named the vendor and the local model
           on the most public route the server has. `m7-control.test.ts` had
           always forbidden it; nobody had ever been able to run that file. */
        cloud: options.cloudConfigured ?? false,
        local: options.localConfigured ?? false,
      })
    }

    /* THE CANVAS'S MEMORY. Read with GET, written with PUT, and both named by
     * the same three parts -- student, tab, lesson. Placed before the POST gate
     * because neither verb is POST: a read changes nothing, and a write to a
     * named key is a PUT by definition.
     *
     * Every refusal below says what was wrong. A memory that will not save and
     * will not say why is how a student loses an afternoon and never finds out. */
    /* A TOPIC'S LEARNING HISTORY. Read with GET, added to with POST.
     *
     * SEPARATE FROM /api/memory, AND THE SEPARATION IS THE FIX. /api/memory
     * PUTs a whole record, which is right for progress and was catastrophic
     * for a canvas: an audit measured sixteen ways a term of learning could
     * vanish, and every one of them ran through "the client sent a shorter
     * canvas than the one on disk".
     *
     * There is no PUT here and no DELETE here. The only thing this route can
     * do to a canvas is make it longer. See the five laws in
     * `src/canvas/api/durability.laws.test.ts`.
     *
     * POST, NOT PUT, DELIBERATELY. PUT means "make the thing at this address
     * equal to this", which is exactly the operation being removed. POST means
     * "add this to the collection", which is exactly what happens.
     */
    /* MONITOR AFTER. Showing a lesson does not end its life: a canvas is
     * permanent, so a mistake that slipped past the checks made before it was
     * drawn sits in front of a student for months. This reads what she has
     * actually said and reports which of her own lessons something real has put
     * in question. Nothing is rewritten here and no model is asked -- see
     * `assurance.ts`, which states what it refuses to do and why. */
    const whatDeservesAnotherLook = (
      lessonId: string,
      artifacts: readonly { seq: number; artifact: unknown }[],
    ): readonly Suspicion[] => {
      if (options.evidence === undefined) return []
      /* The canvas is stored under `<topic>#canvas`; evidence is filed under
         the topic itself. */
      const topic = lessonId.replace(/#canvas$/, '')
      if (topic === '') return []
      const said = options.evidence.recall({ studentId: who.studentId, tabId: 'any', lessonId: topic }, topic)
      return needsAnotherLook({
        canvas: artifacts.map((row) => asOnCanvas(row.seq, row.artifact)),
        saidSince: said.flatMap((e) =>
          e.artifactSeq === undefined
            ? []
            : [{ artifactSeq: e.artifactSeq, beat: e.beat ?? '', kind: e.kind }],
        ),
        knowledgeVersion: 1,
      })
    }

    if (req.path === '/api/canvas') {
      if (options.memory === undefined) {
        return reply(503, { error: 'memory is not configured on this server' })
      }
      const canvasOwner = (tabId: unknown, lessonId: unknown): MemoryOwner => ({
        /* The signed identity, never the one in the body or the query. Same
         * rule, same reason, as /api/memory below. */
        studentId: who.studentId,
        tabId: typeof tabId === 'string' ? tabId : '',
        lessonId: typeof lessonId === 'string' ? lessonId : '',
      })

      if (req.method === 'GET') {
        const asked = new URLSearchParams(req.query ?? '')
        /*
         * `after`: THE HIGHEST SEQ THE BROWSER ALREADY HOLDS, so only what is
         * newer crosses the wire. Measured before this existed: a topic of 200
         * artifacts was 32,113 bytes on every open, forever.
         *
         * READ STRICTLY. A cursor this cannot read is refused with a 400, not
         * rounded to 0 (which would silently re-send everything) and not to
         * "nothing new" (which would look exactly like an empty canvas -- the
         * Law D failure this route exists to keep out). `seq` is a whole
         * number the database assigned, so that is the only shape accepted.
         */
        const cursor = asked.get('after')
        if (cursor !== null && !/^(?:0|[1-9]\d*)$/.test(cursor)) {
          return reply(400, { error: 'after must be the whole number of artifacts already held, or absent' })
        }
        const after = cursor === null ? 0 : Number(cursor)
        try {
          /* THE WHOLE CANVAS IS STILL READ HERE, and that is deliberate: what
           * deserves another look is a judgement about the canvas as a whole --
           * lesson 41 can put lesson 1 in question -- so it is never computed
           * over a slice. Only the payload is cut to what she has not got. */
          const whole = options.memory.list(canvasOwner(asked.get('tabId'), asked.get('lessonId')))
          const artifacts = after === 0 ? whole : whole.filter((row) => row.seq > after)
          /* An empty history is a real answer -- she has not opened this topic
           * yet. It is NOT the same answer as "this could not be read", and
           * keeping those two apart is Law D. A failure leaves here as a
           * non-200 and never as an empty list. */
          return reply(200, {
            artifacts,
            needsAnotherLook: whatDeservesAnotherLook(asked.get('lessonId') ?? '', whole),
            /* WHO THIS CANVAS BELONGS TO, as an opaque tag the browser can hold
             * beside what it cached. A shared school computer keeps one
             * localStorage for every student who sits down; the browser uses a
             * cached canvas only when the server says the same tag back, and a
             * different student -- a different cookie -- gets a different tag,
             * so what A left in the browser is never shown to B. Keyed and
             * domain-separated from the cookie signature: it is not a
             * credential and cannot be turned into one. */
            student: createHmac('sha256', options.identitySecret).update(`canvas-cache:${who.studentId}`).digest('hex').slice(0, 16),
          })
        } catch (thrown) {
          if (thrown instanceof BadMemoryKey) return reply(400, { error: thrown.message })
          throw thrown
        }
      }

      if (req.method === 'POST') {
        if (!isPlainObject(req.body)) {
          return reply(400, { error: 'body must be a JSON object' })
        }
        const asked = req.body
        try {
          const stored = options.memory.append(
            canvasOwner(asked['tabId'], asked['lessonId']),
            asked['artifact'],
          )
          return reply(200, { appended: stored })
        } catch (thrown) {
          if (thrown instanceof BadMemoryKey) return reply(400, { error: thrown.message })
          if (thrown instanceof NotStorable) return reply(400, { error: thrown.message })
          throw thrown
        }
      }

      return reply(405, { error: 'a canvas is read with GET and added to with POST' })
    }

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

    if (req.path === '/api/situation') {
      /* THE SITUATION DOCUMENT: what this student's visit should know on
       * arrival. Today that is her open loops -- the questions this product
       * still owes an answer -- served under the same identity rule as
       * /api/memory: `who` came from a signature this server produced, and the
       * caller gets no say in whose situation it reads or writes. */
      if (options.loops === undefined) {
        return reply(503, { error: 'the situation is not configured on this server' })
      }

      if (req.method === 'GET') {
        return reply(200, { openLoops: options.loops.list(who.studentId) })
      }

      if (req.method === 'PUT') {
        if (!isPlainObject(req.body)) {
          return reply(400, { error: 'body must be a JSON object' })
        }
        const asked = req.body
        const question = asked['question']
        if (typeof question !== 'string' || question.trim() === '') {
          return reply(400, { error: 'question is required' })
        }

        if (asked['resolved'] === true) {
          options.loops.close(who.studentId, question)
          return reply(200, { closed: true })
        }

        const stalled = asked['stalled']
        if (stalled !== 'refused' && stalled !== 'failed') {
          /* The chain's own two words, and only those. Anything else is a
           * caller inventing a third state this ledger would then have to
           * mean something by. */
          return reply(400, { error: "stalled must be 'refused' or 'failed'" })
        }
        options.loops.open(
          who.studentId,
          {
            question,
            lesson: typeof asked['lesson'] === 'string' ? asked['lesson'] : '',
            stalled,
          },
          new Date().toISOString(),
        )
        return reply(200, { opened: true })
      }

      return reply(405, { error: 'the situation is read with GET and written with PUT' })
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

      /*
       * THE SCREEN THE `START` BUTTON OPENS TAKES THE PATH MEASURED AT 0 OF 6.
       *
       * `/api/ask` was moved onto `authorConcept` because a whole lesson in one
       * call is "a request shaped to be unaffordable" -- the note beside that
       * route counts it: five 502s at the twenty-second ceiling and a 429 when
       * the ceiling was raised, against 3 of 3 taught per concept. Everything
       * since has been built on that path: the route rotation, the stored
       * history, the salvage ladder that stops a refusal reaching a learner as
       * a blank screen.
       *
       * `/api/lesson` was left behind, and it is the route the PRODUCT uses.
       * `LearnView` posts here when a learner presses `Start` on today's work,
       * so the one screen a planned lesson opens through got none of it.
       *
       * MEASURED, in the browser, minutes ago: pressing `Start` on "Fundamental
       * Theorem of Arithmetic" spent twenty seconds on "Writing this lesson for
       * you…" and ended on
       * `the model returned a lesson that failed validation` -- a 502, on the
       * main path, while `/api/ask` was answering the same model in about two
       * seconds.
       *
       * ONLY A FRESH CONCEPT, and only when the provider has `chat`. A
       * CONTINUATION carries `taught` and `justSaid`, and the next step of a
       * lesson in progress must be written against what she has already read --
       * which is what `briefFor` does and `authorConcept` has no parameter for.
       * That is the same boundary `/api/ask` draws, for the same reason, and
       * anything it does not cover falls through to `lessonFrom` below exactly
       * as it always has.
       */
      if (options.model.chat !== undefined && !nonEmptyString(body['taught'])) {
        const spent = Array.isArray(body['alreadyUsed'])
          ? (body['alreadyUsed'] as unknown[]).filter((r): r is string => typeof r === 'string')
          : []
        /* The CONCEPT is the question here -- "Fundamental Theorem of
           Arithmetic" -- where `/api/ask` carries what she typed. Both are the
           thing being taught, which is what the history is keyed by. */
        /* The plan's own bucket, and the plan's own teaching decision -- both
           made here, exactly where `lessonFrom` below makes them. */
        return await conceptFor(
          body['concept'],
          spent,
          who,
          'lesson',
          chooseStrategy({
            attempts: typeof body['attempts'] === 'number' ? body['attempts'] : 0,
            carriedFrom: nonEmptyString(body['carriedFrom']) ? body['carriedFrom'] : undefined,
            diagnosis: typeof body['diagnosis'] === 'string' ? body['diagnosis'] : undefined,
          }),
        )
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
      /* "HI" IS NOT A LESSON, AND NOT A MODEL CALL. See `smallTalk.ts`. Only
         for a message with no lesson around it: inside a lesson, "ok" is an
         answer and the model must read it. Answered as `clarify`, which is what
         it is -- a sentence back and the box to type in. */
      if (!nonEmptyString(body['askedInside'])) {
        const talk = smallTalk(body['question'])
        if (talk !== null) {
          const answered = reply(200, { clarify: true, question: SMALL_TALK_REPLY[talk] })
          observeInShadow({ question: body['question'], topicId: null, classId: null, examId: null, alreadyUsed: [], askedFrom: 'ask', studentId: who.studentId }, { status: answered.status, body: answered.body })
          return answered
        }
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
        /* D4: WHICH CONCEPT SHE IS ASKING ABOUT, by meaning rather than by
           the words typed. The reply names it so the canvas and a person can
           both see what was reused; `how` says whether it is the same idea in
           new words, a related one, or new ground. */
        const resolved = options.concepts === undefined
          ? null
          : await options.concepts.resolve({ studentId: who.studentId, tabId: 'any', lessonId: 'concepts' }, body['question'])
        if (resolved !== null) {
          console.log(`[concept] ${resolved.how} ${resolved.id}${resolved.how === 'new' ? '' : ` (${resolved.nearness.toFixed(2)})`}`)
        }
        const shadowTopic = nonEmptyString(body['topicId']) ? body['topicId'] : null
        const shadowRequest = {
          question: body['question'],
          topicId: shadowTopic,
          ...(nonEmptyString(body['topicName']) ? { topicName: body['topicName'] } : {}),
          ...(shadowTopic === null || options.evidence === undefined ? {} : { experience: experienceOf(options.evidence.recall({ studentId: who.studentId, tabId: 'any', lessonId: shadowTopic }, shadowTopic)) }),
          classId: nonEmptyString(body['classId']) ? body['classId'] : null,
          examId: nonEmptyString(body['examId']) ? body['examId'] : null,
          alreadyUsed: spent,
          askedFrom: 'ask',
          studentId: who.studentId,
        }
        /* CANARY / PRIMARY: the candidate is asked first and served only when
           its lesson is verified; otherwise the live brain answers below,
           inside this same request. The client appends what it is served. */
        let alreadyProposed: Proposal | undefined
        if (candidateTakes(process.env, who.studentId)) {
          const fromCandidate = await serveFromCandidate(shadowRequest, { candidate: theCandidate, budgetMs: CANDIDATE_BUDGET_MS, now: Date.now, ...(theCritic === undefined ? {} : { critic: theCritic }) })
          if (fromCandidate.served) {
            const body200 = resolved === null ? fromCandidate.body : { ...fromCandidate.body, concept: resolved }
            observeInShadow(shadowRequest, { status: 200, body: body200, served: 'candidate', candidateProposal: fromCandidate.proposal })
            return reply(200, body200)
          }
          shadowLog(`[canary] the live brain answers instead: ${fromCandidate.because}`)
          alreadyProposed = fromCandidate.proposal
        }
        const answered = await conceptFor(body['question'], spent, who, 'ask', undefined, {
          classId: nonEmptyString(body['classId']) ? body['classId'] : null,
          examId: nonEmptyString(body['examId']) ? body['examId'] : null,
        })
        observeInShadow(shadowRequest, { status: answered.status, body: answered.body, ...(alreadyProposed === undefined ? {} : { candidateProposal: alreadyProposed }) })
        return resolved === null || answered.status !== 200
          ? answered
          : { ...answered, body: { ...answered.body, concept: resolved } }
      }

      /* C3: WHAT SHE TYPED INSIDE THE LESSON IS EVIDENCE, and a plea changes
         what the tutor is asked for. Filed under the topic when the canvas
         names one; the reply names the student so the caller can see the file. */
      const said = nonEmptyString(body['justSaid']) ? body['justSaid'].trim() : ''
      const plea = said !== '' && isPlea(said)
      if (said !== '' && nonEmptyString(body['topicId'])) {
        options.evidence?.record({ studentId: who.studentId, tabId: 'any', lessonId: body['topicId'] }, body['topicId'], {
          said,
          kind: plea ? 'plea' : said.includes('?') ? 'question' : 'answer',
          at: new Date().toISOString(),
          ...(nonEmptyString(body['beat']) ? { beat: body['beat'] } : {}),
        })
        console.log(`[evidence] ${plea ? 'plea' : 'answer'} filed under ${body['topicId']}`)
      }
      /* C4: A PLEA AT A BEAT THAT WARNED HER is evidence -- low, revisable --
         that she holds the belief it warned against. The tutor is told what
         she may hold so the next part repairs it, not merely restates. */
      let mayHold: readonly string[] = []
      if (nonEmptyString(body['topicId']) && options.misconceptions !== undefined) {
        const owner = { studentId: who.studentId, tabId: 'any', lessonId: 'anything' }
        if (plea && Array.isArray(body['suspects'])) {
          for (const suspect of body['suspects']) {
            if (typeof suspect !== 'string' || suspect.trim() === '') continue
            options.misconceptions.observe(owner, {
              concept: body['topicId'],
              observed: suspect.trim(),
              evidence: { said, at: new Date().toISOString(), ...(nonEmptyString(body['beat']) ? { beat: body['beat'] } : {}) },
            })
            console.log(`[misconception] observed "${suspect.trim().slice(0, 60)}" under ${body['topicId']}`)
          }
        }
        if (plea) mayHold = options.misconceptions.activeFor(owner, body['topicId']).map((h) => h.observed)
      }

      /* D1/D2: WHAT WENT WRONG IS GUESSED AT BEFORE ANYTHING IS WRITTEN, and
         the guess chooses HOW to teach -- which is the thing the audit found
         computed on every lesson and never put in a prompt. The moves already
         spent on this topic are read back from the evidence, so the same
         failed explanation is never served twice however it is worded. */
      let decided: { diagnosis?: string; strategy?: Strategy } = {}
      let teachFirst: readonly { readonly id: string; readonly name: string }[] = []
      if (plea) {
        const filed = nonEmptyString(body['topicId']) && options.evidence !== undefined
          ? options.evidence.recall({ studentId: who.studentId, tabId: 'any', lessonId: body['topicId'] }, body['topicId'])
          : []
        const spentHere = filed.flatMap((one) => (typeof one.strategy === 'string' ? [one.strategy] : []))
        const ranked = diagnose({
          concept: nonEmptyString(body['topicId']) ? body['topicId'] : (body['question'] as string),
          evidence: filed.length > 0 ? filed : [{ said, kind: 'plea', at: new Date().toISOString() }],
          mayHold,
          taught: nonEmptyString(body['taught']) ? body['taught'] : '',
          attempts: spentHere.length,
          alreadyUsed: spentHere,
        })
        const top = ranked[0]
        if (top !== undefined) {
          const strategy = chooseStrategy({ diagnosis: top.diagnosis, attempts: spentHere.length, alreadyUsed: spentHere })
          decided = { diagnosis: top.diagnosis, strategy }
          /* D3: THE CURRICULUM IS A PRIOR. It lists what comes first; her own
             evidence decides whether any of it is actually stopping her. A
             prerequisite she has answered on is never queued for reteaching. */
          if (top.diagnosis === 'prerequisite_gap' && Array.isArray(body['prerequisites']) && options.evidence !== undefined) {
            const listed = body['prerequisites'].flatMap((one): Listed[] => {
              if (typeof one !== 'object' || one === null) return []
              const it = one as { id?: unknown; name?: unknown }
              return typeof it.id === 'string' && typeof it.name === 'string' ? [{ id: it.id, name: it.name }] : []
            })
            const known = { taught: [] as string[], answered: [] as string[], pleaded: [] as string[] }
            for (const one of listed) {
              const seen = options.evidence.recall({ studentId: who.studentId, tabId: 'any', lessonId: one.id }, one.id)
              if (seen.length > 0) known.taught.push(one.id)
              if (seen.some((turn) => turn.kind === 'answer')) known.answered.push(one.id)
              if (seen.some((turn) => turn.kind === 'plea')) known.pleaded.push(one.id)
            }
            const blockers = blocking(listed, known).map((one) => ({ id: one.id, name: one.name }))
            if (blockers.length > 0) {
              teachFirst = blockers
              console.log(`[prerequisite] blocking: ${blockers.map((one) => one.id).join(', ')}`)
            }
          }
          console.log(`[diagnosis] ${top.diagnosis} (${top.confidence.toFixed(2)}) -> ${strategy}: ${top.because}`)
          if (nonEmptyString(body['topicId'])) {
            options.evidence?.remember?.({ studentId: who.studentId, tabId: 'any', lessonId: body['topicId'] }, body['topicId'], strategy)
          }
        }
      }
      const taughtReply = await lessonFrom({
        question: body['question'],
        ...(nonEmptyString(body['askedInside']) ? { askedInside: body['askedInside'] } : {}),
        /* THE NEXT PART OF A LESSON IN PROGRESS, when the browser sends what
         * has already been taught. Without these the model writes a whole
         * lesson in one go and the learner is handed a chapter she did not ask
         * for; with them it writes ONE step, after reading what she just said.
         * See `briefFor` and invariant I3. */
        ...(nonEmptyString(body['taught']) ? { taught: body['taught'] } : {}),
        ...(said !== '' ? { justSaid: said } : {}),
        ...(plea ? { notUnderstood: said } : {}),
        ...(mayHold.length > 0 ? { mayHold } : {}),
        ...(decided.strategy === undefined ? {} : { strategy: decided.strategy }),
        /* One at a time: the tutor is told the hardest blocker only. */
        ...(teachFirst.length > 0 ? { teachFirst: teachFirst.slice(0, 1) } : {}),
      }, 'answer')
      return taughtReply.status === 200
        ? { ...taughtReply, body: { ...taughtReply.body, studentId: who.studentId, ...decided, ...(teachFirst.length > 0 ? { teachFirst } : {}) } }
        : taughtReply
    }

    /* C3: A TURN INSIDE A LESSON IS EVIDENCE. What she typed, filed under the
       topic as what it observably is -- a plea, an answer, a question, or
       nothing -- and never as a mark. The reply names the kind and the student
       so the caller can see what was filed. */
    if (req.path === '/api/evidence') {
      if (!nonEmptyString(body['topicId'])) return reply(400, { error: 'topicId is required' })
      if (typeof body['said'] !== 'string') return reply(400, { error: 'said is required' })
      const said = body['said'].trim()
      const kind: 'plea' | 'answer' | 'question' | 'empty' =
        said === '' ? 'empty' : isPlea(said) ? 'plea' : said.includes('?') ? 'question' : 'answer'
      const owner = { studentId: who.studentId, tabId: 'any', lessonId: body['topicId'] }
      options.evidence?.record(owner, body['topicId'], {
        said,
        kind,
        at: new Date().toISOString(),
        ...(nonEmptyString(body['beat']) ? { beat: body['beat'] } : {}),
        /* WHICH LESSON ON HER CANVAS she was reading. `assurance.ts` needs it
           to tell "lost three times in one lesson" -- which questions the
           teaching -- from "lost once in each of three lessons", which is an
           ordinary hard week. */
        ...(typeof body['artifactSeq'] === 'number' ? { artifactSeq: body['artifactSeq'] } : {}),
      })
      return reply(200, { kind, studentId: who.studentId })
    }
    /* G3: WHAT SHOULD SHE DO NEXT. The canvas knows the curriculum and sends
       it; the server knows what she has shown and ranks it. Derived every
       time, never stored: a schedule goes stale the moment she learns
       something. See `priority.ts`. */
    if (req.path === '/api/next') {
      const sent = body['syllabus']
      if (typeof sent !== 'object' || sent === null || !Array.isArray((sent as { topics?: unknown }).topics)) {
        return reply(400, { error: 'syllabus is required' })
      }
      const syllabus = sent as Syllabus
      const seen = new Map(
        syllabus.topics.map((topic) => [
          topic.id,
          options.evidence?.recall({ studentId: who.studentId, tabId: 'any', lessonId: topic.id }, topic.id) ?? [],
        ]),
      )
      return reply(200, { next: whatToDoNext(syllabus, seen), studentId: who.studentId })
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

    /* /api/search
     *
     * A PASSTHROUGH TO THE OPEN-WEB PIPELINE, NOT A SECOND SEARCH.
     *
     * This route used to map `options.search` hits into a `results` shape that
     * NOTHING read: `webSearchClient.askTheRoute` parses `pages` and treats any
     * other reply as a broken route, so every production answer from here was
     * discarded and the browser fell back to Wikipedia. The dev server has
     * always answered through `searchTheOpenWeb` (vite-plugin-search.ts), which
     * plans queries, fetches pages, runs the injection guard and marks
     * `suspicious` -- so the honest production route is the SAME function, and
     * dev and prod cannot drift apart again.
     *
     * `options.search` is untouched by this: it is the GROUNDING port for
     * lesson authoring (see the race above `lookUp`), a different job with a
     * different shape.
     *
     * The core validates the body itself -- 400 for a missing question, 503
     * naming the unset variable, 413 for an oversized one -- and this route
     * forwards those verdicts rather than pre-judging them, so validation has
     * exactly one owner.
     */
    if (options.openWeb === undefined) {
      return reply(503, {
        pages: [],
        engineFailed: true,
        engineError: 'web search is not configured on this server',
        /* Both spellings on purpose: `engineError` is the browser client's
         * contract, `error` is the refusal convention every other route
         * follows and M7 checks. One sentence, two doors. */
        error: 'web search is not configured on this server',
      })
    }

    let webReply: OpenWebReply
    try {
      webReply = await options.openWeb(JSON.stringify(body))
    } catch {
      /* The thrown message is NOT forwarded: the search layer holds a
       * credential, and an error string is exactly where one leaks. The
       * scrubbed sentence below is the whole story a browser needs. */
      return reply(502, {
        pages: [],
        engineFailed: true,
        engineError: 'search could not be reached',
        error: 'search could not be reached',
      })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(webReply.body)
    } catch {
      return reply(502, {
        pages: [],
        engineFailed: true,
        engineError: 'the search layer answered something that was not JSON',
        error: 'the search layer answered something that was not JSON',
      })
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return reply(502, {
        pages: [],
        engineFailed: true,
        engineError: 'the search layer answered something that was not JSON',
        error: 'the search layer answered something that was not JSON',
      })
    }
    return reply(webReply.status, parsed as Record<string, unknown>)
  }

  /* THE LESSON AS IT IS WRITTEN, FOR A CALLER THAT ASKED FOR IT.
   *
   * Everything the plain route does still happens -- the identity, the
   * controller, the veto, the shelf, authoring, validation, repair, the memory
   * writes -- through the very same `route`. The only difference is that it
   * runs inside an async context that carries `onDelta`, so the authoring
   * model streams its first attempt into `lessonStream`, and those events are
   * yielded as they come. When `route` settles, its reply -- whatever status
   * it would have sent -- is the last event. Nothing is answered twice and
   * nothing is answered differently. */
  async function routeMaybeStreaming(req: ServerRequest, who: Identified): Promise<ServerResponse> {
    const asked =
      req.path === '/api/ask' &&
      req.method === 'POST' &&
      /text\/event-stream/i.test(req.accept ?? '') &&
      options.model.chatStream !== undefined
    if (!asked) return route(req, who)

    const scanner = lessonStream()
    const queue: StreamEvent[] = []
    const askedAt = Date.now()
    let firstWordAt: number | null = null
    let wake: (() => void) | null = null
    const push = (events: readonly StreamEvent[]): void => {
      queue.push(...events)
      const waiting = wake
      wake = null
      waiting?.()
    }
    let settled: ServerResponse | null = null
    void streaming.run(
      (text: string) => {
        if (firstWordAt === null) {
          firstWordAt = Date.now()
          console.log(`[timing] first streamed word after ${firstWordAt - askedAt}ms`)
        }
        push(scanner.push(text))
      },
      () => route(req, who),
    ).then(
      (response) => {
        settled = response
        push([])
      },
      (error: unknown) => {
        console.error('[almanac] unhandled error while streaming a lesson:', error)
        settled = reply(500, { error: 'internal error' })
        push([])
      },
    )
    async function* events(): AsyncGenerator<StreamEvent> {
      for (;;) {
        while (queue.length > 0) yield queue.shift()!
        if (settled !== null) {
          yield { type: 'done', reply: { status: settled.status, body: settled.body } }
          return
        }
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    }
    return { status: 200, body: {}, stream: events() }
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
      : await routeMaybeStreaming(req, who)

    return who.setCookie === undefined ? response : { ...response, setCookie: who.setCookie }
  }
}

/**
 * A stored artifact as `assurance.ts` needs to see it.
 *
 * `says` is every word of the lesson flattened, because the content signals ask
 * questions about what a lesson SAYS and the block structure is beside the
 * point for that. Anything unreadable becomes an empty lesson, which no signal
 * fires on -- a damaged row is a problem for the page that draws it, not a
 * reason to suspect the teaching.
 */
function asOnCanvas(seq: number, stored: unknown): OnCanvas {
  const row = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>
  const kinds = new Set(['scope', 'lesson', 'answer', 'correction', 'note'])
  const states = new Set(['verified', 'suspect', 'corrected'])
  return {
    seq,
    kind: kinds.has(String(row['kind'])) ? (row['kind'] as OnCanvas['kind']) : 'lesson',
    question: typeof row['question'] === 'string' ? row['question'] : '',
    state: states.has(String(row['state'])) ? (row['state'] as OnCanvas['state']) : 'verified',
    /* The pages this lesson was grounded on, when it recorded any. Older
       artifacts have none, and a lesson with no sources simply cannot trip the
       source-changed signal -- which is correct, not a gap. */
    ...(Array.isArray(row['sources'])
      ? { sources: (row['sources'] as unknown[]).filter((u): u is string => typeof u === 'string') }
      : {}),
    ...(typeof row['knowledgeVersion'] === 'number' ? { knowledgeVersion: row['knowledgeVersion'] } : {}),
    says: everyWordOf(row['payload']),
  }
}

/** Every string in a lesson, joined. Depth-limited: a lesson is a document. */
function everyWordOf(payload: unknown, depth = 0): string {
  if (depth > 6) return ''
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return payload.map((x) => everyWordOf(x, depth + 1)).join(' ')
  if (typeof payload === 'object' && payload !== null) {
    return Object.values(payload).map((x) => everyWordOf(x, depth + 1)).join(' ')
  }
  return ''
}
