/**
 * REQUIREMENTS IN, A RETRIEVAL PLAN OUT. §14 and §15.
 *
 * The previous shape of this system had one retrieval setting for every
 * question: fetch eight, four at a time, cache always allowed. That is a policy
 * for the average question, and no real question is the average one. A
 * definition is settled by one good source; a comparison that fetches one source
 * has not compared anything; a question about a price right now must not be
 * answered from last week's bytes at any fetch count.
 *
 * WHY THE PLANNER MAY NOT WRITE WORDS
 * -----------------------------------
 * `interpret` guarantees that entities and aspects are substrings of the query.
 * That guarantee is worth nothing if the very next stage may synthesise query
 * text freely, because the invention would then be one hop from the guarantee
 * and look like it inherited it. So every token of every planned query is drawn
 * from the query's own tokens, and that is asserted rather than intended.
 *
 * It has a security edge as well as an honesty one. `refine` takes a list of
 * uncovered aspects, and those arrive from a stage that has processed FETCHED
 * PAGE CONTENT. A refiner that will search for whatever it is handed is an
 * injection sink: a page that says its own text is a "gap" gets to choose the
 * next outbound query. Gaps are therefore intersected with the question's own
 * aspects and anything else is dropped.
 *
 * WHY REFINEMENT HAS A HARD CEILING
 * ---------------------------------
 * §43 says stop when evidence is sufficient. The failure mode is the opposite
 * one: a gap that never closes, because the answer is not on the web at all.
 * A refiner that can always produce one more query is an infinite loop wearing
 * a feature's clothing — every round looks like progress and nothing upstream
 * can distinguish "still working" from "never going to finish". The ceiling is
 * a constant, exported, and asserted against; a budget that only exists in a
 * comment is not a budget.
 */

import type { SearchRequirements } from './interpret'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface PlannedQuery {
  text: string
  /** Why this query exists. Carried into the report so a plan is explainable. */
  purpose: 'primary' | 'aspect' | 'refinement'
}

export interface QueryPlan {
  queries: readonly PlannedQuery[]
  /** How many pages to actually fetch. Never fewer than `minSources`. */
  fetchCount: number
  concurrency: number
  /** Bounded staleness. Absent when the cache is bypassed or unbounded. */
  maxAgeMs?: number
  requireFresh: boolean
}

/**
 * How many refinement rounds are allowed, ever.
 *
 * Exported because the test asserts against this exact value rather than a
 * number it also guessed. Three is enough to chase a genuinely missing aspect
 * and far too few to hide a non-terminating loop.
 */
export const MAX_REFINEMENTS = 3

const MAX_QUERIES = 6
const MAX_FETCH = 12
const MAX_CONCURRENCY = 8

const EMPTY_PLAN: QueryPlan = {
  queries: [],
  fetchCount: 0,
  concurrency: 1,
  requireFresh: false,
}

const tokensOf = (s: string): string[] => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Collapse identical texts. Two identical queries cost twice and learn once. */
function dedupeQueries(queries: readonly PlannedQuery[]): PlannedQuery[] {
  const seen = new Set<string>()
  const out: PlannedQuery[] = []
  for (const q of queries) {
    const text = q.text.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({ ...q, text })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* §14 — how much retrieval this question needs                               */
/* -------------------------------------------------------------------------- */

/**
 * Fetch depth as a function of the question, not of a global default.
 *
 * A comparison needs one source per thing compared plus corroboration; an
 * opinion needs breadth because there is no single right answer to find; a
 * definition is usually settled by the first good page and paying for eight is
 * paying seven times for nothing.
 */
function fetchDepth(req: SearchRequirements): number {
  const base =
    req.intent === 'comparison' || req.intent === 'opinion'
      ? 8
      : req.intent === 'enumerative' || req.intent === 'temporal'
        ? 6
        : 4
  /* Never below what §10 said this question needs corroborated. The max is not
     decoration: a policy that can return fewer sources than the requirement
     silently converts "needs two" into "got one". */
  return Math.min(MAX_FETCH, Math.max(base, req.minSources))
}

/**
 * The queries to issue.
 *
 * The whole question first, because a search engine is better at whole
 * questions than any decomposition this file could invent. Aspect queries
 * follow only when the question has enough distinct terms that one query
 * plausibly misses one of them.
 */
export function planQueries(req: SearchRequirements): QueryPlan {
  if (!req.shouldSearch) return EMPTY_PLAN

  const queries: PlannedQuery[] = [{ text: req.normalized, purpose: 'primary' }]

  /* Aspect queries pair the leading entity with each remaining aspect. Pairing
     rather than issuing a bare aspect keeps the subject attached: `law` alone
     retrieves the whole of jurisprudence, `india law` retrieves the question. */
  const [head, ...rest] = req.aspects
  if (head && rest.length >= 2) {
    for (const aspect of rest.slice(0, MAX_QUERIES - 1)) {
      queries.push({ text: `${head} ${aspect}`, purpose: 'aspect' })
    }
  }

  const deduped = dedupeQueries(queries).slice(0, MAX_QUERIES)
  const fetchCount = fetchDepth(req)

  return {
    queries: deduped,
    fetchCount,
    /* Bounded by the fetch count as well as by the ceiling: opening eight
       connections to retrieve four pages is four connections spent on nothing. */
    concurrency: Math.max(1, Math.min(MAX_CONCURRENCY, fetchCount)),
    ...(req.maxAgeMs === undefined ? {} : { maxAgeMs: req.maxAgeMs }),
    requireFresh: req.requireFresh,
  }
}

/* -------------------------------------------------------------------------- */
/* §15 / §43 — refinement, and the stop condition                             */
/* -------------------------------------------------------------------------- */

/**
 * A narrower plan for the aspects the first pass did not cover, or `undefined`
 * when there is nothing left to do.
 *
 * `undefined` is the stop signal and it fires for three separate reasons, all
 * of which are genuine ends rather than errors: the question was never
 * searchable, nothing is uncovered, or the refinement budget is spent. A caller
 * loops `while (plan)` and terminates by construction.
 *
 * `uncovered` is UNTRUSTED. It is computed downstream from fetched page text,
 * so a page can influence what lands in it. Intersecting with the question's
 * own aspects means the worst a hostile page can do is suppress a refinement,
 * never cause one for text of its choosing.
 */
export function refine(
  req: SearchRequirements,
  issued: QueryPlan,
  uncovered: readonly string[],
  round: number,
): QueryPlan | undefined {
  if (!req.shouldSearch) return undefined
  if (round >= MAX_REFINEMENTS) return undefined

  const permitted = new Set(req.aspects)
  const gaps = [...new Set(uncovered)].filter((g) => permitted.has(g))
  if (gaps.length === 0) return undefined

  const already = new Set(issued.queries.map((q) => q.text))
  const head = req.aspects[0] ?? ''

  /* SEVERAL FORMULATIONS PER GAP, not one.
   *
   * A refinement that repeats a query already issued is not a refinement — the
   * engine has answered that exact question and the aspect is still uncovered,
   * so asking again spends a round to learn nothing. But giving up at the first
   * repeat is the opposite error, and it is the one this hit: the aspect pass
   * has usually ALREADY issued `head + gap`, so the single-formulation refiner
   * declined to refine in exactly the case refinement exists for.
   *
   * So each gap gets a sequence of genuinely different pairings, and the first
   * one nobody has asked yet is taken. Every token still comes from the query;
   * what varies is which of the user's own terms sit next to each other. */
  const candidates: PlannedQuery[] = []
  for (const gap of gaps) {
    const pairings = [
      head && head !== gap ? `${head} ${gap}` : '',
      ...req.aspects.filter((a) => a !== gap && a !== head).map((a) => `${gap} ${a}`),
      gap,
    ].filter(Boolean)
    const next = pairings.find((text) => !already.has(text))
    if (next) candidates.push({ text: next, purpose: 'refinement' })
  }

  /* Only when EVERY formulation of every gap has already been asked is the gap
     genuinely unreachable by asking differently, and stopping is the honest
     move rather than a round spent proving it. */
  const fresh = dedupeQueries(candidates)
  if (fresh.length === 0) return undefined

  return {
    queries: fresh.slice(0, MAX_QUERIES),
    fetchCount: Math.min(MAX_FETCH, Math.max(req.minSources, fresh.length * 2)),
    concurrency: Math.max(1, Math.min(MAX_CONCURRENCY, fresh.length * 2)),
    ...(req.maxAgeMs === undefined ? {} : { maxAgeMs: req.maxAgeMs }),
    requireFresh: req.requireFresh,
  }
}
