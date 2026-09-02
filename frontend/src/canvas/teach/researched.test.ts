/*
 * TURNING A SEARCH RESULT INTO SOURCES THE AUTHOR MAY WRITE FROM.
 *
 * `groundingPreamble` has existed since the seam was built and nothing has ever
 * called it with a source, so every lesson the canvas writes is still written
 * from memory. This is the adapter that closes that: `SearchResult` in,
 * `Source[]` out.
 *
 * The rules are all refusals. A page that failed to fetch, a page the injection
 * guard flagged, and a page with nothing readable are each worse than no
 * source at all -- grounding a lesson in an error page teaches the error.
 */
import { describe, expect, it } from 'vitest'
import { groundingFrom, howWellSourcesAgree, sourcesFrom } from './researched'
import type { SearchResult } from './webResolver'

const page = (over: Partial<{ ok: boolean; suspicious: boolean; readerText: string; title: string; url: string }> = {}) => ({
  ok: over.ok ?? true,
  suspicious: over.suspicious ?? false,
  readerText: over.readerText ?? 'Photosynthesis converts light energy into chemical energy.',
  title: over.title ?? 'Photosynthesis',
  finalUrl: over.url ?? 'https://en.wikipedia.org/wiki/Photosynthesis',
  hit: { url: over.url ?? 'https://en.wikipedia.org/wiki/Photosynthesis', title: over.title ?? 'Photosynthesis' },
})

const result = (pages: unknown[], engineFailed = false): SearchResult =>
  ({ results: pages, engineFailed }) as unknown as SearchResult

describe('sources from a search', () => {
  it('carries a good page through with its url, title and text', () => {
    const [s] = sourcesFrom(result([page()]))
    expect(s).toEqual({
      url: 'https://en.wikipedia.org/wiki/Photosynthesis',
      title: 'Photosynthesis',
      text: 'Photosynthesis converts light energy into chemical energy.',
    })
  })

  /* A page that did not load has no facts in it. Grounding a lesson in a 404
     teaches the 404. */
  it('drops a page that failed to fetch', () => {
    expect(sourcesFrom(result([page({ ok: false })]))).toEqual([])
  })

  /*
   * The injection guard flags a page whose text tries to instruct a model.
   * `groundingPreamble` fences every source, but a fence is a second line and
   * this is the first: a page already known to be hostile does not get handed
   * to the author at all.
   */
  it('drops a page the injection guard flagged', () => {
    expect(sourcesFrom(result([page({ suspicious: true })]))).toEqual([])
  })

  it('drops a page with nothing readable', () => {
    expect(sourcesFrom(result([page({ readerText: '   ' })]))).toEqual([])
  })

  /* `engineFailed` means the provider broke, not that the topic has no
     sources. Whatever came back cannot be trusted as a sample of the web. */
  it('returns nothing when the search engine itself failed', () => {
    expect(sourcesFrom(result([page()], true))).toEqual([])
  })

  it('returns nothing for no results, rather than throwing', () => {
    expect(sourcesFrom(result([]))).toEqual([])
  })

  it('prefers the final url, so a redirect is cited where it landed', () => {
    const p = { ...page(), finalUrl: 'https://example.org/after', hit: { url: 'https://example.org/before', title: 'x' } }
    expect(sourcesFrom(result([p]))[0]?.url).toBe('https://example.org/after')
  })

  it('keeps every usable page, in the order the search returned them', () => {
    const out = sourcesFrom(result([
      page({ url: 'https://a.test', title: 'A' }),
      page({ ok: false, url: 'https://bad.test' }),
      page({ url: 'https://b.test', title: 'B' }),
    ]))
    expect(out.map((s) => s.title)).toEqual(['A', 'B'])
  })
})

describe('F2 — the claim check is carried, not dropped', () => {
  /* `websearch` reads the pages, decides whether two independent domains agree,
     and hands back a verdict with the sentence it rests on. `sourcesFrom` threw
     both away, so a lesson written from one shaky page looked exactly like one
     written from two agreeing sources -- to the author, and to the reader. */
  const page = (url: string, text: string) => ({
    ok: true as const,
    suspicious: false,
    finalUrl: url,
    title: 'A page',
    readerText: text,
    hit: { url, title: 'A page', snippet: '' },
  })

  it('passes the verdict through beside the sources', () => {
    const checked = groundingFrom({
      results: [page('https://a.test/1', 'Zeros are where the graph crosses.')],
      engineFailed: false,
      check: { status: 'supported', supportingEvidenceIds: ['e1', 'e2'], conflictingEvidenceIds: [] },
      evidence: { text: 'A zero is where the polynomial equals zero.', sourceUrl: 'https://a.test/1' },
    })
    expect(checked.sources).toHaveLength(1)
    expect(checked.check?.status).toBe('supported')
    expect(checked.evidence?.text).toContain('polynomial equals zero')
  })

  it('says nothing about a check that was never made', () => {
    const checked = groundingFrom({ results: [page('https://a.test/1', 'Some text.')], engineFailed: false })
    expect(checked.check).toBeUndefined()
  })

  it('the author is told how well the sources agree, in words', () => {
    const supported = howWellSourcesAgree({ status: 'supported', supportingEvidenceIds: ['e1', 'e2'], conflictingEvidenceIds: [] })
    expect(supported).toMatch(/two|independent|agree/i)
    const single = howWellSourcesAgree({ status: 'single-source', supportingEvidenceIds: ['e1'], conflictingEvidenceIds: [] })
    expect(single).toMatch(/one source|single/i)
    const conflicting = howWellSourcesAgree({ status: 'conflicting', supportingEvidenceIds: ['e1'], conflictingEvidenceIds: ['e2'] })
    expect(conflicting).toMatch(/disagree|conflict/i)
    expect(howWellSourcesAgree({ status: 'unknown', supportingEvidenceIds: [], conflictingEvidenceIds: [] })).toBe('')
  })
})
