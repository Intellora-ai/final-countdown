/* A LESSON IS WRITTEN ONCE AND CAN BE READ BY EVERYONE WHO HAS NOT SEEN IT.
 *
 * THE COST THIS REMOVES, MEASURED. Every concept request reserves ~1,778 tokens
 * of prompt plus a 1,000-token reply against Groq's 8,000 per minute and
 * 200,000 per day. This account reached `Used 198032 / 200000` in one
 * afternoon. A class of forty students working the same syllabus asks the same
 * forty concepts, and today every one of those forty asks is authored from
 * scratch: the same truth, written forty times, paid for forty times.
 *
 * THE RULE THIS DOES NOT BREAK. "Never repeat an explanation" is a property of
 * a LEARNER, not of the corpus -- `explanations.ts` states it exactly that way,
 * keyed per student. A lesson this learner has never seen is new TO THEM
 * however many other people have read it, which is the same reason a textbook
 * is not a worse textbook for having two readers.
 *
 * SO THE ROUTE IS THE KEY, AND `alreadyUsed` IS STILL OBEYED. Entries are
 * stored per `route.ts` axis, and a lookup is handed the routes this learner
 * has already spent. It can only return an axis they have not had -- the same
 * test `nextRoute` applies before authoring. A learner asking a second time
 * still gets a different way in; they just may not pay for it.
 *
 * WHAT IS NOT CACHED, AND WHY. Nothing that was salvaged, nothing refused, and
 * nothing personalised: only a lesson that passed the gate whole. A partial
 * answer is worth serving to the person who waited for it and is not worth
 * handing to somebody else as though it were the real thing.
 *
 * THE SAME STORE EVERYTHING ELSE LIVES IN. No new engine: `sqliteMemoryStore`
 * from Phase 1, `memoryKey` from Phase 1, the transactional `update` from Phase
 * 2. Durability and isolation are not re-argued here because they were proven
 * there.
 */

import { memoryKey } from './key.ts'
import type { MemoryStore } from './sqliteStore.ts'

/** One lesson as it was served, with the tutor turn that went with it. */
export interface Written {
  /** The `route.ts` axis it took. What a learner's spent list is compared to. */
  readonly route: string
  /** The validated lesson. Stored whole so a hit needs no re-authoring. */
  readonly lesson: unknown
  /** The question that finds out whether it landed. */
  readonly checkpoint?: string
  /** Named branches. Same shape `handler.ts` forwards. */
  readonly next?: unknown
  /** ISO 8601, so a row reads in order without a clock. */
  readonly at: string
}

/**
 * How many ways in are kept for one concept.
 *
 * `route.ts` has twelve axes and `nextRoute` restarts the cycle once they are
 * spent, so a thirteenth entry can never be the one a learner is owed. Keyed by
 * route rather than appended, so re-authoring the same axis replaces rather
 * than grows.
 */
const MOST_ROUTES_KEPT = 12

/**
 * THE CONCEPT, AS A KEY PART.
 *
 * Deliberately NOT keyed by student: that is the whole point. `memoryKey` wants
 * three parts, so the student part is the constant `shared` -- one box every
 * learner reads and writes, sitting beside the per-student boxes in the same
 * file, told apart by a prefix exactly as `explanations.ts` does with
 * `explain:`.
 *
 * The concept is normalised the same way `explanations.ts` normalises it, so
 * "What is photosynthesis?" and "what  is  photosynthesis?" share a cache
 * entry. Case and runs of whitespace carry no meaning in a question.
 */
export function keyFor(concept: string): string {
  return memoryKey({
    studentId: 'shared',
    tabId: 'any',
    lessonId: `written:${encodeURIComponent(concept.trim().toLowerCase().replace(/\s+/g, ' '))}`,
  })
}

/** Only shapes this module wrote. Anything else reads as an empty shelf. */
function shelfFrom(stored: string | undefined): Record<string, Written> {
  if (stored === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    /* A row this module cannot read is not a reason to refuse to teach. The
       caller authors as if nothing were cached, which is the state it was in
       before any of this existed. */
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const out: Record<string, Written> = {}
  for (const [route, one] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof one !== 'object' || one === null) continue
    const it = one as Record<string, unknown>
    if (typeof it['route'] !== 'string' || typeof it['at'] !== 'string') continue
    if (it['lesson'] === undefined || it['lesson'] === null) continue
    out[route] = {
      route: it['route'],
      lesson: it['lesson'],
      at: it['at'],
      ...(typeof it['checkpoint'] === 'string' ? { checkpoint: it['checkpoint'] } : {}),
      ...(Array.isArray(it['next']) ? { next: it['next'] } : {}),
    }
  }
  return out
}

export interface WrittenLessons {
  /**
   * A lesson for this concept by a way in the learner has not had, or nothing.
   *
   * `spent` is that learner's own list, so a hit is always new TO THEM.
   */
  findUnseen(concept: string, spent: readonly string[]): Written | null
  /** Keep one that passed the gate whole. */
  keep(concept: string, written: Written): void
}

export function writtenLessons(store: MemoryStore): WrittenLessons {
  return {
    findUnseen(concept, spent) {
      const shelf = shelfFrom(store.read(keyFor(concept)))
      const already = new Set(spent)
      /* OLDEST FIRST, so a concept's ways in are handed out in a stable order
         rather than by whichever was written most recently. Two learners at the
         same point in their history get the same lesson, which is what makes a
         classroom's questions cheap. */
      const unseen = Object.values(shelf)
        .filter((one) => !already.has(one.route))
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      return unseen[0] ?? null
    },

    keep(concept, written) {
      if (written.route === '') return
      /*
       * `update`, NEVER read-then-write. Two learners asking the same concept at
       * the same moment both read the same shelf, and the second write would
       * silently drop the first -- the exact defect `sqliteStore.update` exists
       * for. Merging is a read-decide-write and belongs inside the transaction.
       */
      store.update(keyFor(concept), written.at, (current) => {
        const shelf = shelfFrom(current)
        shelf[written.route] = written
        const kept = Object.values(shelf)
          .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
          .slice(-MOST_ROUTES_KEPT)
        return JSON.stringify(Object.fromEntries(kept.map((one) => [one.route, one])))
      })
    },
  }
}
