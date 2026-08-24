import { describe, expect, it, vi } from 'vitest'

import { searchTheWeb, SEARCH_ROUTE } from './webSearchClient'

/**
 * The browser half of open-web search.
 *
 * It holds no key, names no vendor and fetches no page. It posts the learner's
 * question to a route on its own origin and turns what comes back into the
 * shape the canvas already speaks — plus the one thing the canvas cannot
 * compute for itself, because `crosscheck.ts` cannot be imported across the
 * canvas tsconfig boundary: whether the pages actually agree.
 */

interface Page {
  title: string
  url: string
  domain: string
  text: string
  suspicious: boolean
}

function page(url: string, text: string, over: Partial<Page> = {}): Page {
  return {
    title: 'A page',
    url,
    domain: new URL(url).hostname,
    text,
    suspicious: false,
    ...over,
  }
}

function respondWith(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch
}

const GAS = 'why does heating a gas raise its pressure'
const HOT_A = 'Heating a gas raises its pressure because particles move faster.'
const HOT_B = 'When a gas is heated its pressure rises at constant volume.'

/* -------------------------------------------------------------------------- */
/* It talks to our own route, and to nothing else                             */
/* -------------------------------------------------------------------------- */

describe('the browser never talks to a search vendor directly', () => {
  it('posts the question to a relative route on its own origin', async () => {
    const seen: { url: string; init?: RequestInit }[] = []
    const spy = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ pages: [], engineFailed: false }) } as unknown as Response
    }) as unknown as typeof fetch

    await searchTheWeb(GAS, { fetchImpl: spy })

    expect(seen[0]?.url).toBe(SEARCH_ROUTE)
    expect(SEARCH_ROUTE.startsWith('/')).toBe(true)
    expect(String(seen[0]?.init?.body)).toContain(GAS)
  })

  it('sends the question RAW, because the route and the provider do the trimming', async () => {
    /* The Wikipedia rung stripped filler in the resolver before searching. The
       general route takes the question as typed: a real engine handles natural
       language, and pre-trimming here would throw away the words that let it. */
    const seen: string[] = []
    const spy = (async (_url: string, init?: RequestInit) => {
      seen.push(String(init?.body))
      return { ok: true, status: 200, json: async () => ({ pages: [], engineFailed: false }) } as unknown as Response
    }) as unknown as typeof fetch

    await searchTheWeb('can you explain photosynthesis to me please', { fetchImpl: spy })
    expect(seen[0]).toContain('can you explain photosynthesis to me please')
  })
})

/* -------------------------------------------------------------------------- */
/* Failures stay failures                                                     */
/* -------------------------------------------------------------------------- */

describe('a broken route is never reported as an empty web', () => {
  it('a non-2xx response -> engineFailed', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({ pages: [], engineFailed: true, engineError: 'not configured' }, 503),
    })
    expect(out.engineFailed).toBe(true)
    expect(out.engineError).toContain('not configured')
  })

  it('a thrown fetch -> engineFailed, never an exception at the chain', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch,
    })
    expect(out.engineFailed).toBe(true)
    expect(out.engineError).toContain('offline')
  })

  it('a body that is not the agreed shape -> engineFailed, not a silent empty', async () => {
    const out = await searchTheWeb(GAS, { fetchImpl: respondWith({ nonsense: true }) })
    expect(out.engineFailed).toBe(true)
  })

  it('a non-2xx whose body does NOT say engineFailed is still a failure', async () => {
    /* MUTATION-DERIVED. Deleting the status check survived, because every
       fixture happened to carry `engineFailed: true` in the body as well — so
       the later branch caught it and the status check looked redundant. A 500
       from a proxy carries no such field, and without this the answer would be
       "the web has nothing to say about that". */
    const out = await searchTheWeb(GAS, { fetchImpl: respondWith({ pages: [] }, 500) })
    expect(out.engineFailed).toBe(true)
    expect(out.engineError).toContain('500')
  })

  it('zero pages with no failure is NOT an outage', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({ pages: [], engineFailed: false }),
    })
    expect(out.engineFailed).toBe(false)
    expect(out.results).toEqual([])
  })
})

describe('a failure reports BOTH that it broke and that nothing was checked', () => {
  it('a provider timeout produces status unknown as well as engineFailed', async () => {
    /* Two true statements, and sending only one leaves a fail-closed reader
       with no verdict — which is the single thing it cannot tell apart from a
       passing one. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: (async () => {
        throw new Error('ETIMEDOUT')
      }) as unknown as typeof fetch,
    })
    expect(out.engineFailed).toBe(true)
    expect(out.check?.status).toBe('unknown')
  })

  it('an unconfigured route produces status unknown, not a false answer', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith(
        { pages: [], engineFailed: true, engineError: 'WEB_SEARCH_API_KEY is not set' },
        503,
      ),
    })
    expect(out.check?.status).toBe('unknown')
    expect(out.engineError).toContain('WEB_SEARCH_API_KEY')
  })

  it('a 200 whose BODY reports a failure is still a failure with no verdict', async () => {
    /* MUTATION-DERIVED. Deleting the verdict from the relayed-failure branch
       survived, because every fixture that reported a failure did it with a
       non-2xx status — so the earlier branch caught them all and this one was
       never exercised. A route is entitled to answer 200 and say in the body
       that the search itself failed, and a client that then reported no verdict
       would leave a fail-closed reader unable to tell that from success. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith(
        { pages: [page('https://a.test/1', HOT_A)], engineFailed: true, engineError: 'quota spent' },
        200,
      ),
    })
    expect(out.engineFailed).toBe(true)
    expect(out.engineError).toContain('quota spent')
    expect(out.check?.status).toBe('unknown')
    /* The pages still come back, so the canvas can say what it saw. */
    expect(out.results).toHaveLength(1)
  })

  it('unknown never claims the answer is false', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({ pages: [], engineFailed: true, engineError: 'down' }, 502),
    })
    expect(out.check?.supportingEvidenceIds).toEqual([])
    expect(out.check?.conflictingEvidenceIds).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* The check                                                                  */
/* -------------------------------------------------------------------------- */

describe('what came back is checked before the canvas is allowed to show it', () => {
  it('two independent domains agreeing -> supported', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A), page('https://b.test/2', HOT_B)],
        engineFailed: false,
      }),
    })
    expect(out.check?.status).toBe('supported')
  })

  it('one relevant page -> single-source', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({ pages: [page('https://a.test/1', HOT_A)], engineFailed: false }),
    })
    expect(out.check?.status).toBe('single-source')
  })

  it('two pages from the SAME domain -> single-source, not supported', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A), page('https://a.test/2', HOT_B)],
        engineFailed: false,
      }),
    })
    expect(out.check?.status).toBe('single-source')
  })

  it('nothing relevant -> unknown, and no evidence is chosen', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', 'Cricket is a bat-and-ball game.')],
        engineFailed: false,
      }),
    })
    expect(out.check?.status).toBe('unknown')
    expect(out.evidence).toBeUndefined()
  })

  it('an off-topic page cannot become evidence even beside a relevant one', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://junk.test/1', 'Cricket is a bat-and-ball game.'), page('https://a.test/1', HOT_A)],
        engineFailed: false,
      }),
    })
    expect(out.evidence?.sourceUrl).toBe('https://a.test/1')
  })

  it('two pages that each share ONE word of four cannot corroborate each other', async () => {
    /* MUTATION-DERIVED. Removing the relevance gate from the voting set
       survived, because `extractClaims` already needs a sentence to mention an
       aspect — which looked like the same rule. It is not: that needs ONE
       aspect, this needs HALF the question. Two pages about gas PRICES and
       natural gas SALES both mention "gas", and without the gate they become
       two independent sources agreeing about a physics question. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [
          page('https://a.test/1', 'Gas prices rose sharply in London last winter.'),
          page('https://b.test/2', 'Natural gas is sold by the cubic metre.'),
        ],
        engineFailed: false,
      }),
    })
    expect(out.check?.status).not.toBe('supported')
  })

  it('a source select.ts excludes cannot vote', async () => {
    /* MUTATION-DERIVED. Ignoring `excluded` survived, because no fixture
       contained a source worth excluding. `select.ts` refuses unparseable urls
       and non-http schemes, and a route that ever relayed one would otherwise
       hand it a vote on what is true. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [
          page('https://a.test/1', HOT_A),
          {
            title: 'Not a web page',
            url: 'javascript:alert(1)',
            domain: '',
            text: HOT_B,
            suspicious: false,
          },
        ],
        engineFailed: false,
      }),
    })
    expect(out.check?.status).toBe('single-source')
  })

  it('a suspicious page is returned to the canvas but never counted as agreement', async () => {
    /* Both facts matter. The canvas has to be able to say "pages came back and
       could not be trusted", which it cannot do if they were filtered away
       here; and a page trying to manipulate this software must not be one of
       the two voices that make something `supported`. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A), page('https://evil.test/2', HOT_B, { suspicious: true })],
        engineFailed: false,
      }),
    })
    expect(out.results.some((r) => r.suspicious)).toBe(true)
    expect(out.check?.status).toBe('single-source')
  })
})

/* -------------------------------------------------------------------------- */
/* The evidence is a copy                                                     */
/* -------------------------------------------------------------------------- */

describe('the chosen evidence is copied out of a page, never composed', () => {
  it('is a substring of the page it names', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({ pages: [page('https://a.test/1', HOT_A)], engineFailed: false }),
    })
    if (!out.evidence) throw new Error('expected evidence')
    expect(HOT_A).toContain(out.evidence.text)
    expect(out.evidence.sourceUrl).toBe('https://a.test/1')
  })
})

/* -------------------------------------------------------------------------- */
/* The pages reach the canvas in the shape it already speaks                  */
/* -------------------------------------------------------------------------- */

describe('pages arrive in the shape the canvas already renders', () => {
  it('carries reader text, address and title across', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A, { title: 'Gas laws' })],
        engineFailed: false,
      }),
    })
    const first = out.results[0]
    expect(first?.readerText).toBe(HOT_A)
    expect(first?.finalUrl).toBe('https://a.test/1')
    expect(first?.title).toBe('Gas laws')
    expect(first?.ok).toBe(true)
  })

  it('an aborted signal means it never asks', async () => {
    const controller = new AbortController()
    controller.abort()
    const spy = vi.fn()
    const out = await searchTheWeb(GAS, {
      fetchImpl: spy as unknown as typeof fetch,
      signal: controller.signal,
    })
    expect(spy).not.toHaveBeenCalled()
    expect(out.results).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Freshness and rounds reach the canvas                                      */
/* -------------------------------------------------------------------------- */

describe('what the route knows about the age of its evidence is passed on', () => {
  it('relays freshness rather than dropping it at the boundary', async () => {
    /* The route has computed this since `pipeline.ts` was wired and nothing
       read it. A value computed and discarded is worse than one never
       computed: it looks, in the code, like the property is handled. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A)],
        engineFailed: false,
        freshness: { live: true, origins: ['live'], usableSources: 1 },
        rounds: 2,
      }),
    })
    expect(out.freshness?.live).toBe(true)
    expect(out.freshness?.usableSources).toBe(1)
    expect(out.rounds).toBe(2)
  })

  it('a route that reports no freshness leaves it undefined rather than inventing it', async () => {
    /* Absent and "live" are different claims. Defaulting a missing value to
       live is how a cached answer starts calling itself current. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({ pages: [page('https://a.test/1', HOT_A)], engineFailed: false }),
    })
    expect(out.freshness).toBeUndefined()
  })

  it('a saved answer is relayed as saved, not upgraded to live', async () => {
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A)],
        engineFailed: false,
        freshness: { live: false, origins: ['recent-cache'], usableSources: 1 },
        rounds: 0,
      }),
    })
    expect(out.freshness?.live).toBe(false)
  })
})

describe('provenance labels from the route are checked, not trusted', () => {
  it('drops an origin nobody defined rather than relaying it', async () => {
    /* Found by tightening the canvas type, not by review. The client relayed
       `origins` as raw strings, so a route sending "totally-fresh" would have
       arrived and rendered as a meaningful provenance label. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A)],
        engineFailed: false,
        freshness: { live: true, origins: ['live', 'totally-fresh'], usableSources: 1 },
      }),
    })
    expect(out.freshness?.origins).toEqual(['live'])
  })

  it('keeps every origin that IS defined', async () => {
    /* The pair. A filter asserted only to drop is satisfied by dropping
       everything. */
    const out = await searchTheWeb(GAS, {
      fetchImpl: respondWith({
        pages: [page('https://a.test/1', HOT_A)],
        engineFailed: false,
        freshness: { live: false, origins: ['recent-cache', 'precomputed'], usableSources: 1 },
      }),
    })
    expect(out.freshness?.origins).toEqual(['recent-cache', 'precomputed'])
  })
})
