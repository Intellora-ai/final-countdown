import { describe, expect, it } from 'vitest'

import { ask } from './pipeline'
import { finalCheck } from './answer'
import { fixtureProvider, type SearchProvider } from './engine'
import { Latency } from './latency'
import type { FetchOutcome } from './fetchPage'
import type { SearchHit } from './port'

const NOW = Date.parse('2026-08-24T00:00:00Z')
const now = () => NOW

const hit = (url: string, title = 'India GDP'): SearchHit => ({
  url,
  title,
  snippet: 'india gdp growth figures',
})

/** A fetcher that serves canned HTML per URL, and fails for anything unknown. */
function fetcherFor(pages: Record<string, string>) {
  return async (url: string): Promise<FetchOutcome> => {
    const body = pages[url]
    if (body === undefined) {
      return { ok: false, reason: 'network', detail: 'no such page', elapsedMs: 1, attempts: 1 }
    }
    return {
      ok: true,
      page: {
        requestedUrl: url,
        body,
        contentType: 'text/html',
        finalUrl: url,
        status: 200,
        bytes: body.length,
        redirects: [],
        retrievedAt: '2026-08-23T00:00:00Z',
        truncated: false,
        elapsedMs: 1,
        attempts: 1,
      },
    }
  }
}

const page = (text: string) => `<html><body><p>${text}</p></body></html>`

const TWO_AGREE = {
  provider: fixtureProvider({
    'india gdp growth': [hit('https://rbi.org.in/a'), hit('https://www.reuters.com/b')],
  }),
  fetchImpl: fetcherFor({
    'https://rbi.org.in/a': page('India GDP growth was 7.8 percent in 2024.'),
    'https://www.reuters.com/b': page('India GDP growth was 7.8 percent in 2024.'),
  }),
}

/* -------------------------------------------------------------------------- */

describe('the whole §46 pipeline runs, and its output checks out', () => {
  it('a well-supported question produces citations that trace to fetched bytes', async () => {
    const result = await ask('india gdp growth', { ...TWO_AGREE, now })
    expect(result.answer.citations.length).toBeGreaterThan(0)
    for (const cite of result.answer.citations) {
      expect(['https://rbi.org.in/a', 'https://www.reuters.com/b']).toContain(cite.sourceUrl)
    }
  })

  it('the answer passes its own final check, always', async () => {
    for (const query of ['india gdp growth', 'what is opportunity cost', '2+2', '']) {
      const result = await ask(query, { ...TWO_AGREE, now })
      expect(finalCheck(result.answer)).toEqual([])
      expect(result.violations).toEqual([])
    }
  })

  it('every stage of the pipeline is reported, so a bad answer can be traced to where it went wrong', async () => {
    const result = await ask('india gdp growth', { ...TWO_AGREE, now })
    expect(result.requirements.shouldSearch).toBe(true)
    expect(result.plan.queries.length).toBeGreaterThan(0)
    expect(result.ranked.length).toBeGreaterThan(0)
    expect(result.retrieved.length).toBeGreaterThan(0)
    expect(result.claims.length).toBeGreaterThan(0)
    expect(result.findings.length).toBeGreaterThan(0)
  })
})

describe('§42 — a question we declined to search costs nothing', () => {
  it('the provider is never called for arithmetic', async () => {
    let called = 0
    const counting: SearchProvider = {
      name: 'counting',
      search: async () => {
        called += 1
        return []
      },
    }
    const result = await ask('2+2', { provider: counting, fetchImpl: fetcherFor({}), now })
    expect(called).toBe(0)
    expect(result.answer.status).toBe('refused')
    expect(result.answer.refusalReason).toContain('arithmetic')
  })

  it('an empty query is refused without a request', async () => {
    let called = 0
    const counting: SearchProvider = {
      name: 'counting',
      search: async () => {
        called += 1
        return []
      },
    }
    await ask('   ', { provider: counting, fetchImpl: fetcherFor({}), now })
    expect(called).toBe(0)
  })
})

describe('§17 — a broken engine is an outage, not an empty world', () => {
  it('a throwing provider refuses with the engine reason and cites nothing', async () => {
    const broken: SearchProvider = {
      name: 'broken',
      search: async () => {
        throw new Error('connect ETIMEDOUT')
      },
    }
    const result = await ask('india gdp growth', { provider: broken, fetchImpl: fetcherFor({}), now })
    expect(result.answer.status).toBe('refused')
    expect(result.answer.refusalReason).toContain('engine')
    expect(result.answer.citations).toEqual([])
    expect(finalCheck(result.answer)).toEqual([])
  })

  it('an engine that legitimately finds nothing is refused for a DIFFERENT reason', async () => {
    const empty = fixtureProvider({})
    const result = await ask('india gdp growth', { provider: empty, fetchImpl: fetcherFor({}), now })
    expect(result.answer.status).toBe('refused')
    expect(result.answer.refusalReason).not.toContain('engine')
  })
})

describe('failure is per source, all the way to the answer', () => {
  it('one dead host does not lose the other source', async () => {
    const result = await ask('india gdp growth', {
      provider: fixtureProvider({
        'india gdp growth': [hit('https://rbi.org.in/a'), hit('https://dead.example.com/x')],
      }),
      fetchImpl: fetcherFor({
        'https://rbi.org.in/a': page('India GDP growth was 7.8 percent in 2024.'),
      }),
      now,
    })
    expect(result.claims.length).toBeGreaterThan(0)
    expect(result.retrieved.some((r) => !r.ok)).toBe(true)
  })
})

describe('invariant 7 — disagreement reaches the caller intact', () => {
  it('two sources with different figures produce a contradicted, non-answered result', async () => {
    const result = await ask('india gdp growth', {
      provider: fixtureProvider({
        'india gdp growth': [hit('https://rbi.org.in/a'), hit('https://www.reuters.com/b')],
      }),
      fetchImpl: fetcherFor({
        'https://rbi.org.in/a': page('India GDP growth was 7.8 percent in 2024.'),
        'https://www.reuters.com/b': page('India GDP growth was 2.1 percent in 2024.'),
      }),
      now,
    })
    expect(result.answer.contradictions.length).toBeGreaterThan(0)
    expect(result.answer.status).not.toBe('answered')
    expect(finalCheck(result.answer)).toEqual([])
  })
})

describe('§43 — the refinement loop terminates', () => {
  it('a question that can never be satisfied still returns', async () => {
    const result = await ask('india gdp growth', {
      provider: fixtureProvider({
        'india gdp growth': [hit('https://rbi.org.in/a')],
      }),
      fetchImpl: fetcherFor({
        'https://rbi.org.in/a': page('This page is about something else entirely.'),
      }),
      now,
    })
    expect(result.rounds).toBeLessThanOrEqual(4)
    expect(result.answer.status).toBe('refused')
  })

  it('a satisfied question stops immediately rather than refining for its own sake', async () => {
    const result = await ask('india gdp growth', { ...TWO_AGREE, now })
    expect(result.rounds).toBe(0)
  })
})

describe('§38 — the run is measured', () => {
  it('latency is recorded when a recorder is supplied', async () => {
    const latency = new Latency()
    await ask('india gdp growth', { ...TWO_AGREE, latency, now })
    const summary = latency.summary()
    expect(summary.live.count).toBeGreaterThan(0)
  })
})

describe('the pipeline is deterministic', () => {
  it('the same question against the same fixtures gives the same answer', async () => {
    const a = await ask('india gdp growth', { ...TWO_AGREE, now })
    const b = await ask('india gdp growth', { ...TWO_AGREE, now })
    expect(a.answer).toEqual(b.answer)
  })
})
