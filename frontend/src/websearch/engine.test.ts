import { describe, expect, it } from 'vitest'

import { DEFAULT_RESULT_LIMIT, fixtureProvider, jsonProvider, search } from './engine'
import { Latency } from './latency'
import type { FetchOutcome } from './fetchPage'
import type { SearchHit } from './port'

const page = (body: string, url: string): FetchOutcome => ({
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
    elapsedMs: 5,
    attempts: 1,
    retrievedAt: '2026-08-24T00:00:00.000Z',
  },
})

const hit = (url: string): SearchHit => ({ url, title: 't', snippet: 's' })

describe('the fixture provider, which is what makes this runnable with no key', () => {
  it('returns the hits recorded for a query', async () => {
    const provider = fixtureProvider({
      'india gdp': [hit('https://a.gov.in/1'), hit('https://b.gov.in/2')],
    })
    expect(await provider.search('india gdp')).toHaveLength(2)
  })

  it('matches a query regardless of case and surrounding space', async () => {
    const provider = fixtureProvider({ 'india gdp': [hit('https://a.gov.in/1')] })
    expect(await provider.search('  INDIA GDP ')).toHaveLength(1)
  })

  it('returns nothing for a query it has never seen, rather than inventing one', async () => {
    /* A fixture provider that guesses is worse than no provider: the
       benchmark would score the guess. */
    const provider = fixtureProvider({ 'india gdp': [hit('https://a.gov.in/1')] })
    expect(await provider.search('something else')).toEqual([])
  })

  it('names itself, so a report can say where results came from', () => {
    expect(fixtureProvider({}).name).toBe('fixture')
  })
})

describe('search composes the engine with retrieval', () => {
  it('turns a query into fetched, extracted, quarantined results', async () => {
    const url = 'https://a.gov.in/report'
    const out = await search('india gdp', {
      provider: fixtureProvider({ 'india gdp': [hit(url)] }),
      fetchImpl: async () => page('<article><p>Growth was 6.1%.</p></article>', url),
    })

    expect(out.query).toBe('india gdp')
    expect(out.results).toHaveLength(1)
    expect(out.results[0].text).toBe('Growth was 6.1%.')
    expect(out.results[0].evidence).toContain('UNTRUSTED')
  })

  it('returns an empty result set for a query the engine cannot answer', async () => {
    const out = await search('unknown', { provider: fixtureProvider({}) })
    expect(out.results).toEqual([])
    /* Distinguishable from "the engine broke" — see the next test. */
    expect(out.engineFailed).toBe(false)
  })

  it('survives an engine that throws, and says the engine was the problem', async () => {
    const broken = {
      name: 'broken',
      search: async () => {
        throw new Error('provider exploded')
      },
    }
    const out = await search('anything', { provider: broken })

    expect(out.results).toEqual([])
    expect(out.engineFailed).toBe(true)
    expect(out.engineError).toContain('provider exploded')
  })

  it('caps how many hits it will fetch', async () => {
    const hits = Array.from({ length: 20 }, (_, i) => hit(`https://s${i}.gov.in/`))
    let fetched = 0
    const out = await search('many', {
      provider: fixtureProvider({ many: hits }),
      maxResults: 5,
      fetchImpl: async (url) => {
        fetched += 1
        return page('<p>x</p>', url)
      },
    })

    expect(fetched).toBe(5)
    expect(out.results).toHaveLength(5)
  })

  it('records interpret, retrieve and extract as separate stages', async () => {
    const latency = new Latency()
    await search('india gdp', {
      provider: fixtureProvider({ 'india gdp': [hit('https://a.gov.in/1')] }),
      fetchImpl: async (url) => page('<p>x</p>', url),
      latency,
    })

    const stages = latency.summary().stages
    expect(stages.engine?.count).toBe(1)
    expect(stages.extract?.count).toBe(1)
  })

  it('passes the freshness requirement through to retrieval', async () => {
    /* A time-sensitive question must not be answered from cache. This asserts
       the flag actually reaches `gather`, which is where it takes effect. */
    const url = 'https://a.gov.in/1'
    let fetches = 0
    const opts = {
      provider: fixtureProvider({ now: [hit(url)] }),
      fetchImpl: async () => {
        fetches += 1
        return page('<p>x</p>', url)
      },
      cache: new (await import('./gather')).MemoryCache(),
    }

    await search('now', opts)
    await search('now', { ...opts, requireFresh: true })
    expect(fetches).toBe(2)
  })
})

describe('the engine asks for exactly what the search will use', () => {
  it('shares one constant, so the provider cannot fetch results nobody reads', async () => {
    /* BUG. `jsonProvider` defaulted to limit 10 while `search` defaulted to
       maxResults 8. Two results paid for and discarded on every call to a
       metered API — invisible, because no test read both numbers. */
    let requested = ''
    const provider = jsonProvider({
      name: 'e',
      endpoint: 'https://api.example/s?q={query}&n={limit}',
      map: () => [],
      fetchJson: async (url) => {
        requested = url
        return {}
      },
    })

    await provider.search('q')
    expect(requested).toContain(`n=${DEFAULT_RESULT_LIMIT}`)

    /* And `search` must not silently discard what it asked for. */
    const hits = Array.from({ length: DEFAULT_RESULT_LIMIT }, (_, i) => hit(`https://s${i}.gov.in/`))
    let fetched = 0
    await search('many', {
      provider: fixtureProvider({ many: hits }),
      fetchImpl: async (url) => {
        fetched += 1
        return page('<p>x</p>', url)
      },
    })
    expect(fetched).toBe(DEFAULT_RESULT_LIMIT)
  })
})

describe('the JSON provider, which is the shape a real engine plugs into', () => {
  it('builds the request from a template and maps the response', async () => {
    let requested = ''
    const provider = jsonProvider({
      name: 'test-engine',
      endpoint: 'https://api.example/search?q={query}&n={limit}',
      map: (body) =>
        (body as { items: { link: string; name: string; blurb: string }[] }).items.map((i) => ({
          url: i.link,
          title: i.name,
          snippet: i.blurb,
        })),
      fetchJson: async (url) => {
        requested = url
        return { items: [{ link: 'https://a.gov.in/1', name: 'T', blurb: 'S' }] }
      },
    })

    const hits = await provider.search('india gdp')
    expect(requested).toContain('q=india%20gdp')
    expect(hits[0]).toEqual({ url: 'https://a.gov.in/1', title: 'T', snippet: 'S' })
  })

  it('url-encodes the query rather than pasting it in', async () => {
    let requested = ''
    const provider = jsonProvider({
      name: 'e',
      endpoint: 'https://api.example/s?q={query}',
      map: () => [],
      fetchJson: async (url) => {
        requested = url
        return {}
      },
    })

    await provider.search('a&b=c d')
    expect(requested).toContain('q=a%26b%3Dc%20d')
    expect(requested).not.toContain('q=a&b=c')
  })

  it('drops a mapped hit whose URL is not http(s)', async () => {
    /* The engine is untrusted input too. A provider returning `javascript:`
       or `file:` must not reach the fetcher, which would refuse it anyway —
       but refusing here keeps a bad URL out of the result list entirely. */
    const provider = jsonProvider({
      name: 'e',
      endpoint: 'https://api.example/s?q={query}',
      map: () => [
        { url: 'javascript:alert(1)', title: 'x', snippet: '' },
        { url: 'file:///etc/passwd', title: 'x', snippet: '' },
        { url: 'https://ok.gov.in/1', title: 'ok', snippet: '' },
      ],
      fetchJson: async () => ({}),
    })

    const hits = await provider.search('q')
    expect(hits).toHaveLength(1)
    expect(hits[0].url).toBe('https://ok.gov.in/1')
  })

  it('returns nothing when the mapper throws on an unexpected shape', async () => {
    /* An engine changing its response format is an outage, not a crash. */
    const provider = jsonProvider({
      name: 'e',
      endpoint: 'https://api.example/s?q={query}',
      map: () => {
        throw new Error('unexpected shape')
      },
      fetchJson: async () => ({}),
    })

    await expect(provider.search('q')).resolves.toEqual([])
  })

  it('keeps the api key out of anything it returns', async () => {
    /* The key belongs in the request and nowhere else. A key that reaches a
       hit URL ends up in the cache, in the evidence block, and in any log
       that prints a source. */
    const provider = jsonProvider({
      name: 'e',
      endpoint: 'https://api.example/s?q={query}&key={key}',
      /* One field, not two. `apiKey ?? key ?? ''` accepted either name and
         silently accepted neither, which is how the empty-key request got
         out. */
      apiKey: 'SUPER-SECRET',
      map: () => [{ url: 'https://ok.gov.in/1', title: 'ok', snippet: '' }],
      fetchJson: async () => ({}),
    })

    const hits = await provider.search('q')
    expect(JSON.stringify(hits)).not.toContain('SUPER-SECRET')
  })

  it('bounds the default transport, which nothing else does', async () => {
    /* BUG. Every other test in this file injects `fetchJson`, so the DEFAULT
       path — the one that calls the real `fetch` — was executed by nothing.
       It had no AbortController, no deadline, no size cap. A search API that
       accepts the connection and goes quiet held `search()` open forever.

       Exactly the failure fixed in `fetchPage` after a loopback stub caught
       it at 5011ms against a 250ms budget, left open at the front door
       because the tests all walked around it. */
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (_url: string, init?: { signal?: AbortSignal }) =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        })) as unknown as typeof fetch

      const provider = jsonProvider({
        name: 'slow',
        endpoint: 'https://api.example/s?q={query}',
        map: () => [],
        timeoutMs: 50,
      })

      const started = Date.now()
      await expect(provider.search('q')).resolves.toEqual([])
      expect(Date.now() - started).toBeLessThan(2000)
    } finally {
      globalThis.fetch = original
    }
  })

  it('refuses to build a provider whose endpoint needs a key it was not given', () => {
    /* BUG. `{key}` was substituted with '' when no secret was supplied. The
       request went out unauthenticated, the engine answered 401, the mapper
       threw, the catch returned [] — and `engineFailed` stayed FALSE.

       A silent auth failure presented as "this question has no answer",
       destroying the one distinction `engineFailed` exists to preserve.
       Config errors belong at construction, where they are loud. */
    expect(() =>
      jsonProvider({
        name: 'e',
        endpoint: 'https://api.example/s?q={query}&key={key}',
        map: () => [],
      }),
    ).toThrow(/key/i)
  })

  it('builds fine when the endpoint needs no key', () => {
    expect(() =>
      jsonProvider({ name: 'e', endpoint: 'https://api.example/s?q={query}', map: () => [] }),
    ).not.toThrow()
  })

  it('never throws when the transport fails', async () => {
    const provider = jsonProvider({
      name: 'e',
      endpoint: 'https://api.example/s?q={query}',
      map: () => [],
      fetchJson: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    await expect(provider.search('q')).resolves.toEqual([])
  })
})
