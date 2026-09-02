/* P3 — WHERE A MEMORY ACTUALLY LIVES.
 *
 * WHY SQLITE, AND WHY IT IS NOT A COMPROMISE.
 *
 *   The JSON ledger this replaces is read-whole then written-whole. Measured
 *   through the real product over real HTTP: twenty concurrent marks across two
 *   replicas sharing one file returned FIFTEEN 500s and dropped connections,
 *   because both processes wrote the whole file at once and the next reader
 *   found half of each.
 *
 *   `ledger.ts:110` already carries a fix for the single-process half of that --
 *   `alone()`, a promise chain. Its own comment records what it was built for:
 *   "twenty-five concurrent marks, ONE survivor". It is correct and it cannot
 *   help here, because a promise chain lives inside ONE process and two
 *   replicas have two chains that cannot see each other.
 *
 *   `node:sqlite` is built into Node 26 -- verified by running it, not assumed.
 *   No dependency, no daemon, no Docker. WAL mode lets two processes write to
 *   the same file safely, which is the exact property the JSON file lacked. One
 *   file on disk, the same operational shape as the ledger it replaces.
 *
 * WHAT THIS FILE DOES NOT KNOW.
 *   What a memory contains. It stores text under a key and hands back the same
 *   text. `record.ts` decides what is storable; `key.ts` decides who it belongs
 *   to; the canvas decides what is worth remembering. A store that understood
 *   the content would have to change every time the content did.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS canvas_memory (
  memory_key TEXT PRIMARY KEY,
  record     TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

/**
 * How long a replica keeps trying to put the journal into WAL before it gives
 * up and reports the failure it kept meeting.
 *
 * The same five seconds `busy_timeout` gives every other contended operation,
 * because it is the same promise made at a different moment.
 */
const A_WAL_SWITCH_IS_RETRIED_FOR_MS = 5000

/**
 * The two SQLite result codes that mean "somebody else has this, come back".
 *
 * Anything else -- a corrupt file, a directory that cannot be written -- is a
 * real failure, and waiting cannot turn it into a success. Retrying those would
 * only deliver the same error five seconds later than it was known.
 */
const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6

/** The longest a single pause between attempts is allowed to grow to. */
const A_RETRY_WAITS_AT_MOST_MS = 32

/**
 * Sleep without handing control back to the event loop.
 *
 * Everything in this file is synchronous by design, and this runs once, while
 * the database is being opened and before the server has bound its port. A
 * timer here would let the loop run other work in the middle of an open.
 */
function rest(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

/**
 * Put the file into WAL, waiting out any other process trying to do the same.
 *
 * WHY `busy_timeout` IS NOT ENOUGH FOR THIS ONE STATEMENT.
 *
 *   Setting `busy_timeout` before this call was a real fix and is still the
 *   line above it: it is what makes every WRITE queue instead of failing. It
 *   does not cover the journal switch, and SQLite says why in its own
 *   documentation of the busy handler -- "If SQLite determines that invoking
 *   the busy handler could result in a deadlock, it will go ahead and return
 *   SQLITE_BUSY."
 *
 *   Switching a rollback-journal database to WAL means promoting a SHARED lock
 *   to an EXCLUSIVE one. Two replicas doing that in the same instant are each
 *   holding the lock the other is waiting for, so a busy handler could only
 *   make both wait forever. SQLite refuses to call it and fails one of them at
 *   once -- with the timeout set, honoured, and beside the point.
 *
 *   MEASURED, with `busy_timeout = 5000` already in force: eight processes
 *   opening one brand-new file on a shared instant, and one to four of them
 *   died with "database is locked" on this exact statement, errcode 5. Three
 *   runs in five. The header of this file promises a store that is safe for
 *   many servers; that was true of every write and false of the first
 *   millisecond of startup, which is the one moment nobody tests.
 *   `m4-startup-contention.test.ts` is where it is tested now.
 *
 *   Backing off and returning is exactly what that SQLITE_BUSY is asking for,
 *   and it converges at once rather than grinding: the winner's switch makes
 *   the question moot, because once the file IS in WAL this statement is a
 *   no-op that needs no exclusive lock from anybody. MEASURED at sixteen
 *   processes over eight runs: every one of them opened, and not one ever
 *   needed a third attempt.
 *
 * THE RESULTING MODE IS READ BACK RATHER THAN ASSUMED.
 *
 *   `PRAGMA journal_mode = WAL` answers with the mode the database ended up in,
 *   and a switch that could not be made is reported by that answer rather than
 *   by an error. Reading "it did not throw" as "it worked" would leave a replica
 *   running contentedly on the single-writer journal this whole file exists to
 *   escape -- which is the original defect, restored quietly.
 */
function switchTheJournalToWal(db: DatabaseSync): void {
  const giveUpAt = Date.now() + A_WAL_SWITCH_IS_RETRIED_FOR_MS
  let pause = 1
  let whatItKeptMeeting: unknown

  for (;;) {
    try {
      const answered = db.prepare('PRAGMA journal_mode = WAL').get() as
        | { journal_mode?: unknown }
        | undefined
      if (answered?.journal_mode === 'wal') return
      whatItKeptMeeting = new Error(
        `the journal stayed in ${String(answered?.journal_mode)} mode instead of switching to WAL`,
      )
    } catch (thrown) {
      /* Only contention is worth coming back for. See `SQLITE_BUSY`. */
      const code = (thrown as { errcode?: unknown }).errcode
      if (code !== SQLITE_BUSY && code !== SQLITE_LOCKED) throw thrown
      whatItKeptMeeting = thrown
    }

    /* THE DEADLINE IS CHECKED BEFORE THE PAUSE, so the last attempt is followed
     * by the error rather than by one more sleep nobody is waiting through. */
    if (Date.now() >= giveUpAt) throw whatItKeptMeeting
    rest(pause)
    pause = Math.min(pause * 2, A_RETRY_WAITS_AT_MOST_MS)
  }
}

/**
 * Take the transaction's write lock, waiting out another PROCESS that holds it.
 *
 * WHY `busy_timeout` IS NOT ENOUGH FOR THIS STATEMENT EITHER.
 *
 *   The same clause that covers the WAL switch above covers `BEGIN IMMEDIATE`:
 *   "If SQLite determines that invoking the busy handler could result in a
 *   deadlock, it will go ahead and return SQLITE_BUSY." A second operating-
 *   system process hammering the same file is exactly when that determination
 *   gets made, and the timeout is then set, honoured, and beside the point.
 *
 *   MEASURED, on CI run 33596355320: `m4-consistency.test.ts`'s two-process
 *   proof ("never shows a partly written record while a second operating-system
 *   process writes the same key") died with "database is locked", errcode 5,
 *   on this exact statement -- with `busy_timeout = 5000` in force the whole
 *   time. The child process was writing in a loop, so every refusal was of the
 *   "come back" kind, and coming back is what this loop does.
 *
 *   Backing off converges the same way the WAL switch does: the other writer's
 *   COMMIT is milliseconds away, and not one retry is needed after it lands.
 */
function takeTheWriteLock(db: DatabaseSync): void {
  const giveUpAt = Date.now() + A_WAL_SWITCH_IS_RETRIED_FOR_MS
  let pause = 1
  for (;;) {
    try {
      db.exec('BEGIN IMMEDIATE')
      return
    } catch (thrown) {
      /* Only contention is worth coming back for. See `SQLITE_BUSY`. */
      const code = (thrown as { errcode?: unknown }).errcode
      if (code !== SQLITE_BUSY && code !== SQLITE_LOCKED) throw thrown
      if (Date.now() >= giveUpAt) throw thrown
      rest(pause)
      pause = Math.min(pause * 2, A_RETRY_WAITS_AT_MOST_MS)
    }
  }
}

export interface MemoryStore {
  /** The stored text for this key, or undefined if nothing was ever written. */
  read(key: string): string | undefined
  /** Store text under this key. Returns only once it is durably written. */
  write(key: string, text: string, at: string): void
  /**
   * Read a key and write it back, with nothing able to slip in between.
   *
   * WHY A SEPARATE CALL AND NOT `read()` THEN `write()`.
   *   Deciding what to store now depends on what is ALREADY stored -- a save
   *   may not move progress backwards, and that can only be judged against the
   *   current value. Read-then-write is two statements, and two servers doing
   *   it at once both read the old value and the second one wins, silently
   *   undoing the first. That is the exact shape of the bug the almanac ledger
   *   had, one layer down and with a child's work instead of a mark.
   *
   *   `BEGIN IMMEDIATE` takes the write lock at the START rather than on first
   *   write, so two writers cannot both be inside this at once. The whole
   *   read-decide-write is then one indivisible step: the stored value is the
   *   old one or the new one, and never a mix of both.
   *
   * `change` returns the text to store, or `undefined` to leave it alone.
   * A throw rolls everything back and reaches the caller unchanged.
   */
  update(key: string, at: string, change: (current: string | undefined) => string | undefined): void
  close(): void
}

/**
 * Open (or create) the memory file.
 *
 * `:memory:` is accepted and is a real mode, not a test hack: a deployment that
 * genuinely wants no persistence should say so rather than being handed a file
 * it did not ask for.
 */
export function sqliteMemoryStore(path: string): MemoryStore {
  /* THE DIRECTORY IS MADE BEFORE THE FILE, BECAUSE SQLITE WILL NOT MAKE IT.
   *
   * `new DatabaseSync(path)` creates a missing FILE and refuses a missing
   * DIRECTORY, with "unable to open database file" and nothing naming the
   * directory as the cause.
   *
   * MEASURED, on a fresh checkout of this repository: the server's default is
   * `data/canvas-memory.db` (`index.ts`), and `frontend/data/` is gitignored --
   * correctly, because it holds the identity secret and a student's real work.
   * So the directory exists on a machine that has run the product before and on
   * no other. `server/boot.test.ts` builds and starts the real server, and all
   * five of its scenarios failed on a clean tree with `almanac server: unable to
   * open database file`, while passing on the machine the work was done on. A
   * defect that hides on the developer's own disk and appears for everyone else
   * is the worst shape this can take, and cloning is the first thing a reader of
   * a public repository does.
   *
   * This is not a new decision, it is the one the sibling stores already made:
   * `identity.ts` calls `mkdirSync(dirname(path), { recursive: true })` before
   * writing the secret, and `almanac/fileStore.ts` does the same before writing
   * the ledger. This store was the one that skipped it. `recursive: true` makes
   * an existing directory a success rather than an error, so this costs one
   * syscall at startup and can never fail for being early.
   *
   * `:memory:` is excluded because it is not a path -- there is no directory to
   * make, and `dirname(':memory:')` is `.`, which would be a silent no-op that
   * only LOOKED correct. Saying so is better than relying on the accident. */
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const db = new DatabaseSync(path)

  /* WAL IS THE WHOLE POINT AND IS NOT A TUNING KNOB.
   *
   * Without it a second process is locked out and its write fails. With it,
   * readers and one writer proceed together and writers queue rather than
   * corrupt. That is precisely the failure the JSON file had. `:memory:` has no
   * file to journal, so it is skipped there rather than failing to open. */
  if (path !== ':memory:') {
    /* BUSY_TIMEOUT FIRST, BECAUSE EVERYTHING AFTER IT DEPENDS ON IT.
     *
     * It is a connection setting and needs no lock, so it can always be set
     * first and nothing can make setting it fail. From here on every statement
     * that meets another process QUEUES rather than failing -- the schema
     * creation below, and every save for the life of this connection. A busy
     * database is a queue, not an error, and reporting it as an error is how a
     * student is told her work did not save when it was merely a moment late.
     * `m4-consistency.test.ts` is where that is proven, with real processes.
     *
     * WHAT THIS LINE WAS ONCE BELIEVED TO DO, AND DOES NOT.
     *
     *   These two lines were originally the other way round, and swapping them
     *   was recorded here as "the whole fix" for a measured boot failure: two
     *   replicas started together and one died with "database is locked" before
     *   it ever bound its port. The swap helped, and the sentence was wrong.
     *   Measured afterwards, with the timeout set and in force, replicas still
     *   died on the WAL switch alone -- SQLite will not run a busy handler for
     *   the lock promotion that switch needs. `switchTheJournalToWal` is what
     *   actually covers it, and it carries that measurement.
     *
     *   SO THE ORDER OF THESE TWO LINES IS NO LONGER OBSERVABLE, and the next
     *   person to run mutation testing on this file should know it rather than
     *   spend an afternoon on it: putting the switch first still works, because
     *   the retry inside it does not depend on the timeout. It survives as an
     *   equivalent mutant. The order stays this way round because it is the one
     *   that states the intent, and because the schema creation below is not
     *   covered by anything else. */
    db.exec('PRAGMA busy_timeout = 5000')
    switchTheJournalToWal(db)
  }
  db.exec(SCHEMA)

  const readOne = db.prepare('SELECT record FROM canvas_memory WHERE memory_key = ?')
  /* ONE STATEMENT, SO IT IS ATOMIC BY CONSTRUCTION. There is no read-then-write
   * for another process to interleave with, and it touches exactly one row, so
   * writing one key can never disturb another. */
  const writeOne = db.prepare(
    `INSERT INTO canvas_memory (memory_key, record, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(memory_key) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at`,
  )

  return {
    read(key) {
      const row = readOne.get(key) as { record?: unknown } | undefined
      const record = row?.record
      return typeof record === 'string' ? record : undefined
    },

    write(key, text, at) {
      /* Throws on failure rather than returning a flag. A caller that forgets
       * to check a flag has silently acknowledged a save that never happened,
       * which is the one thing this layer exists to make impossible. */
      writeOne.run(key, text, at)
    },

    update(key, at, change) {
      /* IMMEDIATE, NOT DEFERRED. A plain `BEGIN` takes no lock until the first
       * write, so two writers both READ the old value, both decide against it,
       * and the second overwrites the first's decision -- with SQLite raising
       * nothing, because neither did anything illegal on its own. Taking the
       * write lock up front is what makes the read part of this transaction
       * mean anything. Taken through the retry, because a second PROCESS
       * holding it answers with the SQLITE_BUSY the busy handler is forbidden
       * to wait on -- `takeTheWriteLock` carries the measurement. */
      takeTheWriteLock(db)
      try {
        const row = readOne.get(key) as { record?: unknown } | undefined
        const current = typeof row?.record === 'string' ? row.record : undefined
        const next = change(current)
        if (next !== undefined) writeOne.run(key, next, at)
        db.exec('COMMIT')
      } catch (thrown) {
        /* ROLLED BACK BEFORE THE ERROR IS RE-THROWN, so a refused save leaves
         * the previous record exactly as it was. Its own failure is swallowed
         * deliberately: if the rollback cannot run the connection is already
         * broken, and reporting THAT instead of why the save was refused would
         * replace a useful message with a confusing one. */
        try { db.exec('ROLLBACK') } catch { /* already unwound */ }
        throw thrown
      }
    },

    close() {
      db.close()
    },
  }
}
