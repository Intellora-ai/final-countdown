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
    aspectsRequired: ['growth-rate'],
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
