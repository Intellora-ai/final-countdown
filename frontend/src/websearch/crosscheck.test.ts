import { describe, expect, it } from 'vitest'

import { crossCheck } from './crosscheck'
import type { Claim } from './evidence'
import { interpret } from './interpret'
import { classify } from './select'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 3571 + 5)

const REQ = interpret('india gdp growth')

function claim(text: string, url: string, over: Partial<Claim> = {}): Claim {
  const lower = text.toLowerCase()
  return {
    text,
    sourceUrl: url,
    sourceKind: classify(url),
    offset: 0,
    length: text.length,
    kind: /\d/.test(text.replace(/\b(1[0-9]{3}|20[0-9]{2})\b/, '')) ? 'numeric' : 'statement',
    aspects: REQ.aspects.filter((a) => lower.includes(a)),
    retrievedAt: '2026-08-20T00:00:00Z',
    tainted: false,
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('§22 / invariant 7 — contradictions are surfaced, never collapsed', () => {
  it('two different figures for the same aspect is a contradiction, not a consensus', () => {
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
        claim('india gdp growth was 6.1 percent', 'https://www.reuters.com/b'),
      ],
      REQ,
    )
    const gdp = findings.find((f) => f.aspect === 'gdp')!
    expect(gdp.agreement).toBe('contradicted')
    expect(gdp.contradictions.length).toBeGreaterThan(0)
  })

  /* The dangerous shape: two sources agree and a third disagrees. Majority
     logic would report "corroborated" and drop the dissent, which is exactly
     the silent collapse invariant 7 forbids. The dissent is a fact about the
     world, not noise to be voted away. */
  it('a lone dissenter is not outvoted into silence', () => {
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
        claim('india gdp growth was 7.8 percent', 'https://www.reuters.com/b'),
        claim('india gdp growth was 2.0 percent', 'https://apnews.com/c'),
      ],
      REQ,
    )
    const gdp = findings.find((f) => f.aspect === 'gdp')!
    expect(gdp.agreement).toBe('contradicted')
    expect(gdp.contradictions.length).toBeGreaterThan(0)
    /* And the dissenting claim is still present in the finding. */
    expect(gdp.claims.some((c) => c.text.includes('2.0'))).toBe(true)
  })

  it('a contradiction always names both sides, so a reader can go and look', () => {
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
        claim('india gdp growth was 6.1 percent', 'https://www.reuters.com/b'),
      ],
      REQ,
    )
    for (const f of findings) {
      for (const c of f.contradictions) {
        expect(c.a.sourceUrl).toBeTruthy()
        expect(c.b.sourceUrl).toBeTruthy()
        expect(c.a.sourceUrl).not.toBe(c.b.sourceUrl)
        expect(c.detail).toBeTruthy()
      }
    }
  })

  it('contradictions imply the agreement field, and the two cannot disagree', () => {
    for (const seed of SEEDS) {
      const r = rng(seed)
      const claims = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) =>
        claim(
          `india gdp growth was ${(r() * 10).toFixed(1)} percent`,
          `https://site${i}.example.com/p`,
        ),
      )
      for (const f of crossCheck(claims, REQ)) {
        expect(f.contradictions.length > 0).toBe(f.agreement === 'contradicted')
      }
    }
  })

  it('the same figure written differently is not a contradiction', () => {
    /* `7.8` and `7.80` are the same number. Reporting a contradiction here
       would train a reader to ignore the field. */
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
        claim('india gdp growth was 7.80 percent', 'https://www.reuters.com/b'),
      ],
      REQ,
    )
    expect(findings.find((f) => f.aspect === 'gdp')!.agreement).not.toBe('contradicted')
  })
})

describe('§11 — corroboration requires INDEPENDENT sources', () => {
  /* Two pages from one publisher is one publisher agreeing with itself. If
     that counted, a single site could manufacture consensus with two URLs, and
     "three sources agree" would be a statement about our crawler rather than
     about the world. */
  it('two pages on the same host are one voice, not two', () => {
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://www.reuters.com/a'),
        claim('india gdp growth was 7.8 percent', 'https://www.reuters.com/b'),
      ],
      REQ,
    )
    const gdp = findings.find((f) => f.aspect === 'gdp')!
    expect(gdp.independentSources).toBe(1)
    expect(gdp.agreement).toBe('single')
  })

  it('two genuinely different publishers corroborate', () => {
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
        claim('india gdp growth was 7.8 percent', 'https://www.reuters.com/b'),
      ],
      REQ,
    )
    const gdp = findings.find((f) => f.aspect === 'gdp')!
    expect(gdp.independentSources).toBe(2)
    expect(gdp.agreement).toBe('corroborated')
  })

  it.each(SEEDS.slice(0, 80))(
    'independentSources never exceeds the number of claims (seed %i)',
    (seed) => {
      const r = rng(seed)
      const claims = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) =>
        claim('india gdp growth was 7.8 percent', `https://s${i % 2}.example.com/p${i}`),
      )
      for (const f of crossCheck(claims, REQ)) {
        expect(f.independentSources).toBeGreaterThanOrEqual(1)
        expect(f.independentSources).toBeLessThanOrEqual(f.claims.length)
      }
    },
  )
})

describe('a tainted source cannot corroborate anything', () => {
  /* Invariant 5 again. If a flagged page could be the second voice, an attacker
     who controls one page turns any single-source claim into a corroborated
     one — which is the strongest possible upgrade for the lowest possible
     effort. */
  it('a clean claim plus a tainted claim is still a single source', () => {
    const findings = crossCheck(
      [
        claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
        claim('india gdp growth was 7.8 percent', 'https://evil.example.com/b', { tainted: true }),
      ],
      REQ,
    )
    const gdp = findings.find((f) => f.aspect === 'gdp')!
    expect(gdp.agreement).toBe('single')
  })

  it('a tainted claim is still reported, because hiding it is its own failure', () => {
    const findings = crossCheck(
      [claim('india gdp growth was 7.8 percent', 'https://evil.example.com/b', { tainted: true })],
      REQ,
    )
    const gdp = findings.find((f) => f.aspect === 'gdp')!
    expect(gdp.claims.length).toBe(1)
    expect(gdp.agreement).toBe('unsupported')
  })
})

describe('nothing is lost — every claim reaches at least one finding', () => {
  it.each(SEEDS)('claims are conserved (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) =>
      claim(`india gdp growth was ${i}.0 percent`, `https://s${i}.example.com/p`),
    )
    const findings = crossCheck(claims, REQ)
    const seen = new Set(findings.flatMap((f) => f.claims))
    for (const c of claims) expect(seen.has(c)).toBe(true)
  })

  it('an aspect with no evidence is reported as unsupported rather than omitted', () => {
    /* Omission is indistinguishable from "we did not look". §21: the system
       must not invent missing evidence, and silence about a gap is the first
       step to filling it. */
    const findings = crossCheck([claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a')], REQ)
    const aspects = findings.map((f) => f.aspect)
    for (const a of REQ.aspects) expect(aspects).toContain(a)
    const missing = findings.filter((f) => f.claims.length === 0)
    for (const f of missing) expect(f.agreement).toBe('unsupported')
  })

  it('no claims at all still produces one finding per aspect', () => {
    const findings = crossCheck([], REQ)
    expect(findings.length).toBe(REQ.aspects.length)
    expect(findings.every((f) => f.agreement === 'unsupported')).toBe(true)
  })
})

describe('cross-checking is total and deterministic', () => {
  it.each(SEEDS.slice(0, 60))('same claims, same findings (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: 3 }, (_, i) =>
      claim(`india gdp growth was ${(r() * 9).toFixed(1)} percent`, `https://s${i}.example.com/p`),
    )
    expect(crossCheck(claims, REQ)).toEqual(crossCheck(claims, REQ))
  })

  it('a question we declined to search has nothing to cross-check', () => {
    expect(crossCheck([], interpret('2+2'))).toEqual([])
  })
})
