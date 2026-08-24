import { describe, expect, it } from 'vitest'

import { MAX_ORIGINS, freshnessOf, originOf } from './provenance'
import type { Retrieved } from './gather'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 6779 + 23)

const NOW = Date.parse('2026-08-24T12:00:00Z')
const now = () => NOW
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MINUTE = 60_000

function retrieved(over: Partial<Retrieved> = {}): Retrieved {
  return {
    hit: { url: 'https://rbi.org.in/a', title: 't', snippet: 's' },
    ok: true, title: 't', text: 'body', tables: [], evidence: 'body',
    suspicious: false, signals: [],
    finalUrl: 'https://rbi.org.in/a',
    truncated: false,
    retrievedAt: ago(0),
    fromCache: false,
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('§32 — the four origins stay distinguishable', () => {
  it('a page fetched now is live', () => {
    expect(originOf(retrieved({ fromCache: false }), now)).toBe('live')
  })

  it('a page served from cache is NOT live, however recent', () => {
    /* Invariant 2 in one line: a live-web answer must not be represented as
       live if the information came from cache. One second old is still cache. */
    expect(originOf(retrieved({ fromCache: true, retrievedAt: ago(1000) }), now)).toBe('recent-cache')
  })

  it('a precomputed entry is its own origin, not folded into cache', () => {
    /* §32 lists them separately because they mean different things: a cache
       entry was fetched for a real earlier question, a precomputed one was
       prepared speculatively and may never have been asked for. */
    expect(originOf(retrieved({ fromCache: true, precomputed: true }), now)).toBe('precomputed')
  })

  it.each(SEEDS)('origin is always one of the declared set (seed %i)', (seed) => {
    const r = rng(seed)
    const o = originOf(retrieved({
      fromCache: r() > 0.5,
      precomputed: r() > 0.7,
      retrievedAt: ago(Math.floor(r() * 1e9)),
    }), now)
    expect(MAX_ORIGINS).toContain(o)
  })
})

describe('invariant 2 — one stale source makes the whole answer not-live', () => {
  /* THE ROUNDING-UP TEST. Nine live sources and one cached must not be
     reported as live. A majority rule here is exactly how stale data gets
     presented as fresh: the label describes most of the evidence and is wrong
     about the rest, and the reader has no way to tell which claim came from
     which. */
  it('nine live and one cached is not live', () => {
    const pages = [
      ...Array.from({ length: 9 }, () => retrieved({ fromCache: false })),
      retrieved({ fromCache: true, retrievedAt: ago(MINUTE) }),
    ]
    const f = freshnessOf(pages, now)
    expect(f.live).toBe(false)
    expect(f.origins).toContain('recent-cache')
    expect(f.origins).toContain('live')
  })

  it('all live is live', () => {
    const f = freshnessOf(Array.from({ length: 3 }, () => retrieved({ fromCache: false })), now)
    expect(f.live).toBe(true)
    expect(f.origins).toEqual(['live'])
  })

  it.each(SEEDS)('live is true only when EVERY source is live (seed %i)', (seed) => {
    const r = rng(seed)
    const pages = Array.from({ length: 1 + Math.floor(r() * 5) }, () =>
      retrieved({ fromCache: r() > 0.5 }))
    const f = freshnessOf(pages, now)
    const everyLive = pages.every((p) => !p.fromCache)
    expect(f.live).toBe(everyLive)
  })

  it('a failed source cannot make an answer live by contributing nothing', () => {
    /* A dead fetch has no bytes and no origin. If it counted as live, a search
       where everything failed except one cached page would report live. */
    const pages = [retrieved({ ok: false, fromCache: false }), retrieved({ fromCache: true })]
    expect(freshnessOf(pages, now).live).toBe(false)
  })

  it('no usable sources at all is not live, rather than vacuously live', () => {
    /* `[].every(...)` is TRUE. Without an explicit guard, an answer built on
       nothing reports itself as freshly retrieved from the live web. */
    expect(freshnessOf([], now).live).toBe(false)
    expect(freshnessOf([retrieved({ ok: false })], now).live).toBe(false)
  })
})

describe('age is reported, never assumed', () => {
  it('a cached entry carries how old it actually is', () => {
    const f = freshnessOf([retrieved({ fromCache: true, retrievedAt: ago(5 * MINUTE) })], now)
    expect(f.oldestAgeMs).toBe(5 * MINUTE)
  })

  it('the OLDEST source sets the age, not the newest', () => {
    /* Reporting the newest would let one fresh page hide a week-old one. */
    const f = freshnessOf([
      retrieved({ fromCache: true, retrievedAt: ago(MINUTE) }),
      retrieved({ fromCache: true, retrievedAt: ago(100 * MINUTE) }),
    ], now)
    expect(f.oldestAgeMs).toBe(100 * MINUTE)
  })

  it('an unparseable timestamp yields no age rather than a wrong one', () => {
    const f = freshnessOf([retrieved({ fromCache: true, retrievedAt: 'not a date' })], now)
    expect(f.oldestAgeMs).toBeUndefined()
  })

  it('a future timestamp does not produce a negative age', () => {
    const f = freshnessOf([
      retrieved({ fromCache: true, retrievedAt: new Date(NOW + 60_000).toISOString() }),
    ], now)
    expect(f.oldestAgeMs === undefined || f.oldestAgeMs >= 0).toBe(true)
  })
})

describe('it is total and deterministic', () => {
  it.each(SEEDS)('hostile input produces a value, never an exception (seed %i)', (seed) => {
    const r = rng(seed)
    expect(() => freshnessOf([retrieved({
      retrievedAt: ['', '   ', 'x', '2026', new Date(NOW).toISOString()][Math.floor(r() * 5)],
      fromCache: r() > 0.5,
    })], now)).not.toThrow()
  })

  it.each(SEEDS.slice(0, 60))('same pages, same freshness (seed %i)', (seed) => {
    const r = rng(seed)
    const pages = [retrieved({ fromCache: r() > 0.5 })]
    expect(freshnessOf(pages, now)).toEqual(freshnessOf(pages, now))
  })

  it('origins are deduplicated and sorted, so the report is stable', () => {
    const f = freshnessOf([
      retrieved({ fromCache: true }), retrieved({ fromCache: false }),
      retrieved({ fromCache: true }), retrieved({ fromCache: false }),
    ], now)
    expect(f.origins).toEqual([...new Set(f.origins)].sort())
  })
})
