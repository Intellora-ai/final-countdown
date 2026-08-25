import { describe, expect, it } from 'vitest'

import { Latency, nearestRank, type PathKind } from './latency'

describe('nearestRank uses nearest-rank, and says which rank', () => {
  const oneToHundred = Array.from({ length: 100 }, (_, i) => i + 1)

  it.each([
    [50, 50],
    [90, 90],
    [95, 95],
    [99, 99],
    [100, 100],
    [1, 1],
  ])('p%d of 1..100 is %d', (p, expected) => {
    expect(nearestRank(oneToHundred, p)).toBe(expected)
  })

  it('does not interpolate between samples', () => {
    /* An interpolated p95 reports a latency no request ever had. For a budget
       you intend to hold yourself to, the honest answer is a real observation. */
    expect(nearestRank([10, 20], 95)).toBe(20)
    expect(nearestRank([10, 20], 50)).toBe(10)
  })

  it('is order-independent', () => {
    expect(nearestRank([1, 3, 5, 7, 9], 50)).toBe(5)
  })

  it('returns undefined for no samples rather than 0 or NaN', () => {
    /* Zero would read as "instant" on a dashboard. NaN poisons arithmetic
       downstream. Neither is "we have not measured this yet". */
    expect(nearestRank([], 50)).toBeUndefined()
  })

  it('collapses to the single value when there is one sample', () => {
    for (const p of [1, 50, 99]) expect(nearestRank([42], p)).toBe(42)
  })

  it('rejects a percentile outside 0-100 instead of returning nonsense', () => {
    expect(nearestRank([1, 2, 3], 0)).toBeUndefined()
    expect(nearestRank([1, 2, 3], 101)).toBeUndefined()
    expect(nearestRank([1, 2, 3], Number.NaN)).toBeUndefined()
  })
})

describe('the three paths are never blended', () => {
  it('reports each separately, because they are different physics', () => {
    const log = new Latency()
    log.record('local', 0.2)
    log.record('local', 0.3)
    log.record('cached', 4)
    log.record('live', 700)
    log.record('live', 900)

    const s = log.summary()
    expect(s.local.count).toBe(2)
    expect(s.cached.count).toBe(1)
    expect(s.live.count).toBe(2)
    /* The headline number of a system that mixes these is a statement about
       its cache hit rate, not its speed. */
    expect(s.local.p50).toBeLessThan(1)
    expect(s.live.p50).toBeGreaterThan(100)
  })

  it('starts every path empty rather than absent', () => {
    const s = new Latency().summary()
    for (const path of ['local', 'cached', 'live'] as PathKind[]) {
      expect(s[path].count).toBe(0)
      expect(s[path].p50).toBeUndefined()
    }
  })

  it('offers no combined percentile at all', () => {
    const log = new Latency()
    log.record('live', 5)
    const s = log.summary() as unknown as Record<string, unknown>
    /* Asserted on the SHAPE. A blended p95 is the number people quote, and it
       cannot be computed honestly here, so it must not be available to quote. */
    expect(s.overall).toBeUndefined()
    expect(s.mean).toBeUndefined()
    expect(s.average).toBeUndefined()
  })

  it('exposes no mean on a path either', () => {
    const log = new Latency()
    log.record('live', 1)
    const path = log.summary().live as unknown as Record<string, unknown>
    expect(path.mean).toBeUndefined()
    expect(path.avg).toBeUndefined()
  })
})

describe('percentiles are monotonic, which is the cheapest correctness check', () => {
  it.each([1, 2, 3, 7, 50, 999])('holds for %d samples', (n) => {
    const log = new Latency()
    /* Deterministic spread, no clock and no randomness: a flaky statistics
       test is worse than none, because it teaches people to re-run. */
    for (let i = 0; i < n; i += 1) log.record('live', ((i * 37) % 100) + 1)

    const { p50, p95, p99 } = log.summary().live
    expect(p50).toBeDefined()
    expect(p50!).toBeLessThanOrEqual(p95!)
    expect(p95!).toBeLessThanOrEqual(p99!)
  })
})

describe('outcomes are counted apart from timings', () => {
  it('separates timeouts from other failures', () => {
    const log = new Latency()
    log.record('live', 100)
    log.record('live', 8000, 'timeout')
    log.record('live', 40, 'error')
    log.record('live', 30, 'error')

    const live = log.summary().live
    expect(live.timeouts).toBe(1)
    expect(live.failures).toBe(2)
    expect(live.successes).toBe(1)
    /* A timeout is a budget decision; a 500 is the far end being broken.
       One is tuned, the other is escalated. */
    expect(live.count).toBe(4)
  })

  it('keeps failed requests in the latency distribution', () => {
    /* Dropping them makes a system that times out constantly look fast: every
       slow request is excluded precisely because it was slow. */
    const log = new Latency()
    log.record('live', 10)
    log.record('live', 9000, 'timeout')
    expect(log.summary().live.p99).toBe(9000)
  })
})

describe('cache accounting', () => {
  it('derives the hit rate from what actually happened', () => {
    const log = new Latency()
    log.record('cached', 2)
    log.record('cached', 3)
    log.record('cached', 1)
    log.record('live', 500)

    expect(log.summary().cacheHitRate).toBeCloseTo(3 / 4)
  })

  it('is undefined before any request, not 0 or 1', () => {
    expect(new Latency().summary().cacheHitRate).toBeUndefined()
  })

  it('does not count local answers as cache hits', () => {
    /* Answering from local knowledge is not a cache hit — it is not having
       needed the web. Folding them together inflates the number that is
       supposed to justify the cache. */
    const log = new Latency()
    log.record('local', 1)
    log.record('live', 500)
    expect(log.summary().cacheHitRate).toBeCloseTo(0)
  })
})

describe('stages are measured separately, per the latency budget', () => {
  it('records each stage independently', () => {
    const log = new Latency()
    log.stage('interpret', 3)
    log.stage('retrieve', 600)
    log.stage('extract', 40)
    log.stage('rank', 5)
    log.stage('verify', 20)

    const stages = log.summary().stages
    expect(stages.retrieve.p50).toBe(600)
    expect(stages.interpret.p50).toBe(3)
    /* The point of the breakdown is to show where the budget actually goes,
       so an unrecorded stage must be visibly absent rather than zero. */
    expect(stages.generate).toBeUndefined()
  })

  it('accumulates repeated stage samples', () => {
    const log = new Latency()
    log.stage('retrieve', 100)
    log.stage('retrieve', 300)
    expect(log.summary().stages.retrieve.count).toBe(2)
  })
})

describe('robustness', () => {
  it('ignores a non-finite duration rather than poisoning the distribution', () => {
    const log = new Latency()
    log.record('live', Number.NaN)
    log.record('live', Number.POSITIVE_INFINITY)
    log.record('live', -5)
    log.record('live', 10)

    const live = log.summary().live
    expect(live.count).toBe(1)
    expect(live.p50).toBe(10)
  })

  it('does not mutate a caller-held summary on later records', () => {
    const log = new Latency()
    log.record('live', 10)
    const first = log.summary()
    log.record('live', 20)
    expect(first.live.count).toBe(1)
  })

  it('handles a large number of samples quickly', () => {
    const log = new Latency()
    const started = Date.now()
    for (let i = 0; i < 200_000; i += 1) log.record('live', i % 1000)
    expect(log.summary().live.count).toBe(200_000)
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
