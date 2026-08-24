import { describe, expect, it } from 'vitest'

import type { Turn, Understanding } from '../kernel/contracts'
import { NO_CONTEXT, type RouteContext } from '../kernel/router'
import { signals, understand } from '../understand/understand'
import {
  authorityOf,
  decideSource,
  disagree,
  freshness,
  queries,
  rank,
  research,
  synthesize,
  type SearchHit,
  type SearchPort,
} from './knowledge'

const NOW = '2026-08-24T00:00:00.000Z'

function read(text: string): { u: Understanding; ctx: RouteContext } {
  const turn: Turn = { parts: [{ modality: 'text', content: text }], at: NOW }
  return { u: understand(turn), ctx: { ...NO_CONTEXT, ...signals(turn) } }
}

function hit(over: Partial<SearchHit> & { url: string }): SearchHit {
  return { title: 'Inflation in India', snippet: 'India inflation was 6.2 percent', ...over }
}

describe('source selection: the model does not answer from weights by default', () => {
  it('answers a settled question from what it knows', () => {
    const { u, ctx } = read('What is photosynthesis?')
    expect(decideSource(u, ctx).routes).toEqual(['know'])
  })

  it('searches when the answer moves with the world', () => {
    const { u, ctx } = read('What is the latest RBI repo rate?')
    expect(decideSource(u, ctx).routes).toContain('search')
  })

  it('computes rather than recalls a number', () => {
    const { u, ctx } = read('Calculate 17.5% of 2400')
    expect(decideSource(u, ctx).routes).toContain('calculate')
  })

  it('reads the attachment rather than answering about it from memory', () => {
    const turn: Turn = {
      parts: [
        { modality: 'text', content: 'Summarise this' },
        { modality: 'document', content: 'x', name: 'a.pdf' },
      ],
      at: NOW,
    }
    const u = understand(turn)
    expect(decideSource(u, { ...NO_CONTEXT, ...signals(turn) }).routes).toContain('retrieve')
  })

  it('goes to memory for a question about earlier', () => {
    const { u, ctx } = read('What were we doing yesterday?')
    expect(decideSource(u, ctx).routes).toContain('remember')
  })

  it('ASKS, and does nothing else, when the referent is unknown', () => {
    /* Searching for an unresolved "it" returns a well-sourced answer about the
       wrong thing, which is harder to catch than no answer at all. */
    const { u, ctx } = read('what is the latest one')
    const d = decideSource(u, ctx)
    expect(d.routes).toEqual(['ask'])
  })

  it('records why every route was chosen', () => {
    const { u, ctx } = read('Search the latest inflation data')
    const d = decideSource(u, ctx)
    for (const r of d.routes) expect(d.because[r]?.length ?? 0).toBeGreaterThan(10)
  })

  it('combines search with know for an explanation of current facts', () => {
    const { u, ctx } = read('Explain why the latest inflation figure rose')
    const routes = decideSource(u, ctx).routes
    expect(routes).toContain('search')
    expect(routes).toContain('know')
  })
})

describe('query generation', () => {
  it('produces several genuinely different angles, not rewordings', () => {
    const { u } = read('What is the latest RBI repo rate?')
    const qs = queries(u, NOW)
    expect(qs.length).toBeGreaterThan(1)
    expect(new Set(qs).size).toBe(qs.length)
  })

  it('adds the current year for a time-sensitive question', () => {
    const { u } = read('What is the latest JEE syllabus?')
    expect(queries(u, NOW).join(' ')).toContain('2026')
  })

  it('does not add a year to a settled question', () => {
    const { u } = read('What is photosynthesis?')
    expect(queries(u, NOW).join(' ')).not.toContain('2026')
  })

  it('returns nothing rather than a junk query when there is no subject', () => {
    const { u } = read('the and of')
    expect(queries(u, NOW)).toEqual([])
  })
})

describe('authority is judged by kind of institution, not by brand', () => {
  it.each([
    ['https://rbi.org.in/rates', 0.8],
    ['https://data.gov.in/x', 0.9],
    ['https://mit.edu/paper', 0.8],
    ['https://someone.blogspot.com/post', 0.3],
  ])('%s scores about %s', (url, atLeast) => {
    const w = authorityOf(url).weight
    if (atLeast > 0.5) expect(w).toBeGreaterThanOrEqual(atLeast - 0.05)
    else expect(w).toBeLessThanOrEqual(atLeast)
  })

  it('always explains the classification', () => {
    expect(authorityOf('https://x.gov/a').why).toContain('government')
  })
})

describe('freshness', () => {
  it('is ignored entirely for a timeless question', () => {
    /* A 2015 page on the Krebs cycle is not stale, and downranking it for a
       2026 blog post makes the answer worse. */
    const old = hit({ url: 'https://x.edu/a', publishedAt: '2015-01-01T00:00:00Z' })
    expect(freshness(old, NOW, false)).toBe(1)
  })

  it('decays with age for a time-sensitive question', () => {
    const recent = hit({ url: 'https://x.gov/a', publishedAt: '2026-08-01T00:00:00Z' })
    const old = hit({ url: 'https://x.gov/b', publishedAt: '2020-01-01T00:00:00Z' })
    expect(freshness(recent, NOW, true)).toBeGreaterThan(freshness(old, NOW, true))
  })

  it('treats an UNDATED page as neither fresh nor stale', () => {
    /* Missing metadata is not evidence of recency. Defaulting it to fresh is
       how an undated page outranks a dated one on a date question. */
    const undated = freshness(hit({ url: 'https://x.gov/a' }), NOW, true)
    const fresh = freshness(hit({ url: 'https://x.gov/b', publishedAt: NOW }), NOW, true)
    const stale = freshness(hit({ url: 'https://x.gov/c', publishedAt: '2010-01-01T00:00:00Z' }), NOW, true)
    expect(undated).toBeLessThan(fresh)
    expect(undated).toBeGreaterThan(stale)
  })
})

describe('ranking', () => {
  it('does not let an authoritative but off-topic page win', () => {
    /* A weighted SUM would let authority carry an irrelevant page to the top.
       Relevance has to gate the other terms. */
    const { u } = read('What is the RBI repo rate?')
    const ranked = rank(
      [
        hit({ url: 'https://nasa.gov/mars', title: 'Mars rover', snippet: 'The rover landed on Mars' }),
        hit({ url: 'https://blog.example.com/rbi', title: 'RBI repo rate', snippet: 'The RBI repo rate is 6.5 percent' }),
      ],
      u,
      NOW,
      true,
    )
    expect(ranked[0]?.url).toContain('blog.example.com')
  })

  it('prefers the authoritative source when relevance is equal', () => {
    const { u } = read('What is the RBI repo rate?')
    const ranked = rank(
      [
        hit({ url: 'https://someone.blogspot.com/a', title: 'RBI repo rate', snippet: 'The RBI repo rate is 6.5 percent' }),
        hit({ url: 'https://rbi.org.in/a', title: 'RBI repo rate', snippet: 'The RBI repo rate is 6.5 percent' }),
      ],
      u,
      NOW,
      false,
    )
    expect(ranked[0]?.url).toContain('rbi.org.in')
  })

  it('drops results with no relevance at all', () => {
    const { u } = read('What is the RBI repo rate?')
    expect(rank([hit({ url: 'https://x.com/a', title: 'Cake', snippet: 'Bake for 40 minutes' })], u, NOW, false)).toEqual([])
  })
})

describe('conflicting sources', () => {
  it('detects two different values for the same quantity', () => {
    expect(disagree('India inflation was 6.2 percent', 'India inflation was 4.9 percent')).toBeTruthy()
  })

  it('does not call rounding a conflict', () => {
    expect(disagree('inflation was 6.20 percent', 'inflation was 6.21 percent')).toBeNull()
  })

  it('does not compare different units', () => {
    /* "7 percent" and "7 million" are not the same quantity. */
    expect(disagree('growth was 7 percent', 'population grew by 7 million')).toBeNull()
  })

  it.each([
    ['inflation was 6.2%', 'inflation was 4.9 percent'],
    ['inflation was 6.2 per cent', 'inflation was 4.9%'],
    ['inflation was 6.2 percent', 'inflation was 4.9 per cent'],
    ['inflation was 6.2 PERCENT', 'inflation was 4.9 Per Cent'],
  ])('treats every spelling of percent as the same unit: %s vs %s', (a, b) => {
    /* UNIT NORMALISATION MUST BE TOTAL.
     *
     * "%", "percent" and "per cent" are the same unit written three ways. If
     * any spelling normalises to a different string, `disagree` compares two
     * quantities it thinks are in different units and returns null --- so two
     * sources stating 6.2% and 4.9% are reported as agreeing. A conflict that
     * silently disappears is the worst outcome this module has, because the
     * caller then presents one number with full confidence.
     *
     * This is also why the normalisation is a lookup rather than chained
     * `.replace()` calls: a string-literal `.replace()` substitutes only the
     * FIRST occurrence, which CodeQL flags as js/incomplete-sanitization. The
     * regex alternation happens to yield at most one occurrence today, so the
     * old form was not a live bug --- it was a live bug waiting for the
     * alternation to change. */
    expect(disagree(a, b), `${a} vs ${b}`).toBeTruthy()
  })

  it('does not compare different subjects', () => {
    expect(disagree('India inflation was 6.2 percent', 'Brazil rainfall was 40 percent')).toBeNull()
  })

  it('PRESERVES the disagreement on the claim instead of picking a winner', () => {
    /* The laundering failure: present one number, never mention the split.
       Both sources must be attached to the SAME claim so no arrangement of the
       output shows one without the other. */
    const { u } = read('What is India inflation?')
    const ranked = rank(
      [
        hit({ url: 'https://rbi.org.in/a', snippet: 'India inflation was 6.2 percent' }),
        hit({ url: 'https://news.example.com/b', snippet: 'India inflation was 4.9 percent' }),
      ],
      u,
      NOW,
      false,
    )
    const claims = synthesize(ranked, NOW)
    const conflicted = claims.find((c) => c.conflict)
    expect(conflicted).toBeDefined()
    expect(conflicted?.sources).toHaveLength(2)
    expect(conflicted?.confidence).toBeLessThanOrEqual(0.4)
  })

  it('does not manufacture consensus from one site’s two pages', () => {
    /* Two pages of one domain are one source wearing two URLs. */
    const { u } = read('What is India inflation?')
    const ranked = rank(
      [
        hit({ url: 'https://news.example.com/a', snippet: 'India inflation was 6.2 percent this year' }),
        hit({ url: 'https://news.example.com/b', snippet: 'India inflation was 6.2 percent this year' }),
      ],
      u,
      NOW,
      false,
    )
    const claims = synthesize(ranked, NOW)
    expect(claims[0]?.confidence).toBeLessThan(0.75)
  })

  it('every claim carries at least one source', () => {
    const { u } = read('What is India inflation?')
    const claims = synthesize(rank([hit({ url: 'https://rbi.org.in/a' })], u, NOW, false), NOW)
    for (const c of claims) expect(c.sources.length).toBeGreaterThan(0)
  })

  it('separates when the page was published from when we fetched it', () => {
    /* Collapsing them makes every page look freshly published on fetch. */
    const { u } = read('What is India inflation?')
    const claims = synthesize(
      rank([hit({ url: 'https://rbi.org.in/a', publishedAt: '2024-01-05T00:00:00Z' })], u, NOW, false),
      NOW,
    )
    const s = claims[0]?.sources[0]
    expect(s?.publishedAt).toBe('2024-01-05T00:00:00Z')
    expect(s?.retrievedAt).toBe(NOW)
  })
})

describe('“do I have enough evidence?” is answered, not assumed', () => {
  const port = (hits: readonly SearchHit[]): SearchPort => ({ async search() { return hits } })

  it('reports insufficient when nothing was found', async () => {
    const { u } = read('What is the latest repo rate?')
    const out = await research(port([]), u, NOW, true)
    expect(out.insufficient).toBe(true)
    expect(out.why).toContain('no usable results')
  })

  it('reports insufficient on a single source', async () => {
    /* One source is not corroboration, however authoritative. */
    const { u } = read('What is India inflation?')
    const out = await research(port([hit({ url: 'https://rbi.org.in/a' })]), u, NOW, true)
    expect(out.insufficient).toBe(true)
    expect(out.why).toContain('single source')
  })

  it('reports insufficient when sources disagree', async () => {
    const { u } = read('What is India inflation?')
    const out = await research(
      port([
        hit({ url: 'https://rbi.org.in/a', snippet: 'India inflation was 6.2 percent' }),
        hit({ url: 'https://news.example.com/b', snippet: 'India inflation was 4.9 percent' }),
      ]),
      u, NOW, true,
    )
    expect(out.insufficient).toBe(true)
    expect(out.why).toContain('disagree')
  })

  it('reports sufficient when independent sources agree', async () => {
    const { u } = read('What is India inflation?')
    const out = await research(
      port([
        hit({ url: 'https://rbi.org.in/a', snippet: 'India inflation was 6.2 percent this year' }),
        hit({ url: 'https://data.gov.in/b', snippet: 'India inflation was 6.2 percent this year' }),
      ]),
      u, NOW, true,
    )
    expect(out.insufficient).toBe(false)
  })

  it('survives a search engine that throws', async () => {
    /* One failed query must not end the research, and must not be reported as
       a confident empty result either. */
    const flaky: SearchPort = {
      async search(q) {
        if (q.includes('2026')) throw new Error('rate limited')
        return [hit({ url: 'https://rbi.org.in/a' })]
      },
    }
    const { u } = read('What is the latest India inflation?')
    const out = await research(flaky, u, NOW, true)
    expect(out.claims.length).toBeGreaterThan(0)
  })

  it('runs every generated query', async () => {
    const seen: string[] = []
    const spy: SearchPort = {
      async search(q) {
        seen.push(q)
        return []
      },
    }
    const { u } = read('What is the latest India inflation?')
    const out = await research(spy, u, NOW, true)
    expect(seen).toEqual([...out.queriesRun])
    expect(seen.length).toBeGreaterThan(1)
  })
})
