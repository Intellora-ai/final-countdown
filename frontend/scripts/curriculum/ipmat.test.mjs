/* IPMAT, read off IIM Rohtak's own FAQ.
 *
 * WHERE IT WAS FOUND, AND WHY THAT IS RECORDED
 *   Not on a syllabus page -- there is not one. The IPM programme page carries
 *   no test pattern at all; the pattern is inside the admissions FAQ, and the
 *   PDF the page most obviously offers ("IPMAT 2026 Summary") is candidate
 *   STATISTICS, not a syllabus. Anyone re-fetching this will otherwise take
 *   that file and record the wrong thing.
 *
 * WHAT THIS COVERS, AND WHAT IT DOES NOT
 *   IIM ROHTAK's IPM AT only. IIM Indore runs a different paper with a
 *   different shape, and its site did not answer. That gap is stated in the
 *   data rather than left for a student to discover.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseIpmat, IPMAT_SOURCE } from './ipmat.mjs'

const TEXT = readFileSync(
  fileURLToPath(new URL('./__fixtures__/ipmat-2026-rohtak.pages.txt', import.meta.url)),
  'utf8',
)

const paper = parseIpmat(TEXT)

describe('the shape of the paper', () => {
  it('reads the three sections the test is built from', () => {
    expect(paper.sections.map((s) => s.name)).toEqual([
      'Quantitative Ability',
      'Logical Reasoning',
      'Verbal Ability',
    ])
  })

  it('reads forty questions in each, off the table rather than assuming', () => {
    for (const section of paper.sections) {
      expect(section.questions, section.name).toBe(40)
    }
    expect(paper.questions).toBe(120)
  })

  it('reads the time and the marking the candidate actually faces', () => {
    expect(paper.minutes).toBe(120)
    expect(paper.marksPerQuestion).toBe(4)
    expect(paper.negativeMarking).toBe(1)
  })

  it('records the extra Legal Reasoning section the law option adds', () => {
    /* A candidate who also chose IPL sits twenty more questions in twenty more
     * minutes. Leaving it out would under-state the paper for exactly the
     * students who need to plan for it. */
    expect(paper.optional).toEqual({
      name: 'Legal Reasoning',
      questions: 20,
      minutes: 20,
      appliesWhen: 'the candidate also chose the Integrated Programme in Law (IPL)',
    })
  })
})

describe('what it does NOT claim', () => {
  it('covers IIM Rohtak only, and says so', () => {
    /* IIM Indore runs a different paper. Presenting this as "IPMAT" without
     * qualification would tell an Indore candidate to prepare the wrong shape. */
    expect(paper.institute).toBe('IIM Rohtak')
    expect(paper.covers).toMatch(/Rohtak/)
    expect(paper.notCovered).toMatch(/Indore/)
  })
})

describe('provenance', () => {
  it('records the document, the page it was found on, and its digest', () => {
    expect(IPMAT_SOURCE.url).toMatch(/^https:\/\/www\.iimrohtak\.ac\.in\//)
    expect(IPMAT_SOURCE.discoveredFrom).toMatch(/^https:\/\/www\.iimrohtak\.ac\.in\//)
    expect(IPMAT_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('warns which nearby file is the WRONG one', () => {
    expect(IPMAT_SOURCE.note).toMatch(/summary/i)
  })
})
