import { describe, expect, it } from 'vitest'

import { buildAnswer, finalCheck, sufficient } from './answer'
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

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 2999 + 17)

const REQ = interpret('india gdp growth')

function claim(text: string, url: string, over: Partial<Claim> = {}): Claim {
  const lower = text.toLowerCase()
  return {
    text,
    sourceUrl: url,
    sourceKind: classify(url),
    offset: 0,
    length: text.length,
    kind: 'statement',
    aspects: REQ.aspects.filter((a) => lower.includes(a)),
    retrievedAt: '2026-08-20T00:00:00Z',
    tainted: false,
    ...over,
  }
}

const AGREE = [
  claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
  claim('india gdp growth was 7.8 percent', 'https://www.reuters.com/b'),
]

const CONFLICT = [
  claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a'),
  claim('india gdp growth was 2.1 percent', 'https://www.reuters.com/b'),
]

const answerFor = (claims: readonly Claim[], req = REQ) =>
  buildAnswer(req, crossCheck(claims, req), { engineFailed: false })

/* -------------------------------------------------------------------------- */

describe('§21 / invariant 4 — the answer is assembled, never written', () => {
  /* Every citation must be a span this system READ. If a citation can carry
     text that no claim contains, the system has generated prose and attached a
     URL to it, which is the precise shape of a fabricated answer with a real
     source attached — the most credible possible lie. */
  it.each(SEEDS)('every citation matches a claim exactly (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) =>
      claim(`india gdp growth was ${i}.0 percent`, `https://s${i}.example.com/p`),
    )
    const answer = answerFor(claims)
    const byKey = new Map(claims.map((c) => [`${c.sourceUrl}|${c.offset}|${c.text}`, c]))
    for (const cite of answer.citations) {
      expect(byKey.has(`${cite.sourceUrl}|${cite.offset}|${cite.text}`)).toBe(true)
    }
  })

  it('an answer carries no prose field for anyone to fill in later', () => {
    /* A `text: string` here is an invitation. The next change adds a model, and
       the guarantee is gone with no test failing. */
    const answer = answerFor(AGREE)
    expect(answer).not.toHaveProperty('text')
    expect(answer).not.toHaveProperty('summary')
    expect(answer).not.toHaveProperty('prose')
  })
})

describe('§17 / invariant 4 — a broken engine is refused, never answered around', () => {
  it('engine failure refuses, and says so', () => {
    const answer = buildAnswer(REQ, crossCheck([], REQ), {
      engineFailed: true,
      engineError: 'connect ETIMEDOUT',
    })
    expect(answer.status).toBe('refused')
    expect(answer.refusalReason).toContain('engine')
    expect(answer.citations).toEqual([])
  })

  it('a refusal cites nothing, because there is nothing it read', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const r = rng(seed)
      const answer = buildAnswer(REQ, crossCheck([], REQ), {
        engineFailed: true,
        engineError: `e${Math.floor(r() * 100)}`,
      })
      expect(answer.citations).toEqual([])
    }
  })

  it('§42 — a question we declined to search is refused with that reason, not with an outage', () => {
    const req = interpret('2+2')
    const answer = buildAnswer(req, crossCheck([], req), { engineFailed: false })
    expect(answer.status).toBe('refused')
    expect(answer.refusalReason).toContain('arithmetic')
  })

  it('no evidence at all is refused rather than answered emptily', () => {
    const answer = answerFor([])
    expect(answer.status).toBe('refused')
    expect(answer.citations).toEqual([])
  })
})

describe('invariant 7 — a contradiction can never produce a confident answer', () => {
  it('contradicted evidence is never status answered', () => {
    const answer = answerFor(CONFLICT)
    expect(answer.status).not.toBe('answered')
    expect(answer.contradictions.length).toBeGreaterThan(0)
  })

  it.each(SEEDS)('any contradiction downgrades the status (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) =>
      claim(`india gdp growth was ${(r() * 9).toFixed(1)} percent`, `https://s${i}.example.com/p`),
    )
    const answer = answerFor(claims)
    if (answer.contradictions.length > 0) expect(answer.status).not.toBe('answered')
  })

  it('the contradiction survives into the answer, it is not summarised away', () => {
    const answer = answerFor(CONFLICT)
    for (const c of answer.contradictions) {
      expect(c.a.sourceUrl).toBeTruthy()
      expect(c.b.sourceUrl).toBeTruthy()
    }
  })
})

describe('invariant 5 — evidence that only a flagged source supports is not an answer', () => {
  it('tainted-only support cannot reach answered', () => {
    const tainted = [
      claim('india gdp growth was 7.8 percent', 'https://evil.example.com/a', { tainted: true }),
      claim('india gdp growth was 7.8 percent', 'https://evil2.example.com/b', { tainted: true }),
    ]
    expect(answerFor(tainted).status).not.toBe('answered')
  })
})

describe('§10 — an answer meets the source requirement the question set', () => {
  it('a question needing two sources is not answered by one', () => {
    const req = interpret('LIFO vs FIFO')
    expect(req.minSources).toBe(2)
    const one = [
      {
        ...claim('lifo and fifo differ in cost flow', 'https://rbi.org.in/a'),
        aspects: req.aspects.filter((a) => 'lifo and fifo differ in cost flow'.includes(a)),
      },
    ]
    const answer = buildAnswer(req, crossCheck(one, req), { engineFailed: false })
    expect(answer.status).not.toBe('answered')
  })
})

describe('§20 — unresolved aspects are named, never quietly dropped', () => {
  it('an aspect with no support appears in unresolved', () => {
    const answer = answerFor([claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a')])
    for (const f of answer.findings) {
      if (f.claims.length === 0) expect(answer.unresolved).toContain(f.aspect)
    }
  })

  it.each(SEEDS.slice(0, 80))('answered implies nothing unresolved (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) =>
      claim(`india gdp growth was 7.8 percent`, `https://s${i}.example.com/p`),
    )
    const answer = answerFor(claims)
    if (answer.status === 'answered') expect(answer.unresolved).toEqual([])
  })

  it('partial means some coverage and some gap, and says which', () => {
    const answer = answerFor([claim('india gdp growth was 7.8 percent', 'https://rbi.org.in/a')])
    if (answer.status === 'partial') {
      expect(answer.citations.length).toBeGreaterThan(0)
      expect(answer.unresolved.length).toBeGreaterThan(0)
    }
  })
})

describe('finalCheck is a real gate — it fails a tampered answer', () => {
  /* A check that only ever passes is satisfied by `return []`. These build
     answers that VIOLATE each invariant and require the checker to catch them. */
  it('catches a citation that no claim supports', () => {
    const answer = answerFor(AGREE)
    const forged = {
      ...answer,
      citations: [
        ...answer.citations,
        {
          text: 'india gdp growth was 99 percent',
          sourceUrl: 'https://rbi.org.in/a',
          offset: 0,
          length: 30,
          retrievedAt: '2026-08-20T00:00:00Z',
        },
      ],
    }
    expect(finalCheck(forged).length).toBeGreaterThan(0)
  })

  it('catches an answered status hiding a contradiction', () => {
    const answer = answerFor(CONFLICT)
    expect(finalCheck({ ...answer, status: 'answered' }).length).toBeGreaterThan(0)
  })

  it('catches an answered status with unresolved aspects', () => {
    const answer = answerFor(AGREE)
    expect(finalCheck({ ...answer, status: 'answered', unresolved: ['gdp'] }).length).toBeGreaterThan(0)
  })

  it('catches a refusal that still cites sources', () => {
    const answer = answerFor(AGREE)
    expect(
      finalCheck({ ...answer, status: 'refused', refusalReason: 'x' }).length,
    ).toBeGreaterThan(0)
  })

  it('catches a refusal with no reason given', () => {
    const answer = answerFor([])
    expect(finalCheck({ ...answer, refusalReason: undefined }).length).toBeGreaterThan(0)
  })

  it.each(SEEDS)('a genuinely built answer passes its own check (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: Math.floor(r() * 4) }, (_, i) =>
      claim(`india gdp growth was 7.8 percent`, `https://s${i}.example.com/p`),
    )
    expect(finalCheck(answerFor(claims))).toEqual([])
  })
})

describe('§43 — sufficiency is decidable, so the loop knows when to stop', () => {
  it('corroborated coverage of every aspect is sufficient', () => {
    expect(sufficient(crossCheck(AGREE, REQ), REQ)).toBe(true)
  })

  it('a gap is not sufficient', () => {
    expect(sufficient(crossCheck([], REQ), REQ)).toBe(false)
  })

  it('a contradiction is not sufficient, however much evidence there is', () => {
    /* More searching will not resolve a disagreement, but calling it sufficient
       would let the loop stop and report a confident wrong answer. */
    expect(sufficient(crossCheck(CONFLICT, REQ), REQ)).toBe(false)
  })
})

describe('building is deterministic', () => {
  it.each(SEEDS.slice(0, 60))('same findings, same answer (seed %i)', (seed) => {
    const r = rng(seed)
    const claims = Array.from({ length: 3 }, (_, i) =>
      claim(`india gdp growth was 7.8 percent`, `https://s${i}.example.com/p`),
    )
    void r
    expect(answerFor(claims)).toEqual(answerFor(claims))
  })
})
