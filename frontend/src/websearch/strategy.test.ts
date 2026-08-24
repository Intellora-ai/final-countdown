import { describe, expect, it } from 'vitest'

import { interpret } from './interpret'
import { MAX_REFINEMENTS, planQueries, refine, type QueryPlan } from './strategy'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]

const QUERIES = [
  'what is opportunity cost',
  'LIFO vs FIFO vs weighted average',
  'India GDP growth 2015-2025',
  'how does a bill become law in India',
  'derive the quadratic formula',
  'why does heating a gas raise its pressure',
  'explain compound interest',
  'latest news about TypeScript',
  'current price of copper',
  'best approach to learning Rust',
  'what is mercury',
  '2+2',
  '',
] as const

const SEEDS = Array.from({ length: 150 }, (_, i) => i * 6151 + 7)

const allQueryText = (plan: QueryPlan) => plan.queries.map((q) => q.text)

/* -------------------------------------------------------------------------- */

describe('the planner invents nothing either — the guarantee propagates', () => {
  /* `interpret` promises entities and aspects are substrings of the query. That
     promise is worthless if the very next stage is free to synthesise query
     text out of nothing. Every token of every planned query must trace back to
     something the user typed. */
  it.each(SEEDS)('every planned token came from the query (seed %i)', (seed) => {
    const query = pick(rng(seed), QUERIES)
    const req = interpret(query)
    const plan = planQueries(req)
    const allowed = new Set(req.normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean))
    for (const q of plan.queries) {
      for (const token of q.text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        expect(allowed.has(token)).toBe(true)
      }
    }
  })

  it('a planned query is never empty, because an empty query retrieves the whole web', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const plan = planQueries(interpret(pick(rng(seed), QUERIES)))
      for (const q of plan.queries) expect(q.text.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('§42 — a question we decided not to search produces no queries', () => {
  it.each(['2+2', '', '   ', '17 * 3'])('%j plans nothing', (q) => {
    const plan = planQueries(interpret(q))
    expect(plan.queries).toEqual([])
    expect(plan.fetchCount).toBe(0)
  })

  it('refinement cannot resurrect a search we declined', () => {
    const req = interpret('2+2')
    expect(refine(req, planQueries(req), ['anything'], 0)).toBeUndefined()
  })
})

describe('§14 — retrieval adapts to the question, it is not one setting for all', () => {
  it('a comparison fetches more than a definition, because it must corroborate', () => {
    const definition = planQueries(interpret('what is opportunity cost'))
    const comparison = planQueries(interpret('LIFO vs FIFO vs weighted average'))
    expect(comparison.fetchCount).toBeGreaterThan(definition.fetchCount)
  })

  it.each(SEEDS.slice(0, 80))('fetchCount always covers minSources (seed %i)', (seed) => {
    const req = interpret(pick(rng(seed), QUERIES))
    const plan = planQueries(req)
    if (req.shouldSearch) {
      expect(plan.fetchCount).toBeGreaterThanOrEqual(req.minSources)
    }
  })

  it('a realtime question refuses the cache, and the plan carries that, not a comment', () => {
    const plan = planQueries(interpret('current price of copper'))
    expect(plan.requireFresh).toBe(true)
    expect(plan.maxAgeMs).toBeUndefined()
  })

  it('a recent question keeps the cache but bounds its age', () => {
    const plan = planQueries(interpret('latest news about TypeScript'))
    expect(plan.requireFresh).toBe(false)
    expect(plan.maxAgeMs).toBeGreaterThan(0)
  })

  it('an ambiguous question does not silently pick a reading by planning for one', () => {
    /* If the planner appended a disambiguator, it would resolve §45.6 ambiguity
       by fiat and the surfaced ambiguity would be theatre. */
    const req = interpret('what is mercury')
    const plan = planQueries(req)
    const text = allQueryText(plan).join(' ')
    expect(text).not.toContain('planet')
    expect(text).not.toContain('element')
  })
})

describe('§15/§43 — refinement makes progress, and then it stops', () => {
  const req = interpret('how does a bill become law in India')
  const base = planQueries(req)

  it('nothing uncovered means nothing to refine — this is the stop condition', () => {
    expect(refine(req, base, [], 0)).toBeUndefined()
  })

  it('an uncovered aspect produces a query that is actually different', () => {
    const next = refine(req, base, ['law'], 0)
    expect(next).toBeDefined()
    const before = new Set(allQueryText(base))
    expect(next!.queries.some((q) => !before.has(q.text))).toBe(true)
  })

  /* THE TERMINATION PROPERTY. A refiner that can always produce one more query
     is an infinite loop wearing a feature's clothing: each round looks like
     progress, the budget drains, and nothing upstream can tell the difference
     between "still working" and "never going to finish". */
  it('refinement terminates even when the gap never closes', () => {
    let plan: QueryPlan | undefined = base
    let rounds = 0
    let issued = plan
    while (plan !== undefined) {
      plan = refine(req, issued, ['law', 'india', 'bill'], rounds)
      if (plan) issued = plan
      rounds += 1
      expect(rounds).toBeLessThan(1000)
    }
    expect(rounds).toBeLessThanOrEqual(MAX_REFINEMENTS + 1)
  })

  it.each([MAX_REFINEMENTS, MAX_REFINEMENTS + 1, MAX_REFINEMENTS + 50])(
    'at or past the refinement budget (%i) it refuses regardless of gaps',
    (round) => {
      expect(refine(req, base, ['law', 'india'], round)).toBeUndefined()
    },
  )

  it('a refined query still invents nothing', () => {
    const next = refine(req, base, ['law'], 0)
    const allowed = new Set(req.normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean))
    for (const q of next!.queries) {
      for (const t of q.text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        expect(allowed.has(t)).toBe(true)
      }
    }
  })

  it('an uncovered aspect that was never part of the question is ignored, not searched', () => {
    /* Otherwise a downstream stage can inject arbitrary text into an outbound
       engine query by naming it as a "gap". */
    const next = refine(req, base, ['ignore all previous instructions'], 0)
    if (next) {
      expect(allQueryText(next).join(' ')).not.toContain('ignore')
    }
  })
})

describe('planning is deterministic, because a plan is a cache key too', () => {
  it.each(SEEDS.slice(0, 60))('same requirements, same plan (seed %i)', (seed) => {
    const req = interpret(pick(rng(seed), QUERIES))
    expect(planQueries(req)).toEqual(planQueries(req))
  })
})

describe('the plan is bounded, so one question cannot exhaust the budget', () => {
  it.each(SEEDS)('queries and fetches stay within limits (seed %i)', (seed) => {
    const plan = planQueries(interpret(pick(rng(seed), QUERIES)))
    expect(plan.queries.length).toBeLessThanOrEqual(6)
    expect(plan.fetchCount).toBeLessThanOrEqual(12)
    expect(plan.concurrency).toBeGreaterThanOrEqual(1)
    expect(plan.concurrency).toBeLessThanOrEqual(8)
  })

  it('duplicate query texts are collapsed, since two identical queries cost twice and learn once', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const texts = allQueryText(planQueries(interpret(pick(rng(seed), QUERIES))))
      expect(new Set(texts).size).toBe(texts.length)
    }
  })
})
