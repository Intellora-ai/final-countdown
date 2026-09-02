/* PHASE 3 — WHAT SHE HAS ALREADY BEEN TOLD, KEPT WHERE IT SURVIVES A RELOAD.
 *
 * Phase 3 asks for three things and this module is the first two:
 *
 *   1. "Store every explanation with its wording and examples, keyed by lesson
 *      + concept."
 *   2. "Implement retrieval by concept — pull all prior explanations."
 *   3. "A new explanation must differ from all prior ones."
 *
 * WHAT WAS THERE INSTEAD, AND WHY IT WAS NOT ENOUGH.
 *
 * `CanvasRoute.tsx:321` keeps `useRef(new Map<string, Remembered>())`. It is a
 * Map inside one React component, so:
 *
 *   - it dies on reload. F5 and every explanation ever given is forgotten, and
 *     the next question is answered as if it were the first.
 *   - it never reached the store Phases 1 and 2 built. The server is stateless
 *     per request and read `alreadyUsed` out of the REQUEST BODY, which the
 *     browser filled from that Map -- so the SQLite layer, the thing those two
 *     phases spent weeks proving durable, has never held a single explanation.
 *   - a caller could simply omit it. Sending `alreadyUsed: []` is the whole of
 *     what it takes to be taught the same way forever.
 *
 * So the Phase 3 done condition -- "asking for the same concept twice never
 * yields the same explanation" -- held for one browser session and no longer.
 *
 * THE SAME BOX EVERYTHING ELSE LIVES IN. This adds no storage engine: it is
 * `sqliteMemoryStore` from Phase 1, keyed by `memoryKey` from Phase 1, written
 * through the transactional `update` from Phase 2. Isolation, atomicity and
 * durability are not re-argued here because they were already proven there.
 *
 * WHAT IS NOT RECORDED, AND THAT IS DELIBERATE. No mastery, no confidence, no
 * "how well she understood". Those are judgements this software cannot observe,
 * and a number it cannot measure poisons every decision made from it later.
 * What is stored is what observably HAPPENED: these words were shown, by this
 * route, at this time.
 */

import { fittedLessonId, memoryKey, type MemoryOwner } from './key.ts'
import type { MemoryStore } from './sqliteStore.ts'

/** One explanation, as it was actually given. */
export interface Explanation {
  /** The route it took -- a `route.ts` axis id, so `nextRoute` can avoid it. */
  readonly route: string
  /** The readable text she saw, joined in block order. What novelty is judged on. */
  readonly text: string
  /** When it was shown. ISO 8601, so a history reads in order without a clock. */
  readonly at: string
}

/** Everything she has been told about one concept, oldest first. */
export interface History {
  readonly explanations: readonly Explanation[]
}

const NOTHING_YET: History = { explanations: [] }

/**
 * How many explanations are kept for one concept.
 *
 * `route.ts` has TWELVE axes and `nextRoute` restarts the cycle once they are
 * spent, so a thirteenth entry can no longer change which route is chosen next.
 * Keeping more would grow a child's row without end for no decision it could
 * ever affect.
 *
 * The OLDEST are dropped, never the newest: the recent ones are the ones a
 * repeat would resemble, and they are what novelty is judged against.
 */
const MOST_EXPLANATIONS_KEPT = 12

/**
 * WHICH CONCEPT THIS IS, AS A KEY PART.
 *
 * Phase 3 says "keyed by lesson + concept", and `memoryKey` already builds
 * `student : tab : lesson`. The concept is folded into the lesson part rather
 * than added as a fourth, so every guarantee `key.ts` already proves -- each
 * part percent-encoded so a separator cannot appear inside one, no empty part,
 * no space-padded part silently merging two boxes -- covers the concept too,
 * with nothing re-derived.
 *
 * `explain:` marks the row as an explanation history and not canvas progress.
 * They share a store and must never be read as each other: `progress.ts`
 * refuses to overwrite progress with a shape that has none, and would refuse
 * this.
 */
/**
 * A KEY IS OUR PROBLEM, NOT HERS. Measured 2026-09-02 by the gibberish law: a
 * student who pasted a paragraph -- 5,000 characters, one screenful of a
 * textbook -- got `BadMemoryKey: lessonId is longer than 200 characters`
 * thrown out through the API. Long is not invalid.
 *
 * Past the limit the question is replaced by a hash of itself: two different
 * long questions stay two different memories, and the row is still readable
 * for every question short enough to print, which is nearly all of them.
 */
export function keyFor(owner: MemoryOwner, concept: string): string {
  const said = normalised(concept)
  return memoryKey({ ...owner, lessonId: fittedLessonId(`explain:${owner.lessonId}:`, encodeURIComponent(said), said) })
}

/**
 * The form of a concept name that two askings share.
 *
 * MEASURED AS A DEFECT IN THE MAP THIS REPLACES: it keyed on
 * `question.toLowerCase()`, so "What is photosynthesis?" and
 * "what  is  photosynthesis?" were two different memories and the learner was
 * taught the same way twice. Case and runs of whitespace carry no meaning in a
 * question, so neither may split a history.
 *
 * WHAT IS DELIBERATELY NOT DONE. No stemming, no synonyms, no embedding.
 * "Explain photosynthesis" and "How does photosynthesis work?" stay separate,
 * and pretending otherwise would need a judgement this layer cannot make. The
 * honest limit is stated here rather than implied by a comment elsewhere.
 */
function normalised(concept: string): string {
  return concept.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Only shapes this module wrote. Anything else reads as no history at all. */
function historyFrom(stored: string | undefined): History {
  if (stored === undefined) return NOTHING_YET
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    /* A row this module cannot read is not a reason to refuse to teach her.
       She is answered as a first asking, which is the state she was in before
       any of this existed. */
    return NOTHING_YET
  }
  if (typeof parsed !== 'object' || parsed === null) return NOTHING_YET
  const list = (parsed as Record<string, unknown>)['explanations']
  if (!Array.isArray(list)) return NOTHING_YET

  const kept: Explanation[] = []
  for (const one of list) {
    if (typeof one !== 'object' || one === null) continue
    const it = one as Record<string, unknown>
    if (typeof it['route'] !== 'string') continue
    if (typeof it['text'] !== 'string') continue
    if (typeof it['at'] !== 'string') continue
    kept.push({ route: it['route'], text: it['text'], at: it['at'] })
  }
  return { explanations: kept }
}

export interface Explanations {
  /** Everything she has been told about this concept, oldest first. */
  priorFor(owner: MemoryOwner, concept: string): History
  /** The route ids already spent, which is what `nextRoute` needs. */
  routesSpent(owner: MemoryOwner, concept: string): readonly string[]
  /** The wording of every prior explanation, which is what novelty is judged on. */
  wordsShown(owner: MemoryOwner, concept: string): readonly string[]
  /** Record one that was actually given. */
  remember(owner: MemoryOwner, concept: string, shown: Explanation): void
}

/**
 * The explanation history, on top of the store Phases 1 and 2 built.
 *
 * `at` is passed IN rather than read from a clock, matching `MemoryStore.write`
 * -- a module that reads the time cannot be tested for ordering without also
 * controlling the machine's clock, and every ordering proof in `m4` and `m5`
 * depends on being able to state the time rather than wait for it.
 */
export function explanationsIn(store: MemoryStore): Explanations {
  function read(owner: MemoryOwner, concept: string): History {
    return historyFrom(store.read(keyFor(owner, concept)))
  }

  return {
    priorFor: read,

    routesSpent(owner, concept) {
      return read(owner, concept).explanations.map((one) => one.route)
    },

    wordsShown(owner, concept) {
      return read(owner, concept).explanations.map((one) => one.text)
    },

    remember(owner, concept, shown) {
      /*
       * `update`, NEVER read-then-write. Two tabs of the same lesson answering
       * at once both read the same history and the second write would silently
       * drop the first -- the exact defect `sqliteStore.update` was added for,
       * and the reason its comment cites the almanac ledger. Appending is a
       * read-decide-write and belongs inside the transaction.
       */
      store.update(keyFor(owner, concept), shown.at, (current) => {
        const before = historyFrom(current).explanations
        const after = [...before, shown]
        /* Oldest dropped. See `MOST_EXPLANATIONS_KEPT`. */
        const trimmed = after.slice(Math.max(0, after.length - MOST_EXPLANATIONS_KEPT))
        return JSON.stringify({ explanations: trimmed })
      })
    },
  }
}
