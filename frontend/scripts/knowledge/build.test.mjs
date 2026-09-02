import { describe, expect, it } from 'vitest'

import { decompose } from './build.mjs'

/**
 * WHAT THE GENERATOR KEEPS AND WHAT IT THROWS AWAY.
 *
 * The model is injected, so every decision this pipeline makes is provable
 * without one running. That matters more here than almost anywhere else: this
 * script decides what the product will tell a child a topic contains, and every
 * one of its judgements is a place it could quietly invent curriculum.
 *
 * The page below is the real Class 10 syllabus text for trigonometry, copied
 * from `pdftotext -layout data/source-pdfs/maths-x.pdf` page 6.
 */

const THE_REAL_PAGE = `
                                 UNIT V: TRIGONOMETRY

1.   INTRODUCTION                  TO        Understands          the    Evaluates
     TRIGONOMETRY                             definitions of the basic     trigonometric ratios
                                              trigonometric functions     Describes
     1. Trigonometric ratios of an            (including           the     trigonometric ratios of
        acute angle of a right-angled         introduction of the sine     standard angles and
        triangle. Proof of their              and cosine functions).       solving          related
        existence (well defined)                                           expressions
     2. Motivate      the       ratios
        whichever are defined at 0
        and 90. Values of the
        trigonometric ratios of 30 ,
        45 and 60.
     3. Relationships between the
        ratios.
`

const TOPIC = {
  id: 'introduction-to-trigonometry--trigonometric-ratios',
  name: 'Trigonometric ratios of an acute angle of a right-angled triangle',
  source: { pdf: 'maths-x', page: 6 },
}
const CHAPTER = { id: 'introduction-to-trigonometry', name: 'INTRODUCTION TO TRIGONOMETRY' }
const SUBJECT = { id: 'mathematics', name: 'Mathematics' }

const page = async () => THE_REAL_PAGE
const answering = (body) => async () => JSON.stringify(body)

describe('a concept the model can quote from the page', () => {
  it('is kept, with the quotation as its evidence', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'flat',
      concepts: [{ id: 'sine', name: 'The sine function', quote: 'introduction of the sine and cosine functions' }],
    }), page)
    expect(out.concepts.map((c) => c.name)).toEqual(['The sine function'])
    expect(out.concepts[0].evidence[0]).toMatchObject({ kind: 'syllabus', pdf: 'maths-x', page: 6 })
    expect(out.concepts[0].evidence[0].quote).toContain('sine')
  })
})

describe('a concept the model made up', () => {
  it('is thrown away, however confident the name sounds', async () => {
    /* THE FAILURE THIS WHOLE LAYER EXISTS TO PREVENT. A model asked what is
       inside a topic will always produce something; the quotation is what
       separates reading from remembering. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'flat',
      concepts: [
        { id: 'sine', name: 'The sine function', quote: 'introduction of the sine and cosine functions' },
        { id: 'fourier', name: 'Fourier series expansion of trigonometric functions', quote: 'the syllabus requires students to master Fourier analysis of periodic waveforms' },
      ],
    }), page)
    expect(out.concepts.map((c) => c.name), 'an invented concept was written into the curriculum').toEqual(['The sine function'])
    expect(out.dropped).toBe(1)
  })

  it('throws away an invented sub-concept while keeping its real parent', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'hierarchical',
      concepts: [{
        id: 'ratios', name: 'The ratios', quote: 'Relationships between the ratios',
        subConcepts: [
          { id: 'thirty', name: 'At 30 degrees', quote: 'Values of the trigonometric ratios of 30' },
          { id: 'made-up', name: 'At 17 degrees', quote: 'the ratios of seventeen and twenty three degrees are examinable' },
        ],
      }],
    }), page)
    expect(out.concepts[0].subConcepts.map((s) => s.name)).toEqual(['At 30 degrees'])
  })
})

describe('a quote assembled from fragments of the page is not a quote', () => {
  it('refuses words that appear only inside longer words', async () => {
    /* THE HOLE THIS CLOSES. The check was `page.includes(word)` against the
       page as one long string, so "art" matched inside "particle", "ion" inside
       "station" and "use" inside "because". A quote stitched together from
       short fragments of the page's own vocabulary would have passed a check
       whose entire job is to tell reading from remembering.

       Every word below really is inside a word on the real page: `art` in
       "right-angled", no -- in "part"; `ratio` is genuinely there, so the quote
       is built from words that are NOT: `rig`, `angl`, `onometr`. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'flat',
      concepts: [{ id: 'made-up', name: 'Something', quote: 'rig angl onometr riangl' }],
    }), page)
    expect(out.concepts, 'a quote made of fragments of page words was accepted').toEqual([])
  })

  it('still accepts a real quotation the PDF broke across columns', async () => {
    /* The reason the rule is word OVERLAP and not an intact phrase: pdftotext
       interleaves a three-column table, so a genuine Content-column sentence
       arrives with Competencies-column words pushed through the middle of it. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'flat',
      concepts: [{
        id: 'real', name: 'Trigonometric ratios',
        quote: 'Trigonometric ratios of an acute angle of a right-angled triangle. Proof of their existence (well defined)',
      }],
    }), page)
    expect(out.concepts.map((c) => c.name), 'a real quotation was thrown away').toEqual(['Trigonometric ratios'])
  })
})

describe('the shape is read off what survived, not taken on trust', () => {
  it('calls it atomic when every concept was thrown away', async () => {
    /* A model claiming "flat" while all its concepts were invented would
       otherwise write a file asserting parts that are not there. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'flat',
      concepts: [{ id: 'x', name: 'Something', quote: 'nothing of the sort appears anywhere on this page whatsoever' }],
    }), page)
    expect(out.shape).toBe('atomic')
    expect(out.concepts).toEqual([])
  })

  it('calls it flat when nothing has parts, whatever the model said', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({
      shape: 'hierarchical',
      concepts: [{ id: 'sine', name: 'The sine function', quote: 'introduction of the sine and cosine functions' }],
    }), page)
    expect(out.shape).toBe('flat')
  })

  it('accepts an empty answer as a real answer', async () => {
    /* A topic that is one idea. Never inventing parts to fill a list is the
       point, so the generator has to be able to come back with nothing. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({ shape: 'atomic', concepts: [] }), page)
    expect(out.shape).toBe('atomic')
    expect(out.concepts).toEqual([])
  })
})

describe('when things go wrong', () => {
  it('skips a topic whose page cannot be read, rather than guessing', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', answering({ concepts: [] }), async () => null)
    expect(out.skipped).toContain('could not be read')
  })

  it('skips a topic the curriculum has no page for', async () => {
    const out = await decompose({ ...TOPIC, source: undefined }, CHAPTER, SUBJECT, '10', answering({ concepts: [] }), page)
    expect(out.skipped).toContain('page')
  })

  it('skips a topic when the model answers rubbish, rather than writing rubbish', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', async () => 'I am afraid I cannot help with that', page)
    expect(out.skipped).toContain('did not answer usably')
  })
})
