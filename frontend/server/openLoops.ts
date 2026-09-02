/**
 * THE OPEN-LOOP LEDGER: questions that went unanswered, kept until they are not.
 *
 * WHY THIS EXISTS.
 *   `askChain` ends with `answeredBy: null` and the learner gets an honest
 *   refusal — and then the product forgets. The learner asked something real,
 *   was told "not right now", and on her next visit nothing anywhere remembers
 *   that she is still owed an answer. A person who said "I'll get back to you"
 *   and never did would not be called intelligent. This module is the memory
 *   of the promise.
 *
 * WHAT IT DELIBERATELY IS NOT.
 *   Not a queue, not a notifier, not a scheduler. Nothing here ever initiates
 *   anything: the canvas ASKS on arrival and shows at most one quiet card.
 *   Children use this product; the loop waits for her, never the reverse.
 *
 * WHY IT RIDES `MemoryStore` INSTEAD OF OWNING A TABLE.
 *   The store's whole contract is "text under a key, atomically updatable",
 *   and its `update()` exists precisely because read-then-write lets two
 *   servers silently undo each other. A second sqlite schema would duplicate
 *   that machinery to hold a JSON array. One key per student, namespaced so it
 *   can never collide with a canvas memory key (`memory/key.ts` keys carry a
 *   tab and lesson id; this prefix carries neither).
 */

import type { MemoryStore } from './memory/sqliteStore.ts'

/** One question the product still owes an answer. */
export interface OpenLoop {
  /** Her words, exactly. Capped on entry; never rewritten. */
  readonly question: string
  /** The lesson she was in when she asked, so the card can return her there. */
  readonly lesson: string
  /**
   * Why it stalled, in the chain's own vocabulary: 'refused' means every rung
   * looked and declined; 'failed' means something could not be reached. The
   * card treats them the same; keeping them apart preserves the distinction
   * `chain.ts` fights to maintain — "no answer" versus "could not go and look".
   */
  readonly stalled: 'refused' | 'failed'
  /** ISO time it was recorded. Injected by the route, never read from a clock here. */
  readonly at: string
}

/**
 * The most loops one student may hold. A bound, not a policy: past this, the
 * OLDEST is dropped, because a list of forty unanswered questions is not a
 * memory of promises any more — it is a guilt pile nobody will read.
 */
export const MAX_LOOPS = 12

/** Her words survive whole up to this; past it the record would be a document. */
export const MAX_QUESTION_LENGTH = 300

const KEY_PREFIX = 'open-loops/'

function keyFor(studentId: string): string {
  return `${KEY_PREFIX}${studentId}`
}

/**
 * Parse a stored value, tolerating anything.
 *
 * A corrupt row must degrade to "no loops", never to a crash: this ledger is a
 * courtesy, and a courtesy that can take down `/api/situation` has forgotten
 * what it is. Unknown fields are dropped; malformed entries are skipped.
 */
function parseLoops(raw: string | undefined): OpenLoop[] {
  if (raw === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: OpenLoop[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const question = record['question']
    const lesson = record['lesson']
    const stalled = record['stalled']
    const at = record['at']
    if (typeof question !== 'string' || question.trim() === '') continue
    if (typeof lesson !== 'string') continue
    if (stalled !== 'refused' && stalled !== 'failed') continue
    if (typeof at !== 'string') continue
    out.push({ question, lesson, stalled, at })
  }
  return out
}

export interface OpenLoops {
  /** Every loop this student holds, oldest first. */
  list(studentId: string): readonly OpenLoop[]
  /**
   * Record an unanswered question. Asking the same question again refreshes
   * its entry (new time, new reason) rather than duplicating it — a learner
   * who tries three times is owed one answer, not three cards.
   */
  open(studentId: string, loop: { question: string; lesson: string; stalled: 'refused' | 'failed' }, at: string): void
  /**
   * The promise was kept (or withdrawn): remove the loop for this question.
   * Closing a question that holds no loop is a no-op, not an error — the
   * common case is an answer arriving for a question that never stalled.
   */
  close(studentId: string, question: string): void
}

/** Case- and whitespace-insensitive sameness, because her retype is her question. */
function sameQuestion(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function openLoops(store: MemoryStore): OpenLoops {
  return {
    list(studentId) {
      return parseLoops(store.read(keyFor(studentId)))
    },

    open(studentId, loop, at) {
      const question = loop.question.trim().slice(0, MAX_QUESTION_LENGTH)
      if (question === '') return
      store.update(keyFor(studentId), at, (current) => {
        const kept = parseLoops(current).filter((l) => !sameQuestion(l.question, question))
        kept.push({ question, lesson: loop.lesson.slice(0, 200), stalled: loop.stalled, at })
        /* Oldest dropped from the FRONT: entries are appended in time order and
           re-asking re-appends, so index 0 is always the stalest promise. */
        return JSON.stringify(kept.slice(-MAX_LOOPS))
      })
    },

    close(studentId, question) {
      store.update(keyFor(studentId), new Date(0).toISOString(), (current) => {
        const loops = parseLoops(current)
        const kept = loops.filter((l) => !sameQuestion(l.question, question))
        /* Unchanged means untouched: returning undefined leaves the row alone,
           so a close for a question that never stalled writes nothing. */
        return kept.length === loops.length ? undefined : JSON.stringify(kept)
      })
    },
  }
}
