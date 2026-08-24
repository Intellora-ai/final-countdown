import { describe, expect, it } from 'vitest'

import {
  citationSupports,
  coverage,
  independentSources,
  precision,
  recall,
  retrievalReport,
} from './quality'

describe('precision, and what it refuses to say', () => {
  it('is the fraction of what came back that was relevant', () => {
    expect(precision([true, true, false, false])).toBe(0.5)
    expect(precision([true, true, true])).toBe(1)
    expect(precision([false, false])).toBe(0)
  })

  it('is undefined for an empty result set, not 0 and not 1', () => {
    /* Zero would read as "everything we returned was junk" and one as
       "flawless". Neither is true of a search that returned nothing, and both
       are numbers somebody would put on a dashboard. */
    expect(precision([])).toBeUndefined()
  })
})

describe('recall needs a denominator it cannot invent', () => {
  it('is found-relevant over all-relevant', () => {
    expect(recall(3, 10)).toBe(0.3)
    expect(recall(10, 10)).toBe(1)
    expect(recall(0, 4)).toBe(0)
  })

  it('is undefined when nothing relevant exists to find', () => {
    /* 0/0 is not 1. A query with no relevant documents in the corpus has no
       recall, and reporting perfect recall for it would make an empty
       benchmark look like a solved one. */
    expect(recall(0, 0)).toBeUndefined()
  })

  it('refuses a count that exceeds the total rather than reporting above 1', () => {
    /* Finding 5 of 3 means the labels are wrong. A ratio over 1 is a bug
       report, not a score, so it is refused rather than displayed. */
    expect(recall(5, 3)).toBeUndefined()
  })

  it('rejects negative or non-finite counts', () => {
    expect(recall(-1, 5)).toBeUndefined()
    expect(recall(2, Number.NaN)).toBeUndefined()
  })
})

describe('coverage is about the question, not the documents', () => {
  it('is the fraction of required aspects some source addressed', () => {
    const required = ['revenue', 'year', 'source']
    expect(coverage(['revenue', 'year', 'source'], required)).toBe(1)
    expect(coverage(['revenue', 'year'], required)).toBeCloseTo(2 / 3)
    expect(coverage([], required)).toBe(0)
  })

  it('ignores aspects nobody asked for', () => {
    /* Ten pages about something adjacent is not coverage. Only the aspects
       the question named count towards it. */
    expect(coverage(['revenue', 'weather', 'sport'], ['revenue'])).toBe(1)
  })

  it('is case- and whitespace-insensitive, because aspect labels are prose', () => {
    expect(coverage([' Revenue '], ['revenue'])).toBe(1)
  })

  it('is undefined when the question named no aspects', () => {
    expect(coverage(['anything'], [])).toBeUndefined()
  })

  it('does not double-count a repeated aspect', () => {
    expect(coverage(['revenue', 'revenue', 'revenue'], ['revenue', 'year'])).toBe(0.5)
  })
})

describe('source independence, because copies are not corroboration', () => {
  it('counts three identical articles as one independent source', () => {
    const wire = 'The ministry reported growth of 6.1% for the year.'
    const groups = independentSources([
      { url: 'https://a.example/1', text: wire },
      { url: 'https://b.example/2', text: wire },
      { url: 'https://c.example/3', text: wire },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toHaveLength(3)
  })

  it('keeps genuinely different reporting apart', () => {
    const groups = independentSources([
      { url: 'https://a.example/', text: 'The ministry reported growth of 6.1%.' },
      { url: 'https://b.example/', text: 'Rainfall this monsoon was the heaviest in a decade.' },
    ])
    expect(groups).toHaveLength(2)
  })

  it('treats near-identical syndication as the same source', () => {
    /* Syndicated copy is rarely byte-identical: a house style tweak, a
       different dateline, an extra sentence. Exact matching would score all
       of those as independent, which is the whole failure mode. */
    const groups = independentSources([
      { url: 'https://a.example/', text: 'The ministry reported growth of 6.1% for the year.' },
      {
        url: 'https://b.example/',
        text: 'NEW DELHI: The ministry reported growth of 6.1% for the year.',
      },
    ])
    expect(groups).toHaveLength(1)
  })

  it('counts two pages on the same host as one source regardless of text', () => {
    /* One publisher agreeing with itself is one voice. Same registrable
       domain, same source. */
    const groups = independentSources([
      { url: 'https://news.example.com/a', text: 'Growth was 6.1%.' },
      { url: 'https://news.example.com/b', text: 'Something else entirely happened.' },
    ])
    expect(groups).toHaveLength(1)
  })

  it('does not merge different hosts that share a suffix', () => {
    const groups = independentSources([
      { url: 'https://a-example.com/x', text: 'One thing.' },
      { url: 'https://example.com/y', text: 'Another thing.' },
    ])
    expect(groups).toHaveLength(2)
  })

  it('returns nothing for no sources, and never throws on junk', () => {
    expect(independentSources([])).toEqual([])
    expect(() => independentSources([{ url: 'not a url', text: '' }])).not.toThrow()
  })
})

describe('a citation has to support its claim', () => {
  it('accepts a claim whose numbers and terms appear in the cited text', () => {
    expect(
      citationSupports('Growth was 6.1% in 2025', 'The ministry said growth was 6.1% in 2025.'),
    ).toBe(true)
  })

  it('rejects a claim whose number is absent from the source', () => {
    /* The failure that makes citations worthless: a plausible sentence with a
       real-looking link that does not say it. */
    expect(
      citationSupports('Growth was 9.9% in 2025', 'The ministry said growth was 6.1% in 2025.'),
    ).toBe(false)
  })

  it('rejects a claim citing a source about something else', () => {
    expect(citationSupports('Revenue was $120 billion', 'Rainfall was heavy this monsoon.')).toBe(
      false,
    )
  })

  it('does not care about wording, only about the load-bearing parts', () => {
    expect(
      citationSupports(
        'revenue reached 120 billion',
        'Total revenue for the period reached 120 billion dollars.',
      ),
    ).toBe(true)
  })

  it('treats a claim with no checkable content as unsupported', () => {
    /* "It is significant" cannot be supported or refuted by any source, so it
       must not pass. Returning true for it would let vague claims through the
       one gate that exists to catch them. */
    expect(citationSupports('This is significant', 'The ministry said growth was 6.1%.')).toBe(
      false,
    )
    expect(citationSupports('', 'anything')).toBe(false)
  })

  it('never throws on empty or enormous input', () => {
    expect(() => citationSupports('x', '')).not.toThrow()
    expect(() => citationSupports('6.1%', 'a '.repeat(100_000))).not.toThrow()
  })
})

describe('the report keeps its numbers apart', () => {
  it('reports each measure separately and offers no overall score', () => {
    const report = retrievalReport({
      judged: [true, true, false],
      relevantFound: 2,
      relevantTotal: 8,
      aspectsCovered: ['revenue'],
      aspectsRequired: ['revenue', 'year'],
      sources: [
        { url: 'https://a.example/', text: 'Growth was 6.1%.' },
        { url: 'https://b.example/', text: 'Growth was 6.1%.' },
      ],
    })

    expect(report.precision).toBeCloseTo(2 / 3)
    expect(report.recall).toBe(0.25)
    expect(report.coverage).toBe(0.5)
    expect(report.independentSources).toBe(1)
    expect(report.retrievedSources).toBe(2)

    /* No composite. Spec 44: a single "search quality = 0.94" cannot be
       constructed honestly from these, so it is not available to quote. */
    const loose = report as unknown as Record<string, unknown>
    expect(loose.score).toBeUndefined()
    expect(loose.overall).toBeUndefined()
    expect(loose.quality).toBeUndefined()
  })

  it('leaves a measure undefined rather than guessing it', () => {
    const report = retrievalReport({
      judged: [],
      relevantFound: 0,
      relevantTotal: 0,
      aspectsCovered: [],
      aspectsRequired: [],
      sources: [],
    })

    expect(report.precision).toBeUndefined()
    expect(report.recall).toBeUndefined()
    expect(report.coverage).toBeUndefined()
    expect(report.independentSources).toBe(0)
  })
})
