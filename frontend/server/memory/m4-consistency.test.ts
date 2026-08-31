/* M4 — CONSISTENCY. A SAVE IS THE OLD STATE OR THE NEW ONE. THERE IS NO THIRD.
 *
 * The requirement, verbatim from the product owner:
 *
 *   "Implement atomic writes -- a save is old-state or new-state, never a mix."
 *   "Done when: ... writing to lesson A never changes lesson B (proven)."
 *
 * TWO SENTENCES, AND THE SECOND IS NOT A RESTATEMENT OF THE FIRST.
 *
 *   "Never a mix" is about ONE record: what is on disk after a save is either
 *   every byte of what was there before or every byte of what was sent, and
 *   never some of each. A half-applied record is the failure a student cannot
 *   detect and cannot recover from, because it looks exactly like her work.
 *
 *   "Lesson A never changes lesson B" is about TWO records: a save aimed at one
 *   memory must not reach into another. That is a different defect with a
 *   different cause -- a write that touches more rows than it named, or a
 *   rollback that unwinds more than it wrote -- and a proof of the first says
 *   nothing whatever about the second.
 *
 * WHY A REFUSAL IS THE ONLY THING THAT CAN TEST "NEVER A MIX".
 *
 *   If every save is accepted there is no second outcome to fall between. The
 *   old state and the new state are only two different answers when a save can
 *   be turned down, and the turning-down is what has to leave the previous
 *   record untouched. So these proofs need saves that MUST be refused, and
 *   `progress.ts` states which ones those are, in its own header:
 *
 *     "A learner who has seen five steps has seen them, and no later save may
 *      claim she has seen three. `questionsAsked` and `emptyAnswers` are
 *      counters of things that HAPPENED and cannot un-happen."
 *
 *   And `reconcile` is handed `lessonIdFromKey` for one reason: a record that
 *   names a lesson its key does not name is a record about somebody else's
 *   work. Storing it is the "lesson A changes lesson B" defect arriving through
 *   the front door instead of through a bad query.
 *
 *   None of that is read out of the implementation. `reconcile` today returns
 *   its argument unchanged; these proofs are aimed at the requirement, and the
 *   ones that depend on a refusal are EXPECTED TO FAIL until the rules exist.
 *   That is the point of writing them first.
 *
 * WHY THE ASSERTIONS READ RAW TEXT THROUGH A SECOND CONNECTION.
 *
 *   Asking the API that just wrote whether the write worked is asking one
 *   process whether it agrees with itself. It would pass for a store that kept
 *   the record in memory and never reached the disk, and it would pass for a
 *   store that reported the value it was handed rather than the value it holds.
 *   So every check below opens the SQLite file again, as a caller that was
 *   never the writer, and compares the stored TEXT -- not a parsed object.
 *
 *   `record.ts` promises byte-for-byte return. Deep equality on parsed objects
 *   is a weaker claim than the one that was made: it passes for a store that
 *   reordered keys or turned a large integer into a float. Comparing text is
 *   the exact promise.
 *
 *   The row's `updated_at` is read the same way, and it is read on purpose. A
 *   rollback that restores the record but leaves the timestamp moved has
 *   written something during a save it claimed to refuse, and "nothing was
 *   written" is the whole of the claim.
 *
 * WHY TWO SERVERS, AND WHY A SECOND OPERATING-SYSTEM PROCESS AS WELL.
 *
 *   Read-then-write is two statements. Two writers can both read the old value
 *   and the second one silently undoes the first, and SQLite raises nothing
 *   because neither did anything illegal on its own. That failure needs two
 *   independent connections to the same file to appear at all -- an in-process
 *   test that shares one connection can never see it.
 *
 *   Two `startLiveServer` replicas give two connections, which is the shape the
 *   product ships in. They still share one event loop, so their synchronous
 *   transactions cannot literally overlap; that is stated rather than glossed,
 *   and the proof that does not depend on it spawns a REAL child process, which
 *   has its own event loop and its own connection and genuinely races.
 *
 * WHY THERE IS A POSITIVE BESIDE EVERY NEGATIVE.
 *
 *   "The bytes did not change" is satisfied completely by a store that never
 *   writes anything. So every proof that a refused save changed nothing is
 *   paired with a sensible save that MUST change the bytes, and every proof
 *   that a neighbour was untouched is paired with the record that was.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'

import { IDENTITY_COOKIE, readCookie, verifyIdentity } from '../identity.ts'
import { anIdentityPart, DRAWS, seededRandom } from './generate.test.ts'
import { memoryKey } from './key.ts'
import {
  A_TEST_SECRET,
  aBrowser,
  aTemporaryDirectory,
  startLiveServer,
  type Browser,
  type LiveServer,
} from './live.test.ts'
import { fromStoredText, toStoredText } from './record.ts'
import { canvasMemory } from './store.ts'
import { sqliteMemoryStore, type MemoryStore } from './sqliteStore.ts'

/* -------------------------------------------------------------------------- */
/* Named numbers. A bare literal in a consistency proof is a decision nobody    */
/* can review later, so each one says what it is FOR.                          */
/* -------------------------------------------------------------------------- */

/** One tab, because a memory belongs to one student in one tab for one lesson. */
const ONE_TAB = 'tab%3A1 🧪'

/**
 * The lesson these proofs write to, and its neighbour.
 *
 * BOTH CARRY THE HAZARDS `key.ts` CLAIMS TO HANDLE -- a colon, an already
 * percent-encoded colon, an astral-plane emoji. A consistency proof run on
 * `lesson-a` and `lesson-b` would be a proof about the two easiest strings in
 * the world, and the encoding that keeps two keys apart would never be tested.
 */
const A_LESSON = 'gas-pressure 🧪'
const ANOTHER_LESSON = 'gas-pressure 🧪 (the next one)'

/** Where the generated `at` values start. Any instant; it only has to increase. */
const FIRST_QUESTION_AT_MS = 1_767_225_600_000

/**
 * The seed every property draw comes from.
 *
 * FIXED, AND PRINTED IN THE FAILURE MESSAGE. A property test that fails once
 * and passes on re-run teaches the reader to press the button again. This
 * number means nothing beyond "a number somebody wrote down"; what makes it
 * load-bearing is that it reproduces the exact counterexample.
 */
const PROPERTY_SEED = 20260904

/**
 * How many writes land on one key at the same moment.
 *
 * Chosen above the number of sockets a browser will open to one origin, so the
 * requests genuinely queue somewhere rather than being spaced out by the client
 * for us. This is what an autosave firing while the learner presses save looks
 * like on a slow connection, multiplied by every tab she left open.
 */
const WRITERS_ON_ONE_KEY = 24

/** Half that at each replica, so both files' worth of traffic is the same size. */
const WRITERS_PER_SERVER = WRITERS_ON_ONE_KEY / 2

/**
 * How many times one lesson is written over while its neighbours are watched.
 *
 * Enough that a store which rebuilt neighbouring rows would have had many
 * chances to; small enough that the whole property stays inside a test budget.
 */
const HAMMER_WRITES = 25

/**
 * The fewest generated lesson ids that make the isolation property mean
 * anything.
 *
 * `anIdentityPart` deliberately draws ids that `key.ts` REFUSES -- ones padded
 * with spaces, tabs or newlines -- and those never become lessons at all. So
 * the count of lessons that really exist is smaller than `DRAWS`, and a run
 * that produced a handful would pass while proving nothing. This is the floor
 * below which the proof declares itself vacuous instead of passing.
 */
const ENOUGH_LESSONS_TO_BE_A_PROPERTY = 50

/**
 * How many draws it takes to reach a wanted number of lessons.
 *
 * MEASURED, NOT GUESSED: of 400 draws at this seed, 255 became lessons and the
 * rest were ids `key.ts` refuses. Asking for forty lessons from forty draws
 * therefore fails on arithmetic rather than on the product -- which is exactly
 * what happened the first time this file ran, and is why the count is a target
 * with a draw budget instead of a hope.
 */
const DRAWS_PER_LESSON_WANTED = 3

/**
 * How many lessons the two-replica version of the property uses.
 *
 * Smaller than `DRAWS` on purpose: it pays for every write twice, once at each
 * replica, and the thing it adds over the single-server property is the SECOND
 * CONNECTION, not more lesson ids. The single-server property above already
 * covers the id space.
 */
const LESSONS_ACROSS_TWO_SERVERS = 40

/**
 * The progress numbers every racing record shares.
 *
 * IDENTICAL ON PURPOSE, AND THE REASON IS THE RULES THEMSELVES. `revealed`,
 * `questionsAsked` and `emptyAnswers` are counters of things that happened, so
 * a racing writer that cycled through decreasing values would be REFUSED by a
 * correct `reconcile` and its loop would die -- turning a race into a single
 * writer without saying so. Racing records therefore differ only in `draft`,
 * which is a text box a learner may retype as often as she likes.
 */
const A_SETTLED_REVEALED = 7
const A_SETTLED_QUESTION_COUNT = 3

/** How many records each racing writer cycles through. A finite, listable family. */
const RECORDS_IN_A_RACING_FAMILY = 6

/** How many rounds the parent writes while a second process writes the same key. */
const RACE_ROUNDS = 40

/** How many separate keys the crashing child writes to, round after round. */
const CRASH_KEYS = 6

/**
 * Padding that makes one record big enough for a kill to land inside a write.
 *
 * A tiny record is written in one go on any machine, and a crash proof that can
 * only kill BETWEEN writes has not tested the word "mid-write". Far below
 * `MAX_RECORD_BYTES`, so a refusal never masquerades as a crash.
 */
const A_RECORD_BIG_ENOUGH_TO_BE_CAUGHT_MID_WRITE = 48 * 1024

/** The line a child prints once, and only once, its first write has RETURNED. */
const CHILD_WROTE_ONCE = 'M4-CHILD-FIRST-WRITE-RETURNED'

/** How long a child gets to boot Node, open SQLite and finish one write. */
const CHILD_MARKER_TIMEOUT_MS = 30_000

/** How often the parent looks for a child's marker while waiting. */
const CHILD_POLL_MS = 10

/** How long the crashing child is left running before the signal arrives. */
const A_MOMENT_OF_WRITING_MS = 250

/** Whole-test budget for a proof that spawns a real Node process. */
const CHILD_TEST_TIMEOUT_MS = 60_000

/**
 * Whole-test budget for the property proofs.
 *
 * Generous on purpose: they make hundreds of real loopback requests, each one
 * a real SQLite commit, on a machine that may be running the rest of the suite
 * at the same time. A tight budget here turns a slow laptop into a red test
 * about nothing.
 */
const A_GENEROUS_TIMEOUT_MS = 120_000

/** How long the clock is allowed to take to move on to the next millisecond. */
const CLOCK_MOVE_TIMEOUT_MS = 5_000

/* -------------------------------------------------------------------------- */
/* Numbers for the two proofs that need MORE THAN ONE OPERATING-SYSTEM PROCESS. */
/*                                                                             */
/* `node:sqlite` IS SYNCHRONOUS, AND THAT IS WHY EVERYTHING ABOVE THIS LINE     */
/* CANNOT REACH THESE DEFECTS.                                                  */
/*                                                                             */
/*   Inside one process, two `update()` calls can never interleave: the first   */
/*   runs to completion before the second begins. `Promise.all` around twenty-  */
/*   four HTTP writes looks concurrent and is not -- the transactions still     */
/*   take turns, because there is one thread and no `await` inside a            */
/*   transaction for anything to slip through. Two `startLiveServer` replicas    */
/*   have two CONNECTIONS but still one event loop, which the header of this    */
/*   file already states.                                                       */
/*                                                                             */
/*   So a contended write lock cannot exist in a single-process test, and the   */
/*   two settings that only matter under contention -- `BEGIN IMMEDIATE` and    */
/*   `busy_timeout` -- are invisible to every proof above. The proofs below      */
/*   spawn REAL processes, each with its own event loop and its own connection   */
/*   to the same file, because there is no other way.                           */
/* -------------------------------------------------------------------------- */

/**
 * How many real operating-system processes count up ONE memory at once.
 *
 * FIVE, AND THE SHIPPED FAILURE THIS FILE DOCUMENTS NEEDED ONLY TWO. The header
 * of `sqliteStore.ts` records what two replicas sharing one file already did to
 * the JSON ledger it replaces. Five is more replicas than this product would
 * ever run against one SQLite file, so a store that cannot lose a step under
 * five cannot lose one under two.
 *
 * MEASURED at this size, against the real file, three runs each: with
 * `BEGIN IMMEDIATE` all six hundred increments were acknowledged and all six
 * hundred survived; with `BEGIN DEFERRED` roughly nine in ten were REFUSED with
 * "database is locked". That gap is what makes this a proof rather than a
 * ritual.
 */
const RACING_PROCESSES = 5

/**
 * How many read-decide-write increments each of those processes performs.
 *
 * Chosen by measurement, not by feel. Below about fifty the processes finish
 * before they have properly collided; at this number the contended window is
 * tens of milliseconds long and every one of the five is inside it, which is
 * asserted rather than assumed (see the overlap check in the proof itself).
 */
const INCREMENTS_EACH_PROCESS_MAKES = 120

/** Every step the five of them uncover between them. */
const EVERY_INCREMENT = RACING_PROCESSES * INCREMENTS_EACH_PROCESS_MAKES

/**
 * How long the children get to boot before they are all released together.
 *
 * They start on a shared wall-clock instant because processes spawned in a loop
 * would otherwise begin seconds apart and never meet. MEASURED: booting Node
 * and importing the three real product modules took 78-139ms on this machine,
 * so this is roughly fifteen times the observed cost. It is a head start, not a
 * guarantee -- what actually proves the five overlapped is each child reporting
 * when it began and ended, which the proof compares.
 */
const CHILDREN_GET_THIS_LONG_TO_START_MS = 2_000

/**
 * How long one process stays INSIDE a save, holding the write lock.
 *
 * Long enough to measure and to be sure another writer really met it; far below
 * the five seconds `sqliteStore.ts` gives a busy database, so a correct store
 * must win the wait rather than merely survive it.
 */
const A_SLOW_SAVE_HOLDS_THE_LOCK_MS = 1_200

/**
 * The least a queued save must have waited for the queueing to be real.
 *
 * NOT THE CLAIM -- the claim is that the work landed. This is the guard that
 * stops the claim being satisfied by a save that never met the lock at all.
 * MEASURED: against a 1,200ms hold the real store waited 1,299-1,301ms, and
 * with `busy_timeout = 0` it gave up after 1ms. Anything between is a machine
 * behaving strangely, and this floor sits far from both.
 */
const A_SAVE_THAT_REALLY_QUEUED_MS = 500

/** The line a counting child prints once it has opened the file and is waiting. */
const CHILD_IS_READY = 'M4-CHILD-READY'

/** The line a counting child prints when it is finished, followed by its tally. */
const CHILD_COUNTED = 'M4-CHILD-COUNTED '

/** The line the holding child prints from INSIDE its save, while the lock is its. */
const CHILD_HOLDS_THE_WRITE_LOCK = 'M4-CHILD-HOLDS-THE-WRITE-LOCK'

/** And the line it prints once that save has committed and the lock is free. */
const CHILD_RELEASED_THE_WRITE_LOCK = 'M4-CHILD-RELEASED-THE-WRITE-LOCK'

/* -------------------------------------------------------------------------- */
/* Fixtures — the shape the canvas really keeps.                               */
/* -------------------------------------------------------------------------- */

/**
 * One lesson's progress, in the shape `TeachProgress` actually has.
 *
 * NOT INVENTED HERE. `src/canvas/teach/teachStore.ts` is the source of this
 * shape -- `lessonId`, `revealed`, `asked`, `draft`, `questionsAsked`,
 * `emptyAnswers`, `struggleReported`. A fixture carrying a `mastery: 0.4` that
 * no product code has ever written would make every proof below a proof about
 * a made-up document.
 */
function aProgress(
  lessonId: string,
  revealed: number,
  questionsAsked: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    lessonId,
    revealed,
    asked: Array.from({ length: questionsAsked }, (_, i) => ({
      at: FIRST_QUESTION_AT_MS + i,
      beatId: `beat-${i}`,
      doubt: 'why does that follow',
      pending: false,
    })),
    draft: '',
    questionsAsked,
    emptyAnswers: 0,
    struggleReported: false,
    ...extra,
  }
}

/**
 * A family of records that are all equally acceptable at any moment.
 *
 * See `A_SETTLED_REVEALED`. Every member carries the same counters and differs
 * only in the draft text and the name of who wrote it, so no consistency rule
 * can prefer one over another -- which is exactly what a race needs, because a
 * racing writer whose records get refused stops being a racing writer.
 */
function aRacingFamily(lessonId: string, writtenBy: string, padTo = 0): Record<string, unknown>[] {
  return Array.from({ length: RECORDS_IN_A_RACING_FAMILY }, (_, i) =>
    aProgress(lessonId, A_SETTLED_REVEALED, A_SETTLED_QUESTION_COUNT, {
      writtenBy,
      round: i,
      draft: `${writtenBy} was typing round ${i}${'.'.repeat(padTo)}`,
    }),
  )
}

/* -------------------------------------------------------------------------- */
/* Reading the disk as somebody who was never the writer.                      */
/* -------------------------------------------------------------------------- */

/** One stored row, exactly as SQLite holds it. */
interface RawRow {
  readonly record: string
  readonly updatedAt: string
}

/**
 * Open the file again and read one row, then close.
 *
 * A FRESH CONNECTION EVERY TIME, AND THAT IS THE POINT RATHER THAN AN
 * INEFFICIENCY. A connection held open could serve a value from its own state;
 * a new one has nothing to remember and must ask the file. The SQL names the
 * two columns the store itself writes, because the timestamp is part of what
 * "nothing was written" means and no interface above exposes it.
 */
function theRowOnDisk(path: string, key: string): RawRow | undefined {
  const db = new DatabaseSync(path)
  try {
    const row = db
      .prepare('SELECT record, updated_at AS updatedAt FROM canvas_memory WHERE memory_key = ?')
      .get(key) as { record?: unknown; updatedAt?: unknown } | undefined
    if (row === undefined || typeof row.record !== 'string') return undefined
    return { record: row.record, updatedAt: String(row.updatedAt) }
  } finally {
    db.close()
  }
}

/** Every row in the file, by key. Used to compare a whole store before and after. */
function everyRowOnDisk(path: string): Map<string, RawRow> {
  const db = new DatabaseSync(path)
  try {
    const rows = db
      .prepare('SELECT memory_key AS memoryKey, record, updated_at AS updatedAt FROM canvas_memory')
      .all() as unknown[]
    const out = new Map<string, RawRow>()
    for (const raw of rows) {
      const row = raw as { memoryKey?: unknown; record?: unknown; updatedAt?: unknown }
      out.set(String(row.memoryKey), { record: String(row.record), updatedAt: String(row.updatedAt) })
    }
    return out
  } finally {
    db.close()
  }
}

/* -------------------------------------------------------------------------- */
/* Everything opened here is closed in one place. A leaked server or a child    */
/* that waits forever does not fail the suite -- it HANGS it, which is the      */
/* failure nobody can read.                                                    */
/* -------------------------------------------------------------------------- */

const temporaryDirectories: string[] = []
const startedServers: LiveServer[] = []
const spawnedChildren: ChildProcess[] = []
const openedStores: MemoryStore[] = []

/** A fresh SQLite file under a fresh temp directory. No path is ever fixed. */
function aFreshMemoryFile(name: string): string {
  const directory = aTemporaryDirectory()
  temporaryDirectories.push(directory)
  return join(directory, `${name}.db`)
}

function openStore(path: string): MemoryStore {
  const store = sqliteMemoryStore(path)
  openedStores.push(store)
  return store
}

/**
 * A server on a chosen file, with the secret stated rather than defaulted.
 *
 * Both are explicit because the two-replica proofs depend on both: the same
 * FILE so they can collide, and the same SECRET so one student's cookie is the
 * same student at either replica. A default doing that quietly is a coincidence
 * the proofs should not rest on.
 */
async function aServerOn(memoryPath: string): Promise<LiveServer> {
  const server = await startLiveServer({ memoryPath, identitySecret: A_TEST_SECRET })
  startedServers.push(server)
  return server
}

afterAll(async () => {
  for (const child of spawnedChildren) child.kill('SIGKILL')
  for (const store of openedStores) {
    /* Already-closed is the normal case: most proofs close as they go. Closing
     * twice must not be what turns a green suite red. */
    try {
      store.close()
    } catch {
      /* it was already closed */
    }
  }
  for (const server of startedServers) await server.close()
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/* -------------------------------------------------------------------------- */
/* Talking to the product the way a browser does.                              */
/* -------------------------------------------------------------------------- */

/**
 * The student id behind a browser's cookie.
 *
 * READ THE WAY THE SERVER READS IT, through `readCookie` and `verifyIdentity`,
 * so the raw-row checks address the row the product addresses. A test that
 * split the cookie itself could drift from the server and then assert
 * confidently about a key nothing uses.
 */
function theStudentBehind(browser: Browser): string {
  const token = readCookie(browser.identity(), IDENTITY_COOKIE)
  expect(token, 'the browser is holding no identity cookie').toBeDefined()
  const studentId = verifyIdentity(token as string, A_TEST_SECRET)
  expect(studentId, 'the identity cookie did not verify').toBeDefined()
  return studentId as string
}

/**
 * Give a browser an identity before anything else happens.
 *
 * LOAD-BEARING, NOT SETUP NOISE. A browser with an empty jar gets a NEW student
 * id on every request it makes, so firing twenty-four parallel writes from a
 * fresh browser would write twenty-four DIFFERENT keys and the "many writers,
 * one key" proof would silently become "one writer each, twenty-four keys" --
 * green, and about nothing.
 */
async function withAnIdentity(browser: Browser): Promise<string> {
  await browser.readMemory({ tabId: ONE_TAB, lessonId: 'a read that only mints the cookie' })
  return theStudentBehind(browser)
}

function put(
  browser: Browser,
  lessonId: string,
  record: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return browser.writeMemory({ tabId: ONE_TAB, lessonId, record })
}

/** Wait until the wall clock has genuinely moved past a stamped instant. */
async function untilTheClockPasses(instant: string): Promise<void> {
  const deadline = Date.now() + CLOCK_MOVE_TIMEOUT_MS
  while (new Date().toISOString() <= instant) {
    if (Date.now() > deadline) throw new Error('the clock never moved past the stored instant')
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
}

/* ========================================================================== */
/* 1. NEVER A MIX — a refused save leaves the previous record identical.      */
/* ========================================================================== */

describe('M4 · a refused save is not a partial save', () => {
  it('leaves the stored bytes exactly as they were when a save moves revealed backwards', async () => {
    const path = aFreshMemoryFile('refused-backwards')
    const server = await aServerOn(path)
    const student = aBrowser(server.origin)
    const studentId = await withAnIdentity(student)
    const key = memoryKey({ studentId, tabId: ONE_TAB, lessonId: A_LESSON })

    /* Five steps uncovered, three questions asked. This is what she has done. */
    const whatSheHasDone = aProgress(A_LESSON, 5, 3)
    expect(await put(student, A_LESSON, whatSheHasDone)).toEqual({ status: 200, body: { saved: true } })

    const before = theRowOnDisk(path, key)
    expect(before?.record, 'the first save never reached the disk').toBe(toStoredText(whatSheHasDone))

    /* A LATER SAVE CLAIMING SHE HAS SEEN LESS. A stale tab that woke up, a
     * retry carrying an older body, a race that arrived out of order -- all of
     * them look like this, and all of them would un-teach the lesson. */
    const claimingSheSawLess = aProgress(A_LESSON, 2, 3)
    const refused = await put(student, A_LESSON, claimingSheSawLess)

    /* 409, NOT 400 AND NOT 200. The record is well formed and perfectly
     * storable; it disagrees with what is already there. `handler.ts` says the
     * same thing in its own words, and a client needs that distinction to know
     * whether to fix its request or re-read the state. */
    expect(refused.status, `the body was ${JSON.stringify(refused.body)}`).toBe(409)

    /* THE WHOLE CLAIM, READ THROUGH A CONNECTION THAT WAS NEVER THE WRITER. Not
     * "mostly the same" and not "equal when parsed": the same bytes. */
    expect(theRowOnDisk(path, key)?.record).toBe(before?.record)
  })

  it('leaves the stored bytes exactly as they were when a save un-asks a question', async () => {
    const path = aFreshMemoryFile('refused-unasked')
    const server = await aServerOn(path)
    const student = aBrowser(server.origin)
    const studentId = await withAnIdentity(student)
    const key = memoryKey({ studentId, tabId: ONE_TAB, lessonId: A_LESSON })

    const whatSheHasDone = aProgress(A_LESSON, 5, 4)
    expect(await put(student, A_LESSON, whatSheHasDone)).toEqual({ status: 200, body: { saved: true } })
    const before = theRowOnDisk(path, key)

    /* SHE ASKED FOUR QUESTIONS. A save claiming two is claiming that two
     * questions she typed never happened. `revealed` is untouched here on
     * purpose: this proves the counters are guarded in their own right and not
     * as a side effect of one field being watched. */
    const claimingSheAskedFewer = aProgress(A_LESSON, 5, 2)
    const refused = await put(student, A_LESSON, claimingSheAskedFewer)
    expect(refused.status, `the body was ${JSON.stringify(refused.body)}`).toBe(409)

    expect(theRowOnDisk(path, key)?.record).toBe(before?.record)
  })

  it('does change the stored bytes when the next state is a sensible one, so the checks above are not vacuous', async () => {
    const path = aFreshMemoryFile('accepted-forward')
    const server = await aServerOn(path)
    const student = aBrowser(server.origin)
    const studentId = await withAnIdentity(student)
    const key = memoryKey({ studentId, tabId: ONE_TAB, lessonId: A_LESSON })

    const earlier = aProgress(A_LESSON, 5, 3)
    expect(await put(student, A_LESSON, earlier)).toEqual({ status: 200, body: { saved: true } })
    const before = theRowOnDisk(path, key)

    /* THE PAIR. "The bytes did not change" is satisfied completely by a store
     * that never writes anything, so a store that refuses everything has to
     * fail here. She uncovered another step and asked another question, which
     * is the ordinary thing a learner does next. */
    const later = aProgress(A_LESSON, 6, 4)
    expect(await put(student, A_LESSON, later)).toEqual({ status: 200, body: { saved: true } })

    const after = theRowOnDisk(path, key)
    expect(after?.record).toBe(toStoredText(later))
    expect(after?.record).not.toBe(before?.record)
  })
})

/* ========================================================================== */
/* 4. A THROW ROLLS BACK — the row is untouched, timestamp included.          */
/* ========================================================================== */

describe('M4 · a refusal rolls the whole transaction back', () => {
  it('leaves the row untouched, updated_at included, after a refused save', async () => {
    const path = aFreshMemoryFile('rollback')
    const server = await aServerOn(path)
    const student = aBrowser(server.origin)
    const studentId = await withAnIdentity(student)
    const key = memoryKey({ studentId, tabId: ONE_TAB, lessonId: A_LESSON })

    const whatSheHasDone = aProgress(A_LESSON, 9, 5)
    expect(await put(student, A_LESSON, whatSheHasDone)).toEqual({ status: 200, body: { saved: true } })

    const before = theRowOnDisk(path, key)
    expect(before, 'the first save never reached the disk').toBeDefined()

    /* THE CLOCK IS MOVED ON DELIBERATELY, BECAUSE OTHERWISE THIS PROOF COULD
     * PASS BY ACCIDENT. Two writes inside the same millisecond carry the same
     * ISO timestamp, so an accepted save would leave `updated_at` looking
     * untouched and the assertion below would be satisfied by the very defect
     * it exists to catch. Waiting until the clock has genuinely passed the
     * stored instant means any write at all must stamp a different value. */
    await untilTheClockPasses((before as RawRow).updatedAt)

    const refused = await put(student, A_LESSON, aProgress(A_LESSON, 1, 0))
    expect(refused.status, `the body was ${JSON.stringify(refused.body)}`).toBe(409)

    /* BOTH COLUMNS, THROUGH A FRESH CONNECTION. A rollback that restored the
     * record but left the timestamp moved wrote something during a save it
     * reported as refused, and "nothing was written" is the entire claim. */
    expect(theRowOnDisk(path, key)).toEqual(before)
  })
})

/* ========================================================================== */
/* 2. CONCURRENT WRITERS — one key, many writes, one whole survivor.          */
/* ========================================================================== */

describe('M4 · many writers, one key', () => {
  it('stores exactly one of the records that were actually submitted when many writes land at once', async () => {
    const path = aFreshMemoryFile('one-key-many-writers')
    const server = await aServerOn(path)
    const student = aBrowser(server.origin)
    const studentId = await withAnIdentity(student)
    const key = memoryKey({ studentId, tabId: ONE_TAB, lessonId: A_LESSON })

    /* Each writer submits a DIFFERENT record, so a blend of two is a value that
     * matches none of them and is caught. Records that were all identical would
     * make every possible outcome -- including a corrupt one -- look right. */
    const submitted = Array.from({ length: WRITERS_ON_ONE_KEY }, (_, i) =>
      aProgress(A_LESSON, i + 1, i, { writtenBy: `writer ${i}`, draft: `writer ${i} was typing` }),
    )

    /* FIRED TOGETHER, NOT IN A LOOP THAT AWAITS EACH ONE. A sequential loop is
     * twenty-four separate saves with nothing racing anything, and it would
     * pass against a store with no locking at all. */
    const answers = await Promise.all(submitted.map((record) => put(student, A_LESSON, record)))

    /* EVERY REQUEST GOT A DECIDED ANSWER. 200 means stored, 409 means refused
     * for a reason the caller can act on. A 500, or a dropped connection, is
     * the store telling a learner nothing about whether her work is safe. */
    const undecided = answers.filter((a) => a.status !== 200 && a.status !== 409)
    expect(undecided, `some writes got neither a save nor a refusal`).toEqual([])
    expect(answers.some((a) => a.status === 200), 'not one of the writes was stored').toBe(true)

    /* THE WHOLE CLAIM. The stored text must be one of the texts that was
     * actually sent -- never a blend of two, never a record with one writer's
     * counters and another's draft. */
    const submittedTexts = new Set(submitted.map((record) => toStoredText(record)))
    const stored = theRowOnDisk(path, key)
    expect(stored, 'nothing at all was stored').toBeDefined()
    expect(
      submittedTexts.has((stored as RawRow).record),
      `the stored record is not one anybody submitted:\n${(stored as RawRow).record}`,
    ).toBe(true)

    /* And it survives being read back as a record, rather than as text that
     * happens to match. */
    expect(() => fromStoredText((stored as RawRow).record)).not.toThrow()
  })
})

/* ========================================================================== */
/* 3. TWO SERVERS, ONE FILE — and one real second process.                    */
/* ========================================================================== */

describe('M4 · two servers, one file', () => {
  it('stores exactly one of the records that were actually submitted when two servers write one key at once', async () => {
    const path = aFreshMemoryFile('two-servers-one-key')
    const one = await aServerOn(path)
    const other = await aServerOn(path)

    /* THE SAME STUDENT AT BOTH REPLICAS. Two browsers would be two people
     * writing two different keys, and the proof would be about nothing. The
     * cookie carries across because both servers were given the same secret. */
    const atOne = aBrowser(one.origin)
    const studentId = await withAnIdentity(atOne)
    const atOther = aBrowser(other.origin)
    atOther.setIdentity(atOne.identity())
    expect(theStudentBehind(atOther), 'the two replicas disagree about who this is').toBe(studentId)

    const key = memoryKey({ studentId, tabId: ONE_TAB, lessonId: A_LESSON })

    const submitted = Array.from({ length: WRITERS_ON_ONE_KEY }, (_, i) =>
      aProgress(A_LESSON, i + 1, i, { writtenBy: `replica ${i % 2} writer ${i}` }),
    )

    /* Half at each replica, interleaved, all in flight together. This is the
     * shape a load balancer produces when one student's tab retries. */
    const answers = await Promise.all(
      submitted.map((record, i) =>
        put(i < WRITERS_PER_SERVER ? atOne : atOther, A_LESSON, record),
      ),
    )

    const undecided = answers.filter((a) => a.status !== 200 && a.status !== 409)
    expect(undecided, 'some writes got neither a save nor a refusal').toEqual([])
    expect(answers.some((a) => a.status === 200), 'not one of the writes was stored').toBe(true)

    const submittedTexts = new Set(submitted.map((record) => toStoredText(record)))
    const stored = theRowOnDisk(path, key)
    expect(stored, 'nothing at all was stored').toBeDefined()
    expect(
      submittedTexts.has((stored as RawRow).record),
      `the stored record is not one anybody submitted:\n${(stored as RawRow).record}`,
    ).toBe(true)
    /* A BUDGET OF ITS OWN, AND THE NUMBER IS NOT ARBITRARY. Two connections to
     * one file mean a writer can meet a lock, and `sqliteStore.ts` sets
     * `busy_timeout` to five seconds precisely so a busy database is a queue
     * rather than an error. Vitest's default budget is also five seconds, so
     * ONE legitimate wait was enough to fail this proof -- and a proof that
     * times out leaves its requests in flight, which is how three later tests
     * in this same file were handed 500s that had nothing to do with them. */
  }, A_GENEROUS_TIMEOUT_MS)

  it(
    'never shows a partly written record while a second operating-system process writes the same key',
    async () => {
      /* WHY A CHILD PROCESS AND NOT A THIRD SERVER. Two `startLiveServer`
       * replicas have two SQLite connections but ONE event loop, so their
       * synchronous transactions take turns and can never truly overlap. A
       * spawned process has its own loop and its own connection, and its writes
       * land whenever the operating system decides. That is the only
       * arrangement in this file where a read-then-write that is not one
       * transaction can actually be caught in the middle. */
      const path = aFreshMemoryFile('two-processes-one-key')
      const owner = { studentId: 'two:processes', tabId: ONE_TAB, lessonId: A_LESSON }
      const key = memoryKey(owner)

      const childRecords = aRacingFamily(A_LESSON, 'the child process')
      const parentRecords = aRacingFamily(A_LESSON, 'the parent process')

      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          theProgramThatWritesOneKeyForever(
            aPayloadFile(path, { path, owner, records: childRecords }),
          ),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      spawnedChildren.push(child)
      const heard = await theChildSpeaks(child)

      /* The child has written at least once and is still writing. Everything
       * observed from here on was observed while two processes held the file. */
      const observed: string[] = []
      const firstSeen = theRowOnDisk(path, key)
      expect(
        firstSeen,
        `the child never reached the disk.\nstdout: ${heard.out}\nstderr: ${heard.err}`,
      ).toBeDefined()
      observed.push((firstSeen as RawRow).record)

      const parent = canvasMemory({ store: openStore(path), log: () => {} })
      for (let round = 0; round < RACE_ROUNDS; round += 1) {
        parent.write(owner, parentRecords[round % parentRecords.length])
        const seen = theRowOnDisk(path, key)
        expect(seen, 'the key vanished while two processes were writing it').toBeDefined()
        observed.push((seen as RawRow).record)
      }

      child.kill('SIGKILL')

      /* EVERY VALUE EVER SEEN WAS A WHOLE RECORD SOMEBODY SENT. A store that
       * let one writer's bytes land on top of another's would show a value here
       * belonging to neither family, and this is where it is caught. */
      const whole = new Set([...childRecords, ...parentRecords].map((r) => toStoredText(r)))
      const strangers = observed.filter((text) => !whole.has(text))
      expect(strangers.slice(0, 1), 'a value appeared that neither writer ever sent').toEqual([])

      /* NON-VACUOUS BY CONSTRUCTION. The first observation was taken BEFORE the
       * parent wrote anything, so it can only have come from the other process.
       * Without this the whole proof would pass on a run where the child never
       * started. */
      const childTexts = new Set(childRecords.map((r) => toStoredText(r)))
      expect(
        childTexts.has(observed[0]),
        'the first value seen did not come from the child, so the two never really shared the file',
      ).toBe(true)
    },
    CHILD_TEST_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* 5. LESSON A NEVER CHANGES LESSON B — the phase's stated Done-when.         */
/* ========================================================================== */

describe('M4 · writing to lesson A never changes lesson B', () => {
  it(
    'leaves every other lesson byte-identical while one lesson is written over and over',
    async () => {
      const path = aFreshMemoryFile('lesson-isolation')
      const server = await aServerOn(path)
      const student = aBrowser(server.origin)
      await withAnIdentity(student)

      const lessons = await someGeneratedLessons(student, DRAWS, ENOUGH_LESSONS_TO_BE_A_PROPERTY)

      /* THE SNAPSHOT IS OF THE WHOLE FILE, NOT OF THE LESSONS THIS TEST NAMED.
       * A write that invented a row, or renamed one, would be invisible to a
       * check that only looked where it expected something. */
      const before = everyRowOnDisk(path)
      const hammered = lessons[0]
      const hammeredKey = memoryKey({
        studentId: theStudentBehind(student),
        tabId: ONE_TAB,
        lessonId: hammered,
      })

      /* THE HAMMER MIXES SAVES THAT MUST BE KEPT WITH SAVES THAT MUST BE
       * REFUSED. A rollback is the operation most likely to reach too far, so a
       * proof that only ever wrote successfully would miss the very case where
       * a neighbour gets unwound. Both outcomes are acceptable answers here;
       * what is not acceptable is a neighbour changing. */
      for (let i = 0; i < HAMMER_WRITES; i += 1) {
        const goesForward = i % 2 === 0
        const answer = await put(
          student,
          hammered,
          goesForward
            ? aProgress(hammered, 10 + i, 5 + i, { draft: `round ${i}` })
            : aProgress(hammered, 0, 0, { draft: `round ${i} tries to un-teach the lesson` }),
        )
        expect(
          answer.status === 200 || answer.status === 409,
          `round ${i} got ${answer.status}: ${JSON.stringify(answer.body)}`,
        ).toBe(true)
      }

      const after = everyRowOnDisk(path)

      /* Every other lesson, byte for byte, timestamp included. */
      for (const [key, row] of before) {
        if (key === hammeredKey) continue
        expect(after.get(key), `seed=${PROPERTY_SEED}: a neighbouring lesson changed at key ${key}`).toEqual(row)
      }
      /* And no row appeared that nobody wrote. */
      expect([...after.keys()].filter((k) => !before.has(k)), 'a row appeared from nowhere').toEqual([])

      /* THE PAIR. The hammered lesson MUST have moved, or this whole property
       * is satisfied by a server that ignored every request. */
      expect(after.get(hammeredKey)?.record).not.toBe(before.get(hammeredKey)?.record)
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'refuses a save whose record names a different lesson than its key, and changes neither lesson',
    async () => {
      /* THIS IS "LESSON A CHANGES LESSON B" ARRIVING THROUGH THE FRONT DOOR.
       * The key says one lesson and the document inside says another. Storing
       * it puts lesson B's work in lesson A's drawer, and the next reader of
       * either one gets an answer about the wrong lesson. `reconcile` is handed
       * the lesson id FROM THE KEY for exactly this comparison. */
      const path = aFreshMemoryFile('lesson-mislabelled')
      const server = await aServerOn(path)
      const student = aBrowser(server.origin)
      const studentId = await withAnIdentity(student)

      const lessons = await someGeneratedLessons(student, DRAWS, ENOUGH_LESSONS_TO_BE_A_PROPERTY)
      const before = everyRowOnDisk(path)

      let attempted = 0
      let refused = 0
      let firstNotRefused: { lessonId: string; named: string; status: number } | undefined
      for (let i = 0; i < lessons.length; i += 1) {
        const lessonId = lessons[i]
        const named = lessons[(i + 1) % lessons.length]
        if (named === lessonId) continue

        attempted += 1
        const answer = await put(student, lessonId, aProgress(named, 99, 9, { smuggled: true }))
        if (answer.status === 409) refused += 1
        else if (firstNotRefused === undefined) {
          firstNotRefused = { lessonId, named, status: answer.status }
        }
      }

      /* COUNTED AGAINST THE NUMBER ATTEMPTED, NOT AGAINST ITSELF. "every one was
       * refused" is the claim, and comparing a tally to itself would be
       * satisfied by a run that attempted nothing. */
      expect(attempted, 'no cross-lesson save was attempted at all').toBeGreaterThanOrEqual(
        ENOUGH_LESSONS_TO_BE_A_PROPERTY,
      )
      expect(
        { refused, firstNotRefused },
        `seed=${PROPERTY_SEED}: a record naming another lesson was accepted`,
      ).toEqual({ refused: attempted, firstNotRefused: undefined })

      /* NOT ONE ROW MOVED -- not the key that was written to, and not the
       * lesson whose name was smuggled inside the record. */
      expect(everyRowOnDisk(path)).toEqual(before)

      /* AND THE SAME THING THROUGH A SECOND SERVER ON THE SAME FILE, because a
       * check that lives in one process is a check a second replica can miss. */
      const other = await aServerOn(path)
      const sameStudentElsewhere = aBrowser(other.origin)
      sameStudentElsewhere.setIdentity(student.identity())
      expect(theStudentBehind(sameStudentElsewhere)).toBe(studentId)

      const acrossReplicas = await put(
        sameStudentElsewhere,
        lessons[0],
        aProgress(lessons[1], 99, 9, { smuggled: 'via the other replica' }),
      )
      expect(
        acrossReplicas.status,
        `the second replica answered ${JSON.stringify(acrossReplicas.body)}`,
      ).toBe(409)
      expect(everyRowOnDisk(path)).toEqual(before)
    },
    A_GENEROUS_TIMEOUT_MS,
  )

  it(
    'leaves every other lesson byte-identical when the hammering happens on a second server sharing the file',
    async () => {
      const path = aFreshMemoryFile('lesson-isolation-two-servers')
      const one = await aServerOn(path)
      const student = aBrowser(one.origin)
      const studentId = await withAnIdentity(student)

      const lessons = await someGeneratedLessons(
        student,
        LESSONS_ACROSS_TWO_SERVERS * DRAWS_PER_LESSON_WANTED,
        LESSONS_ACROSS_TWO_SERVERS,
      )
      const before = everyRowOnDisk(path)

      /* The hammering moves to a DIFFERENT connection to the same file. A store
       * that kept an index in process memory, or that rewrote the file whole,
       * loses the other lessons here and nowhere else. */
      const other = await aServerOn(path)
      const sameStudentElsewhere = aBrowser(other.origin)
      sameStudentElsewhere.setIdentity(student.identity())
      expect(theStudentBehind(sameStudentElsewhere)).toBe(studentId)

      const hammered = lessons[0]
      const hammeredKey = memoryKey({ studentId, tabId: ONE_TAB, lessonId: hammered })
      for (let i = 0; i < HAMMER_WRITES; i += 1) {
        const answer = await put(
          sameStudentElsewhere,
          hammered,
          aProgress(hammered, 10 + i, 5 + i, { draft: `replica two, round ${i}` }),
        )
        expect(answer.status, `round ${i}: ${JSON.stringify(answer.body)}`).toBe(200)
      }

      const after = everyRowOnDisk(path)
      for (const [key, row] of before) {
        if (key === hammeredKey) continue
        expect(after.get(key), `a neighbouring lesson changed at key ${key}`).toEqual(row)
      }
      expect(after.get(hammeredKey)?.record).not.toBe(before.get(hammeredKey)?.record)
    },
    A_GENEROUS_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* 6. CRASH MID-WRITE — whole records only, never a half.                     */
/* ========================================================================== */

describe('M4 · a crash in the middle of writing leaves whole records only', () => {
  it(
    'leaves every key holding a complete record after the writer is SIGKILLed mid-loop',
    async () => {
      const path = aFreshMemoryFile('crash-mid-write')

      /* SEVERAL KEYS AND SEVERAL ROUNDS, WRITTEN CONTINUOUSLY. One key written
       * once could only be killed before or after; a loop across keys means the
       * signal has somewhere to land in the middle. Each record is padded so a
       * single write is not instantaneous. */
      const keys = Array.from({ length: CRASH_KEYS }, (_, i) => ({
        owner: {
          studentId: 'killed:mid-write',
          tabId: ONE_TAB,
          lessonId: `${A_LESSON} — part ${i}`,
        },
        records: aRacingFamily(
          `${A_LESSON} — part ${i}`,
          'the child that was killed',
          A_RECORD_BIG_ENOUGH_TO_BE_CAUGHT_MID_WRITE,
        ),
      }))

      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          theProgramThatWritesEveryKeyForever(aPayloadFile(path, { path, keys })),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      spawnedChildren.push(child)
      const heard = await theChildSpeaks(child)

      /* Let it get well into the loop, so the kill is not politely waiting for
       * a gap between writes. */
      await new Promise<void>((resolve) => setTimeout(resolve, A_MOMENT_OF_WRITING_MS))

      /* Registered BEFORE the signal. A listener attached afterwards can miss
       * an exit that already happened, and the test would wait forever. */
      const died = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        child.on('exit', (code, signal) => {
          resolve({ code, signal })
        })
      })
      child.kill('SIGKILL')
      const how = await died

      /* THIS IS WHAT MAKES IT A CRASH RATHER THAN A SHUTDOWN, AND IT IS
       * ASSERTED. A process that exits with a CODE ran to the end of itself:
       * handlers fired, buffers flushed, the database closed. SIGKILL cannot be
       * caught, handled or ignored. If this ever reports a code instead, every
       * assertion below is about a polite close. */
      expect(how.signal, `stdout: ${heard.out}\nstderr: ${heard.err}`).toBe('SIGKILL')
      expect(how.code).toBeNull()

      /* THE FILE STILL PARSES -- opened by a process that was never the writer,
       * which is what a restart after a crash actually is. */
      const rows = everyRowOnDisk(path)
      expect(rows.size, 'the crashed child left nothing at all behind').toBeGreaterThan(0)

      for (const key of keys) {
        const stored = rows.get(memoryKey(key.owner))
        expect(stored, `key ${key.owner.lessonId} lost everything in the crash`).toBeDefined()

        /* EITHER A COMPLETE OLD RECORD OR A COMPLETE NEW ONE. The child cycled
         * a listable family, so any value that is not a member of it is a value
         * nobody ever wrote -- which is what half a record looks like. */
        const family = new Set(key.records.map((r) => toStoredText(r)))
        expect(
          family.has((stored as RawRow).record),
          `key ${key.owner.lessonId} holds ${(stored as RawRow).record.length} bytes that nobody wrote`,
        ).toBe(true)

        /* And it reads back as a record rather than as text. */
        expect(() => fromStoredText((stored as RawRow).record)).not.toThrow()
      }

      /* THE PAIR. A store that came back claiming to hold a memory nobody gave
       * it is not a store that survived a crash; it is one making things up. */
      const neverWritten = memoryKey({
        studentId: 'killed:mid-write',
        tabId: ONE_TAB,
        lessonId: `${A_LESSON} — a part the child never wrote`,
      })
      expect(rows.get(neverWritten)).toBeUndefined()
    },
    CHILD_TEST_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* 7. NO ACKNOWLEDGED STEP IS EVER LOST — five processes, one key, one count. */
/* ========================================================================== */

/*
 * WHY THIS PROOF DRIVES `MemoryStore.update` AND NOT `canvasMemory.write`.
 *
 *   `update` is the ONLY interface in this product that can express a
 *   read-decide-write, and `store.ts` says so in the comment that defines it:
 *   "Read a key and write it back, with nothing able to slip in between."
 *   `canvasMemory.write` is a thin caller of exactly that function -- it hands
 *   `update` a `change` callback whose whole body is `reconcile`.
 *
 *   It cannot be used HERE because the record it stores is fixed before the
 *   call. `reconcile` may accept a proposal or refuse it; it cannot merge one.
 *   A writer that read `revealed: 5` outside the transaction and proposed
 *   `revealed: 6` would be ACCEPTED even when the stored value had already
 *   moved to 6 -- the monotonic rule permits equality on purpose, because two
 *   devices restoring the same state is not a mistake. So a count taken through
 *   `write` would drift for a perfectly correct store, and the proof would be
 *   about arithmetic rather than about locking.
 *
 *   The children below therefore call `update` directly, and their callback is
 *   `store.ts`'s own body with one line added: read what is there, add the step
 *   she just uncovered, hand it to the real `reconcile`, encode it with the real
 *   `record.ts`. Every module in that sentence is the shipped one.
 *
 * WHY THE COUNTER IS `revealed`, IN A REAL CANVAS-PROGRESS RECORD.
 *
 *   `progress.ts` names it: "There is no `mastery` field in this product ... The
 *   real fact with that meaning is `revealed`: how much of the lesson she has
 *   uncovered." Counting it means a lost increment is not an abstract lost
 *   update -- it is a step of the lesson a child worked through and the store
 *   forgot. It also keeps every intermediate state one `reconcile` accepts, so
 *   nothing in the loop can be refused for a reason other than the file.
 *
 * WHAT WAS MEASURED, SO THE ASSERTIONS BELOW ARE NOT GUESSES.
 *
 *   Run against the real store, five processes, a hundred and twenty
 *   increments each, three times: 600 attempted, 600 acknowledged, 600 stored.
 *
 *   Run with `BEGIN IMMEDIATE` changed to `BEGIN DEFERRED`, three times: 600
 *   attempted, 44-69 acknowledged, and 531-556 refused outright with "database
 *   is locked".
 *
 *   SO THE DEFECT DOES NOT ARRIVE AS SILENT LOSS HERE, AND SAYING SO MATTERS.
 *   Under WAL, a transaction that read an old snapshot and then tries to write
 *   is stopped by SQLite rather than allowed to overwrite -- the lost update
 *   becomes an error instead. It is the same bug wearing a different coat: nine
 *   in ten of a learner's saves come back as failures. Both faces are asserted
 *   below, because a future change to journal mode would swap which one shows,
 *   and the promise -- her work is not lost and she is not told it failed -- is
 *   the same either way.
 */

describe('M4 · five real processes counting up one memory', () => {
  it(
    'keeps every acknowledged step and turns nobody away while five processes read and write one key at once',
    async () => {
      const path = aFreshMemoryFile('no-step-is-ever-lost')
      const owner = { studentId: 'five:replicas 🧪', tabId: ONE_TAB, lessonId: A_LESSON }
      const key = memoryKey(owner)

      /* THE PARENT OPENS THE FILE FIRST, AND THAT IS LOAD-BEARING. Opening
       * switches the journal to WAL, which takes a brief EXCLUSIVE lock. Five
       * children arriving on an EMPTY path all try to do it at once, and
       * MEASURED: one of them died at boot with "database is locked" before it
       * had written anything. That is a real defect and `sqliteStore.ts`
       * already documents it -- it is simply not the one this proof is aimed
       * at, and a child that never started would quietly weaken the race. */
      const memory = canvasMemory({ store: openStore(path), log: () => {} })

      /* Nothing uncovered yet. Every increment below is one more step of the
       * lesson she has seen. */
      const nothingSeenYet = aProgress(A_LESSON, 0, A_SETTLED_QUESTION_COUNT)

      const startAt = Date.now() + CHILDREN_GET_THIS_LONG_TO_START_MS
      const watching = Array.from({ length: RACING_PROCESSES }, (_, i) => {
        const payload = aFileBeside(
          path,
          `counting-${i}.json`,
          JSON.stringify({
            path,
            key,
            lessonId: A_LESSON,
            base: nothingSeenYet,
            increments: INCREMENTS_EACH_PROCESS_MAKES,
            startAt,
            who: `process ${i}`,
          }),
        )
        /* THE PROGRAM GOES IN A FILE, NOT IN `-e`. Measured earlier in this same
         * file: a large program passed on the command line was refused outright
         * with `E2BIG`, because the operating system caps the size of an
         * argument list. A file has no such ceiling and is removed with the
         * temp directory it sits in. */
        const program = aFileBeside(path, `counting-${i}.mjs`, theProgramThatCountsUpOneKey(payload))
        const child = spawn(process.execPath, [program], { stdio: ['ignore', 'pipe', 'pipe'] })
        spawnedChildren.push(child)
        return whileTheChildRuns(child)
      })

      /* All five have booted Node, imported the real modules and opened the
       * file. Only then is the shared instant still ahead of them. */
      for (const watch of watching) await watch.until(CHILD_IS_READY)

      const deaths = await Promise.all(watching.map((watch) => watch.ended))
      deaths.forEach((how, i) => {
        expect(
          how.code,
          `process ${i} did not finish cleanly (signal ${how.signal}).\n` +
            `stderr: ${watching[i].heard.err}`,
        ).toBe(0)
      })

      const reports = watching.map((watch) => whatTheChildCounted(watch.heard))

      /* THE CONTENDED WINDOW IS MEASURED, NOT HOPED FOR.
       *
       * Each child reports the instant it began and the instant it finished. If
       * the last one to start began before the first one finished, then there
       * was a moment when all five were inside the loop together. Without this
       * the whole proof would pass on a run where they took polite turns, which
       * is precisely the run that cannot see either defect. */
      const lastToStart = Math.max(...reports.map((report) => report.firstAt))
      const firstToFinish = Math.min(...reports.map((report) => report.lastAt))
      expect(
        firstToFinish - lastToStart,
        `the ${RACING_PROCESSES} processes never overlapped, so nothing raced anything:\n` +
          reports.map((r) => `${r.who} ${r.firstAt}..${r.lastAt}`).join('\n'),
      ).toBeGreaterThan(0)

      /* NOBODY WAS TOLD HER WORK DID NOT SAVE.
       *
       * A busy database is a queue. `sqliteStore.ts` says that in its own words
       * and gives it five seconds to be true in. A save refused because another
       * process happened to be writing is a child told her afternoon did not
       * save when it was merely a moment late. */
      const refusals = reports.flatMap((report) => report.refusals)
      expect(
        refusals.slice(0, 3),
        `${refusals.length} of ${EVERY_INCREMENT} saves were turned away while ` +
          `${RACING_PROCESSES} processes shared one file`,
      ).toEqual([])

      const acknowledged = reports.reduce((total, report) => total + report.acknowledged, 0)
      expect(acknowledged, 'not every attempted step was acknowledged').toBe(EVERY_INCREMENT)

      /* AND EVERY ACKNOWLEDGED STEP IS STILL THERE.
       *
       * Compared as TEXT, and the text is built from the same fixture the
       * children started from, so the assertion covers the whole record and not
       * just the number in it: a store that kept the count but rebuilt the rest
       * of her progress is caught here too. Read through a connection that was
       * never one of the writers. */
      const everyStepShouldStillBeThere = toStoredText({
        ...nothingSeenYet,
        revealed: acknowledged,
      })
      const stored = theRowOnDisk(path, key)
      expect(stored, 'the five processes left nothing at all behind').toBeDefined()
      expect(
        (stored as RawRow).record,
        `${acknowledged} steps were acknowledged and this is what the file holds`,
      ).toBe(everyStepShouldStillBeThere)

      /* AND THE PRODUCT'S OWN FRONT DOOR AGREES. A file that is right and a
       * `read()` that cannot see it is still a learner staring at lost work. */
      const throughTheFrontDoor = memory.read(owner)
      expect(throughTheFrontDoor, 'the product cannot see the memory its own store holds').toBeDefined()
      expect(toStoredText(throughTheFrontDoor)).toBe(everyStepShouldStillBeThere)
    },
    CHILD_TEST_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* 8. A BUSY DATABASE IS A QUEUE, NOT AN ERROR.                               */
/* ========================================================================== */

/*
 * TWO STUDENTS, TWO KEYS, ONE FILE -- AND THE SECOND ONE MUST NOT BE PUNISHED
 * FOR THE FIRST ONE BEING SLOW.
 *
 *   The keys are DIFFERENT on purpose. If both wrote the same record the proof
 *   would be about a contested memory, and a store could pass it by refusing one
 *   of them for a perfectly good reason. Two different students saving two
 *   different lessons have no disagreement with each other at all; the only
 *   thing they share is the file. So the only reason the second could fail is
 *   that the file was busy, and "the file was busy" is not a reason to tell a
 *   child her work did not save.
 *
 * THE HOLDER IS THE REAL PRODUCT, NOT A HAND-WRITTEN TRANSACTION.
 *
 *   The child calls `sqliteMemoryStore(...).update()` and takes its time inside
 *   the `change` callback -- which is the caller's own code, and is allowed to
 *   think. `BEGIN IMMEDIATE` means the write lock is already held when that
 *   callback runs, so a slow decision is a genuinely held lock, produced by the
 *   shipped code doing exactly what it was written to do. Nothing here reaches
 *   around the product to arrange the collision.
 *
 * MEASURED, against a 1,200ms hold:
 *   with `busy_timeout = 5000` the second save waited 1,299ms and landed, and
 *   both students' records were on disk afterwards;
 *   with `busy_timeout = 0` it threw "database is locked" after 1ms and the
 *   second student's row was NOT THERE AT ALL.
 */

describe('M4 · a busy database is a queue, not an error', () => {
  it(
    'stores the next student\'s work while another process is still inside its own save',
    async () => {
      const path = aFreshMemoryFile('a-busy-database-is-a-queue')

      const slow = { studentId: 'the student whose save is slow', tabId: ONE_TAB, lessonId: A_LESSON }
      const inTheNextSeat = { studentId: 'the student in the next seat', tabId: ONE_TAB, lessonId: A_LESSON }
      const slowKey = memoryKey(slow)
      const nextSeatKey = memoryKey(inTheNextSeat)

      /* OPENED BEFORE THE LOCK IS TAKEN. Opening switches the journal to WAL,
       * which needs a lock of its own; doing it while another process is
       * mid-transaction would test the wrong moment. */
      const memory = canvasMemory({ store: openStore(path), log: () => {} })

      const whatTheSlowOneIsSaving = aProgress(A_LESSON, 4, 2, { writtenBy: 'the slow save' })
      const payload = aFileBeside(
        path,
        'holder.json',
        JSON.stringify({
          path,
          key: slowKey,
          at: new Date().toISOString(),
          text: toStoredText(whatTheSlowOneIsSaving),
          holdMs: A_SLOW_SAVE_HOLDS_THE_LOCK_MS,
        }),
      )
      const child = spawn(
        process.execPath,
        [aFileBeside(path, 'holder.mjs', theProgramThatHoldsTheWriteLock(payload))],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      spawnedChildren.push(child)
      const watch = whileTheChildRuns(child)
      await watch.until(CHILD_HOLDS_THE_WRITE_LOCK)

      /* THE LOCK IS GENUINELY HELD, AND IT IS PROVED RATHER THAN TIMED.
       *
       * The holder announced itself from INSIDE its transaction, so its record
       * has been written and not yet committed. A connection that was never the
       * writer therefore cannot see it. If it CAN, the transaction has already
       * closed, nothing is holding the file, and everything below would pass
       * without testing anything. */
      expect(
        theRowOnDisk(path, slowKey),
        'the slow save had already committed, so nothing was holding the file',
      ).toBeUndefined()

      /* THE NEXT STUDENT PRESSES SAVE. Through the product's front door, which
       * is what her browser reaches. */
      const whatSheTyped = aProgress(A_LESSON, 6, 3, { writtenBy: 'the student in the next seat' })
      const pressedSaveAt = Date.now()
      let toldItFailed: unknown
      try {
        memory.write(inTheNextSeat, whatSheTyped)
      } catch (thrown) {
        toldItFailed = thrown
      }
      const waited = Date.now() - pressedSaveAt

      expect(
        toldItFailed === undefined ? undefined : String((toldItFailed as Error).message),
        'the next student was told her work did not save, when the database was merely busy',
      ).toBeUndefined()

      /* THE OUTCOME SHE CARES ABOUT: her work is in the file, byte for byte,
       * read by a connection that was never the writer. */
      expect(theRowOnDisk(path, nextSeatKey)?.record).toBe(toStoredText(whatSheTyped))

      /* AND SHE REALLY DID QUEUE FOR IT.
       *
       * NOT THE CLAIM -- the claim is the line above. This is what stops the
       * claim being satisfied by a save that sailed past a lock nobody was
       * holding, and it is why the holder's hold is measured in seconds rather
       * than microseconds. */
      expect(
        waited,
        'the save returned immediately, so it never met the held lock at all',
      ).toBeGreaterThanOrEqual(A_SAVE_THAT_REALLY_QUEUED_MS)

      /* AND NOBODY LOST ANYTHING. The slow student's own save committed too,
       * with the bytes she sent. A store that let the second writer through by
       * throwing the first one away has not queued; it has chosen. */
      await watch.until(CHILD_RELEASED_THE_WRITE_LOCK)
      const how = await watch.ended
      expect(how.code, `the slow saver died (signal ${how.signal}).\nstderr: ${watch.heard.err}`).toBe(0)
      expect(theRowOnDisk(path, slowKey)?.record).toBe(toStoredText(whatTheSlowOneIsSaving))
    },
    CHILD_TEST_TIMEOUT_MS,
  )
})

/* -------------------------------------------------------------------------- */
/* The generated lesson space, and the child programs.                         */
/* -------------------------------------------------------------------------- */

/**
 * Create as many real lessons as the generator can, and refuse to be vacuous.
 *
 * `anIdentityPart` deliberately draws ids `key.ts` REFUSES -- padded with
 * spaces, tabs or newlines. Those get a 400 and never become lessons, which is
 * correct and is not this proof's subject. What matters is that the ones that
 * ARE lessons are numerous and awkward: colons, percent escapes, emoji,
 * two-hundred-character walls. A run that produced a handful is reported as a
 * broken property rather than passed.
 */
async function someGeneratedLessons(
  student: Browser,
  draws: number,
  atLeast: number,
): Promise<string[]> {
  const rng = seededRandom(PROPERTY_SEED)
  const seen = new Set<string>()
  const lessons: string[] = []

  for (let i = 0; i < draws; i += 1) {
    const lessonId = anIdentityPart(rng)
    if (seen.has(lessonId)) continue
    seen.add(lessonId)

    const answer = await put(student, lessonId, aProgress(lessonId, 1, 1, { drawnAt: i }))
    if (answer.status === 200) {
      lessons.push(lessonId)
      continue
    }
    /* The only other answer this layer may give to a generated id is "that is
     * not a usable name". Anything else means the store refused a lesson for a
     * reason nobody stated. */
    expect(
      answer.status,
      `seed=${PROPERTY_SEED} lessonId=${JSON.stringify(lessonId)}: ${JSON.stringify(answer.body)}`,
    ).toBe(400)
  }

  expect(
    lessons.length,
    `seed=${PROPERTY_SEED}: too few lessons were created for this to be a property`,
  ).toBeGreaterThanOrEqual(atLeast)

  return lessons
}

/**
 * Wait until a spawned child says its first write RETURNED.
 *
 * THE RETURN IS THE ACKNOWLEDGEMENT, and it is what the proofs above test the
 * durability of. A marker printed before the write would claim a save that had
 * not happened. The child's own output is carried back so that "it timed out"
 * is never the only thing a failure says.
 */
async function theChildSpeaks(child: ChildProcess): Promise<{ out: string; err: string }> {
  const heard = { out: '', err: '' }
  child.stdout.on('data', (chunk) => {
    heard.out += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    heard.err += String(chunk)
  })

  const deadline = Date.now() + CHILD_MARKER_TIMEOUT_MS
  while (!heard.out.includes(CHILD_WROTE_ONCE)) {
    if (Date.now() > deadline) {
      throw new Error(
        `the child never acknowledged a write within ${CHILD_MARKER_TIMEOUT_MS}ms.\n` +
          `stdout: ${JSON.stringify(heard.out)}\nstderr: ${JSON.stringify(heard.err)}`,
      )
    }
    await new Promise<void>((resolve) => setTimeout(resolve, CHILD_POLL_MS))
  }
  return heard
}

/**
 * Hand a child its instructions through a FILE beside the database.
 *
 * NOT THROUGH THE COMMAND LINE, AND THAT IS MEASURED RATHER THAN PREFERRED. The
 * crash proof's records are padded to tens of kilobytes each so that a kill can
 * land inside a write, which makes the whole payload megabytes; the operating
 * system has a hard ceiling on the size of an argument list and `spawn` refused
 * it outright with `E2BIG`. A file has no such ceiling, and it keeps the
 * hazards -- colons, percent escapes, emoji, quotes -- inside the VALUE rather
 * than turning the proof into a proof about argv encoding.
 *
 * It is written beside the database file, inside a directory `afterAll` already
 * removes, so nothing is left behind.
 */
function aPayloadFile(databasePath: string, payload: unknown): string {
  const file = `${databasePath}.payload.json`
  writeFileSync(file, JSON.stringify(payload), { encoding: 'utf8' })
  return file
}

/** The two real modules a child loads, so a child proves the PRODUCT, not itself. */
function theRealProduct(): { store: string; sqlite: string } {
  return {
    store: JSON.stringify(new URL('store.ts', import.meta.url).href),
    sqlite: JSON.stringify(new URL('sqliteStore.ts', import.meta.url).href),
  }
}

/**
 * A child that writes ONE key, round after round, until it is killed.
 *
 * WHY THE LOOP GOES THROUGH `setImmediate` INSTEAD OF `while (true)`. A tight
 * synchronous loop never returns to the event loop, and Node's stdout to a pipe
 * is asynchronous -- the marker would never reach the parent and the proof
 * would hang instead of failing. Yielding each round also lets the operating
 * system interleave this process with the parent, which is the entire point.
 */
function theProgramThatWritesOneKeyForever(payloadPath: string): string {
  const real = theRealProduct()
  return `
import { readFileSync } from 'node:fs'
import { canvasMemory } from ${real.store}
import { sqliteMemoryStore } from ${real.sqlite}

const asked = JSON.parse(readFileSync(${JSON.stringify(payloadPath)}, 'utf8'))

/* THE REAL PRODUCT, NOT A COPY OF IT. A child that wrote to SQLite itself would
 * make the proof a proof about the child. */
const memory = canvasMemory({ store: sqliteMemoryStore(asked.path), log: () => {} })

let round = 0
const tick = () => {
  memory.write(asked.owner, asked.records[round % asked.records.length])
  round += 1
  if (round === 1) console.log(${JSON.stringify(CHILD_WROTE_ONCE)})
  setImmediate(tick)
}
tick()
`
}

/**
 * Write any file beside the database, inside the directory `afterAll` removes.
 *
 * The same argument `aPayloadFile` makes above, generalised because the proofs
 * below need FIVE payloads and five programs rather than one of each, and two
 * children handed the same filename would each be running the other's
 * instructions.
 */
function aFileBeside(databasePath: string, suffix: string, contents: string): string {
  const file = `${databasePath}.${suffix}`
  writeFileSync(file, contents, { encoding: 'utf8' })
  return file
}

/** Everything a spawned child says, and the two moments worth waiting for. */
interface ChildWatch {
  /** Everything it has printed so far, on both streams. */
  readonly heard: { out: string; err: string }
  /** Resolve once it has printed this line. Throws, quoting both streams, if it never does. */
  until(line: string): Promise<void>
  /** How it ended. */
  readonly ended: Promise<{ code: number | null; signal: string | null }>
}

/**
 * Watch a child from the moment it is spawned.
 *
 * SEPARATE FROM `theChildSpeaks` ABOVE, WHICH WAITS FOR ONE FIXED MARKER AND
 * NOTHING ELSE. These proofs need to wait for several different lines, and to
 * wait for the EXIT as well -- a counting child reports its tally on the way
 * out, and a suite that waited for a marker that will never come would hang
 * rather than fail, which is the failure nobody can read.
 *
 * The `exit` listener is attached here, at spawn time, for the reason the crash
 * proof already states: one attached later can miss an exit that has already
 * happened.
 */
function whileTheChildRuns(child: ChildProcess): ChildWatch {
  const heard = { out: '', err: '' }
  child.stdout.on('data', (chunk) => {
    heard.out += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    heard.err += String(chunk)
  })

  let over = false
  const ended = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      over = true
      resolve({ code, signal })
    })
  })

  return {
    heard,
    ended,
    async until(line) {
      const deadline = Date.now() + CHILD_MARKER_TIMEOUT_MS
      while (!heard.out.includes(line)) {
        if (over) {
          /* ONE LAST LOOK BEFORE GIVING UP. `exit` can arrive before the final
           * chunk of stdout has been handed over, so a line printed on the way
           * out must not be reported as never printed. */
          await new Promise<void>((resolve) => setTimeout(resolve, CHILD_POLL_MS * 5))
          if (heard.out.includes(line)) return
          throw new Error(
            `the child exited without ever printing ${JSON.stringify(line)}.\n` +
              `stdout: ${JSON.stringify(heard.out)}\nstderr: ${JSON.stringify(heard.err)}`,
          )
        }
        if (Date.now() > deadline) {
          throw new Error(
            `the child never printed ${JSON.stringify(line)} within ${CHILD_MARKER_TIMEOUT_MS}ms.\n` +
              `stdout: ${JSON.stringify(heard.out)}\nstderr: ${JSON.stringify(heard.err)}`,
          )
        }
        await new Promise<void>((resolve) => setTimeout(resolve, CHILD_POLL_MS))
      }
    },
  }
}

/** What one counting child did, in its own words. */
interface CountingReport {
  readonly who: string
  /** Increments whose `update` RETURNED. Only these are claims the store made. */
  readonly acknowledged: number
  /** Why the rest were turned away, in the store's own words. */
  readonly refusals: readonly string[]
  /** When it began and when it stopped, so overlap can be measured rather than assumed. */
  readonly firstAt: number
  readonly lastAt: number
}

function whatTheChildCounted(heard: { out: string; err: string }): CountingReport {
  const line = heard.out.split('\n').find((printed) => printed.startsWith(CHILD_COUNTED))
  if (line === undefined) {
    throw new Error(
      `a counting child never reported its tally.\n` +
        `stdout: ${JSON.stringify(heard.out)}\nstderr: ${JSON.stringify(heard.err)}`,
    )
  }
  return JSON.parse(line.slice(CHILD_COUNTED.length)) as CountingReport
}

/** The three real modules the counting child loads. Same argument as `theRealProduct`. */
function theRealRules(): { store: string; sqlite: string; record: string; progress: string } {
  return {
    ...theRealProduct(),
    record: JSON.stringify(new URL('record.ts', import.meta.url).href),
    progress: JSON.stringify(new URL('progress.ts', import.meta.url).href),
  }
}

/**
 * A child that uncovers one more step of a lesson, over and over, in a genuine
 * read-decide-write.
 *
 * THE CALLBACK IS `store.ts`'s OWN BODY WITH ONE LINE ADDED. Read what is
 * stored, decide against it, write the decision -- and the decision here is
 * "she has seen one more step than the file says she has". That is what makes
 * the transaction's read part mean something, and it is the exact shape the
 * comment on `update()` was written to protect.
 *
 * NOTHING IS PRINTED WITH `console.log`. Node's stdout to a pipe is
 * asynchronous, and this program blocks the event loop on purpose while it waits
 * for the shared start. A line queued behind that block would never reach the
 * parent, and the parent would wait for a child that had already said it was
 * ready. `writeSync` goes straight to the file descriptor.
 */
function theProgramThatCountsUpOneKey(payloadPath: string): string {
  const real = theRealRules()
  return `
import { readFileSync, writeSync } from 'node:fs'
import { sqliteMemoryStore } from ${real.sqlite}
import { fromStoredText, toStoredText } from ${real.record}
import { reconcile } from ${real.progress}

const asked = JSON.parse(readFileSync(${JSON.stringify(payloadPath)}, 'utf8'))

/* THE REAL PRODUCT, NOT A COPY OF IT. */
const store = sqliteMemoryStore(asked.path)

writeSync(1, ${JSON.stringify(CHILD_IS_READY)} + '\\n')

/* EVERY PROCESS BEGINS ON ONE INSTANT. Spawned in a loop they would otherwise
 * start hundreds of milliseconds apart, take polite turns, and never collide. */
const idle = new Int32Array(new SharedArrayBuffer(4))
const remaining = asked.startAt - Date.now()
if (remaining > 0) Atomics.wait(idle, 0, 0, remaining)
while (Date.now() < asked.startAt) { /* the last fraction of a millisecond */ }

const firstAt = Date.now()
let acknowledged = 0
const refusals = []

for (let step = 0; step < asked.increments; step += 1) {
  try {
    store.update(asked.key, new Date().toISOString(), (current) => {
      const previous = current === undefined ? undefined : fromStoredText(current)
      const sofar = previous === undefined ? asked.base : previous
      const uncovered = previous === undefined ? 0 : previous.revealed
      const next = { ...sofar, revealed: uncovered + 1 }
      return toStoredText(reconcile(asked.lessonId, previous, next))
    })
    /* COUNTED ONLY AFTER THE CALL RETURNED. A count taken before would claim a
     * save that a throw was about to cancel. */
    acknowledged += 1
  } catch (thrown) {
    refusals.push(String(thrown && thrown.message))
  }
}

const lastAt = Date.now()
store.close()
writeSync(
  1,
  ${JSON.stringify(CHILD_COUNTED)} +
    JSON.stringify({ who: asked.who, acknowledged, refusals, firstAt, lastAt }) +
    '\\n',
)
`
}

/**
 * A child that takes its time INSIDE one save, holding the write lock.
 *
 * `change` is the caller's own code and is entitled to think before it answers.
 * `BEGIN IMMEDIATE` means the lock is already held while it does, so this is
 * the shipped store holding its own lock through its own public interface --
 * not a transaction hand-written by a test to arrange a collision.
 *
 * `Atomics.wait` rather than a spin: five seconds of a burning CPU beside a
 * running suite is a way to make other tests flaky.
 */
function theProgramThatHoldsTheWriteLock(payloadPath: string): string {
  const real = theRealProduct()
  return `
import { readFileSync, writeSync } from 'node:fs'
import { sqliteMemoryStore } from ${real.sqlite}

const asked = JSON.parse(readFileSync(${JSON.stringify(payloadPath)}, 'utf8'))
const store = sqliteMemoryStore(asked.path)

store.update(asked.key, asked.at, () => {
  /* ANNOUNCED FROM INSIDE THE TRANSACTION, so the parent knows the lock is held
   * at the moment it hears this -- not that it was, or will be. */
  writeSync(1, ${JSON.stringify(CHILD_HOLDS_THE_WRITE_LOCK)} + '\\n')
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, asked.holdMs)
  return asked.text
})

writeSync(1, ${JSON.stringify(CHILD_RELEASED_THE_WRITE_LOCK)} + '\\n')
store.close()
`
}

/** The same, across several keys, which is what gives a kill somewhere to land. */
function theProgramThatWritesEveryKeyForever(payloadPath: string): string {
  const real = theRealProduct()
  return `
import { readFileSync } from 'node:fs'
import { canvasMemory } from ${real.store}
import { sqliteMemoryStore } from ${real.sqlite}

const asked = JSON.parse(readFileSync(${JSON.stringify(payloadPath)}, 'utf8'))
const memory = canvasMemory({ store: sqliteMemoryStore(asked.path), log: () => {} })

let round = 0
const tick = () => {
  for (const key of asked.keys) {
    memory.write(key.owner, key.records[round % key.records.length])
  }
  round += 1
  /* PRINTED ONLY AFTER A WHOLE PASS RETURNED, so the parent knows every key
   * already holds a complete record before the signal is sent. Anything found
   * missing afterwards is a loss, not a race with startup. */
  if (round === 1) console.log(${JSON.stringify(CHILD_WROTE_ONCE)})
  setImmediate(tick)
}
tick()
`
}
