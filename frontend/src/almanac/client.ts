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
import { readableText } from '../canvas/spec/readable'

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
  /* NO `studentId`. THIS IS THE WIRE SHAPE, and the wire no longer carries one:
   * the server identifies the student from a signed cookie and refuses a body
   * that names one (403). The LEDGER still keys by student — see
   * `server/almanac/ledger.ts` — but that id is the server's, not the caller's.
   * See `server/identity.ts`. */
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
  | {
      ok: true
      lesson: unknown
      strategy?: string
      /**
       * WHICH WAY IN THE SERVER TOOK, AND WHY THE SCREEN NEEDS IT.
       *
       * Present only when the server authored ONE CONCEPT rather than a whole
       * lesson -- `route` is the `route.ts` axis id, and only `authorConcept`
       * reports one. That makes it the honest signal for how the reply must be
       * JUDGED: a concept is one idea and owes no opening definition and no
       * closing progression, so it is validated at `'answer'`, exactly as the
       * server validated it.
       *
       * MEASURED, in the browser: with this dropped, `LearnView` re-checked a
       * concept at `'lesson'` level -- the default -- and refused it with "The
       * lesson that came back could not be trusted, so it was not shown." The
       * server had answered 200 in 1.98 seconds with a good concept, and the
       * page threw it away for missing an arc it was never asked to have. That
       * is the same defect `AskView` records paying for and fixing with
       * `teaching="answer"`, arriving again one screen over.
       */
      route?: string
      /**
       * WHETHER THIS IS LESS THAN WAS ASKED FOR.
       *
       * The server sets it when the salvage ladder in `handler.ts` rescued a
       * refused concept by DROPPING the blocks that failed the gate. What comes
       * back is true and smaller: some of what the model wrote is not in it.
       *
       * It was parsed nowhere, so a pruned answer arrived wearing the same
       * chrome as a whole lesson and the learner had no way to know anything
       * had been cut -- or that asking again was worth doing. A flag the server
       * sets and no client reads is the same as a flag nobody set.
       */
      partial?: boolean
    }
  | { ok: false; reason: string }

/** A free question, answered as prose. Shaped for the teaching screen's
 *  escalation path, which must never end in a refusal. */
export type AskResult = { ok: true; text: string } | { ok: false; reason: string }
export type DoneResult = { ok: true } | { ok: false; reason: string }

/**
 * WHERE A QUESTION WAS ASKED FROM, WHICH IS HALF OF WHAT IT MEANS.
 *
 * `ask` posted `{ question }` and nothing else. A learner who had just read a
 * lesson on photosynthesis and typed "so is that where the oxygen comes from?"
 * sent five words to a server that had no idea a lesson existed -- and
 * `/api/ask` answers a question with no `taught` by AUTHORING A NEW CONCEPT.
 * So a doubt about the paragraph on screen came back as a brand-new lesson
 * about oxygen, with its own definition, checkpoint and branches.
 *
 * The server has read this since it was written: `askedInside` is documented
 * there as "what lets the model judge whether her question belongs here".
 * Nothing on this side had ever sent it.
 */
export interface AskedInside {
  /** The question the lesson on screen answers. */
  readonly askedInside?: string
  /** What she has already been shown of it, in the order she read it. */
  readonly taught?: string
}

export interface AlmanacClient {
  day(request: DayRequest): Promise<DayResult>
  markDone(studentId: string, conceptId: string): Promise<DoneResult>
  lesson(request: LessonRequest): Promise<LessonResult>
  ask(question: string, context?: AskedInside): Promise<AskResult>
  /** The same free question, answered as a full lesson rather than as prose,
   *  so the ask-anything screen teaches exactly like the concept screen. */
  lessonForQuestion(question: string, context?: AskedInside): Promise<LessonResult>
}

/** Only what this file uses, so a test double is a couple of lines rather than
 *  a whole `fetch`. */
type FetchLike = (url: string, init: {
  method: string
  headers: Record<string, string>
  body: string
  /** Optional so every existing test double stays a couple of lines. */
  signal?: AbortSignal
}) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/**
 * The longest the browser will wait before it says something.
 *
 * `fetch` HAS NO TIMEOUT. A server that accepts the connection and then stops
 * writing leaves this promise pending until the socket dies, and every screen
 * that calls this file sits on its loading line for the whole of it -- "Writing
 * this lesson for you…" with no end and no way back except the browser's own
 * reload button.
 *
 * MEASURED against what the work actually takes: the slowest real lesson
 * through this server was 3382ms, and the retry path inside `server/groq.ts`
 * can legitimately pause for the vendor's rate-limit reset before answering,
 * which is why this is well above that and not just under it. Its own ceiling
 * is 45s, so 60 leaves the server room to give a real answer while still
 * guaranteeing this side stops waiting.
 */
const LONGEST_WAIT_MS = 60_000

const UNREACHABLE = 'the planner could not be reached'

/* Classes Almanac has curriculum for live in `school-class.ts`, alongside the
 * reader that understands the form a student record ACTUALLY stores. */

/** Used when a student finished setup without choosing a daily budget. Two
 *  hours is the same default the dashboard already shows. */
export const DEFAULT_DAILY_MINUTES = 120

/**
 * A real number, not merely something JavaScript calls a number.
 *
 * `typeof NaN === 'number'` AND `typeof Infinity === 'number'`. Both are true,
 * both are checkable in one line, and neither was checked -- so a `minutes`
 * that arrived as `NaN` passed every guard in this file and reached the screen,
 * where `35 of 120 min` becomes `NaN of 120 min` and a progress bar computed
 * from it renders at no width at all. Nothing crashes. It just quietly stops
 * meaning anything, which is the failure this file's own header exists to
 * prevent: "a screen that cannot tell them apart".
 *
 * NEGATIVE IS REFUSED TOO. A concept that takes minus twenty minutes is not a
 * plan, and a day whose `allocated` is negative makes the bar run backwards.
 */
function isRealNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPlannedItem(value: unknown): value is PlannedItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item['conceptId'] === 'string' &&
    typeof item['subjectId'] === 'string' &&
    typeof item['chapterId'] === 'string' &&
    isRealNumber(item['minutes']) &&
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
/**
 * ONE UNUSABLE `minutes` IS NOT A BAD DAY.
 *
 * `isDayPlan` requires `items.every(isPlannedItem)`, and `isPlannedItem` now
 * refuses a `minutes` that is negative, NaN or Infinity. Together those turned
 * a day with nine good items and one carrying `minutes: -1` into "the planner
 * returned something that is not a day" -- the learner shown no plan at all,
 * strictly worse than the nine usable items and one odd number they had
 * before.
 *
 * ONLY THAT ONE FIELD, AND ONLY WHEN EVERYTHING ELSE ABOUT THE ITEM IS RIGHT.
 * A day is a LIST, so an unreadable duration is a missing member rather than a
 * missing list. Every OTHER malformation still refuses the whole day, and that
 * is deliberate: `client.test.ts:142` refuses an item whose `carriedFrom` is
 * `42`, because a wrong TYPE in a field that is rendered straight through --
 * "Backlog — set on 42" -- means the body is not what it claims to be, and a
 * body lying about its shape is not something to quietly repair.
 *
 * `allocated` and `capacity` stay strict below for the same reason: they
 * describe the day ITSELF, and a progress bar drawn from NaN means nothing.
 */
function onlyItsMinutesAreUnusable(value: unknown): boolean {
  if (isPlannedItem(value)) return false
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  /* The same item with a duration it could legally have. If THAT is a planned
     item, `minutes` was the only thing wrong with it. */
  return isPlannedItem({ ...item, minutes: 0 })
}

function withoutBrokenItems(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const day = value as Record<string, unknown>
  if (!Array.isArray(day['items'])) return value
  return { ...day, items: day['items'].filter((item) => !onlyItsMinutesAreUnusable(item)) }
}

function isDayPlan(value: unknown): value is DayPlan {
  if (typeof value !== 'object' || value === null) return false
  const day = value as Record<string, unknown>
  return (
    typeof day['date'] === 'string' &&
    Array.isArray(day['items']) &&
    day['items'].every(isPlannedItem) &&
    isRealNumber(day['allocated']) &&
    isRealNumber(day['capacity'])
  )
}

/*
 * WHAT SHE IS TOLD WHEN THE SERVER SAID NOTHING SHE COULD READ.
 *
 * THE DEFECT THIS REPLACES, MEASURED IN A BROWSER. This function used to end
 * `return \`the planner answered ${response.status}\``, and that string is
 * rendered verbatim on the front door. Run `npm run dev` with no API server --
 * which is what everyone who clones this repository has -- and the first thing
 * a child reads under "Today's learning" is "the planner answered 500". It
 * tells her the app is broken and that it is not going to say why.
 *
 * `tests/integration/law-c-she-never-reads-a-machine-code.spec.ts` is the law
 * that forbids it, and it failed on exactly that sentence, twice, on the front
 * door and behind "Hide curriculum".
 *
 * THREE SENTENCES, NOT ONE, FOR THE REASON `CanvasRoute` GIVES FOR ITS THREE:
 * each wrong sentence sends her to do a different wrong thing. Told to wait,
 * she waits for a server that is not coming back. Told it is broken, she gives
 * up on a rate limit that clears in a minute. Each one names an action,
 * because Law C's other half forbids silence just as firmly as it forbids a
 * code.
 */
const PLANNER_BUSY =
  'The planner has too much on right now, so today’s work has not been ' +
  'planned yet. Wait a minute and open this again.'
const PLANNER_SILENT =
  'The planner is not answering right now, so today’s work has not been ' +
  'planned yet. Nothing you have done is lost — try again in a moment.'
const PLANNER_REFUSED =
  'The planner could not use that request, so today’s work has not been ' +
  'planned yet. Try again, and if it keeps happening ask someone to check ' +
  'this app’s setup.'

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
    /* An unreadable body is not a reason to lose the status code. It is a
       reason not to SHOW it to her. Fall through. */
  }

  /* THE STATUS IS NOT DISCARDED, IT IS REDIRECTED. It is the only fact left
     when the body cannot be read, and a developer needs it -- so it goes to
     the console, which is where a developer looks and where a child does not.
     Losing it entirely would trade one defect for another. */
  console.warn(`almanac: the planner answered ${response.status} with no readable reason`)

  if (response.status === 429) return PLANNER_BUSY
  return response.status >= 500 ? PLANNER_SILENT : PLANNER_REFUSED
}

export function createAlmanacClient(options: { fetchImpl?: FetchLike; baseUrl?: string } = {}): AlmanacClient {
  const call = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  /* TRAILING SLASH REMOVED, BECAUSE EVERY PATH BELOW BEGINS WITH ONE. A base of
     `https://host/` produced `https://host//api/day`, which some servers route
     and some answer 404 for -- and a 404 here reads to a learner as "the
     planner refused that request". */
  const base = (options.baseUrl ?? '').replace(/\/+$/, '')

  async function post(path: string, body: unknown): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
    let response
    /* See `LONGEST_WAIT_MS`. Cleared on every path, including the throw: a
       timer left pending in a browser tab keeps the callback alive for a
       request nobody is waiting on any more. */
    const stopWaiting = new AbortController()
    const giveUp = setTimeout(() => { stopWaiting.abort() }, LONGEST_WAIT_MS)
    try {
      response = await call(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: stopWaiting.signal,
      })
    } catch {
      /* Assigns a result and returns: the failure changes what happens next
       * rather than being noted and stepped over.
       *
       * A TIMEOUT AND A DEAD NETWORK GET THE SAME SENTENCE ON PURPOSE. To the
       * learner they are one thing -- the planner did not answer -- and the
       * difference is a developer's question, which is why the status goes to
       * the console in `reasonFrom` and never to her. */
      return { ok: false, reason: UNREACHABLE }
    } finally {
      clearTimeout(giveUp)
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
      const day = withoutBrokenItems((sent.body as Record<string, unknown> | null)?.['day'])
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
      /* See `LessonResult.route`. Carried through, not dropped: it is how the
         screen knows whether it was handed a concept or a whole lesson. */
      const route = body?.['route']
      /* See `LessonResult.partial`. Only the literal `true`: a missing field
         and a false one both mean the lesson is whole. */
      const partial = body?.['partial'] === true
      return {
        ok: true,
        lesson,
        ...(typeof strategy === 'string' ? { strategy } : {}),
        ...(typeof route === 'string' && route !== '' ? { route } : {}),
        ...(partial ? { partial: true } : {}),
      }
    },

    async ask(question, context) {
      const sent = await post('/api/ask', { question, ...contextFields(context) })
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

    async lessonForQuestion(question, context) {
      const sent = await post('/api/ask', { question, ...contextFields(context) })
      if (!sent.ok) return sent
      const lesson = (sent.body as Record<string, unknown> | null)?.['lesson']
      if (!isLessonShaped(lesson)) {
        return { ok: false, reason: 'the server returned something that is not a lesson' }
      }
      return { ok: true, lesson }
    },

    async markDone(studentId, conceptId) {
      /* `studentId` IS ACCEPTED AND DELIBERATELY NOT SENT.
       *
       * The server assigns identity and signs it into a cookie, so a body that
       * names a student is refused with 403 once the browser holds one. This
       * client used to send it, and the effect was worse than useless: the
       * FIRST request had no cookie and was fine, the SECOND arrived with the
       * cookie AND the old claim, disagreed with itself, and was refused. A
       * dashboard that works once and then stops is the hardest kind of bug to
       * report.
       *
       * The parameter stays on the interface because callers legitimately know
       * who they think they are, and taking it away would be a wider change
       * than this fix needs. It is simply not the server's source of truth any
       * more -- `server/identity.ts` is. */
      void studentId
      const sent = await post('/api/done', { conceptId })
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
/* Only the fields that are actually present. An empty `askedInside` is not
   the same as no lesson, and `nonEmptyString` on the server refuses '' anyway
   -- sending it would be a field that reads as context and carries none. */
function contextFields(context: AskedInside | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (context?.askedInside !== undefined && context.askedInside.trim() !== '') {
    out['askedInside'] = context.askedInside
  }
  if (context?.taught !== undefined && context.taught.trim() !== '') {
    out['taught'] = context.taught
  }
  return out
}

/* ONE DEFINITION, SHARED WITH THE SERVER. This read `body` alone, so a doubt
   answered with a misconception, a table or a reasoning block produced '' and
   the learner was told "the answer came back empty" for a reply the model had
   written in full. See `canvas/spec/readable.ts`. */
const proseFrom = readableText

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

  /*
   * THE BUDGET IS CHECKED, NOT JUST DEFAULTED.
   *
   * `student.minutes ?? DEFAULT_DAILY_MINUTES` only replaces null and
   * undefined, so every OTHER wrong value went to the server untouched: `-500`,
   * `0`, `NaN` from a half-parsed setup field, `Infinity`. The same `??` blind
   * spot that sent `GROQ_MODEL=""` as a model name, one directory over.
   *
   * A day planned to a negative budget is not a smaller day, and zero minutes
   * is not a plan she can act on -- both come back as a day with nothing in it
   * and no reason given, which reads as "you have finished". This file's header
   * names that exact outcome as the thing it exists to stop: telling a student
   * they are done when the truth is something else entirely.
   *
   * REFUSED IN HER WORDS, not silently replaced with the default. Quietly
   * substituting 120 would hide a broken setup she can actually go and fix.
   */
  const minutes = student.minutes ?? DEFAULT_DAILY_MINUTES
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return {
      ok: false,
      reason: 'Set how many minutes a day you can study — it has to be more than zero.',
    }
  }

  return {
    ok: true,
    request: {
      /* NO `studentId`. The server identifies the student from a signed cookie;
       * sending one here would be refused with 403 as soon as the browser held
       * that cookie. See `markDone` above and `server/identity.ts`. */
      date,
      schoolClass,
      dailyMinutes: minutes,
      subjectIds: [...student.subjects],
    },
  }
}
