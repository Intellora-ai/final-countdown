/**
 * §32 — WHERE THE ANSWER ACTUALLY CAME FROM.
 *
 * The spec asks for four origins to be recorded, and then states the rule that
 * makes recording them worth anything:
 *
 *   "Never represent stale precomputed data as fresh live web data."
 *
 * That is invariant 2 as well, and it is the whole of this file. The origins
 * are cheap; the honesty about the MIX of them is not.
 *
 * WHY ONE STALE SOURCE MAKES THE WHOLE ANSWER NOT-LIVE
 * ----------------------------------------------------
 * The tempting rule is a majority, or a ratio, or "mostly live". Every one of
 * those is how stale data ends up presented as fresh: the label describes most
 * of the evidence and is wrong about the rest, and the reader has no way to
 * tell which claim came from which source. Nine live pages and one week-old
 * cache entry is NOT a live answer — it is an answer that contains week-old
 * information, and the one thing the reader needs to know is exactly that.
 *
 * So `live` is a conjunction over every usable source, and it is asserted that
 * way over generated mixes rather than spot-checked.
 *
 * WHY THE EMPTY CASE NEEDED ITS OWN GUARD
 * ---------------------------------------
 * `[].every(...)` is `true`. Without an explicit check, an answer built on no
 * usable sources at all reports itself as freshly retrieved from the live web
 * — the strongest possible claim, made by the weakest possible evidence. That
 * is not a hypothetical: it is the default behaviour of the obvious
 * implementation.
 *
 * WHY `local` IS ABSENT
 * ---------------------
 * §32 lists four origins and this file produces three. "Local knowledge" is the
 * agent's own memory, which lives in `src/agent` and never passes through this
 * package. Declaring an origin this code cannot produce would be a branch every
 * caller writes and none ever reaches.
 */

import type { Retrieved } from './gather'

/* -------------------------------------------------------------------------- */

/**
 * The declared set. THE list, not a copy of one.
 *
 * Exported so a test asserts against the real values rather than a list it
 * also wrote, and imported by `webSearchClient.ts` to filter untrusted input —
 * which is what makes this the single runtime source of truth rather than one
 * of two lists that happen to agree.
 *
 * `live` — fetched during this search.
 * `recent-cache` — fetched earlier, for a real earlier question.
 * `precomputed` — prepared speculatively, possibly never asked for before.
 */
export const MAX_ORIGINS = ['live', 'recent-cache', 'precomputed'] as const

/**
 * DERIVED from the value above rather than written alongside it.
 *
 * Declaring the union separately meant a fourth origin could be added to one
 * and not the other, and both halves would still typecheck. Deriving makes
 * that unrepresentable: there is one place to edit, and the type follows.
 */
export type Origin = (typeof MAX_ORIGINS)[number]

export interface Freshness {
  /**
   * True only when EVERY usable source was fetched live during this search.
   * Never a majority, never a ratio.
   */
  live: boolean
  /** Every origin that contributed, deduplicated and sorted. */
  origins: readonly Origin[]
  /** Age of the OLDEST contributing source. Absent when no age is knowable. */
  oldestAgeMs?: number
  /** How many sources actually contributed bytes. */
  usableSources: number
}

/**
 * Where one page came from.
 *
 * `precomputed` outranks `recent-cache` because a precomputed entry is also
 * served from the cache — the flag is the more specific fact, and collapsing it
 * into "cache" would lose the distinction §32 asks for.
 */
export function originOf(page: Retrieved, _now: () => number = Date.now): Origin {
  if (page.precomputed) return 'precomputed'
  return page.fromCache ? 'recent-cache' : 'live'
}

/** Milliseconds since a timestamp, or `undefined` when it is not knowable. */
function ageOf(retrievedAt: string, at: number): number | undefined {
  const t = Date.parse(retrievedAt)
  if (!Number.isFinite(t)) return undefined
  /* A future timestamp is wrong or lying. Clamping to zero reports "as fresh
     as possible" rather than a negative age that would sort as the oldest. */
  return Math.max(0, at - t)
}

/**
 * The freshness of a whole answer.
 *
 * Only sources that actually produced bytes count. A failed fetch has no
 * origin: if it counted as live, a search where everything failed except one
 * cached page would report itself live, which is the exact inversion this
 * exists to prevent.
 */
export function freshnessOf(pages: readonly Retrieved[], now: () => number = Date.now): Freshness {
  const at = now()
  const usable = pages.filter((p) => p.ok)

  /* `[].every()` is true, so the empty case is stated rather than inherited. */
  if (usable.length === 0) {
    return { live: false, origins: [], usableSources: 0 }
  }

  const origins = [...new Set(usable.map((p) => originOf(p, now)))].sort()
  const ages = usable.map((p) => ageOf(p.retrievedAt, at)).filter((a): a is number => a !== undefined)

  return {
    /* The OLDEST source sets the age. Reporting the newest would let one fresh
       page hide a week-old one sitting beside it. */
    ...(ages.length === 0 ? {} : { oldestAgeMs: Math.max(...ages) }),
    live: usable.every((p) => originOf(p, now) === 'live'),
    origins,
    usableSources: usable.length,
  }
}
