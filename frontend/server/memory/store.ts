/* P4 + P5 — THE ONLY WAY IN, AND THE ONLY WAY OUT.
 *
 * ISOLATION IS STRUCTURAL HERE, NOT A RULE SOMEONE MUST REMEMBER.
 *
 *   Both functions take a `MemoryOwner` -- student, tab, lesson -- and there is
 *   no other way to name a memory. There is no "read all", no prefix scan, no
 *   list. So "never let one student see another's work" is not a rule that
 *   could be forgotten in a future change; there is no call that could express
 *   it. That is the difference between a guarantee and a promise.
 *
 *   The three leaks this exists to close are all live in the shipped code:
 *   `teachStore.ts:44` uses ONE browser key for every lesson, `src/canvas/` has
 *   no tab identity at all, and the canvas never reads `studentId`. Same cause
 *   each time -- nothing said who a memory was for.
 *
 * WHY THE MODEL IS NOT TRUSTED WITH ANY OF THIS.
 *   The model supplies what is worth remembering. It is never asked whether
 *   something saved, and its answer would not be believed if it were. Durable,
 *   atomic, isolated and deterministic are properties of code that does the
 *   same thing every time, and the model is the one part of this system that
 *   does not.
 */

import { memoryKey, type MemoryOwner } from './key.ts'
import { reconcile } from './progress.ts'
import { fromStoredText, toStoredText, type Storable } from './record.ts'
import type { MemoryStore } from './sqliteStore.ts'

export interface CanvasMemory {
  /** Exactly what was stored for this owner, or undefined if nothing was. */
  read(owner: MemoryOwner): Storable | undefined
  /** Store a memory for this owner. Returns only once it is durably written. */
  write(owner: MemoryOwner, record: unknown): void
}

export interface CanvasMemoryOptions {
  readonly store: MemoryStore
  /** Overridden only in tests, so a stored time is never a guess. */
  readonly now?: () => string
  /** Where a write is recorded. Defaults to the process log. */
  readonly log?: (line: string) => void
}

export function canvasMemory(options: CanvasMemoryOptions): CanvasMemory {
  const now = options.now ?? (() => new Date().toISOString())
  const log = options.log ?? ((line: string) => console.log(line))

  return {
    read(owner) {
      /* The key is built before anything else touches the store, so a request
       * with a missing part is refused here and never reaches a query. */
      const key = memoryKey(owner)
      const text = options.store.read(key)
      if (text === undefined) return undefined
      return fromStoredText(text)
    },

    write(owner, record) {
      const key = memoryKey(owner)
      const at = now()

      /* THE WHOLE SAVE IS ONE STEP: read what is there, decide, write.
       *
       * It has to be, because the decision DEPENDS on what is there -- progress
       * may not go backwards, and only the stored value says where it had got
       * to. Doing that as a read then a write would let a second server slip
       * between the two and undo a save that had already been acknowledged.
       *
       * A refusal throws out of `change`, which rolls the transaction back, so
       * a rejected save leaves the previous record byte-for-byte untouched. */
      let text = ''
      options.store.update(key, at, (current) => {
        const previous = current === undefined ? undefined : fromStoredText(current)
        const allowed = reconcile(owner.lessonId, previous, record)

        /* CHECKED BEFORE IT IS WRITTEN, NEVER AFTER. A record that cannot
         * survive the round trip must not reach the disk at all -- storing it
         * and finding out on the next read is exactly the half-written record
         * this layer promises never to return. */
        text = toStoredText(allowed)
        return text
      })

      /* LOGGED ONLY AFTER THE WRITE RETURNED. A line printed before would claim
       * a save that a throw was about to cancel, and a log that lies about what
       * happened is worse than no log. The KEY is recorded; the content is not,
       * because a student's work does not belong in an operator's terminal. */
      log(`memory written: key=${key} at=${at} bytes=${text.length}`)
    },
  }
}
