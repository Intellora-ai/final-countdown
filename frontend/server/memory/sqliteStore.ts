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
    /* BUSY_TIMEOUT FIRST, AND THE ORDER IS THE WHOLE FIX.
     *
     * These two lines were the other way round, and the WAL switch itself is
     * the operation that needed the timeout most: changing journal mode takes a
     * brief EXCLUSIVE lock, so two servers opening this file in the same moment
     * collide, and with no busy timeout set yet the loser does not wait -- it
     * fails instantly.
     *
     * MEASURED, through the real product: starting two replicas together, one
     * died at boot with "database is locked" before it ever bound its port,
     * while the other ran perfectly. The header of this file promises "safe for
     * many servers"; that was true of every write and false of the first
     * millisecond of startup, which is the one moment nobody tests.
     *
     * `busy_timeout` is a connection setting and needs no lock, so it can
     * always be set first. Afterwards the WAL switch queues instead of
     * throwing, which is what a busy database deserves. */
    db.exec('PRAGMA busy_timeout = 5000')
    /* Wait for another process's write instead of failing instantly. A busy
     * database is a queue, not an error, and reporting it as an error is how a
     * student is told her work did not save when it was merely a moment late. */
    db.exec('PRAGMA journal_mode = WAL')
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
       * mean anything. */
      db.exec('BEGIN IMMEDIATE')
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
