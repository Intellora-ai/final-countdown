import { describe, expect, it } from 'vitest'

import { HOP_NAMES, hopsOf, reuseOf } from './hops'
import { Latency } from './latency'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}
const SEEDS = Array.from({ length: 100 }, (_, i) => i * 4271 + 29)

/* -------------------------------------------------------------------------- */

describe('§30 — all four hops are always reported, including the one we cannot see', () => {
  /* Omitting an unmeasurable hop is indistinguishable from not having looked.
     The whole instruction in §30 is "do not assume — measure it", and a report
     showing three hops reads as a complete picture of a four-hop path. */
  it.each(HOP_NAMES)('%s appears even with no samples at all', (name) => {
    expect(Object.keys(hopsOf(new Latency()))).toContain(name)
  })

  it('there are exactly the four hops §30 names', () => {
    expect(HOP_NAMES.length).toBe(4)
    expect(HOP_NAMES).toContain('userToCompute')
    expect(HOP_NAMES).toContain('computeToCache')
    expect(HOP_NAMES).toContain('computeToProvider')
    expect(HOP_NAMES).toContain('providerToSource')
  })

  it('userToCompute is unobservable HERE, and says so in a field rather than a comment', () => {
    /* This package starts after the request has arrived. Reporting 0, or
       silently dropping it, would both be claims we cannot support. */
    const hop = hopsOf(new Latency()).userToCompute
    expect(hop.observable).toBe(false)
    expect(hop.reason).toBeTruthy()
    expect(hop.p50).toBeUndefined()
  })

  it('the three hops this package CAN see are marked observable', () => {
    const h = hopsOf(new Latency())
    expect(h.computeToCache.observable).toBe(true)
    expect(h.computeToProvider.observable).toBe(true)
    expect(h.providerToSource.observable).toBe(true)
  })
})

describe('§30 — a hop reports real samples, and nothing when it has none', () => {
  it('an observable hop with no samples has no percentile, rather than zero', () => {
    /* Zero is a measurement. Absent is the truth. A hop reported as 0ms reads
       as "instant", which is the most flattering possible lie. */
    const h = hopsOf(new Latency())
    expect(h.providerToSource.p50).toBeUndefined()
    expect(h.providerToSource.count).toBe(0)
  })

  it('live fetches land on providerToSource', () => {
    const l = new Latency()
    l.record('live', 100)
    l.record('live', 300)
    const h = hopsOf(l)
    expect(h.providerToSource.count).toBe(2)
    expect(h.providerToSource.p50).toBeGreaterThan(0)
  })

  it('cache lookups land on computeToCache, NOT on the source hop', () => {
    const l = new Latency()
    l.record('cached', 5)
    const h = hopsOf(l)
    expect(h.computeToCache.count).toBe(1)
    expect(h.providerToSource.count).toBe(0)
  })

  it('the engine stage lands on computeToProvider', () => {
    const l = new Latency()
    l.stage('engine', 42)
    expect(hopsOf(l).computeToProvider.count).toBe(1)
  })

  it.each(SEEDS)('hops never invent a sample (seed %i)', (seed) => {
    const r = rng(seed)
    const l = new Latency()
    const live = Math.floor(r() * 4)
    const cached = Math.floor(r() * 4)
    for (let i = 0; i < live; i++) l.record('live', 1 + Math.floor(r() * 100))
    for (let i = 0; i < cached; i++) l.record('cached', 1 + Math.floor(r() * 10))
    const h = hopsOf(l)
    expect(h.providerToSource.count).toBe(live)
    expect(h.computeToCache.count).toBe(cached)
    expect(h.userToCompute.count).toBe(0)
  })
})

describe('§31 — connection reuse is MEASURED, never assumed from request count', () => {
  /* The vacuous version reports reuse because two requests happened. That is a
     statement about our own loop, not about the transport. Reuse is only
     evidenced by LATER requests to the same host costing less than the first. */
  it('one request to a host cannot evidence reuse either way', () => {
    const r = reuseOf([{ host: 'a.example', ms: 100 }])
    expect(r['a.example'].reused).toBeUndefined()
    expect(r['a.example'].requests).toBe(1)
  })

  it('later requests that are cheaper is reuse', () => {
    const r = reuseOf([
      { host: 'a.example', ms: 300 },
      { host: 'a.example', ms: 40 },
      { host: 'a.example', ms: 35 },
    ])
    expect(r['a.example'].reused).toBe(true)
    expect(r['a.example'].firstMs).toBe(300)
  })

  it('later requests that are NOT cheaper is not reuse, however many there are', () => {
    /* A hundred requests all paying full setup cost is a hundred pieces of
       evidence that reuse is NOT happening. Counting them as reuse would
       invert the signal precisely when it matters. */
    const r = reuseOf(Array.from({ length: 100 }, () => ({ host: 'a.example', ms: 300 })))
    expect(r['a.example'].reused).toBe(false)
  })

  it('hosts are kept apart, so one warm host cannot vouch for a cold one', () => {
    const r = reuseOf([
      { host: 'warm.example', ms: 300 },
      { host: 'warm.example', ms: 30 },
      { host: 'cold.example', ms: 300 },
    ])
    expect(r['warm.example'].reused).toBe(true)
    expect(r['cold.example'].reused).toBeUndefined()
  })

  it.each(SEEDS)('reuse is undefined exactly when a host has one request (seed %i)', (seed) => {
    const r = rng(seed)
    const samples = Array.from({ length: 1 + Math.floor(r() * 6) }, () => ({
      host: `h${Math.floor(r() * 3)}.example`,
      ms: 1 + Math.floor(r() * 400),
    }))
    const out = reuseOf(samples)
    for (const [host, stat] of Object.entries(out)) {
      const n = samples.filter((s) => s.host === host).length
      expect(stat.requests).toBe(n)
      expect(stat.reused === undefined).toBe(n < 2)
    }
  })

  it('no samples gives an empty report, not a fabricated one', () => {
    expect(reuseOf([])).toEqual({})
  })
})

describe('both are total and deterministic', () => {
  it.each(SEEDS.slice(0, 50))('same input, same output (seed %i)', (seed) => {
    const r = rng(seed)
    const l = new Latency()
    l.record('live', 1 + Math.floor(r() * 50))
    expect(hopsOf(l)).toEqual(hopsOf(l))
    const s = [{ host: 'a', ms: 10 }, { host: 'a', ms: 5 }]
    expect(reuseOf(s)).toEqual(reuseOf(s))
  })

  it('hostile samples do not throw', () => {
    expect(() => reuseOf([
      { host: '', ms: 0 },
      { host: 'a', ms: -1 },
      { host: 'a', ms: Number.NaN },
    ])).not.toThrow()
  })
})
