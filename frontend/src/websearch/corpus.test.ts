import { describe, expect, it } from 'vitest'

import { CORPUS, runCorpus, type BenchmarkCase, type QueryCategory } from './corpus'
import { fixtureProvider } from './engine'
import type { FetchOutcome } from './fetchPage'

const served = (body: string, url: string): FetchOutcome => ({
  ok: true,
  page: {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    body,
    bytes: body.length,
    truncated: false,
    redirects: [],
    elapsedMs: 3,
    attempts: 1,
    retrievedAt: '2026-08-24T00:00:00.000Z',
  },
})

describe('the corpus itself is checked, because a broken benchmark scores nothing', () => {
  it('covers every failure category exactly once or more', () => {
    const categories: QueryCategory[] = [
      'simple-factual',
      'ambiguous',
      'current',
      'multi-hop',
      'technical',
      'numerical',
      'comparison',
      'source-sensitive',
      'contradictory-source',
      'rare',
    ]
    for (const category of categories) {
      expect(CORPUS.some((c) => c.category === category)).toBe(true)
    }
  })

  it('gives every case a unique id', () => {
    expect(new Set(CORPUS.map((c) => c.id)).size).toBe(CORPUS.length)
  })

  it('states why every case exists', () => {
    /* A case nobody can justify is a case nobody will maintain, and it will
       be deleted the first time it goes red for a reason someone dislikes. */
    for (const c of CORPUS) {
      expect(c.why.length).toBeGreaterThan(30)
    }
  })

  it('never claims more relevant documents than it names, in either direction', () => {
    for (const c of CORPUS) {
      expect(c.relevantTotal).toBeGreaterThanOrEqual(c.relevantUrls.length)
      expect(c.aspectsRequired.length).toBeGreaterThan(0)
    }
  })

  it('every case is SATISFIABLE — a page that answers it scores coverage 1', async () => {
    /* BUG, and the reason this test exists at all.
     *
     * `runCase` matches an aspect by `text.includes(aspect.replace(/-/g,' '))`.
     * Four cases named META-LABELS instead of page vocabulary — `entity`,
     * `period`, `as-of-date`, `authority`, `figure`, `disagreement`. No real
     * document contains the literal string "as of date", so those cases
     * could not reach full coverage however good the system got. Measured
     * against pages that genuinely answered each question:
     *
     *     apple-revenue        coverage = 0
     *     population-dispute   coverage = 0
     *     repo-rate-now        coverage = 0.5
     *     vaccine-efficacy     coverage = 0.5
     *
     * A benchmark case nobody can pass is worse than a missing one: it reads
     * as a permanent failure everyone learns to ignore, and it hides real
     * regressions in the same column.
     *
     * This is the INDEPENDENT check. It does not assert what the system
     * scores — it asserts the benchmark can be scored at all, by building
     * the ideal page for each case from the case's own aspect list. It fails
     * the moment someone adds an unmatchable aspect. */
    for (const c of CORPUS) {
      /* The page comes from `examplePage`, written independently as prose a
         real source would publish — NOT generated from `aspectsRequired`.
         Building it from the aspect list would make this tautological: it
         would contain every aspect by construction and could never fail.
         The first version of this test did exactly that and passed against
         the broken corpus, which is how a circular test earns its keep for
         nobody. */
      const report = await runCorpus({
        cases: [c],
        provider: fixtureProvider({
          [c.query]: c.relevantUrls.map((u) => ({ url: u, title: 't', snippet: 's' })),
        }),
        fetchImpl: async (url) => served(`<article><p>${c.examplePage}</p></article>`, url),
      })

      expect(report.cases[0].coverage, `case "${c.id}" cannot reach full coverage`).toBe(1)
    }
  })

  it('names aspects a real page would contain, not meta-labels', () => {
    /* The same defect stated as a property of the DATA rather than of a run,
       so it fails at the point someone writes the bad aspect rather than
       later when a score looks wrong. Meta-labels describe what an answer
       must DO; aspects have to be words an answer would SAY. */
    const metaLabels = ['entity', 'period', 'as-of-date', 'authority', 'figure', 'disagreement', 'source']
    for (const c of CORPUS) {
      for (const aspect of c.aspectsRequired) {
        expect(metaLabels, `case "${c.id}" uses meta-label "${aspect}"`).not.toContain(aspect)
      }
    }
  })

  it('marks exactly the questions where a cached answer would be wrong', () => {
    const timeSensitive = CORPUS.filter((c) => c.timeSensitive).map((c) => c.id)
    /* "current rbi repo rate" is the case that must bypass cache. If this
       list grows silently, something has started treating stable facts as
       perishable and every run pays for it. */
    expect(timeSensitive).toEqual(['repo-rate-now'])
  })
})

describe('running the corpus', () => {
  const oneCase: BenchmarkCase = {
    id: 'test-1',
    query: 'india gdp growth 2025',
    category: 'simple-factual',
    aspectsRequired: ['growth rate'],
    examplePage: 'The ministry reported that the growth rate was 6.1 percent.',
    relevantUrls: ['https://mospi.gov.in/gdp-2025'],
    relevantTotal: 1,
    timeSensitive: false,
    why: 'A single controlled case used to prove the runner scores what it claims to score.',
  }

  it('scores a perfect retrieval as perfect', async () => {
    const url = 'https://mospi.gov.in/gdp-2025'
    const report = await runCorpus({
      cases: [oneCase],
      provider: fixtureProvider({
        'india gdp growth 2025': [{ url, title: 'GDP', snippet: 'growth' }],
      }),
      fetchImpl: async () => served('<article><p>The growth rate was 6.1%.</p></article>', url),
    })

    const [result] = report.cases
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.coverage).toBe(1)
    expect(result.fetchFailures).toBe(0)
    expect(result.engineFailed).toBe(false)
  })

  it('scores an irrelevant retrieval as zero precision, not as a failure', async () => {
    const wrong = 'https://spam.example/seo'
    const report = await runCorpus({
      cases: [oneCase],
      provider: fixtureProvider({
        'india gdp growth 2025': [{ url: wrong, title: 'x', snippet: 'x' }],
      }),
      fetchImpl: async () => served('<p>Unrelated content.</p>', wrong),
    })

    const [result] = report.cases
    /* Retrieval worked; it just retrieved the wrong thing. Those are
       different problems and the report must not merge them. */
    expect(result.precision).toBe(0)
    expect(result.recall).toBe(0)
    expect(result.engineFailed).toBe(false)
    expect(result.fetchFailures).toBe(0)
  })

  it('counts a dead source as a fetch failure without sinking the case', async () => {
    const url = 'https://mospi.gov.in/gdp-2025'
    const report = await runCorpus({
      cases: [oneCase],
      provider: fixtureProvider({
        'india gdp growth 2025': [{ url, title: 'GDP', snippet: 'growth' }],
      }),
      fetchImpl: async () => ({
        ok: false,
        reason: 'timeout',
        detail: 'no response within 8000ms',
        elapsedMs: 8000,
        attempts: 3,
      }),
    })

    const [result] = report.cases
    expect(result.fetchFailures).toBe(1)
    /* The URL was still the right one to retrieve. Precision measures the
       engine's choice, not the host's uptime. */
    expect(result.precision).toBe(1)
    expect(result.coverage).toBe(0)
  })

  it('records that the engine broke, separately from finding nothing', async () => {
    const report = await runCorpus({
      cases: [oneCase],
      provider: {
        name: 'broken',
        search: async () => {
          throw new Error('engine down')
        },
      },
    })

    expect(report.cases[0].engineFailed).toBe(true)
    expect(report.cases[0].retrievedSources).toBe(0)
  })

  it('collapses syndicated copies when counting independent sources', async () => {
    const wire = '<article><p>The growth rate was 6.1% this year.</p></article>'
    const report = await runCorpus({
      cases: [{ ...oneCase, relevantUrls: ['https://a.example/x'], relevantTotal: 3 }],
      provider: fixtureProvider({
        'india gdp growth 2025': [
          { url: 'https://a.example/x', title: 't', snippet: 's' },
          { url: 'https://b.example/y', title: 't', snippet: 's' },
          { url: 'https://c.example/z', title: 't', snippet: 's' },
        ],
      }),
      fetchImpl: async (url) => served(wire, url),
    })

    const [result] = report.cases
    expect(result.retrievedSources).toBe(3)
    /* Three pages, one story. The gap between these two numbers is what a
       naive confidence estimate would have got wrong. */
    expect(result.independentSources).toBe(1)
  })

  it('breaks results down per category and offers no total', async () => {
    const report = await runCorpus({
      cases: [oneCase, { ...oneCase, id: 'test-2', category: 'rare' }],
      provider: fixtureProvider({}),
    })

    expect(Object.keys(report.byCategory).sort()).toEqual(['rare', 'simple-factual'])
    const loose = report as unknown as Record<string, unknown>
    expect(loose.score).toBeUndefined()
    expect(loose.total).toBeUndefined()
    expect(loose.overall).toBeUndefined()
  })

  it('records latency per stage across the run', async () => {
    const url = 'https://mospi.gov.in/gdp-2025'
    const report = await runCorpus({
      cases: [oneCase, { ...oneCase, id: 'test-2' }],
      provider: fixtureProvider({
        'india gdp growth 2025': [{ url, title: 'GDP', snippet: 'growth' }],
      }),
      fetchImpl: async () => served('<p>growth rate 6.1%</p>', url),
    })

    const stages = report.latency.summary().stages
    expect(stages.engine?.count).toBe(2)
    expect(report.latency.summary().live.count).toBeGreaterThan(0)
  })

  it('runs the real corpus end to end without throwing, even with no fixtures', async () => {
    /* Every case misses, which is the correct outcome for an empty provider —
       and the run must still complete and report, rather than fail. */
    const report = await runCorpus({ provider: fixtureProvider({}) })
    expect(report.cases).toHaveLength(CORPUS.length)
    expect(report.cases.every((c) => c.retrievedSources === 0)).toBe(true)
    expect(report.cases.every((c) => !c.engineFailed)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* The harness measures the path the product actually runs                    */
/* -------------------------------------------------------------------------- */

describe('the benchmark runs the pipeline the product runs', () => {
  it('plans several queries for one question, which a single search cannot', async () => {
    /*
     * `runCase` called `search()` from `engine.ts` while the product calls
     * `ask()` from `pipeline.ts`. So the harness measured a pipeline with no
     * planned queries, no refinement and no freshness — a benchmark standing
     * BESIDE the thing it claims to score.
     *
     * This is the same shape the reachability gate exists to catch, and it is
     * worse here: coverage and green tests both went UP as the harness was
     * improved, while the numbers it produced were about code nobody ran.
     */
    let calls = 0
    const counting = {
      name: 'counting',
      search: async () => {
        calls += 1
        return [{ url: 'https://mospi.gov.in/gdp-2025', title: 'g', snippet: '' }]
      },
    }
    const report = await runCorpus({
      provider: counting,
      fetchImpl: async (url: string) =>
        served('The ministry reported the growth rate for 2025 was 6.1 percent.', url),
      cases: [CORPUS[0] as BenchmarkCase],
    })

    expect(calls).toBeGreaterThan(1)
    expect(report.cases).toHaveLength(1)
  })

  it('records how many refinement rounds a case needed', async () => {
    const report = await runCorpus({
      provider: fixtureProvider({
        'india gdp growth 2025': [{ url: 'https://mospi.gov.in/gdp-2025', title: 'g', snippet: '' }],
      }),
      fetchImpl: async (url: string) =>
        served('The ministry reported the growth rate for 2025 was 6.1 percent.', url),
      cases: [CORPUS[0] as BenchmarkCase],
    })
    expect(typeof report.cases[0]?.rounds).toBe('number')
  })

  it('records whether the evidence was read live', async () => {
    /* §32. A benchmark that cannot tell a live read from a cached one cannot
       notice the day its own numbers stop describing the live path. */
    const report = await runCorpus({
      provider: fixtureProvider({
        'india gdp growth 2025': [{ url: 'https://mospi.gov.in/gdp-2025', title: 'g', snippet: '' }],
      }),
      fetchImpl: async (url: string) =>
        served('The ministry reported the growth rate for 2025 was 6.1 percent.', url),
      cases: [CORPUS[0] as BenchmarkCase],
    })
    expect(report.cases[0]?.freshLive).toBe(true)
  })
})
