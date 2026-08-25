/* The browser's side of the Almanac wire.
 *
 * WHY A CLIENT AND NOT AN IMPORT
 *   Almanac runs on the server because it holds the API key, and the
 *   secret-exposure gate refuses any import from `src/` into `server/`. The
 *   network IS the boundary here, so the wire shapes are declared on this side
 *   too. `server/day-contract.test.ts` drives the real handler through this
 *   parser, so the two descriptions cannot drift apart quietly.
 *
 * THE RULE THIS FILE EXISTS TO KEEP
 *   A failure NEVER produces a day. "Nothing to study today" and "I could not
 *   ask the planner" are different answers, and a screen that cannot tell them
 *   apart will one day tell a student they are finished when the truth is that
 *   the server is down.
 */

import { schoolClassOf } from './school-class'

/** One thing to study. `carriedFrom` present means it is backlog: it first
 *  appeared on an earlier day and was never marked done. */
export interface PlannedItem {
  readonly conceptId: string
  readonly subjectId: string
  readonly chapterId: string
  readonly minutes: number
  readonly carriedFrom?: string
}

export interface DayPlan {
  readonly date: string
  readonly items: readonly PlannedItem[]
  readonly allocated: number
  readonly capacity: number
}

export interface DayRequest {
  readonly studentId: string
  readonly date: string
  readonly schoolClass: number
  readonly dailyMinutes: number
  readonly subjectIds: readonly string[]
}

export type DayResult = { ok: true; day: DayPlan } | { ok: false; reason: string }

/** What the browser knows about this student and this concept. The server
 *  turns it into a teaching strategy; the browser never picks one. */
export interface LessonRequest {
  readonly concept: string
  readonly subject?: string
  /** How many times this concept has been opened, including this one. */
  readonly attempts?: number
  /** Set when it was carried over from an earlier day unfinished. */
  readonly carriedFrom?: string
  /** A named failure, when the screen has watched one happen. */
  readonly diagnosis?: string
}

export type LessonResult =
  | { ok: true; lesson: unknown; strategy?: string }
  | { ok: false; reason: string }

/** A free question, answered as prose. Shaped for the teaching screen's
 *  escalation path, which must never end in a refusal. */
export type AskResult = { ok: true; text: string } | { ok: false; reason: string }
export type DoneResult = { ok: true } | { ok: false; reason: string }

export interface AlmanacClient {
  day(request: DayRequest): Promise<DayResult>
  markDone(studentId: string, conceptId: string): Promise<DoneResult>
  lesson(request: LessonRequest): Promise<LessonResult>
  ask(question: string): Promise<AskResult>
  /** The same free question, answered as a full lesson rather than as prose,
   *  so the ask-anything screen teaches exactly like the concept screen. */
  lessonForQuestion(question: string): Promise<LessonResult>
}

/** Only what this file uses, so a test double is a couple of lines rather than
 *  a whole `fetch`. */
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

const UNREACHABLE = 'the planner could not be reached'

/* Classes Almanac has curriculum for live in `school-class.ts`, alongside the
 * reader that understands the form a student record ACTUALLY stores. */

/** Used when a student finished setup without choosing a daily budget. Two
 *  hours is the same default the dashboard already shows. */
export const DEFAULT_DAILY_MINUTES = 120

function isPlannedItem(value: unknown): value is PlannedItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item['conceptId'] === 'string' &&
    typeof item['subjectId'] === 'string' &&
    typeof item['chapterId'] === 'string' &&
    typeof item['minutes'] === 'number' &&
    (item['carriedFrom'] === undefined || typeof item['carriedFrom'] === 'string')
  )
}

/**
 * A 200 is not a promise that the body is a day.
 *
 * A proxy, a captive portal, a login page and a future API change all answer
 * 200 with something else entirely. Trusting the status code alone is how
 * `undefined.items` ends up rendering in front of a student.
 */
function isDayPlan(value: unknown): value is DayPlan {
  if (typeof value !== 'object' || value === null) return false
  const day = value as Record<string, unknown>
  return (
    typeof day['date'] === 'string' &&
    Array.isArray(day['items']) &&
    day['items'].every(isPlannedItem) &&
    typeof day['allocated'] === 'number' &&
    typeof day['capacity'] === 'number'
  )
}

/** The server's own message when it gave one; it is more specific than
 *  anything this side could invent. */
async function reasonFrom(response: { status: number; json(): Promise<unknown> }): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body === 'object' && body !== null) {
      const error = (body as Record<string, unknown>)['error']
      if (typeof error === 'string' && error.length > 0) return error
    }
  } catch {
    /* An unreadable body is not a reason to lose the status code, which is the
     * only fact left. Fall through to it. */
  }
  return `the planner answered ${response.status}`
}

export function createAlmanacClient(options: { fetchImpl?: FetchLike; baseUrl?: string } = {}): AlmanacClient {
  const call = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const base = options.baseUrl ?? ''

  async function post(path: string, body: unknown): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
    let response
    try {
      response = await call(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      /* Assigns a result and returns: the failure changes what happens next
       * rather than being noted and stepped over. */
      return { ok: false, reason: UNREACHABLE }
    }
    if (!response.ok) return { ok: false, reason: await reasonFrom(response) }
    try {
      return { ok: true, body: await response.json() }
    } catch {
      return { ok: false, reason: 'the planner sent a reply that could not be read' }
    }
  }

  return {
    async day(request) {
      const sent = await post('/api/day', request)
      if (!sent.ok) return sent
      const day = (sent.body as Record<string, unknown> | null)?.['day']
      if (!isDayPlan(day)) return { ok: false, reason: 'the planner returned something that is not a day' }
      return { ok: true, day }
    },

    async lesson(request) {
      /* Only the four fields the server reads. Notably NOT `strategy`: the
       * teaching decision is the server's, and forwarding a field the caller
       * set would let a page choose "transfer_challenge" for a student meeting
       * a topic for the first time. */
      const sent = await post('/api/lesson', {
        concept: request.concept,
        ...(request.subject === undefined ? {} : { subject: request.subject }),
        ...(request.attempts === undefined ? {} : { attempts: request.attempts }),
        ...(request.carriedFrom === undefined ? {} : { carriedFrom: request.carriedFrom }),
        ...(request.diagnosis === undefined ? {} : { diagnosis: request.diagnosis }),
      })
      if (!sent.ok) return sent

      const body = sent.body as Record<string, unknown> | null
      const lesson = body?.['lesson']
      if (!isLessonShaped(lesson)) {
        return { ok: false, reason: 'the server returned something that is not a lesson' }
      }
      const strategy = body?.['strategy']
      return {
        ok: true,
        lesson,
        ...(typeof strategy === 'string' ? { strategy } : {}),
      }
    },

    async ask(question) {
      const sent = await post('/api/ask', { question })
      if (!sent.ok) return sent

      /* The route answers with a LessonSpec, because everything this server
       * produces goes through the same gate. The teaching screen wants prose,
       * so the blocks' text is joined -- and an answer with no readable text is
       * a failure, not an empty answer. A blank reply to a confused learner is
       * a refusal wearing better manners. */
      const lesson = (sent.body as Record<string, unknown> | null)?.['lesson']
      const text = proseFrom(lesson)
      if (text === '') return { ok: false, reason: 'the answer came back empty' }
      return { ok: true, text }
    },

    async lessonForQuestion(question) {
      const sent = await post('/api/ask', { question })
      if (!sent.ok) return sent
      const lesson = (sent.body as Record<string, unknown> | null)?.['lesson']
      if (!isLessonShaped(lesson)) {
        return { ok: false, reason: 'the server returned something that is not a lesson' }
      }
      return { ok: true, lesson }
    },

    async markDone(studentId, conceptId) {
      const sent = await post('/api/done', { studentId, conceptId })
      return sent.ok ? { ok: true } : { ok: false, reason: sent.reason }
    },
  }
}

/**
 * A 200 is not a promise that the body is a lesson.
 *
 * Only the shape the canvas needs to render at all is checked here; the canvas
 * re-validates in full before teaching from it. The point of this check is
 * that `undefined.blocks` never reaches a student as a crash.
 */
function isLessonShaped(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const lesson = value as Record<string, unknown>
  return (
    typeof lesson['id'] === 'string' &&
    typeof lesson['question'] === 'string' &&
    Array.isArray(lesson['blocks']) &&
    lesson['blocks'].length > 0
  )
}

/** The readable text of a lesson-shaped answer, in block order. */
function proseFrom(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  const blocks = (value as Record<string, unknown>)['blocks']
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) =>
      typeof block === 'object' && block !== null && typeof (block as Record<string, unknown>)['body'] === 'string'
        ? String((block as Record<string, unknown>)['body'])
        : '',
    )
    .filter((text) => text.trim() !== '')
    .join('\n\n')
    .trim()
}

/** What `dayRequestFor` needs from a student record. Structural on purpose, so
 *  it does not drag the dashboard's whole `Student` type across. */
export interface StudentLike {
  readonly id: string
  readonly cls: string | null
  readonly subjects: readonly string[]
  readonly minutes: number | null
}

/**
 * Turn a student record into a day request, or say why it cannot be one.
 *
 * The record stores `cls` as TEXT and the route wants a number, so this is a
 * real conversion and not a cast. Sending `schoolClass: NaN` earns a 400 that
 * reads like a server fault when the actual fault is an unfinished setup, and
 * a student cannot act on the wrong one.
 */
export function dayRequestFor(
  student: StudentLike,
  date: string,
): { ok: true; request: DayRequest } | { ok: false; reason: string } {
  /* NOT `Number(student.cls)`. Setup stores "Class 9", so that produced `NaN`
   * and refused to plan for every real student, while every test passed on a
   * fixture that said "9". */
  const schoolClass = schoolClassOf(student.cls)
  if (schoolClass === null) {
    return { ok: false, reason: 'Choose a class first — Almanac plans for classes 9 to 12.' }
  }
  if (student.subjects.length === 0) {
    return { ok: false, reason: 'Choose at least one subject before Almanac can plan a day.' }
  }
  return {
    ok: true,
    request: {
      studentId: student.id,
      date,
      schoolClass,
      dailyMinutes: student.minutes ?? DEFAULT_DAILY_MINUTES,
      subjectIds: [...student.subjects],
    },
  }
}
