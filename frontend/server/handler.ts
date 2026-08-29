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

import { validateLesson, type TeachingLevel } from '../src/canvas/spec/validate.ts'
import { chooseStrategy, type Strategy } from './teaching.ts'
import { injectionSignals, stripInvisible } from '../src/websearch/guard.ts'
import { citationSupports } from '../src/websearch/quality.ts'
import { subjectsFor, SUPPORTED_CLASSES, type SchoolClass } from './almanac/curriculum.ts'
import type { Ledger } from './almanac/ledger.ts'

export interface LessonRequest {
  readonly concept?: string
  readonly subject?: string
  readonly question?: string
  /** How to teach it. Chosen here, never accepted from the request. */
  readonly strategy?: Strategy
}

export interface ModelPort {
  lesson(request: LessonRequest): Promise<unknown>
}

export interface SearchResult {
  readonly url: string
  readonly content: string
}

export interface SearchPort {
  search(query: string): Promise<readonly SearchResult[]>
}

/**
 * The bridge to the Python doubt engine.
 *
 * A PORT, LIKE THE MODEL AND THE SEARCH, AND FOR THE SAME REASON. The engine is
 * a subprocess with a venv and an interpreter to find; injecting it keeps every
 * error path here testable without one, and keeps the one implementation of the
 * bridge — `askEngine` in `doubtEngine.ts` — shared with the dev middleware
 * instead of copied into it.
 *
 * It returns the engine's own status and its raw JSON text, both untouched. The
 * status map is `ask.py`'s and not this server's: a refusal is 200, because the
 * engine exits zero for every OUTCOME.
 */
export interface DoubtPort {
  ask(request: string): Promise<{ readonly status: number; readonly body: string }>
}

export interface ServerRequest {
  readonly method: string
  readonly path: string
  readonly body?: unknown
  /** Byte length of the raw body, when the transport knows it. */
  readonly rawLength?: number
}

export interface ServerResponse {
  readonly status: number
  readonly body: Record<string, unknown>
}

export interface HandlerOptions {
  readonly model: ModelPort
  readonly search: SearchPort
  /** Almanac's memory. Absent means the day routes answer 503, never a guess. */
  readonly almanac?: Ledger
  /**
   * The doubt engine. Absent means `/api/doubt` answers 503 with a document the
   * browser can read, never a 404 — a 404 is indistinguishable from the defect
   * this route exists to fix, which is the route not being deployed at all.
   */
  readonly doubt?: DoubtPort
  /** Strings that must never appear in a response, whatever produced them. */
  readonly secrets?: readonly string[]
  readonly maxBodyBytes?: number
}

/** 256 KB is far above any real request and far below anything that hurts. */
const DEFAULT_MAX_BODY_BYTES = 256 * 1024

const ROUTES = new Set(['/api/lesson', '/api/ask', '/api/search', '/api/doubt', '/api/day', '/api/done', '/api/health'])

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
      produced = await options.model.lesson(request)
    } catch {
      /* The upstream message is deliberately dropped rather than forwarded: it
       * routinely contains the credential that was rejected. The failure is
       * reported; its text is not. */
      return reply(502, { ...decided, error: 'the model could not be reached' })
    }

    const result = validateLesson(produced, { teaching })
    if (!result.ok) {
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

  return async function handle(req: ServerRequest): Promise<ServerResponse> {
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
      return lessonFrom({ question: body['question'] }, 'answer')
    }

    if (req.path === '/api/doubt') {
      /* NO FIELD VALIDATION HERE, DELIBERATELY, AND IT IS THE ONE ROUTE LIKE
       * THAT. Every other route above guards its fields because it owns them.
       * The doubt engine owns this one: `ask.py` answers a blank question with
       * its own `bad_request` document and exit zero. A second validator here
       * would answer the same request with a different status, and the two
       * would drift the first time either changed. */
      if (options.doubt === undefined) {
        /* 503 AND A DOCUMENT, NOT 404. `engineResolver.ts:170` throws on any
         * non-ok status and reads the body of what it threw on; a bare 404 is
         * exactly what the undeployed route already produces, so answering with
         * one would hide the very failure this route closes. */
        return reply(503, {
          outcome: 'unavailable',
          refusal: 'the doubt engine is not configured on this server',
        })
      }

      let engine: { readonly status: number; readonly body: string }
      try {
        engine = await options.doubt.ask(JSON.stringify(body))
      } catch {
        /* THE REASON IS DROPPED ON PURPOSE. A bridge failure message can carry
         * an interpreter path, an environment value or a key, and this response
         * goes to a browser. `scrub` is the last line of defence and not the
         * first; not putting it in the document is the first. */
        return reply(503, {
          outcome: 'unavailable',
          refusal: 'the doubt engine could not be reached',
        })
      }

      let document: unknown
      try {
        document = JSON.parse(engine.body)
      } catch {
        return reply(502, {
          outcome: 'engine_error',
          refusal: 'the engine returned something that is not JSON',
        })
      }
      if (!isPlainObject(document)) {
        return reply(502, {
          outcome: 'engine_error',
          refusal: 'the engine returned something that is not an object',
        })
      }
      /* The engine's status, carried through untouched. See the port's note. */
      return reply(engine.status, document)
    }

    if (req.path === '/api/day') {
      if (options.almanac === undefined) {
        return reply(503, { error: 'the planner is not configured on this server' })
      }
      if (!nonEmptyString(body['studentId'])) return reply(400, { error: 'studentId is required' })
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
        studentId: body['studentId'],
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
      if (!nonEmptyString(body['studentId'])) return reply(400, { error: 'studentId is required' })
      if (!nonEmptyString(body['conceptId'])) return reply(400, { error: 'conceptId is required' })

      /* The ONLY thing in this server that marks work finished. */
      await options.almanac.markDone(body['studentId'], body['conceptId'])
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
}
