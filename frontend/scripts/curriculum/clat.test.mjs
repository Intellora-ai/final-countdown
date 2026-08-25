/* CLAT, which is a SKILLS test and not a chapter list.
 *
 * WHY IT NEEDED ITS OWN READER
 *   JEE and NEET publish numbered units of content. CLAT publishes what a
 *   candidate must be able to DO, in five sections, and says explicitly that it
 *   tests aptitude "rather than prior knowledge". Forcing it into the unit
 *   shape would invent chapters nobody set.
 *
 * AND IT WAS NEVER BLOCKED EITHER
 *   Reported as a dead 404 for a day. The page is at
 *   `clat-2027/ug-syllabus.html` -- the wrong YEAR and the wrong path had been
 *   guessed. The site is a JavaScript application, so the link exists only in
 *   the rendered page and not in the HTML a plain fetch returns, which is why
 *   guessing failed and reading succeeded.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseClat, CLAT_SOURCE } from './clat.mjs'

const HTML = readFileSync(
  fileURLToPath(new URL('./__fixtures__/clat-2027-ug.html', import.meta.url)),
  'utf8',
)

const exam = parseClat(HTML)

describe('the shape of the paper', () => {
  it('reads the five sections the paper is divided into', () => {
    expect(exam.sections.map((s) => s.id)).toEqual([
      'english-language',
      'current-affairs-general-knowledge',
      'legal-reasoning',
      'logical-reasoning',
      'quantitative-techniques',
    ])
  })

  it('reads the marking scheme off the page rather than assuming it', () => {
    /* Every one of these is a number a student plans around, and every one is
     * printed in the document. */
    expect(exam.questions).toBe(120)
    expect(exam.minutes).toBe(120)
    expect(exam.negativeMarking).toBe(0.25)
  })
})

describe('what each section asks a candidate to do', () => {
  it('gives every section its skills, not an empty heading', () => {
    for (const section of exam.sections) {
      /* Two, not three. EXPECTED VALUE CORRECTED against the document:
       * Quantitative Techniques lists exactly two things a candidate must do,
       * and demanding a third would have pushed the parser to split one of
       * them in half to satisfy a number I made up. */
      expect(section.skills.length, section.id).toBeGreaterThanOrEqual(2)
      for (const skill of section.skills) {
        expect(skill.length, `${section.id}: "${skill}"`).toBeGreaterThan(15)
      }
    }
  })

  it('keeps the mathematics CLAT actually tests, which is class 10', () => {
    /* A student revising class 12 calculus for CLAT is revising the wrong
     * thing, and the document says so plainly. */
    const quant = exam.sections.find((s) => s.id === 'quantitative-techniques')
    expect(quant?.skills.join(' ')).toMatch(/10th standard/i)
    expect(quant?.skills.join(' ')).toMatch(/ratios and proportions/i)
  })

  it('records that no prior legal knowledge is required', () => {
    /* The single most misunderstood fact about this exam. */
    const legal = exam.sections.find((s) => s.id === 'legal-reasoning')
    expect(`${legal?.description ?? ''}`).toMatch(/not require any prior knowledge of law/i)
  })

  it('carries the passage length for the four sections built on passages', () => {
    for (const section of exam.sections) {
      if (section.id === 'quantitative-techniques') continue
      expect(section.passageWords, section.id).toBe(450)
    }
  })

  it('does NOT claim a passage length for the section that has none', () => {
    /* EXPECTED VALUE CORRECTED, and the correction is worth keeping.
     *
     * This originally required 450 words for all five. The document does not
     * say that: Quantitative Techniques is built on "short sets of facts or
     * propositions", not on 450-word passages. Inventing the number would have
     * told a student to practise a reading pace this section never asks for. */
    const quant = exam.sections.find((s) => s.id === 'quantitative-techniques')
    expect(quant?.passageWords).toBeNull()
    expect(quant?.description).toMatch(/short sets of facts/i)
  })

  it('has exactly the two things Quantitative Techniques asks for', () => {
    const quant = exam.sections.find((s) => s.id === 'quantitative-techniques')
    expect(quant?.skills).toHaveLength(2)
  })
})

describe('provenance', () => {
  it('records where the page was read, and what it hashed to', () => {
    expect(CLAT_SOURCE.url).toMatch(/^https:\/\/consortiumofnlus\.ac\.in\//)
    expect(CLAT_SOURCE.discoveredFrom).toMatch(/^https:\/\/consortiumofnlus\.ac\.in\//)
    expect(CLAT_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('says the link had to be READ from a rendered page, not constructed', () => {
    /* Written down because the next person to re-fetch this will otherwise
     * repeat the guess that cost a day. */
    expect(CLAT_SOURCE.note).toMatch(/render|javascript/i)
  })
})
