/* M5 — CORRECTNESS. "ORDERING. MONOTONIC MASTERY. A SINGLE SOURCE OF TRUTH."
 *
 * Three sentences from the product owner, and a proof for each:
 *
 *   2. "Implement ordering -- events stored in real order."
 *   3. "Implement monotonic mastery -- a mastered concept stays mastered."
 *   4. "Implement single source of truth -- each fact has one authoritative
 *      value."
 *
 * WHAT THOSE THREE SENTENCES MEAN IN THIS PRODUCT, AND WHY IT IS NOT OBVIOUS.
 *
 *   There is NO `mastery` FIELD IN THIS PRODUCT. The `mastery: 0.4` that turns
 *   up in `features/steps/memory_steps.py` is invented fixture data -- checked
 *   against `src/canvas/teach/teachStore.ts`, which is the shape the canvas
 *   really keeps across a reload, and which has no such field. A proof written
 *   against `mastery` would be a proof about a fixture nobody ships.
 *
 *   `progress.ts` states the mapping in its own header and this file follows
 *   it, because a test and the module it constrains disagreeing about what a
 *   word means is worse than either being wrong alone:
 *
 *     ORDERING          `asked[]` is stored sorted by `asked[i].at` ascending.
 *                       A save presenting them out of order is wrong, because
 *                       the record then claims she asked her second question
 *                       before her first.
 *     MONOTONIC         `revealed` is how much of the lesson she has uncovered
 *                       and it may never DECREASE. Nor may `questionsAsked` or
 *                       `emptyAnswers`: those count things that HAPPENED, and
 *                       nothing that happened can un-happen.
 *     ONE VALUE         `lessonId` is written down TWICE -- once inside the
 *                       record and once in the storage key. Two places, one
 *                       fact. A record whose `lessonId` disagrees with the key
 *                       it is being written under must be REFUSED, because
 *                       storing it silently would leave the store holding two
 *                       different answers to "which lesson is this".
 *
 * WHY THESE ARE RED, ON PURPOSE, THE DAY THEY ARE WRITTEN.
 *
 *   `reconcile()` in `progress.ts` is a stub that returns `proposed` unchanged.
 *   It refuses nothing. Every proof below that expects a 409 therefore FAILS
 *   right now, on a real assertion -- "expected 200 to be 409" -- and that is
 *   the point. A test written after the code is a test that has never been seen
 *   to fail, and a test that has never been seen to fail is a claim, not a
 *   proof. CLAUDE.md, LAW 0: "WATCH IT FAIL", and an import error is a weak red
 *   that proves nothing.
 *
 * WHY EVERY PROOF COMES IN A PAIR.
 *
 *   A rule asserted only to REFUSE is satisfied completely by `throw` on every
 *   write. So each refusal below is written beside the save it must still
 *   ACCEPT -- equal timestamps, a counter that stays put, a counter that moves
 *   forward, a lesson id that agrees -- and the whole of the last section is
 *   the non-vacuity pair for all three rules at once: a record that is NOT
 *   canvas progress must still be stored unchanged, exactly as Phase 1 proved
 *   it was. Without that section, "refuse everything" would score full marks.
 *
 * WHY THIS DRIVES THE PRODUCT OVER A SOCKET.
 *
 *   `live.test.ts` already makes this argument and it is not repeated here. In
 *   short: a student never calls a function, and the layer between the socket
 *   and the row is exactly where this has gone wrong before. One thing is worth
 *   adding for M5 specifically -- a refusal is only useful if it REACHES the
 *   caller as a refusal. `handler.ts` maps `NotConsistent` to 409 and
 *   `BadMemoryKey`/`NotStorable` to 400, and a rule that threw the wrong class
 *   would tell a student her request was malformed when it was merely stale.
 *   Only an HTTP proof can see that difference at all.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/* `aTemporaryDirectory` is deliberately NOT imported: nothing in this file
 * builds a path. `startLiveServer` calls it itself, and the directory it
 * chooses is read back off the server and removed in `afterAll`. A path spelled
 * out here would be the hardcoding the rules forbid. */
import { aBrowser, startLiveServer, type Browser, type LiveServer } from './live.test.ts'
import { anIdentityPart, aStorableValue, DRAWS, seededRandom } from './generate.test.ts'
import { isProgress } from './progress.ts'
/* THE SHAPE IS THE PRODUCT'S, NOT THIS FILE'S. Imported as a type so that the
 * day `TeachProgress` grows or loses a field, this file stops compiling instead
 * of quietly testing a shape the canvas no longer keeps. */
import type { StoredAsked, TeachProgress } from '../../src/canvas/teach/teachStore.ts'

/* -------------------------------------------------------------------------- */
/* The numbers this file uses, each with the reason it is that number.         */
/* -------------------------------------------------------------------------- */

/** One tab, so every proof below differs by LESSON and by nothing else. */
const ONE_TAB = 'the-tab-this-student-has-open'

/** The server said yes. Named so a bare 200 never appears in an assertion. */
const ACCEPTED = 200

/**
 * The server said "you are out of step with what is already stored".
 *
 * NOT 400. `handler.ts` argues this at length and the argument is the reason
 * this constant exists separately: a 400 tells the caller its request was
 * malformed and sends it away to fix the wrong thing. These records are well
 * formed and perfectly storable; they disagree with the truth. 409 is the only
 * answer that tells a client to re-read and try again.
 */
const CONFLICT = 409

/**
 * How many questions one save carries.
 *
 * Two would pass against a rule that only ever compares the first pair, which
 * is precisely the rule a tired implementation writes. Six means every adjacent
 * pair is checked, and six questions in one lesson is an ordinary afternoon.
 */
const EVENTS_PER_SAVE = 6

/** Beats a lesson is cut into. Only ever used to name a beat plausibly. */
const BEATS_IN_A_LESSON = 8

/** An even split, so both a pending question and an answered one are drawn. */
const HALF = 0.5

/**
 * A fixed epoch-millisecond reading, so a timestamp is never `Date.now()`.
 *
 * A test that draws from the wall clock proves something slightly different
 * every time it runs, and the one property a counterexample must have is that
 * it can be reproduced.
 */
const A_SESSION_STARTED_AT = 1_756_000_000_000

/** One hour, which is longer than any single sitting at this canvas. */
const A_SESSION_LENGTH_MS = 60 * 60 * 1000

/**
 * How many kinds of clock reading a timestamp is drawn from.
 *
 * Four of the six are an ordinary time inside the session; the other two are
 * the epoch itself (a machine whose clock was never set) and a reading near
 * `Number.MAX_SAFE_INTEGER` (a clock set to the far future). Both arrive from
 * real machines, and both are where a rule that subtracts rather than compares
 * loses its precision.
 */
const TIMESTAMP_SHAPES = 6

/** As far through a lesson as a learner gets. Bounds every counter drawn. */
const FURTHEST_A_LEARNER_GETS = 40

/**
 * How many draws each COUNTER proof takes.
 *
 * Smaller than `DRAWS`, and the reason is arithmetic rather than comfort: these
 * proofs run three counters and three saves per draw, so `DRAWS` would mean
 * 3,600 round trips inside a single `it`. A hundred and twenty draws over a
 * space of forty values by forty steps is dense coverage of that space; what it
 * is NOT is one hand-picked triple, which is the thing the spec forbids.
 */
const COUNTER_DRAWS = 120

/** Repeated-timestamp draws. Fewer, because the property is narrower. */
const EQUAL_TIME_DRAWS = 60

/** A bound, so a broken generator fails loudly instead of spinning forever. */
const MOST_ATTEMPTS = 200

/**
 * The longest id `key.ts` accepts.
 *
 * Repeated here rather than imported because `key.ts` does not export it. It is
 * a boundary of a neighbouring module, not a number invented here, and an id
 * past it is refused with 400 -- which would make an M5 proof fail for a reason
 * that has nothing to do with M5.
 */
const LONGEST_ID_KEY_TS_ACCEPTS = 200

/** The fewest words a refusal can have and still be an explanation. */
const FEWEST_WORDS_IN_A_USEFUL_MESSAGE = 4

/** A short, safe rendering of a value inside a failure message. */
const MOST_CHARACTERS_IN_A_FAILURE_MESSAGE = 300

/**
 * Seeds. Named, fixed, and printed on every failure.
 *
 * One per proof rather than one shared, so adding a draw to one proof cannot
 * silently change which values a different proof sees.
 */
const SEED_ORDER_KEPT = 20_250_501
const SEED_ORDER_REFUSED = 20_250_502
const SEED_EQUAL_TIMES = 20_250_503
const SEED_EQUAL_TIMES_BACKWARDS = 20_250_504
const SEED_COUNTERS_REFUSED = 20_250_505
const SEED_COUNTERS_ALLOWED = 20_250_506
const SEED_UNTOUCHED = 20_250_507
const SEED_LESSON_ID_DISAGREES = 20_250_508
const SEED_LESSON_ID_AGREES = 20_250_509
const SEED_NOT_PROGRESS = 20_250_510

/** Generous, because CI is slower than a laptop and a timeout is not a finding. */
const A_GENEROUS_TIMEOUT_MS = 120_000

/* -------------------------------------------------------------------------- */
/* Everything opened is closed, and everything written to disk is removed.     */
/* -------------------------------------------------------------------------- */

const startedServers: LiveServer[] = []
const temporaryDirectories: string[] = []

afterAll(async () => {
  /* Servers first: a listening socket outlives the process otherwise and the
   * whole suite hangs at the end, which reads as a broken test rather than a
   * missing close. */
  for (const server of startedServers) await server.close()
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/** A real server on a real port, chosen by the operating system, registered for close. */
async function aLiveServer(): Promise<LiveServer> {
  const server = await startLiveServer()
  startedServers.push(server)
  /* The DIRECTORY goes, not just the file: SQLite leaves a `-wal` and a `-shm`
   * beside it and a stray journal is a leaked temp file like any other. */
  temporaryDirectories.push(join(server.memoryPath, '..'))
  return server
}

/* -------------------------------------------------------------------------- */
/* Saying what a record IS, in the product's own shape.                        */
/* -------------------------------------------------------------------------- */

/** One question the learner asked, drawn so pending and answered both appear. */
function anAskedEvent(rng: () => number, at: number): StoredAsked {
  const beatId = `beat-${Math.floor(rng() * BEATS_IN_A_LESSON)}`
  const doubt = { text: anIdentityPart(rng), atBeatId: beatId }
  if (rng() < HALF) return { at, beatId, doubt, pending: true }
  return {
    at,
    beatId,
    doubt,
    pending: false,
    /* A refusal rather than an answer, because a `DoubtAnswer` carries a whole
     * validated `Lesson` and none of these proofs are about lesson content. */
    resolution: { kind: 'refusal', reason: 'nothing in this lesson answers that', nearest: [] },
    prose: anIdentityPart(rng),
  }
}

/** A complete `TeachProgress`, with only the fields these rules read varying. */
function aProgressRecord(fields: {
  readonly lessonId: string
  readonly revealed: number
  readonly asked: readonly StoredAsked[]
  readonly questionsAsked: number
  readonly emptyAnswers: number
}): TeachProgress {
  return {
    lessonId: fields.lessonId,
    revealed: fields.revealed,
    asked: [...fields.asked],
    draft: 'half a question she has not sent yet',
    questionsAsked: fields.questionsAsked,
    emptyAnswers: fields.emptyAnswers,
    struggleReported: false,
  }
}

/** One clock reading, from a real machine rather than an ideal one. */
function aTimestamp(rng: () => number): number {
  const which = Math.floor(rng() * TIMESTAMP_SHAPES)
  if (which === 0) return 0
  if (which === 1) return Number.MAX_SAFE_INTEGER - Math.floor(rng() * A_SESSION_LENGTH_MS)
  return A_SESSION_STARTED_AT + Math.floor(rng() * A_SESSION_LENGTH_MS)
}

/** `howMany` readings, in the order they really happened. */
function timestampsInRealOrder(rng: () => number, howMany: number): number[] {
  const drawn: number[] = []
  for (let i = 0; i < howMany; i += 1) drawn.push(aTimestamp(rng))
  return drawn.sort((a, b) => a - b)
}

/**
 * The same readings with ONE ADJACENT PAIR SWAPPED.
 *
 * ADJACENT AND ONE, DELIBERATELY. Shuffling the whole list is the easy case --
 * almost any check catches it. A single adjacent swap is the smallest possible
 * violation and the one a rule that compares only the ends, or only the first
 * pair, or only the min and the max, will sail straight past.
 *
 * Throws rather than returning a list that is secretly still in order: a proof
 * that quietly stopped presenting a violation would go green forever.
 */
function withOneAdjacentPairSwapped(inOrder: readonly number[], where: string): number[] {
  for (let i = 0; i + 1 < inOrder.length; i += 1) {
    if (inOrder[i] < inOrder[i + 1]) {
      const out = [...inOrder]
      out[i] = inOrder[i + 1]
      out[i + 1] = inOrder[i]
      return out
    }
  }
  throw new Error(
    `${where}: every drawn timestamp was identical, so nothing could be put out of order — ` +
      'this proof was about to assert nothing',
  )
}

/**
 * A run in which some questions share a millisecond AND some do not.
 *
 * BOTH ARE REQUIRED, and the helper throws if it cannot produce them. The
 * repeats are what the "equal is not out of order" proof rests on; the strictly
 * increasing pair is what the proof beside it swaps to build a genuine
 * violation. A run that lost either would make one of the two vacuous.
 */
function aRunWithRepeatedMoments(rng: () => number, howMany: number, where: string): number[] {
  for (let attempt = 0; attempt < MOST_ATTEMPTS; attempt += 1) {
    const moments = timestampsInRealOrder(rng, Math.max(2, Math.ceil(howMany / 2)))
    const run: number[] = []
    while (run.length < howMany) {
      for (const moment of moments) {
        if (run.length < howMany) run.push(moment)
      }
    }
    run.sort((a, b) => a - b)

    const hasARepeat = new Set(run).size < run.length
    const hasAStep = run.some((value, index) => index + 1 < run.length && value < run[index + 1])
    if (hasARepeat && hasAStep) return run
  }
  throw new Error(`${where}: could not draw a run that both repeats a moment and moves forward`)
}

/** An id `key.ts` will accept: not empty, no whitespace at either edge, not too long. */
function isALessonIdTheKeyLayerAccepts(id: string): boolean {
  return id !== '' && id === id.trim() && id.length <= LONGEST_ID_KEY_TS_ACCEPTS
}

/**
 * Two DIFFERENT lesson ids, both of which the key layer accepts.
 *
 * DRAWN, NOT LISTED. "civics" and "gas" would prove the rule works for two
 * words somebody thought of. The generator produces ids containing the key
 * separator `:`, percent signs, emoji, quotes and two-hundred-character walls
 * -- which is where a comparison written as a loose match, a prefix test or a
 * normalised form comes apart.
 */
function twoDifferentLessonIds(rng: () => number, where: string): { readonly a: string; readonly b: string } {
  let first: string | undefined
  for (let attempt = 0; attempt < MOST_ATTEMPTS; attempt += 1) {
    const drawn = anIdentityPart(rng)
    if (!isALessonIdTheKeyLayerAccepts(drawn)) continue
    if (first === undefined) {
      first = drawn
      continue
    }
    if (drawn !== first) return { a: first, b: drawn }
  }
  throw new Error(`${where}: the generator stopped producing two different usable lesson ids`)
}

/* -------------------------------------------------------------------------- */
/* Saying what "stored", "refused" and "untouched" mean.                       */
/* -------------------------------------------------------------------------- */

/**
 * The exact text a value is.
 *
 * `toEqual` answers "are these the same value". This answers "is this the same
 * ENCODING" -- same keys, same order, same number formatting. "The previous
 * record is untouched" is a claim about bytes, and only this can check it.
 */
function asExactText(value: unknown): string {
  const text = JSON.stringify(value)
  return text === undefined ? '<nothing JSON can carry>' : text
}

function describeValue(value: unknown): string {
  const text = asExactText(value)
  return text.length <= MOST_CHARACTERS_IN_A_FAILURE_MESSAGE
    ? text
    : `${text.slice(0, MOST_CHARACTERS_IN_A_FAILURE_MESSAGE)}… (${text.length} chars)`
}

/** Write over HTTP and insist the server accepted it. */
async function saved(browser: Browser, lessonId: string, record: unknown, where: string): Promise<void> {
  const response = await browser.writeMemory({ tabId: ONE_TAB, lessonId, record })
  expect(response, `${where}: this save was legal and had to be accepted`).toEqual({
    status: ACCEPTED,
    body: { saved: true },
  })
}

/** Read over HTTP and insist the server answered, returning the record itself. */
async function loaded(browser: Browser, lessonId: string, where: string): Promise<unknown> {
  const response = await browser.readMemory({ tabId: ONE_TAB, lessonId })
  expect(response.status, `${where}: a read is never an error`).toBe(ACCEPTED)
  return response.body['record']
}

/**
 * A refusal a person could act on, rather than a code they must look up.
 *
 * WHY THE WORDING IS ASSERTED AT ALL. The spec says events out of order must be
 * refused "LOUDLY", and a 409 with `{"error": "409"}` in it is technically a
 * refusal and practically useless: a student loses an afternoon and never finds
 * out why. So three separate things are checked -- that there ARE words, that
 * they are words and not a machine code, and that they name WHICH of the three
 * rules was broken. The last is what stops one generic message being reused for
 * every refusal in the module, which would leave a client unable to tell a
 * stale save from a mismatched lesson.
 */
function aMessageAPersonCouldActOn(
  body: Record<string, unknown>,
  where: string,
  namesTheProblem: RegExp,
): string {
  const raw = body['error']
  expect(typeof raw, `${where}: a refusal must carry an error message, got ${describeValue(body)}`).toBe('string')
  const message = String(raw)

  expect(message.trim(), `${where}: the refusal said nothing at all`).not.toBe('')
  expect(
    message.trim().split(/\s+/).length,
    `${where}: "${message}" is a label, not an explanation`,
  ).toBeGreaterThanOrEqual(FEWEST_WORDS_IN_A_USEFUL_MESSAGE)
  expect(
    /[a-z]/.test(message),
    `${where}: "${message}" reads as a machine code rather than a sentence`,
  ).toBe(true)
  expect(message, `${where}: "${message}" does not say WHICH rule was broken`).toMatch(namesTheProblem)

  return message
}

/** Write over HTTP and insist the server refused it, in words, with 409. */
async function refused(
  browser: Browser,
  lessonId: string,
  record: unknown,
  where: string,
  namesTheProblem: RegExp,
): Promise<string> {
  const response = await browser.writeMemory({ tabId: ONE_TAB, lessonId, record })
  expect(
    response.status,
    `${where}: this save contradicts what is stored and had to be refused with ${CONFLICT}; ` +
      `the server answered ${response.status} with ${describeValue(response.body)}`,
  ).toBe(CONFLICT)
  return aMessageAPersonCouldActOn(response.body, where, namesTheProblem)
}

/* The word families a refusal must reach for. Deliberately WIDE: this file has
 * no business dictating an implementer's prose, only insisting that the prose
 * is about the thing that went wrong. */
const NAMES_THE_ORDER_PROBLEM = /order|sequence|sorted|ascend|earlier|later|before|after|time/i
const NAMES_THE_BACKWARDS_PROBLEM =
  /backward|back|decreas|lower|smaller|fewer|less|behind|already|un-?happen|revealed|questionsAsked|emptyAnswers/i
const NAMES_THE_LESSON_PROBLEM = /lesson/i

/* ========================================================================== */
/* 2. ORDERING — "EVENTS STORED IN REAL ORDER."                              */
/* ========================================================================== */

describe('M5 · ordering — a lesson keeps its questions in the order they happened', () => {
  it(
    'returns every question in the order it was saved, over drawn timestamps',
    async () => {
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_ORDER_KEPT)

      /* Counted so that a generator collapsing to one clock reading cannot make
       * this proof pass while exploring a single corner of the type. */
      let runsWithARepeat = 0
      let runsSpanningTheEpoch = 0

      for (let draw = 0; draw < DRAWS; draw += 1) {
        const lessonId = `m5-order-kept-${draw}`
        const times = timestampsInRealOrder(rng, EVENTS_PER_SAVE)
        const record = aProgressRecord({
          lessonId,
          revealed: Math.floor(rng() * FURTHEST_A_LEARNER_GETS),
          asked: times.map((at) => anAskedEvent(rng, at)),
          questionsAsked: times.length,
          emptyAnswers: 0,
        })
        const where = `seed=${SEED_ORDER_KEPT} draw=${draw} times=${asExactText(times)}`

        if (new Set(times).size < times.length) runsWithARepeat += 1
        if (times.includes(0)) runsSpanningTheEpoch += 1

        await saved(student, lessonId, record, where)
        const read = await loaded(student, lessonId, where)

        /* The whole record, byte for byte. An ordering rule that reordered the
         * array on the way in would pass a `toEqual` on the timestamps alone if
         * the events happened to be interchangeable, and would still have
         * rewritten the learner's history. */
        expect(asExactText(read), `${where}: the record changed on the way through`).toBe(
          asExactText(record),
        )

        const readTimes = (read as { asked: readonly { at: number }[] }).asked.map((event) => event.at)
        expect(readTimes, `${where}: the questions came back in a different order`).toEqual(times)
      }

      /* If either of these is zero the loop above explored less than it claims,
       * and a later regression would slip through the gap rather than fail. */
      expect(runsWithARepeat, `seed=${SEED_ORDER_KEPT}: no drawn run ever repeated a moment`).toBeGreaterThan(0)
      expect(runsSpanningTheEpoch, `seed=${SEED_ORDER_KEPT}: no drawn run ever included the epoch`).toBeGreaterThan(0)
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'refuses a save whose questions are not in time order, says so in words, and leaves the stored record alone',
    async () => {
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_ORDER_REFUSED)

      for (let draw = 0; draw < DRAWS; draw += 1) {
        const lessonId = `m5-order-refused-${draw}`
        const times = timestampsInRealOrder(rng, EVENTS_PER_SAVE)
        const where = `seed=${SEED_ORDER_REFUSED} draw=${draw} times=${asExactText(times)}`

        const asked = times.map((at) => anAskedEvent(rng, at))
        const stored = aProgressRecord({
          lessonId,
          revealed: Math.floor(rng() * FURTHEST_A_LEARNER_GETS),
          asked,
          questionsAsked: asked.length,
          emptyAnswers: 0,
        })
        await saved(student, lessonId, stored, where)
        const before = asExactText(await loaded(student, lessonId, where))

        /* THE ONLY THING WRONG WITH THIS RECORD IS THE ORDER. Same events, same
         * counters, same lesson id, same everything -- one adjacent pair
         * swapped. If it is accepted, ordering is not being checked; if it is
         * refused for some OTHER reason, the message assertion below says so. */
        const jumbledTimes = withOneAdjacentPairSwapped(times, where)
        const jumbled = aProgressRecord({
          lessonId,
          revealed: stored.revealed,
          asked: jumbledTimes.map((at, index) => ({ ...asked[index], at })),
          questionsAsked: stored.questionsAsked,
          emptyAnswers: stored.emptyAnswers,
        })

        await refused(student, lessonId, jumbled, `${where} jumbled=${asExactText(jumbledTimes)}`, NAMES_THE_ORDER_PROBLEM)

        /* A refusal that half-applied would be worse than one that crashed: the
         * learner would be told nothing was saved while something was. */
        expect(
          asExactText(await loaded(student, lessonId, where)),
          `${where}: a refused save changed the stored record`,
        ).toBe(before)
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'stores two questions asked in the same millisecond, because equal is not out of order',
    async () => {
      /* THE DECISION THE SPEC LEAVES OPEN, AND WHY IT IS THIS WAY.
       *
       * "Ascending" can mean strictly ascending or non-decreasing, and the two
       * disagree about exactly one case: two events sharing an `at`.
       *
       * NON-DECREASING IS CORRECT HERE, and the reason is what `at` actually
       * is. `teachStore.ts` types it `number`, and the canvas fills it from a
       * millisecond clock. Two questions typed a few hundred microseconds apart
       * -- a paste, a double submit, a fast learner on a fast machine -- share
       * a reading, and neither happened "before" the other in anything the
       * product can observe. Refusing that pair would refuse a save that is
       * TRUE, and hand the learner a 409 she cannot act on: there is no edit
       * she could make to her own history that would fix it.
       *
       * The rule is about a record that claims her SECOND question came before
       * her FIRST. Equal readings make no such claim, so they are stored. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_EQUAL_TIMES)

      for (let draw = 0; draw < EQUAL_TIME_DRAWS; draw += 1) {
        const lessonId = `m5-equal-times-${draw}`
        const where = `seed=${SEED_EQUAL_TIMES} draw=${draw}`
        const times = aRunWithRepeatedMoments(rng, EVENTS_PER_SAVE, where)

        expect(
          new Set(times).size,
          `${where}: this proof needs a repeated moment and got ${asExactText(times)}`,
        ).toBeLessThan(times.length)

        const record = aProgressRecord({
          lessonId,
          revealed: Math.floor(rng() * FURTHEST_A_LEARNER_GETS),
          asked: times.map((at) => anAskedEvent(rng, at)),
          questionsAsked: times.length,
          emptyAnswers: 0,
        })

        await saved(student, lessonId, record, `${where} times=${asExactText(times)}`)
        expect(
          asExactText(await loaded(student, lessonId, where)),
          `${where}: a legal record with repeated moments came back changed`,
        ).toBe(asExactText(record))
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'still refuses a run that goes backwards even when some of its timestamps are equal',
    async () => {
      /* THE PAIR FOR THE DECISION ABOVE. Allowing equal readings must not
       * become "a run containing a repeat is waved through", which is what a
       * rule written as `a <= b || a === b` collapses to when the comparison is
       * done on the wrong pair. Same runs, one adjacent pair swapped. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_EQUAL_TIMES_BACKWARDS)

      for (let draw = 0; draw < EQUAL_TIME_DRAWS; draw += 1) {
        const lessonId = `m5-equal-times-backwards-${draw}`
        const where = `seed=${SEED_EQUAL_TIMES_BACKWARDS} draw=${draw}`
        const times = aRunWithRepeatedMoments(rng, EVENTS_PER_SAVE, where)
        const jumbled = withOneAdjacentPairSwapped(times, where)

        const record = aProgressRecord({
          lessonId,
          revealed: Math.floor(rng() * FURTHEST_A_LEARNER_GETS),
          asked: jumbled.map((at) => anAskedEvent(rng, at)),
          questionsAsked: jumbled.length,
          emptyAnswers: 0,
        })

        await refused(
          student,
          lessonId,
          record,
          `${where} times=${asExactText(jumbled)}`,
          NAMES_THE_ORDER_PROBLEM,
        )
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* 3. MONOTONIC MASTERY — "A MASTERED CONCEPT STAYS MASTERED."               */
/* ========================================================================== */

/** The three facts that count things which cannot un-happen. */
const COUNTERS_THAT_ONLY_EVER_RISE = ['revealed', 'questionsAsked', 'emptyAnswers'] as const
type Counter = (typeof COUNTERS_THAT_ONLY_EVER_RISE)[number]

/** A progress record with all three counters set, and one of them singled out. */
function withCounters(
  lessonId: string,
  values: Readonly<Record<Counter, number>>,
  asked: readonly StoredAsked[],
): TeachProgress {
  return aProgressRecord({
    lessonId,
    revealed: values.revealed,
    asked,
    questionsAsked: values.questionsAsked,
    emptyAnswers: values.emptyAnswers,
  })
}

describe('M5 · monotonic progress — what she has already done cannot un-happen', () => {
  it(
    'refuses a save that moves revealed, questionsAsked or emptyAnswers backwards',
    async () => {
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_COUNTERS_REFUSED)

      for (const counter of COUNTERS_THAT_ONLY_EVER_RISE) {
        for (let draw = 0; draw < COUNTER_DRAWS; draw += 1) {
          const lessonId = `m5-backwards-${counter}-${draw}`
          /* Drawn so the backwards value is still a NUMBER A LEARNER COULD
           * HAVE HAD -- a stale tab writing an older state -- rather than a
           * nonsense negative that any type check would already stop. */
          const base = 1 + Math.floor(rng() * FURTHEST_A_LEARNER_GETS)
          const step = 1 + Math.floor(rng() * base)
          const where = `seed=${SEED_COUNTERS_REFUSED} counter=${counter} draw=${draw} ${base} -> ${base - step}`

          const asked = timestampsInRealOrder(rng, EVENTS_PER_SAVE).map((at) => anAskedEvent(rng, at))
          const start: Record<Counter, number> = {
            revealed: base,
            questionsAsked: base,
            emptyAnswers: base,
          }
          await saved(student, lessonId, withCounters(lessonId, start, asked), where)

          /* ONE COUNTER GOES BACKWARDS, THE OTHER TWO STAND STILL. */
          const onlyThisOneSlips = { ...start, [counter]: base - step }
          await refused(
            student,
            lessonId,
            withCounters(lessonId, onlyThisOneSlips, asked),
            `${where} (others unchanged)`,
            NAMES_THE_BACKWARDS_PROBLEM,
          )

          /* AND THE SNEAKY ONE: this counter goes backwards while the other two
           * move FORWARD. A rule written as "something increased, so this is
           * progress" passes the case above and fails here, and that rule is
           * the one somebody actually writes. */
          const slipsWhileTheOthersRise: Record<Counter, number> = {
            revealed: counter === 'revealed' ? base - step : base + step,
            questionsAsked: counter === 'questionsAsked' ? base - step : base + step,
            emptyAnswers: counter === 'emptyAnswers' ? base - step : base + step,
          }
          await refused(
            student,
            lessonId,
            withCounters(lessonId, slipsWhileTheOthersRise, asked),
            `${where} (others moved forward)`,
            NAMES_THE_BACKWARDS_PROBLEM,
          )
        }
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'allows a save that leaves a counter exactly where it was, and one that moves it forward',
    async () => {
      /* THE PAIR. Without this, "refuse every progress save" scores full marks
       * on the proof above. Standing still is the ordinary case -- the canvas
       * saves a draft keystroke without her having revealed anything new -- and
       * refusing it would make the product unusable while looking correct. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_COUNTERS_ALLOWED)

      for (const counter of COUNTERS_THAT_ONLY_EVER_RISE) {
        for (let draw = 0; draw < COUNTER_DRAWS; draw += 1) {
          const lessonId = `m5-forward-${counter}-${draw}`
          const base = Math.floor(rng() * FURTHEST_A_LEARNER_GETS)
          const step = 1 + Math.floor(rng() * FURTHEST_A_LEARNER_GETS)
          const where = `seed=${SEED_COUNTERS_ALLOWED} counter=${counter} draw=${draw} base=${base} step=${step}`

          const asked = timestampsInRealOrder(rng, EVENTS_PER_SAVE).map((at) => anAskedEvent(rng, at))
          const start: Record<Counter, number> = {
            revealed: base,
            questionsAsked: base,
            emptyAnswers: base,
          }
          await saved(student, lessonId, withCounters(lessonId, start, asked), `${where} first save`)

          /* 5 -> 5. Nothing moved, and nothing moved backwards either. */
          const standingStill = withCounters(lessonId, start, asked)
          await saved(student, lessonId, standingStill, `${where} 5 -> 5`)

          /* 5 -> 7. */
          const movedOn = withCounters(lessonId, { ...start, [counter]: base + step }, asked)
          await saved(student, lessonId, movedOn, `${where} 5 -> 7`)

          expect(
            asExactText(await loaded(student, lessonId, where)),
            `${where}: the accepted save is not what came back`,
          ).toBe(asExactText(movedOn))
        }
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'leaves the stored record byte-for-byte identical after a refusal, whichever rule was broken',
    async () => {
      /* "The save is the old state or the new one" -- `progress.ts` says so in
       * its own header. A partly-applied refusal is the half-written record the
       * whole storage layer promises never to produce, and the only way to see
       * it is to compare the ENCODING, not the value: a record rebuilt from
       * parts compares equal and is not the same bytes. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_UNTOUCHED)
      const lessonId = 'm5-untouched'
      const where = `seed=${SEED_UNTOUCHED} lesson=${lessonId}`

      const times = timestampsInRealOrder(rng, EVENTS_PER_SAVE)
      const asked = times.map((at) => anAskedEvent(rng, at))
      const stored = aProgressRecord({
        lessonId,
        revealed: FURTHEST_A_LEARNER_GETS,
        asked,
        questionsAsked: FURTHEST_A_LEARNER_GETS,
        emptyAnswers: FURTHEST_A_LEARNER_GETS,
      })
      await saved(student, lessonId, stored, where)
      const before = asExactText(await loaded(student, lessonId, where))
      expect(before, `${where}: the baseline did not store, so nothing below proves anything`).toBe(
        asExactText(stored),
      )

      const everyWayToBeWrong: readonly (readonly [string, TeachProgress, RegExp])[] = [
        [
          'revealed goes backwards',
          aProgressRecord({ ...stored, revealed: stored.revealed - 1 }),
          NAMES_THE_BACKWARDS_PROBLEM,
        ],
        [
          'questionsAsked goes backwards',
          aProgressRecord({ ...stored, questionsAsked: stored.questionsAsked - 1 }),
          NAMES_THE_BACKWARDS_PROBLEM,
        ],
        [
          'emptyAnswers goes backwards',
          aProgressRecord({ ...stored, emptyAnswers: stored.emptyAnswers - 1 }),
          NAMES_THE_BACKWARDS_PROBLEM,
        ],
        [
          'the questions are out of order',
          aProgressRecord({
            ...stored,
            asked: withOneAdjacentPairSwapped(times, where).map((at, index) => ({ ...asked[index], at })),
          }),
          NAMES_THE_ORDER_PROBLEM,
        ],
        [
          'the lessonId contradicts the key',
          aProgressRecord({ ...stored, lessonId: `${lessonId}-but-not-really` }),
          NAMES_THE_LESSON_PROBLEM,
        ],
      ]

      for (const [what, proposed, namesTheProblem] of everyWayToBeWrong) {
        await refused(student, lessonId, proposed, `${where} attempt="${what}"`, namesTheProblem)
        expect(
          asExactText(await loaded(student, lessonId, where)),
          `${where}: after "${what}" was refused, the stored record was not what it had been`,
        ).toBe(before)
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* 4. SINGLE SOURCE OF TRUTH — "EACH FACT HAS ONE AUTHORITATIVE VALUE."      */
/* ========================================================================== */

describe('M5 · one authoritative value — the lesson id in the record and in the key are one fact', () => {
  it(
    'refuses a record whose lessonId contradicts the key it is being written under',
    async () => {
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_LESSON_ID_DISAGREES)

      /* Counted, because the whole strength of this proof is the awkwardness of
       * the ids it uses. If the generator ever stops producing the separator or
       * an encoding character, a comparison written as a loose match would slip
       * through and nothing here would notice. */
      let sawTheKeySeparator = 0
      let sawAPercentSign = 0

      for (let draw = 0; draw < DRAWS; draw += 1) {
        const where = `seed=${SEED_LESSON_ID_DISAGREES} draw=${draw}`
        const { a: inTheKey, b: inTheRecord } = twoDifferentLessonIds(rng, where)

        if (inTheKey.includes(':') || inTheRecord.includes(':')) sawTheKeySeparator += 1
        if (inTheKey.includes('%') || inTheRecord.includes('%')) sawAPercentSign += 1

        /* Everything else about this record is impeccable: a fresh key so no
         * counter can go backwards, and questions in real order. The ONLY thing
         * wrong is that it says it belongs to a different lesson. */
        const record = aProgressRecord({
          lessonId: inTheRecord,
          revealed: Math.floor(rng() * FURTHEST_A_LEARNER_GETS),
          asked: timestampsInRealOrder(rng, EVENTS_PER_SAVE).map((at) => anAskedEvent(rng, at)),
          questionsAsked: EVENTS_PER_SAVE,
          emptyAnswers: 0,
        })

        await refused(
          student,
          inTheKey,
          record,
          `${where} key=${asExactText(inTheKey)} record=${asExactText(inTheRecord)}`,
          NAMES_THE_LESSON_PROBLEM,
        )
      }

      expect(
        sawTheKeySeparator,
        `seed=${SEED_LESSON_ID_DISAGREES}: no drawn id ever contained the key separator ":"`,
      ).toBeGreaterThan(0)
      expect(
        sawAPercentSign,
        `seed=${SEED_LESSON_ID_DISAGREES}: no drawn id ever contained a percent sign`,
      ).toBeGreaterThan(0)
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'stores a record whose lessonId agrees with its key, over the same drawn ids',
    async () => {
      /* THE PAIR. A rule that refused every progress record would pass the
       * proof above and destroy the product. These are the SAME ids -- the
       * separator, the percent signs, the emoji, the walls of A -- written
       * under the key they actually name. */
      const server = await aLiveServer()
      const rng = seededRandom(SEED_LESSON_ID_AGREES)

      for (let draw = 0; draw < DRAWS; draw += 1) {
        const where = `seed=${SEED_LESSON_ID_AGREES} draw=${draw}`
        const { a: lessonId } = twoDifferentLessonIds(rng, where)

        /* A NEW STUDENT EVERY DRAW, AND THE REASON IS A REAL DEFECT THIS PROOF
         * ALREADY CAUGHT IN ITSELF.
         *
         * The generator's fragment space is finite, so the same lesson id comes
         * up more than once across four hundred draws. Written by ONE student,
         * the second visit to that id is a SECOND save to a key that already
         * holds something -- and when its drawn `revealed` is lower than the
         * first one's, the server refuses it for going BACKWARDS. Correctly.
         * This proof is about the lesson id agreeing with its key and nothing
         * else, and it was accidentally asserting the monotonic rule as well,
         * in the one direction where that rule says no.
         *
         * A fresh cookie jar is a fresh student, which is a fresh key, which
         * gives every draw an empty box. The lesson id itself is left exactly
         * as drawn -- separator, percent signs, emoji, wall of A -- because
         * mangling it to make it unique is what would have weakened this. */
        const student = aBrowser(server.origin)

        const record = aProgressRecord({
          lessonId,
          revealed: Math.floor(rng() * FURTHEST_A_LEARNER_GETS),
          asked: timestampsInRealOrder(rng, EVENTS_PER_SAVE).map((at) => anAskedEvent(rng, at)),
          questionsAsked: EVENTS_PER_SAVE,
          emptyAnswers: 0,
        })

        await saved(student, lessonId, record, `${where} lesson=${asExactText(lessonId)}`)
        expect(
          asExactText(await loaded(student, lessonId, where)),
          `${where}: a record that agreed with its key came back changed`,
        ).toBe(asExactText(record))
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* THE BOUNDARY — these rules apply to progress and to nothing else.          */
/* ========================================================================== */

describe('M5 · the rules apply to canvas progress and to nothing else', () => {
  it(
    'stores an arbitrary drawn value unchanged, because these rules have nothing true to say about it',
    async () => {
      /* THIS IS THE NON-VACUITY PAIR FOR ALL THREE RULES AT ONCE.
       *
       * Without it, `reconcile` could refuse every write in the module and
       * every refusal proof above would still be green. It is also Phase 1's
       * promise restated: the store holds anything JSON can carry, and
       * `record.ts` argues at length that a store dictating the shape of what
       * it holds has to be edited every time its contents learn something new.
       * M5 must not quietly take that away.
       *
       * If THIS test fails, Phase 1 is broken and that is the headline, not M5. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_NOT_PROGRESS)

      const shapesSeen = new Set<string>()
      let drawsThatWereProgress = 0
      let drawsChecked = 0

      for (let draw = 0; draw < DRAWS; draw += 1) {
        const value = aStorableValue(rng)
        /* A drawn value that IS progress would be judged by the rules and
         * belongs to the proofs above, not to this one. Counted rather than
         * silently skipped, so the day the generator starts producing progress
         * records this proof reports how much of itself it stopped running. */
        if (isProgress(value)) {
          drawsThatWereProgress += 1
          continue
        }

        const lessonId = `m5-not-progress-${draw}`
        const where = `seed=${SEED_NOT_PROGRESS} draw=${draw} value=${describeValue(value)}`
        shapesSeen.add(value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)
        drawsChecked += 1

        await saved(student, lessonId, value, where)
        expect(asExactText(await loaded(student, lessonId, where)), `${where}: the value changed`).toBe(
          asExactText(value),
        )
      }

      expect(
        drawsChecked,
        `seed=${SEED_NOT_PROGRESS}: ${drawsThatWereProgress} of ${DRAWS} draws were progress records`,
      ).toBeGreaterThan(DRAWS / 2)
      /* A proof that only ever saw objects would say nothing about a number or
       * a string, and "a number" is one of the shapes the spec names. */
      expect(shapesSeen.size, `seed=${SEED_NOT_PROGRESS}: only saw ${[...shapesSeen].join(', ')}`).toBeGreaterThan(3)
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'stores a number, a string, a boolean, null and a list unchanged, each one by name',
    async () => {
      /* The drawn proof above says "over the whole type". This one pins the
       * shapes the spec names, so a regression reports WHICH promise broke
       * rather than "draw 271 failed". */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)

      const byName: readonly (readonly [string, unknown])[] = [
        ['a number', 0],
        ['a large number', Number.MAX_SAFE_INTEGER],
        ['a string', 'she stopped here'],
        ['an empty string', ''],
        ['a boolean', false],
        ['null', null],
        ['a list', [1, 'two', null, { three: true }]],
        ['an empty object', {}],
        ['an object nobody has invented yet', { whatever: { comes: ['next'] } }],
      ]

      for (const [what, value] of byName) {
        const lessonId = `m5-by-name-${what.replace(/\s+/g, '-')}`
        const where = `value="${what}" ${describeValue(value)}`
        await saved(student, lessonId, value, where)
        expect(asExactText(await loaded(student, lessonId, where)), `${where}: changed on the way through`).toBe(
          asExactText(value),
        )
      }
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'lets a record that is not progress change in any direction, including downwards',
    async () => {
      /* THE SHARPEST NON-VACUITY CASE. A rule that applied "numbers may not go
       * down" to EVERY record would pass every other proof in this file and
       * break every other use of this store. A record that is not canvas
       * progress may go up, down, or become something else entirely. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const lessonId = 'm5-not-progress-goes-down'
      const where = `lesson=${lessonId}`

      const wentUp = { score: FURTHEST_A_LEARNER_GETS, notes: ['first'] }
      await saved(student, lessonId, wentUp, `${where} first`)

      const wentDown = { score: 1, notes: [] }
      await saved(student, lessonId, wentDown, `${where} downwards`)
      expect(asExactText(await loaded(student, lessonId, where)), `${where}: the second save did not stick`).toBe(
        asExactText(wentDown),
      )

      /* And a shape change, which is the case `record.ts` exists to allow. */
      await saved(student, lessonId, 'not even an object any more', `${where} shape change`)
      expect(await loaded(student, lessonId, where), `${where}: the shape change did not stick`).toBe(
        'not even an object any more',
      )
    },
    A_GENEROUS_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* A REFUSAL IS NOT A CRASH.                                                  */
/* ========================================================================== */

describe('M5 · a refusal leaves the server healthy', () => {
  it(
    'answers the very next request normally after refusing a save',
    async () => {
      /* A rule enforced by letting an exception escape the router would look
       * identical to a working one in a single-request test and would take the
       * process down in front of a class. So the refusal is followed by four
       * separate things that must all still work: the health route, a read of
       * the record that was defended, a legal save on the SAME key, and a
       * second student who was never involved. */
      const server = await aLiveServer()
      const student = aBrowser(server.origin)
      const rng = seededRandom(SEED_UNTOUCHED)
      const lessonId = 'm5-refusal-is-not-a-crash'
      const where = `lesson=${lessonId}`

      const asked = timestampsInRealOrder(rng, EVENTS_PER_SAVE).map((at) => anAskedEvent(rng, at))
      const stored = aProgressRecord({
        lessonId,
        revealed: FURTHEST_A_LEARNER_GETS,
        asked,
        questionsAsked: FURTHEST_A_LEARNER_GETS,
        emptyAnswers: FURTHEST_A_LEARNER_GETS,
      })
      await saved(student, lessonId, stored, `${where} baseline`)

      await refused(
        student,
        lessonId,
        aProgressRecord({ ...stored, revealed: stored.revealed - 1 }),
        `${where} backwards`,
        NAMES_THE_BACKWARDS_PROBLEM,
      )

      const health = await fetch(`${server.origin}/api/health`)
      expect(health.status, `${where}: the server stopped answering after a refusal`).toBe(ACCEPTED)

      expect(
        asExactText(await loaded(student, lessonId, where)),
        `${where}: the defended record could not be read back`,
      ).toBe(asExactText(stored))

      const movedOn = aProgressRecord({ ...stored, revealed: stored.revealed + 1 })
      await saved(student, lessonId, movedOn, `${where} legal save after the refusal`)
      expect(
        asExactText(await loaded(student, lessonId, where)),
        `${where}: the legal save after a refusal did not stick`,
      ).toBe(asExactText(movedOn))

      /* A different cookie jar is a different student. One person's refusal
       * must not have disturbed anybody else's memory. */
      const anotherStudent = aBrowser(server.origin)
      const theirs = { theirOwnThing: true }
      await saved(anotherStudent, lessonId, theirs, `${where} another student`)
      expect(
        asExactText(await loaded(anotherStudent, lessonId, where)),
        `${where}: a second student was affected by the first one's refusal`,
      ).toBe(asExactText(theirs))
    },
    A_GENEROUS_TIMEOUT_MS,
  )
})
