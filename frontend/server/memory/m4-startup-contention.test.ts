/* M4 — THE FIRST MILLISECOND OF STARTUP, WHICH IS THE ONE MOMENT NOBODY TESTS.
 *
 * WHY THIS FILE EXISTS BESIDE `m4-consistency.test.ts` AND IS NOT PART OF IT.
 *
 *   `m4-consistency.test.ts` proves what happens when two processes SAVE at the
 *   same time: the write lock is taken up front, and a busy database queues
 *   instead of refusing. Every one of its contention proofs opens the file from
 *   the parent FIRST and races the transactions afterwards -- deliberately, and
 *   it says so in its own comments, because a child that died while opening
 *   would quietly weaken the race it was spawned for.
 *
 *   That leaves the OPEN itself unproven, and the open is where the shipped
 *   failure was. `sqliteStore.ts` records it: two replicas started together,
 *   "one died at boot with 'database is locked' before it ever bound its port,
 *   while the other ran perfectly." A store that queues perfectly on every save
 *   and cannot survive being opened twice has not kept the promise in its own
 *   header. So every proof here begins on a path the parent has never touched.
 *
 * WHAT MAKES OPENING A CONTENDED OPERATION AT ALL.
 *
 *   `PRAGMA journal_mode = WAL` is not a setting, it is a CHANGE to the file:
 *   switching a rollback-journal database to WAL needs an EXCLUSIVE lock, so it
 *   has to wait for every reader to leave and every writer to finish.
 *   `PRAGMA busy_timeout` is a property of the connection, needs no lock, and
 *   can therefore always be set first.
 *
 * THE TWO DIFFERENT WAYS THAT SWITCH CAN BE BLOCKED, WHICH IS WHY THERE ARE
 * TWO PROOFS AND NOT ONE.
 *
 *   BLOCKED BY A READER. Somebody is reading; the switch takes PENDING, waits
 *   for the reader to leave, and proceeds. SQLite calls the busy handler here,
 *   so `busy_timeout` alone is the whole answer -- and it only works because
 *   the timeout was set BEFORE the switch was attempted. MEASURED: with the two
 *   pragmas in the shipped order the open waited 2,480ms and succeeded; with
 *   them the other way round it threw "database is locked" at 0ms.
 *
 *   BLOCKED BY A WRITER. Somebody holds a RESERVED lock. Now the switch is a
 *   read lock trying to promote while a held write lock is trying to promote
 *   too, and SQLite will not run a busy handler for that -- its own
 *   documentation says "If SQLite determines that invoking the busy handler
 *   could result in a deadlock, it will go ahead and return SQLITE_BUSY."
 *   `busy_timeout` is set, honoured, and beside the point. MEASURED: the opener
 *   died with "database is locked" after ONE millisecond, with a five-second
 *   timeout in force. Only coming back and asking again gets in.
 *
 *   Both defects live in the same two lines of `sqliteStore.ts` and neither one
 *   can see the other. A proof of one is not a proof of the other.
 *
 * HOW THE SECOND OF THOSE WAS FOUND, AND WHY THE PROOF NO LONGER LOOKS LIKE IT.
 *
 *   It was found by eight replicas opening one brand-new file on a shared
 *   instant: one to four of them died, in three runs out of five, on a store
 *   whose every other proof was green. That is a real reproduction and it is a
 *   poor test -- it fails only sometimes, and eight simultaneous Node processes
 *   crowd the machine enough to disturb the timing proofs in neighbouring
 *   files, which was measured too. The single held write lock below provokes
 *   exactly the same refusal every single time and costs one child process, so
 *   it replaced the crowd rather than joining it.
 *
 * WHY A SECOND REAL OPERATING-SYSTEM PROCESS.
 *
 *   `node:sqlite` is synchronous. One process cannot contend with itself: its
 *   own statements take turns on one thread, and no amount of `Promise.all`
 *   changes that. A lock has to be held by something with its own address
 *   space, so these proofs spawn one.
 *
 *   The holder speaks raw `node:sqlite` rather than the product, which is
 *   deliberate rather than lazy: the product's opener is the thing under test,
 *   and it switches the journal to WAL. A holder that used it would perform the
 *   very switch these proofs need to still be pending, and they would then pass
 *   against every possible implementation.
 *
 * WHY EACH PROOF COMES WITH A PAIR.
 *
 *   "The open succeeded" is satisfied completely by an open that never met a
 *   lock. So each contended open is measured, and they are paired with an
 *   UNCONTENDED open of a file in the same state, which must finish in a small
 *   fraction of the same budget. Without that pair, "it waited" would also be
 *   the signature of a store that is simply slow.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'

import { memoryKey, type MemoryOwner } from './key.ts'
import { toStoredText } from './record.ts'
import { sqliteMemoryStore, type MemoryStore } from './sqliteStore.ts'

/* -------------------------------------------------------------------------- */
/* Named numbers. A bare literal in a timing proof is a decision nobody can     */
/* review later, so each one says what it is for and where it came from.        */
/* -------------------------------------------------------------------------- */

/**
 * How long a holder keeps its lock.
 *
 * Long enough that an opener meeting it waits for a length of time a clock can
 * measure without argument, and far below the five seconds `sqliteStore.ts`
 * allows a contended open -- so a correct opener must WIN the wait rather than
 * merely outlive it.
 */
const A_LOCK_IS_HELD_FOR_MS = 2_000

/**
 * The least a queued open must have waited for the queueing to be real.
 *
 * NOT THE CLAIM. The claim is that the store opened and works. This is the
 * guard that stops the claim being satisfied by an open that sailed past a lock
 * nobody was holding. MEASURED against this hold: the shipped store waited
 * 1,876-2,480ms, and each of the three defects it protects against gave up
 * between 0ms and 1ms. Half the hold sits a very long way from both.
 */
const AN_OPEN_THAT_REALLY_QUEUED_MS = A_LOCK_IS_HELD_FOR_MS / 2

/** How long a holder gets to boot Node, create the file and take its lock. */
const HOLDER_ANNOUNCE_TIMEOUT_MS = 30_000

/** How often the parent looks for a child's marker while waiting. */
const MARKER_POLL_MS = 10

/** Whole-test budget for a proof that spawns a real process. */
const CHILD_TEST_TIMEOUT_MS = 60_000

/**
 * The instant every write below is stamped with.
 *
 * Fixed, so two runs of the same proof compare the same bytes. A real clock here
 * would make the assertion partly about the calendar.
 */
const AN_INSTANT = '2026-01-01T00:00:00.000Z'

/**
 * The journal mode a freshly created SQLite file is in before anything switches
 * it.
 *
 * Asserted rather than assumed, and it is the anti-vacuity guard for this whole
 * file: if a holder finds the database ALREADY in WAL then the switch these
 * proofs are about has already happened, no exclusive lock is needed, and every
 * assertion below would pass against any implementation whatsoever.
 */
const THE_MODE_A_NEW_FILE_STARTS_IN = 'delete'

/** The table a holder makes for itself, named so nothing mistakes it for the
 * product's. A holder must know NOTHING about what the store stores. */
const THE_HOLDERS_OWN_TABLE = 'a_table_the_lock_holder_made_for_itself'

/* -------------------------------------------------------------------------- */
/* Fixtures.                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Who the parent is saving for once it finally gets the file open.
 *
 * The colon, the percent sequence and the astral-plane emoji are the hazards
 * `key.ts` and `record.ts` are built to survive, and they are here for the same
 * reason they are everywhere else in these proofs: a store that only works for
 * tidy input works for nobody.
 */
const AN_OWNER_WHOSE_SERVER_BOOTED_SECOND: MemoryOwner = {
  studentId: 'the student whose server booted second',
  tabId: 'tab%3A1 🧪',
  lessonId: "photosynthesis' : introduction",
}

/** The owner nobody ever writes. Every positive below is paired with this. */
const AN_OWNER_NOBODY_EVER_WROTE: MemoryOwner = {
  ...AN_OWNER_WHOSE_SERVER_BOOTED_SECOND,
  lessonId: 'a lesson no process in this file ever opened',
}

/** What she had typed while the other replica was still holding the file. */
const WHAT_SHE_HAD_TYPED = {
  revealed: 4,
  questionsAsked: 2,
  note: 'saved by a server that had to queue behind another one just to open the file',
}

/* -------------------------------------------------------------------------- */
/* Everything opened here is closed in one place. A leaked handle or a child     */
/* that waits forever does not fail the suite, it HANGS it -- and a hang is the  */
/* failure nobody can read.                                                      */
/* -------------------------------------------------------------------------- */

const temporaryDirectories: string[] = []
const spawnedChildren: ChildProcess[] = []
const openedStores: MemoryStore[] = []

/**
 * A directory nothing else is using, and a path inside it that does NOT exist.
 *
 * Written here rather than borrowed from `live.test.ts` on purpose: that module
 * registers a `describe` of its own, and importing it grafts another file's
 * suite onto this one's count. A proof whose reported number of tests is not
 * the number of claims it makes is harder to read than it needs to be.
 */
function aFreshMemoryFile(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'almanac-startup-'))
  temporaryDirectories.push(directory)
  return join(directory, `${name}.db`)
}

/** Open the real store and remember it, so a failed assertion cannot leak it. */
function openStore(path: string): MemoryStore {
  const store = sqliteMemoryStore(path)
  openedStores.push(store)
  return store
}

/** Write a file next to the database, and hand back its path. */
function aFileBeside(databasePath: string, name: string, content: string): string {
  const beside = join(databasePath, '..', name)
  writeFileSync(beside, content)
  return beside
}

/** What a connection that was never the writer can see in the file. */
function theRecordOnDisk(path: string, key: string): string | undefined {
  const db = new DatabaseSync(path)
  try {
    const row = db.prepare('SELECT record FROM canvas_memory WHERE memory_key = ?').get(key) as
      | { record?: unknown }
      | undefined
    return typeof row?.record === 'string' ? row.record : undefined
  } finally {
    db.close()
  }
}

/** The journal mode the file is actually in, read by a connection that changes
 * nothing. */
function theJournalModeOf(path: string): string {
  const db = new DatabaseSync(path)
  try {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: unknown }
    return String(row?.journal_mode)
  } finally {
    db.close()
  }
}

/**
 * Wait for a marker FILE, not a line of stdout.
 *
 * `writeFileSync` lands the instant it is called. A child's `console.log` goes
 * into a pipe that Node flushes when the event loop next turns, and every child
 * below blocks its event loop on purpose -- so a stdout marker could arrive long
 * after the thing it announces, or not until the process had already exited.
 */
async function until(marker: string, budgetMs: number, whatWasExpected: string): Promise<void> {
  const deadline = Date.now() + budgetMs
  while (!existsSync(marker)) {
    if (Date.now() > deadline) {
      throw new Error(`${whatWasExpected} within ${budgetMs}ms (no ${marker})`)
    }
    await new Promise<void>((resolve) => setTimeout(resolve, MARKER_POLL_MS))
  }
}

/** How a spawned child ended, with whatever it said on the way. */
function whileTheChildRuns(child: ChildProcess) {
  const heard = { out: '', err: '' }
  child.stdout?.on('data', (chunk) => {
    heard.out += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    heard.err += String(chunk)
  })
  const ended = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  return { heard, ended }
}

/** Read a marker a child wrote as JSON. */
function whatTheChildWrote(marker: string): Record<string, unknown> {
  return JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>
}

afterAll(() => {
  for (const child of spawnedChildren) child.kill('SIGKILL')
  for (const store of openedStores) {
    /* Already-closed is the normal case. Closing twice must not be the thing
     * that turns a green suite red. */
    try {
      store.close()
    } catch {
      /* it was already closed */
    }
  }
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/* -------------------------------------------------------------------------- */
/* The holder, and the two locks it can hold.                                   */
/* -------------------------------------------------------------------------- */

/**
 * A process that creates a rollback-journal database, holds ONE lock on it, and
 * lets go.
 *
 * `'read'` opens a read transaction: the most innocent thing that can be
 * attached to a database -- a health check, a replica still booting -- and
 * already enough to make the journal switch wait.
 *
 * `'write'` takes a RESERVED lock with `BEGIN IMMEDIATE`, which is what the
 * product's own `update()` does on every save. So this is not an exotic state:
 * it is one replica saving a child's work at the moment another replica boots.
 *
 * It announces from INSIDE the transaction, and reports the journal mode it
 * observed while holding, so the proof can refuse to be vacuous against a file
 * that had already been switched.
 */
function theProgramThatHoldsALock(payloadPath: string): string {
  return `
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const asked = JSON.parse(readFileSync(${JSON.stringify(payloadPath)}, 'utf8'))

/* RAW node:sqlite, NOT the product. See the header: the product's opener is the
 * subject of these proofs, and switching to WAL is exactly what it must still
 * have left to do. */
const db = new DatabaseSync(asked.path)
db.exec('CREATE TABLE IF NOT EXISTS ${THE_HOLDERS_OWN_TABLE} (x)')

if (asked.lock === 'write') {
  /* RESERVED. The same lock \`sqliteStore.update()\` takes on every save. */
  db.exec('BEGIN IMMEDIATE')
  db.prepare('INSERT INTO ${THE_HOLDERS_OWN_TABLE} (x) VALUES (1)').run()
} else {
  db.exec('BEGIN')
  /* THE READ IS WHAT TAKES THE LOCK. \`BEGIN\` on its own takes nothing. */
  db.prepare('SELECT count(*) AS n FROM ${THE_HOLDERS_OWN_TABLE}').get()
}

writeFileSync(asked.holding, JSON.stringify({
  at: Date.now(),
  modeWhileHolding: String(db.prepare('PRAGMA journal_mode').get().journal_mode),
}))

/* A SYNCHRONOUS sleep. A timer would return to the event loop, and node:sqlite
 * would be free to do something else with this connection in the meantime. */
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, asked.holdMs)

db.exec('COMMIT')
writeFileSync(asked.released, JSON.stringify({ at: Date.now() }))
db.close()
`
}

/** A holder, started and confirmed to be holding what it said it would. */
async function aProcessHolding(path: string, lock: 'read' | 'write') {
  const holding = join(path, '..', 'holding.json')
  const released = join(path, '..', 'released.json')
  const payload = aFileBeside(
    path,
    'holder.json',
    JSON.stringify({ path, holding, released, lock, holdMs: A_LOCK_IS_HELD_FOR_MS }),
  )
  const child = spawn(process.execPath, [aFileBeside(path, 'holder.mjs', theProgramThatHoldsALock(payload))], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  spawnedChildren.push(child)
  const watch = whileTheChildRuns(child)

  await until(holding, HOLDER_ANNOUNCE_TIMEOUT_MS, `the holder never took its ${lock} lock`)

  /* THE LOCK IS ON A DATABASE THAT HAS NOT YET BEEN SWITCHED, AND THAT IS
   * ASSERTED. If this file were already WAL there would be no exclusive lock to
   * contend for, and everything built on this holder would pass for free. */
  expect(
    whatTheChildWrote(holding).modeWhileHolding,
    'the file was already switched, so the opener had nothing to contend with',
  ).toBe(THE_MODE_A_NEW_FILE_STARTS_IN)

  return {
    watch,
    /** Wait for the holder to finish and confirm it was unharmed by being
     * waited on. */
    async letGoCleanly() {
      await until(released, HOLDER_ANNOUNCE_TIMEOUT_MS, 'the holder never released its lock')
      const how = await watch.ended
      expect(how.code, `the holder died (signal ${how.signal}).\nstderr: ${watch.heard.err}`).toBe(0)
    },
  }
}

/**
 * The second replica boots. This is the subject of every proof in this file.
 *
 * The MEASUREMENT is shared because it is the same measurement; the CLAIMS made
 * about it are written out in each proof, because they are different claims
 * that fail for different reasons.
 */
function theSecondReplicaOpens(path: string) {
  const startedAt = Date.now()
  let refused: unknown
  let store: MemoryStore | undefined
  try {
    store = openStore(path)
  } catch (thrown) {
    refused = thrown
  }
  return {
    waited: Date.now() - startedAt,
    refusedWith: refused === undefined ? undefined : String((refused as Error).message),
    store,
  }
}

/**
 * Everything that must be true once the second replica is in, whatever it had
 * to wait behind.
 *
 * It did not merely survive: the file is WAL, so the replica is not quietly
 * running on the single-writer journal this store exists to escape; her work
 * lands and is read back by a connection that was never the writer, as TEXT,
 * which is the byte-for-byte promise `record.ts` makes and a stricter claim
 * than deep equality on a parsed object; and a key nobody wrote still answers
 * with nothing, because a store that invents records has not survived anything.
 */
function itCanActuallyServeHer(path: string, store: MemoryStore): void {
  expect(theJournalModeOf(path), 'the store opened but never made the file WAL').toBe('wal')

  const key = memoryKey(AN_OWNER_WHOSE_SERVER_BOOTED_SECOND)
  store.write(key, toStoredText(WHAT_SHE_HAD_TYPED), AN_INSTANT)
  expect(theRecordOnDisk(path, key)).toBe(toStoredText(WHAT_SHE_HAD_TYPED))

  expect(theRecordOnDisk(path, memoryKey(AN_OWNER_NOBODY_EVER_WROTE))).toBeUndefined()
}

/* ========================================================================== */
/* BLOCKED BY A READER — what `busy_timeout` covers, once it is set in time    */
/* ========================================================================== */

describe('M4 · a replica opening a file somebody is READING', () => {
  it(
    'waits for the reader and gets in, instead of dying at boot',
    async () => {
      /* THE PARENT HAS NEVER TOUCHED THIS PATH, and must not. Opening it would
       * switch the journal to WAL, and that switch is the operation whose
       * contention this whole file is about. */
      const path = aFreshMemoryFile('opened-while-read')
      const holder = await aProcessHolding(path, 'read')

      const booting = theSecondReplicaOpens(path)

      expect(
        booting.refusedWith,
        'the second replica died at boot because another process was reading the file',
      ).toBeUndefined()

      /* AND IT REALLY DID QUEUE FOR IT. Not the claim -- the guard on the claim.
       * See `AN_OPEN_THAT_REALLY_QUEUED_MS`. */
      expect(
        booting.waited,
        'the open returned at once, so it never met the held lock and proves nothing',
      ).toBeGreaterThanOrEqual(AN_OPEN_THAT_REALLY_QUEUED_MS)

      itCanActuallyServeHer(path, booting.store as MemoryStore)
      await holder.letGoCleanly()
    },
    CHILD_TEST_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* BLOCKED BY A WRITER — what `busy_timeout` cannot cover at all              */
/* ========================================================================== */

describe('M4 · a replica opening a file somebody is WRITING', () => {
  it(
    'keeps asking until the writer is done and gets in, because a busy timeout cannot help here',
    async () => {
      const path = aFreshMemoryFile('opened-while-written')
      const holder = await aProcessHolding(path, 'write')

      const booting = theSecondReplicaOpens(path)

      /* THE DEFECT THIS PROOF EXISTS FOR.
       *
       * `busy_timeout` is set to five seconds before this open is attempted and
       * SQLite declines to use it: a read lock promoting while a write lock is
       * promoting is the deadlock its own documentation refuses to wait on, so
       * it returns SQLITE_BUSY at once. MEASURED, three runs of three, against
       * the store as it stood: "database is locked" after ONE millisecond. */
      expect(
        booting.refusedWith,
        'the second replica died at boot because another process was mid-save. A busy ' +
          'database is a queue, and that is as true of opening it as of writing to it',
      ).toBeUndefined()

      expect(
        booting.waited,
        'the open returned at once, so it never met the held lock and proves nothing',
      ).toBeGreaterThanOrEqual(AN_OPEN_THAT_REALLY_QUEUED_MS)

      itCanActuallyServeHer(path, booting.store as MemoryStore)
      await holder.letGoCleanly()

      /* AND THE WRITER LOST NOTHING BY BEING WAITED ON. Its row is still in its
       * own table, in a file that is now WAL. A store that got in by trampling
       * the transaction it was waiting for has not queued; it has chosen. */
      const db = new DatabaseSync(path)
      try {
        const row = db.prepare(`SELECT count(*) AS n FROM ${THE_HOLDERS_OWN_TABLE}`).get() as {
          n?: unknown
        }
        expect(Number(row?.n), "the writer's own committed row did not survive being waited on").toBe(1)
      } finally {
        db.close()
      }
    },
    CHILD_TEST_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* THE PAIR FOR BOTH OF THEM                                                  */
/* ========================================================================== */

describe('M4 · opening a file nobody is holding', () => {
  it('returns at once, so the waits above are waits and not a slow store', () => {
    const path = aFreshMemoryFile('opened-while-free')

    /* THE SAME STATE A HOLDER LEAVES BEHIND -- a real rollback-journal file with
     * a table in it -- and then nothing holding it. Anything less would compare
     * the contended opens against a different situation. */
    const madeItFirst = new DatabaseSync(path)
    madeItFirst.exec(`CREATE TABLE IF NOT EXISTS ${THE_HOLDERS_OWN_TABLE} (x)`)
    madeItFirst.close()
    expect(theJournalModeOf(path)).toBe(THE_MODE_A_NEW_FILE_STARTS_IN)

    const booting = theSecondReplicaOpens(path)

    expect(booting.refusedWith).toBeUndefined()
    expect(
      booting.waited,
      'an uncontended open is already slower than the floor the contended ones had to clear, ' +
        'so that floor no longer tells waiting apart from working',
    ).toBeLessThan(AN_OPEN_THAT_REALLY_QUEUED_MS)

    itCanActuallyServeHer(path, booting.store as MemoryStore)
  })
})
