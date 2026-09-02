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

import { fittedLessonId, memoryKey } from './key.ts'
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
  /**
   * WHICH RECIPE WROTE IT. See `writtenLessons`.
   *
   * A lesson is only reusable while the thing that produces lessons has not
   * changed. Stamped on write and checked on read, so a prompt change retires
   * every lesson written before it without anyone having to remember to.
   */
  readonly recipe: string
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
/**
 * The words that make a subject a COMPARISON, where the two sides are
 * interchangeable and the sequence really is arbitrary.
 */
const JOINED = new Set(['and', 'or', 'vs', 'vs.', 'versus', '&'])

export function keyFor(concept: string): string {
  /*
   * ORDER CARRIES NO MEANING IN A COMPARISON. IT CARRIES ALL OF IT ELSEWHERE.
   *
   * MEASURED: the same comparison asked two ways was named `mass and weight`
   * once and `weight and mass` the other time, and the second learner missed a
   * lesson already on the shelf and paid to have it written again. Both name
   * one subject; only the sequence differs.
   *
   * SORTING EVERY TARGET WAS THE WRONG GENERALISATION OF THAT. Two nouns joined
   * by "and" are interchangeable; words standing in a RELATION are not, and
   * sorting collapsed subjects that mean different things onto one shelf entry:
   *
   *   "rate of change"        and "change of rate"
   *   "work done by a force"  and "force done by a work"
   *
   * The first learner's lesson was then served to the second under a key that
   * no longer told them apart. Nothing in a target marks which kind it is --
   * except the joining word itself, which is present in exactly the case where
   * the sequence is arbitrary. So the sort is applied there and nowhere else.
   *
   * Safe HERE either way: the tutor still receives `decision.target` in the
   * order the model wrote it. This is an identifier, and an identifier only has
   * to be stable.
   */
  const words = concept
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((word) => word !== '')
  const compared = words.some((word) => JOINED.has(word))
  const named = (compared ? [...words].sort() : words).join(' ')
  return memoryKey({
    studentId: 'shared',
    tabId: 'any',
    lessonId: fittedLessonId('written:', encodeURIComponent(named), named),
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
    /* A row with no recipe was written before recipes existed, so it cannot be
       vouched for and reads as absent. */
    if (typeof it['recipe'] !== 'string') continue
    out[route] = {
      route: it['route'],
      lesson: it['lesson'],
      at: it['at'],
      recipe: it['recipe'],
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
  /** Keep one that passed the gate whole. The recipe is stamped for you. */
  keep(concept: string, written: Omit<Written, 'recipe'>): void
}

/**
 * THE SHELF, AND WHAT MAKES SOMETHING ON IT STILL GOOD.
 *
 * `recipe` is a fingerprint of everything that decides what a lesson looks
 * like -- the prompt, its rules, its worked examples. The caller derives it
 * (see `index.ts`) rather than maintaining a number, because a hand-kept
 * version is a number somebody forgets to bump the first time they edit a
 * prompt, and then a stale lesson is served for ever.
 *
 * MEASURED, AND THIS IS WHY IT EXISTS: after the target bug was fixed, the
 * shelf served the lessons written BEFORE the fix -- "wat is fotosynthesis" --
 * in 11ms, because a stored lesson has no idea the rules changed underneath it.
 */
export function writtenLessons(store: MemoryStore, recipe: string): WrittenLessons {
  return {
    findUnseen(concept, spent) {
      const shelf = shelfFrom(store.read(keyFor(concept)))
      const already = new Set(spent)
      /* OLDEST FIRST, so a concept's ways in are handed out in a stable order
         rather than by whichever was written most recently. Two learners at the
         same point in their history get the same lesson, which is what makes a
         classroom's questions cheap. */
      const unseen = Object.values(shelf)
        /* Written by a different recipe, so it is not this product's lesson any
           more however good it was. */
        .filter((one) => one.recipe === recipe)
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
        shelf[written.route] = { ...written, recipe }
        const kept = Object.values(shelf)
          .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
          .slice(-MOST_ROUTES_KEPT)
        return JSON.stringify(Object.fromEntries(kept.map((one) => [one.route, one])))
      })
    },
  }
}
