/**
 * THE LEDGER, ON DISK.
 *
 * A JSON file holding every student's days and everything they have marked
 * done. Small, human-readable, and trivially replaceable by a database later —
 * `LedgerStore` is two methods on purpose.
 *
 * AN ABSENT FILE AND A BROKEN ONE ARE NOT THE SAME THING.
 *     Absent means a new install: start empty, nothing is lost. Broken means
 *     something is wrong, and starting empty there would wipe a student's whole
 *     history and re-plan today as if they had never used the app — with
 *     nothing anywhere reporting it. So a corrupt file stops the server, loudly.
 *
 * WHY THE WRITE IS ATOMIC.
 *     By the rule above, a truncated file stops the server. A process killed
 *     mid-write would produce exactly that. Writing to a temporary file and
 *     renaming means the real file is only ever a whole one.
 */

import { mkdir, open, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { LedgerData, LedgerStore } from './ledger.ts'

function isLedgerData(value: unknown): value is LedgerData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as { days?: unknown; done?: unknown }
  const objectish = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
  return objectish(candidate.days) && objectish(candidate.done)
}

/**
 * How long a writer waits for another process's lock before giving up.
 *
 * A ceiling on waiting, not on tries. One mark is a few milliseconds of work,
 * so a lock held longer than this means the holder died, not that it is busy.
 */
const LOCK_WAIT_MS = 5_000

/** How long a lock file may exist before it is treated as abandoned. */
const LOCK_IS_STALE_MS = 10_000

export function fileStore(path: string): LedgerStore {
  const lockPath = `${path}.lock`

  /**
   * Hold the lock, do the work, always let go.
   *
   * `wx` IS THE LOCK, AND THAT IS THE WHOLE TRICK. It means "create this file,
   * and fail if it already exists". The operating system decides who wins, in
   * one indivisible step, across processes -- which is the thing a promise
   * chain inside one process cannot do, and the thing `ledger.ts:110` says out
   * loud it cannot do: "a promise chain lives inside ONE process and two
   * replicas have two chains that cannot see each other."
   */
  async function holdingTheLock<T>(work: () => Promise<T>): Promise<T> {
    const giveUpAt = Date.now() + LOCK_WAIT_MS
    for (;;) {
      try {
        const handle = await open(lockPath, 'wx')
        await handle.close()
        break
      } catch {
        /* Someone else holds it. If they held it far too long they are gone --
         * a process killed between taking the lock and releasing it would
         * otherwise block every replica forever, turning a crash into an
         * outage.
         *
         * AN UNREADABLE OR EMPTY LOCK IS FRESH, NOT STALE, AND GETTING THIS
         * BACKWARDS DESTROYED THE LOCK ENTIRELY.
         *
         * `open(path, 'wx')` creates the file EMPTY; the timestamp lands a
         * moment later. Treating an empty file as timestamp zero made its age
         * "now", which is older than any staleness limit -- so every waiting
         * process deleted the lock the instant it saw it, and two replicas
         * happily held it at the same time. Measured: 14 of 20 concurrent marks
         * still lost, with the lock code in place and doing nothing.
         *
         * A lock whose content cannot be read is one that was JUST created.
         * Only a readable timestamp can prove otherwise, and the wait deadline
         * below is what stops an abandoned empty lock blocking forever. */
        const age = await readFile(lockPath, 'utf8').then(
          (text) => {
            const stamped = Number(text.trim())
            return Number.isFinite(stamped) && stamped > 0 ? Date.now() - stamped : 0
          },
          () => 0,
        )
        if (age > LOCK_IS_STALE_MS) {
          await unlink(lockPath).catch(() => {})
          continue
        }
        if (Date.now() > giveUpAt) {
          throw new Error(`could not get the almanac ledger lock at ${lockPath} in time`)
        }
        await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 15)))
      }
    }

    try {
      await writeFile(lockPath, `${Date.now()}`, 'utf8')
      return await work()
    } finally {
      /* RELEASED IN `finally`, ALWAYS. A lock released only on success is a
       * lock that one thrown error turns into a permanent outage. */
      await unlink(lockPath).catch(() => {})
    }
  }

  const store: LedgerStore = {
    async load() {
      let text: string
      try {
        text = await readFile(path, 'utf8')
      } catch {
        /* No file yet. A new install, not a failure — and the only case where
         * starting empty is the correct answer. */
        return { days: {}, done: {} }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(
          `almanac ledger at ${path} is not readable JSON. Refusing to start with an empty history.`,
        )
      }
      if (!isLedgerData(parsed)) {
        throw new Error(
          `almanac ledger at ${path} is not shaped like a ledger. Refusing to start with an empty history.`,
        )
      }
      return parsed
    },

    async save(data) {
      /* CREATED ON FIRST WRITE, and this is not defensive tidiness.
       *
       * The server started, printed "listening", and then returned 500
       * "internal error" to the first student who opened their day -- because
       * `data/` did not exist relative to the working directory. "Starts fine,
       * dies on first use" is the worst shape of failure: it looks healthy to
       * everything that checks whether the process is up.
       *
       * `recursive: true` also means an existing directory is not an error, so
       * this costs one syscall on every save and never fails for being early. */
      await mkdir(dirname(path), { recursive: true })
      /* THE TEMPORARY NAME MUST BE UNIQUE PER WRITER, AND IT WAS NOT.
       *
       * It was the fixed string `${path}.writing`. With two replicas that is
       * ONE file that both processes open, write and rename at the same time:
       * A truncates it while B is still writing, B renames A's half of it over
       * the real ledger, and whichever loses the race renames a file that is no
       * longer there.
       *
       * MEASURED, through the real product: twenty concurrent marks across two
       * replicas returned 500 "internal error" for three of them, and the
       * failures moved around between runs, which is the signature of a race
       * rather than a bad input. Every student who saw one was told the server
       * had broken while she was working.
       *
       * The pid and a random suffix make the scratch file private to this
       * write. `rename` within a directory is atomic, so the real file is still
       * only ever a whole one -- that property is kept, not traded away. */
      const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.writing`
      try {
        await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
        await rename(temporary, path)
      } catch (error) {
        await unlink(temporary).catch(() => {})
        throw error
      }
    },

    /**
     * ADD ONE MARK, INDIVISIBLY, EVEN WITH ANOTHER SERVER RUNNING.
     *
     * `ledger.ts` declares this optional and says a file store "must not
     * pretend" to offer it, because a file "has no way to make 'add one item'
     * indivisible across two processes". That was true of the file ALONE. It is
     * not true of a file plus a lock the operating system arbitrates, and the
     * difference is worth the forty lines above.
     *
     * WITHOUT THIS, THE READ-MODIFY-WRITE IS THE BUG. Both replicas load the
     * ledger, both add their own mark to the copy they loaded, both save. The
     * second save has no idea the first happened and writes it away. Measured
     * through the real product: of twenty concurrent marks across two replicas,
     * some were refused outright and others vanished silently -- and silent is
     * worse, because the student was told her work was saved.
     *
     * The lock is held across load AND save, which is the only span that makes
     * this atomic. Locking each half separately would leave exactly the same
     * gap in the middle.
     */
    async addDone(studentId: string, conceptId: string) {
      await holdingTheLock(async () => {
        const data = await store.load()
        const already = new Set(data.done[studentId] ?? [])
        already.add(conceptId)
        await store.save({ ...data, done: { ...data.done, [studentId]: [...already] } })
      })
    },
  }

  return store
}
