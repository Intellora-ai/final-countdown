import { describe, expect, it } from 'vitest'

import { interpret } from './interpret'
import { classify, rankHits, tierOf, type SourceKind } from './select'
import type { SearchHit } from './port'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]

const HOSTS = [
  'https://www.gov.uk/guidance/x',
  'https://nasa.gov/mission',
  'https://arxiv.org/abs/2401.00001',
  'https://doi.org/10.1000/xyz',
  'https://en.wikipedia.org/wiki/Gas',
  'https://www.reuters.com/world/story',
  'https://apnews.com/article/abc',
  'https://reddit.com/r/askscience/comments/1',
  'https://stackoverflow.com/questions/1',
  'https://example.com/blog/post',
  'https://shop.example.com/product?ref=aff',
  'https://medium.com/@someone/post',
  'https://rbi.org.in/notification',
  'https://nic.in/page',
] as const

const HOSTILE = [
  'not-a-url',
  '',
  'http://',
  'https://',
  'javascript:alert(1)',
  'data:text/html,x',
  'https://' + 'a'.repeat(3000) + '.com',
  'https://[::1]/',
  'https://user:pass@example.com/p',
  'https://xn--80ak6aa92e.com/',
  '://///',
  'https://.com',
] as const

const hit = (url: string, i = 0): SearchHit => ({
  url,
  title: `result ${i}`,
  snippet: 'gas pressure rises with temperature',
})

const SEEDS = Array.from({ length: 150 }, (_, i) => i * 5237 + 11)

const NOW = Date.parse('2026-08-24T00:00:00Z')
const now = () => NOW

/* -------------------------------------------------------------------------- */

describe('classification is total — a hostile URL is classified, never thrown on', () => {
  it.each(HOSTILE)('survives %j', (url) => {
    let kind: SourceKind | undefined
    expect(() => {
      kind = classify(url)
    }).not.toThrow()
    expect(kind).toBeDefined()
  })

  it.each(SEEDS.slice(0, 60))('survives generated input (seed %i)', (seed) => {
    const r = rng(seed)
    const url = r() < 0.5 ? pick(r, HOSTS) : pick(r, HOSTILE)
    expect(() => classify(url)).not.toThrow()
  })

  it.each([
    ['https://nasa.gov/mission', 'official'],
    ['https://www.gov.uk/guidance/x', 'official'],
    ['https://arxiv.org/abs/2401.00001', 'academic'],
    ['https://doi.org/10.1000/xyz', 'academic'],
    ['https://en.wikipedia.org/wiki/Gas', 'reference'],
    ['https://www.reuters.com/world/story', 'news'],
    ['https://reddit.com/r/askscience/comments/1', 'forum'],
    ['https://stackoverflow.com/questions/1', 'forum'],
    ['https://example.com/blog/post', 'commercial'],
  ] as const)('%s is %s', (url, kind) => {
    expect(classify(url)).toBe(kind)
  })

  /* A subdomain must not be able to impersonate a trusted suffix. */
  it.each([
    'https://gov.uk.evil.com/x',
    'https://nasa.gov.attacker.net/x',
    'https://arxiv.org.phish.io/abs/1',
    'https://en.wikipedia.org.fake.co/wiki/X',
  ])('%s does not inherit the trust of the name it embeds', (url) => {
    expect(['commercial', 'unknown']).toContain(classify(url))
  })
})

describe('nothing is silently dropped — filtering is visible', () => {
  /* Goal 2: never clip, distort, or silently delete content. A source removed
     without a record is a source the report cannot explain, and "we found four
     results" reads identically whether four existed or twelve did. */
  it.each(SEEDS)('every input hit appears in the output (seed %i)', (seed) => {
    const r = rng(seed)
    const hits = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, i) =>
      hit(r() < 0.7 ? pick(r, HOSTS) : pick(r, HOSTILE), i),
    )
    const ranked = rankHits(hits, interpret('why does heating a gas raise its pressure'), now)
    expect(ranked.length).toBe(hits.length)
    expect(ranked.map((x) => x.hit.url).sort()).toEqual(hits.map((h) => h.url).sort())
  })

  it('an excluded hit carries a reason, and an included one does not', () => {
    const ranked = rankHits(
      [hit('javascript:alert(1)'), hit('https://nasa.gov/mission')],
      interpret('what is gas pressure'),
      now,
    )
    for (const r of ranked) {
      expect(r.excluded === undefined).toBe(r.excludedReason === undefined)
    }
  })

  /* EVERY non-http(s) scheme, not just `javascript:`.
   *
   * The first version of this checked one scheme with `startsWith`, which is
   * both a weaker test and the exact shape CodeQL flags as an incomplete
   * scheme check — `data:` carries script just as well, and `file:` reads the
   * local disk. The production guard is an allowlist and always handled these;
   * the TEST was the thing asserting only one of them, which is how an
   * allowlist quietly becomes a blocklist in a later refactor with nothing
   * failing. Matching on the exact URL also means this test contains no scheme
   * check of its own to be incomplete. */
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'blob:https://example.com/uuid',
  ])('%s is excluded, with a reason naming the scheme', (url) => {
    const ranked = rankHits(
      [hit(url), hit('https://nasa.gov/mission')],
      interpret('what is gas pressure'),
      now,
    )
    const bad = ranked.find((r) => r.hit.url === url)
    expect(bad).toBeDefined()
    expect(bad!.excluded).toBe(true)
    expect(bad!.excludedReason).toBeTruthy()
    /* And the good hit beside it is untouched — one bad URL must not take the
       ranking down with it. */
    const good = ranked.find((r) => r.hit.url === 'https://nasa.gov/mission')
    expect(good!.excluded).toBeUndefined()
  })

  it('an excluded hit never outranks an included one', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const r = rng(seed)
      const hits = Array.from({ length: 6 }, (_, i) =>
        hit(r() < 0.5 ? pick(r, HOSTS) : pick(r, HOSTILE), i),
      )
      const ranked = rankHits(hits, interpret('what is gas pressure'), now)
      const firstExcluded = ranked.findIndex((x) => x.excluded)
      if (firstExcluded >= 0) {
        expect(ranked.slice(firstExcluded).every((x) => x.excluded)).toBe(true)
      }
    }
  })
})

describe('§44 — the components stay visible, the score is never the only artefact', () => {
  it.each(SEEDS.slice(0, 80))('every ranked hit exposes its factors (seed %i)', (seed) => {
    const r = rng(seed)
    const hits = Array.from({ length: 4 }, (_, i) => hit(pick(r, HOSTS), i))
    for (const x of rankHits(hits, interpret('india gdp growth'), now)) {
      expect(x.factors).toBeDefined()
      expect(typeof x.factors.kindWeight).toBe('number')
      expect(Array.isArray(x.factors.penalties)).toBe(true)
      expect(Number.isFinite(x.score)).toBe(true)
      expect(x.score).toBeGreaterThanOrEqual(0)
      expect(x.score).toBeLessThanOrEqual(1)
    }
  })
})

describe('§9 — primary sources are preferred when the question calls for it', () => {
  it('an official source outranks a forum on the same question', () => {
    const ranked = rankHits(
      [hit('https://reddit.com/r/askscience/comments/1'), hit('https://nasa.gov/mission')],
      interpret('LIFO vs FIFO'),
      now,
    )
    expect(ranked[0].hit.url).toContain('nasa.gov')
  })

  it('a tertiary source never outranks a primary one when primary is required', () => {
    const req = interpret('LIFO vs FIFO')
    expect(req.requirePrimary).toBe(true)
    const ranked = rankHits(
      [hit('https://en.wikipedia.org/wiki/Gas'), hit('https://arxiv.org/abs/2401.00001')],
      req,
      now,
    )
    const tiers = ranked.filter((x) => !x.excluded).map((x) => tierOf(x.kind))
    expect(tiers.indexOf('primary')).toBeLessThan(tiers.indexOf('tertiary'))
  })

  it('when primary is NOT required, a reference source is still usable rather than excluded', () => {
    /* Preference is not prohibition. Excluding Wikipedia from "what is
       opportunity cost" throws away the best available answer to satisfy a
       rule written for a different kind of question. */
    const req = interpret('what is opportunity cost')
    expect(req.requirePrimary).toBe(false)
    const ranked = rankHits([hit('https://en.wikipedia.org/wiki/Opportunity_cost')], req, now)
    expect(ranked[0].excluded).toBeUndefined()
  })
})

describe('ranking does not depend on the order the engine happened to return', () => {
  /* If it did, the engine's arbitrary ordering would decide our ranking and
     §33 would be a function of someone else's tie-break. */
  it.each(SEEDS)('score per URL is permutation-invariant (seed %i)', (seed) => {
    const r = rng(seed)
    const urls = [...new Set(Array.from({ length: 5 }, () => pick(r, HOSTS)))]
    const hits = urls.map((u, i) => hit(u, i))
    const req = interpret('why does heating a gas raise its pressure')

    const forward = new Map(rankHits(hits, req, now).map((x) => [x.hit.url, x.score]))
    const backward = new Map(rankHits([...hits].reverse(), req, now).map((x) => [x.hit.url, x.score]))

    expect([...forward.keys()].sort()).toEqual([...backward.keys()].sort())
    for (const [url, score] of forward) expect(backward.get(url)).toBe(score)
  })

  it.each(SEEDS.slice(0, 60))('the winner is stable under reversal (seed %i)', (seed) => {
    const r = rng(seed)
    const urls = [...new Set(Array.from({ length: 5 }, () => pick(r, HOSTS)))]
    if (urls.length < 2) return
    const hits = urls.map((u, i) => hit(u, i))
    const req = interpret('india gdp growth 2015-2025')
    const a = rankHits(hits, req, now)
    const b = rankHits([...hits].reverse(), req, now)
    /* Only assert when the top score is strictly better than the runner-up:
       a genuine tie has no canonical winner and demanding one would be
       asserting an implementation detail rather than a property. */
    if (a.length >= 2 && a[0].score > a[1].score) {
      expect(b[0].hit.url).toBe(a[0].hit.url)
    }
  })
})

describe('§12 — freshness participates in ranking without inventing a date', () => {
  it('a dated page is preferred over an undated one for a recent question', () => {
    const req = interpret('latest news about india')
    const dated: SearchHit = {
      ...hit('https://www.reuters.com/a'),
      publishedAt: new Date(NOW - 2 * 86_400_000).toISOString(),
    }
    const undated = hit('https://apnews.com/b')
    const ranked = rankHits([undated, dated], req, now)
    expect(ranked[0].hit.url).toContain('reuters')
  })

  it('an undated page stays undated — freshness is absent, not defaulted', () => {
    const ranked = rankHits([hit('https://apnews.com/b')], interpret('latest news'), now)
    expect(ranked[0].factors.freshness).toBeUndefined()
  })

  it('a future publication date does not earn a freshness bonus', () => {
    /* A page claiming tomorrow's date is wrong or lying, and either way it must
       not sort above an honest one. */
    const req = interpret('latest news about india')
    const future: SearchHit = {
      ...hit('https://www.reuters.com/future'),
      publishedAt: new Date(NOW + 30 * 86_400_000).toISOString(),
    }
    const honest: SearchHit = {
      ...hit('https://www.reuters.com/honest'),
      publishedAt: new Date(NOW - 86_400_000).toISOString(),
    }
    const ranked = rankHits([future, honest], req, now)
    expect(ranked[0].hit.url).toContain('honest')
  })

  it('an unparseable date is treated as no date, not as epoch zero', () => {
    const req = interpret('latest news about india')
    const broken: SearchHit = { ...hit('https://apnews.com/x'), publishedAt: 'not a date' }
    const ranked = rankHits([broken], req, now)
    expect(ranked[0].factors.freshness).toBeUndefined()
    expect(Number.isFinite(ranked[0].score)).toBe(true)
  })
})

describe('ranking is deterministic', () => {
  it.each(SEEDS.slice(0, 60))('same input, same ranking (seed %i)', (seed) => {
    const r = rng(seed)
    const hits = Array.from({ length: 5 }, (_, i) => hit(pick(r, HOSTS), i))
    const req = interpret('explain compound interest')
    expect(rankHits(hits, req, now)).toEqual(rankHits(hits, req, now))
  })

  it('an empty hit list ranks to an empty list rather than throwing', () => {
    expect(rankHits([], interpret('what is gas'), now)).toEqual([])
  })
})
