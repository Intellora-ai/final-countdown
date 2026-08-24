import { describe, expect, it } from 'vitest'

import * as accuracy from './accuracy'
import { grade, type Expectation } from './accuracy'
import type { Answer, Citation } from './answer'
import type { Finding } from './crosscheck'
import type { Claim } from './evidence'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7717 + 19)

function claim(text: string, url = 'https://rbi.org.in/a', tainted = false): Claim {
  return {
    text,
    sourceUrl: url,
    sourceKind: 'official',
    offset: 0,
    length: text.length,
    kind: 'numeric',
    aspects: ['gdp'],
    retrievedAt: '2026-08-20T00:00:00Z',
    tainted,
  }
}

const cite = (c: Claim): Citation => ({
  text: c.text,
  sourceUrl: c.sourceUrl,
  offset: c.offset,
  length: c.length,
  retrievedAt: c.retrievedAt,
})

function answerOf(claims: readonly Claim[], over: Partial<Answer> = {}): Answer {
  const finding: Finding = {
    aspect: 'gdp',
    claims,
    agreement: claims.length >= 2 ? 'corroborated' : claims.length === 1 ? 'single' : 'unsupported',
    independentSources: new Set(claims.filter((c) => !c.tainted).map((c) => c.sourceUrl)).size,
    contradictions: [],
  }
  return {
    query: 'india gdp growth',
    status: claims.length ? 'answered' : 'refused',
    ...(claims.length ? {} : { refusalReason: 'no usable evidence was retrieved' }),
    findings: [finding],
    citations: claims.filter((c) => !c.tainted).map(cite),
    unresolved: [],
    contradictions: [],
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('§24 / §44 — there is no single universal accuracy score', () => {
  /* The spec says so in those words, and the failure mode is specific: one
     number invites optimising it, and every per-type signal that disagrees
     with the composite gets tuned away. So the module must not offer one, and
     the absence is asserted rather than intended — a helper added later would
     otherwise pass every other test in this file. */
  it('the module exports no composite scorer', () => {
    const forbidden = ['overall', 'overallAccuracy', 'score', 'accuracyScore', 'compositeScore', 'total']
    for (const name of forbidden) {
      expect(accuracy).not.toHaveProperty(name)
    }
  })

  it('a grade never collapses its per-type parts into one number', () => {
    const g = grade(answerOf([claim('india gdp growth was 7.8 percent')]), {
      type: 'numeric',
      value: 7.8,
    })
    expect(g).not.toHaveProperty('score')
    expect(g).not.toHaveProperty('overall')
  })
})

describe('a grader that cannot fail a wrong answer is not a grader', () => {
  const truth: Expectation = { type: 'numeric', value: 7.8 }

  it('a right figure grades with no error', () => {
    const g = grade(answerOf([claim('india gdp growth was 7.8 percent')]), truth)
    expect(g.numeric!.absoluteError).toBe(0)
    expect(g.numeric!.relativeError).toBe(0)
  })

  it('a WRONG figure is reported as wrong, loudly', () => {
    const g = grade(answerOf([claim('india gdp growth was 2.1 percent')]), truth)
    expect(g.numeric!.absoluteError).toBeCloseTo(5.7, 10)
    expect(g.numeric!.relativeError!).toBeGreaterThan(0.5)
  })

  it.each(SEEDS)('any figure other than the truth has non-zero error (seed %i)', (seed) => {
    const r = rng(seed)
    const wrong = Math.round((r() * 100 - 50) * 100) / 100
    if (wrong === 7.8) return
    const g = grade(answerOf([claim(`india gdp growth was ${wrong} percent`)]), truth)
    expect(g.numeric!.absoluteError).toBeGreaterThan(0)
  })

  it('relative error is scale-free — the same mistake reads the same at any magnitude', () => {
    const small = grade(answerOf([claim('growth was 2.1 percent')]), { type: 'numeric', value: 7.8 })
    const large = grade(answerOf([claim('growth was 2100000 percent')]), {
      type: 'numeric',
      value: 7800000,
    })
    expect(large.numeric!.relativeError!).toBeCloseTo(small.numeric!.relativeError!, 6)
  })

  it('a true value of zero yields no relative error rather than Infinity', () => {
    /* Dividing by the truth is the obvious implementation and it produces
       Infinity or NaN exactly when the true answer is zero — a number that
       poisons every average computed downstream. Absent is the honest value. */
    const g = grade(answerOf([claim('growth was 3 percent')]), { type: 'numeric', value: 0 })
    expect(g.numeric!.relativeError).toBeUndefined()
    expect(Number.isFinite(g.numeric!.absoluteError)).toBe(true)
  })

  it('an answer stating no figure at all is not scored as perfect', () => {
    /* The dangerous default: no number found, error stays 0, and a silent
       answer grades better than a wrong one. */
    const g = grade(answerOf([claim('india gdp grew somewhat')]), truth)
    expect(g.numeric?.absoluteError).not.toBe(0)
  })
})

describe('invariant 3 — a citation that does not support its claim is a distortion', () => {
  /* The single most valuable thing this grader can catch. An answer reporting
     7.8 while citing a span that says 2.1 is worse than a wrong answer: it is a
     wrong answer wearing a real source, and it survives review. */
  it('a citation whose text lacks the reported figure is flagged', () => {
    const supporting = claim('india gdp growth was 2.1 percent')
    const answer = answerOf([supporting], {
      citations: [{ ...cite(supporting), text: 'india gdp growth was 7.8 percent' }],
    })
    const g = grade(answer, { type: 'numeric', value: 7.8 })
    expect(g.distortions.length).toBeGreaterThan(0)
  })

  it('an honest answer has no distortions', () => {
    const g = grade(answerOf([claim('india gdp growth was 7.8 percent')]), {
      type: 'numeric',
      value: 7.8,
    })
    expect(g.distortions).toEqual([])
  })

  it.each(SEEDS.slice(0, 80))('a citation with no matching claim is a distortion (seed %i)', (seed) => {
    const r = rng(seed)
    const real = claim(`india gdp growth was ${(r() * 9).toFixed(1)} percent`)
    const answer = answerOf([real], {
      citations: [{ ...cite(real), offset: real.offset + 999 }],
    })
    expect(grade(answer, { type: 'numeric', value: 7.8 }).distortions.length).toBeGreaterThan(0)
  })
})

describe('a refusal is not automatically a failure, and not automatically a pass', () => {
  it('refusing a question that genuinely has no answer is CORRECT', () => {
    const g = grade(answerOf([]), { type: 'factual', unanswerable: true })
    expect(g.outcome).toBe('correct-refusal')
  })

  it('refusing a question that DOES have an answer is a miss', () => {
    const g = grade(answerOf([]), { type: 'numeric', value: 7.8 })
    expect(g.outcome).toBe('missed-answerable')
  })

  /* These two must be distinguishable, or a system that refuses everything
     scores perfectly on the unanswerable half and invisibly on the rest. */
  it('the two refusal outcomes are different values', () => {
    const correct = grade(answerOf([]), { type: 'factual', unanswerable: true })
    const missed = grade(answerOf([]), { type: 'numeric', value: 7.8 })
    expect(correct.outcome).not.toBe(missed.outcome)
  })

  it('ANSWERING a question that has no answer is wrong, not merely unhelpful', () => {
    const g = grade(answerOf([claim('india gdp growth was 7.8 percent')]), {
      type: 'factual',
      unanswerable: true,
    })
    expect(g.outcome).toBe('answered-unanswerable')
  })
})

describe('§24 list answers — precision, recall and coverage, separately', () => {
  const expectation: Expectation = { type: 'list', facts: ['delhi', 'mumbai', 'chennai'] }

  const listAnswer = (texts: readonly string[]) =>
    answerOf(texts.map((t, i) => claim(t, `https://s${i}.example.com/p`)))

  it('a perfect list scores 1 on all three', () => {
    const g = grade(listAnswer(['delhi is a city', 'mumbai is a city', 'chennai is a city']), expectation)
    expect(g.list!.precision).toBe(1)
    expect(g.list!.recall).toBe(1)
    expect(g.list!.coverage).toBe(1)
  })

  /* THE GAMING TEST. Citing everything must not win. If precision does not
     fall as junk is added, the cheapest way to score well is to cite the whole
     internet, and the metric is measuring effort rather than correctness. */
  it('precision falls as unsupported items are added', () => {
    const clean = grade(listAnswer(['delhi is a city', 'mumbai is a city', 'chennai is a city']), expectation)
    const padded = grade(
      listAnswer([
        'delhi is a city',
        'mumbai is a city',
        'chennai is a city',
        'atlantis is a city',
        'gotham is a city',
        'narnia is a city',
      ]),
      expectation,
    )
    expect(padded.list!.precision!).toBeLessThan(clean.list!.precision!)
  })

  it('recall falls as expected items are omitted', () => {
    const full = grade(listAnswer(['delhi is a city', 'mumbai is a city', 'chennai is a city']), expectation)
    const partial = grade(listAnswer(['delhi is a city']), expectation)
    expect(partial.list!.recall!).toBeLessThan(full.list!.recall!)
  })

  it('an empty expectation gives no ratios rather than 0/0', () => {
    const g = grade(listAnswer(['delhi is a city']), { type: 'list', facts: [] })
    expect(g.list!.recall).toBeUndefined()
  })
})

describe('§24 comparative answers — the RELATIONSHIP is what is graded', () => {
  it('getting the direction right scores, getting it backwards does not', () => {
    const right = grade(
      answerOf([claim('lifo gives higher cost of goods sold than fifo when prices rise')]),
      { type: 'comparative', relationships: [{ subject: 'lifo', relation: 'higher', object: 'fifo' }] },
    )
    const backwards = grade(
      answerOf([claim('fifo gives higher cost of goods sold than lifo when prices rise')]),
      { type: 'comparative', relationships: [{ subject: 'lifo', relation: 'higher', object: 'fifo' }] },
    )
    expect(right.comparative!.correct).toBe(1)
    expect(backwards.comparative!.correct).toBe(0)
  })
})

describe('§24 summaries — supported, omitted and distorted are three numbers', () => {
  it('omission and distortion are reported separately, because they are different failures', () => {
    const g = grade(answerOf([claim('india gdp growth was 7.8 percent')]), {
      type: 'summary',
      facts: ['india gdp growth was 7.8 percent', 'inflation was 5 percent'],
    })
    expect(g.summary!.omissionRate).toBeGreaterThan(0)
    expect(g.summary!.distortionRate).toBeDefined()
    expect(g.summary!.omissionRate).not.toBe(g.summary!.distortionRate)
  })
})

describe('invariant 5 — a fact known only from a tainted source is not supported', () => {
  it('a correct figure carried only by a flagged page does not grade as supported', () => {
    const answer = answerOf([claim('india gdp growth was 7.8 percent', 'https://evil.example.com/x', true)])
    const g = grade(answer, { type: 'numeric', value: 7.8 })
    expect(g.outcome).not.toBe('graded')
  })
})

describe('grading is total and deterministic', () => {
  it.each(SEEDS)('hostile input produces a grade, never an exception (seed %i)', (seed) => {
    const r = rng(seed)
    const text = ['', '   ', 'x'.repeat(5000), '7.8', 'NaN percent', '∞'][Math.floor(r() * 6)]
    expect(() => grade(answerOf([claim(text)]), { type: 'numeric', value: 7.8 })).not.toThrow()
  })

  it.each(SEEDS.slice(0, 60))('same answer, same grade (seed %i)', (seed) => {
    const r = rng(seed)
    const a = answerOf([claim(`india gdp growth was ${(r() * 9).toFixed(1)} percent`)])
    const e: Expectation = { type: 'numeric', value: 7.8 }
    expect(grade(a, e)).toEqual(grade(a, e))
  })
})
