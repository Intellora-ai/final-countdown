/*
 * THE DOORWAY INTO `src/websearch`, AND ITS TESTS.
 *
 * Measured from `src/main.tsx`: 99 of 107 source files are reachable, and every
 * one of the 17 orphans is in this directory. The module is complete, tested
 * and imported by nothing the product loads.
 *
 * A DOORWAY, NOT A HOLE. The app must import exactly ONE file from this module
 * and know nothing else about it: not `jsonProvider`, not `ask`, not `gather`.
 * Sixteen files stay internal and can be rearranged without the app noticing.
 * The type it speaks is `SearchPort`, which the agent ALREADY declares as an
 * injection seam, so no contract is invented for this.
 *
 * WHAT MUST BE TRUE, and each of these is a test below:
 *
 *   1. Unconfigured returns `null`, not a broken port. The caller has to be
 *      able to tell "no search" from "search that fails on every call",
 *      because the agent reports the first as an unmet capability and the
 *      second as a degraded turn.
 *   2. An engine outage NEVER looks like "no results". That distinction is the
 *      thing this whole module is built around; a doorway that flattens it
 *      undoes the work behind it.
 *   3. A key never leaves the browser for a host that is not local. Same rule
 *      as the model port, for the same reason: VITE_* is compiled in.
 *   4. The researching port returns snippets from pages that were FETCHED, not
 *      engine blurbs, or there is no reason to pay for it.
 *   5. Both ports satisfy `SearchPort` structurally, so `createAgent` accepts
 *      either without knowing which it got.
 */
import { describe, expect, it, vi } from 'vitest'
import { researchPort, searchPort, type SearchPort } from './index'
import type { SearchHit } from './port'

const HITS: readonly SearchHit[] = [
  /* An engine's snippet is matched on the question's words, so it says them. */
  { url: 'https://data.gov.in/inflation', title: 'CPI inflation release', snippet: 'engine blurb', publishedAt: '2026-01-01' },
]

describe('1. unconfigured is null, never a port that always fails', () => {
  it('returns null when no endpoint is set', () => {
    expect(searchPort({ endpoint: '' })).toBeNull()
    expect(researchPort({ endpoint: '' })).toBeNull()
  })

  it('returns a port when one is set', () => {
    expect(searchPort({ endpoint: 'https://e/s?q={query}' })).not.toBeNull()
  })
})

describe('2. an outage is not an empty result', () => {
  it('a failing engine rejects rather than returning zero hits', async () => {
    /* THE INVARIANT THIS MODULE EXISTS FOR. `[]` means "the world has no
       answer"; an outage means "we do not know". `loop.ts` turns a rejection
       into a degraded turn that says so, and turns `[]` into an honest "no
       sources found". Collapsing them would make the agent assert absence of
       evidence it never gathered. */
    const port = searchPort({
      endpoint: 'https://e/s?q={query}',
      fetchJson: vi.fn(async () => { throw new Error('ECONNREFUSED') }),
    })
    await expect(port?.search('inflation')).rejects.toThrow(/ECONNREFUSED/)
  })

  it('a genuinely empty engine resolves to an empty list', async () => {
    const port = searchPort({
      endpoint: 'https://e/s?q={query}',
      fetchJson: vi.fn(async () => ({ items: [] })),
      map: () => [],
    })
    await expect(port?.search('nothing')).resolves.toEqual([])
  })
})

describe('3. a key never leaves the browser for a remote host', () => {
  it('refuses to build a port that would send one', () => {
    expect(() => searchPort({ endpoint: 'https://api.example.com/s?q={query}', apiKey: 'sk-live' }))
      .toThrow(/refusing to send an API key/i)
  })

  it('allows a key to a local engine', () => {
    expect(searchPort({ endpoint: 'http://localhost:8080/s?q={query}', apiKey: 'local' })).not.toBeNull()
  })

  it('allows a keyless call to a remote host, because a proxy holds the credential', () => {
    expect(searchPort({ endpoint: 'https://my-proxy.example.com/s?q={query}' })).not.toBeNull()
  })
})

describe('4. the researching port returns fetched text, not engine blurbs', () => {
  it('replaces the engine snippet with what the page actually said', async () => {
    const port = researchPort({
      endpoint: 'https://e/s?q={query}',
      fetchJson: async () => ({ items: HITS }),
      map: () => HITS,
      /* The REAL `FetchOutcome` shape, read out of fetchPage.ts rather than
         guessed: a discriminated union whose success arm carries a
         `FetchedPage`, not a flat object. The first version of this fixture
         invented a flat shape and the pipeline threw on `page.body` --- the
         test was wrong about the contract, and the contract won. */
      fetchImpl: async (url: string) => ({
        ok: true as const,
        page: {
          requestedUrl: url,
          finalUrl: url,
          status: 200,
          contentType: 'text/html',
          body: '<html><body><p>Retail inflation was 5.2 percent in March 2026 according to the CPI release.</p></body></html>',
          bytes: 120,
          truncated: false,
          redirects: [],
          elapsedMs: 12,
          attempts: 1,
          retrievedAt: '2026-03-01T00:00:00.000Z',
        },
      }),
    })
    const out = await port?.search('inflation') ?? []
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]?.snippet, 'the engine blurb was passed through unchanged').not.toBe('engine blurb')
    expect(out[0]?.snippet).toMatch(/inflation/i)
  })

  it('reports a total fetch failure as a failure, not as zero results', async () => {
    /* MY FIRST VERSION OF THIS ASSERTED THE WRONG OUTCOME, and the code proved
       it. I expected the hit to come back carrying its engine blurb when the
       page could not be read. The pipeline refuses instead --- "no usable
       evidence was retrieved" --- and refusing is right: an engine blurb is not
       evidence, and handing one to the agent as though a page had been read is
       exactly the laundering this module spends its whole design avoiding.
       Changed because the module's documented contract contradicted the
       assertion, not to make a red test green: what MUST hold is that the
       caller can tell this apart from "there is nothing to find", and a
       rejection carrying the reason is what preserves that. */
    const port = researchPort({
      endpoint: 'https://e/s?q={query}',
      fetchJson: async () => ({ items: HITS }),
      map: () => HITS,
      fetchImpl: async () => ({
        ok: false as const, reason: 'http-error' as const, detail: 'not found',
        status: 404, elapsedMs: 5, attempts: 1,
      }),
    })
    await expect(port?.search('inflation')).rejects.toThrow(/no usable evidence/i)
  })
})

describe('5. both ports are structurally a SearchPort', () => {
  it('so createAgent accepts either without knowing which', () => {
    const a: SearchPort | null = searchPort({ endpoint: 'https://e/s?q={query}' })
    const b: SearchPort | null = researchPort({ endpoint: 'https://e/s?q={query}' })
    expect(typeof a?.search).toBe('function')
    expect(typeof b?.search).toBe('function')
  })
})
