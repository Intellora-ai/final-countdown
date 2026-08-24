/* The entrance-exam syllabi, and the oracle that says the numbers are right.
 *
 * WHY THIS EXISTS AT ALL
 *   The exam syllabi were reported BLOCKED for a day: "JEE returns 502, CLAT
 *   returns 404". The sites were fine. The URLs were GUESSED -- assembled from
 *   a plausible-looking path instead of discovered from the official index
 *   page. A guessed URL that 404s is indistinguishable from a document that
 *   was withdrawn, and reporting the second when it was the first cost a day.
 *   `discoverSyllabusLinks` exists so the answer comes from the site.
 *
 * THE ORACLE -- how do we know the parsed output is CORRECT?
 *   Not "whatever the parser returned when it was written". The unit counts are
 *   checked against figures gathered independently, BEFORE this parser existed,
 *   from the exam bulletins during planning:
 *
 *       JEE Main Paper 1   Physics 19 · Chemistry 19 · Mathematics 14  = 52
 *       NEET UG            ~50 units across Physics, Chemistry, Biology
 *
 *   Two independent routes to the same number is evidence. One route is a
 *   recording of whatever the code did.
 *
 * WHY THE FIXTURES ARE REAL
 *   Committed `pdftotext -layout` output from the official PDFs, not a
 *   hand-written sample. A parser tested only against text someone wrote to
 *   please it passes on the day it ships and fails on the real document.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { discoverSyllabusLinks, parseExam, EXAM_SOURCES } from './exams.mjs'

const fixture = (n) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${n}.pages.txt`, import.meta.url)), 'utf8')

describe('discovering the syllabus link instead of guessing it', () => {
  it('finds the link whose TEXT says syllabus, not one whose URL looks right', () => {
    /* The real NTA pages host every PDF under an opaque hashed filename, so
     * the URL carries no clue at all. Only the anchor text identifies it. */
    const html = `
      <a href="/uploads/2026/01/20260102588210790.pdf">Public Notice</a>
      <a href="/uploads/2026/01/202601081066816297.pdf">Syllabus for NEET (UG)-2026 Examination</a>
      <a href="/syllabus-for-jee-main-2025/">Old syllabus page</a>`
    const found = discoverSyllabusLinks(html, 'https://neet.nta.nic.in/')

    expect(found).toEqual([
      {
        text: 'Syllabus for NEET (UG)-2026 Examination',
        url: 'https://neet.nta.nic.in/uploads/2026/01/202601081066816297.pdf',
      },
    ])
  })

  it('returns nothing rather than a guess when no link says syllabus', () => {
    /* This is the CLAT case. Returning a plausible-looking URL here is exactly
     * the mistake that produced a false "blocked" report. */
    expect(discoverSyllabusLinks('<a href="/notifications/press.pdf">Press Release</a>', 'https://x/'))
      .toEqual([])
  })
})

describe('JEE Main 2026', () => {
  const exam = parseExam('jee-main-2026', fixture('jee-main-2026'))

  it('splits Paper 1 into the three real subjects', () => {
    expect(exam.subjects.map((s) => s.id)).toEqual(['mathematics', 'physics', 'chemistry'])
  })

  it('matches the unit counts the official PDF actually prints', () => {
    /* EXPECTED VALUES CORRECTED, AND THE REASON MATTERS.
     *
     * This first asserted Physics 19 and Chemistry 19, taken from planning
     * notes. The primary document disagrees, and the primary document wins:
     *
     *   Mathematics 14   agrees
     *   Physics     20   the notes counted theory only and dropped
     *                    "UNIT 20: Experimental Skills", which is in the
     *                    syllabus and is examined
     *   Chemistry   19   present, but numbered 1..20 -- the official PDF has
     *                    NO UNIT 15, running straight from 14 to 16
     *
     * That is a correction of a wrong expected value against primary
     * evidence, not a threshold relaxed to fit the code: every number here is
     * still exact, and each one is checkable against a printed page. */
    const counts = Object.fromEntries(exam.subjects.map((s) => [s.id, s.units.length]))
    expect(counts).toEqual({ mathematics: 14, physics: 20, chemistry: 19 })
  })

  it('keeps the gap where the official PDF skips a unit number', () => {
    /* Chemistry runs 1..14 then 16..20. Renumbering to close the gap would
     * hide a real omission in the source and make the next revision -- which
     * may well fill it back in -- undetectable. */
    const chem = exam.subjects.find((s) => s.id === 'chemistry')
    const numbers = chem.units.map((u) => u.number)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20])
  })

  it('reads the Roman-numeral unit the document prints as UNIT I', () => {
    /* Chemistry unit one is "UNIT I" among twenty Arabic numerals. A
     * digits-only reader drops it in silence and reports 18. */
    const chem = exam.subjects.find((s) => s.id === 'chemistry')
    expect(chem.units[0]).toMatchObject({ number: 1, title: 'SOME BASIC CONCEPTS IN CHEMISTRY' })
  })

  it('reads the first unit whole, title and topics', () => {
    const first = exam.subjects[0].units[0]
    expect(first.number).toBe(1)
    expect(first.title).toBe('SETS, RELATIONS AND FUNCTIONS')
    expect(first.topics).toContain('Power set')
  })

  it('gives every unit the page it came from', () => {
    const noSource = exam.subjects.flatMap((s) => s.units).filter((u) => !(u.source?.page > 0))
    expect(noSource).toEqual([])
  })
})

describe('NEET UG 2026', () => {
  const exam = parseExam('neet-ug-2026', fixture('neet-ug-2026'))

  it('splits into the three real subjects', () => {
    expect(exam.subjects.map((s) => s.id)).toEqual(['physics', 'chemistry', 'biology'])
  })

  it('lands on the ~50 units the bulletin describes', () => {
    const total = exam.subjects.reduce((n, s) => n + s.units.length, 0)
    expect(total).toBeGreaterThanOrEqual(45)
    expect(total).toBeLessThanOrEqual(55)
  })

  it('reads the first physics unit whole', () => {
    const first = exam.subjects[0].units[0]
    expect(first.number).toBe(1)
    expect(first.title).toBe('PHYSICS AND MEASUREMENT')
  })

  it('gives every unit the page it came from', () => {
    const noSource = exam.subjects.flatMap((s) => s.units).filter((u) => !(u.source?.page > 0))
    expect(noSource).toEqual([])
  })
})

describe('every unit is teachable, not a stray heading', () => {
  for (const name of ['jee-main-2026', 'neet-ug-2026']) {
    it(`${name}: no unit has an empty title, and none is a page artefact`, () => {
      const units = parseExam(name, fixture(name)).subjects.flatMap((s) => s.units)
      expect(units.length).toBeGreaterThan(0)
      for (const u of units) {
        expect(u.title.length).toBeGreaterThan(2)
        expect(u.title).not.toMatch(/^\d+$/)
        expect(u.title).not.toMatch(/^(page|annexure)\b/i)
      }
    })
  }
})

describe('the source manifest', () => {
  it('records a discovered URL and a digest for each exam it ships', () => {
    for (const [id, src] of Object.entries(EXAM_SOURCES)) {
      expect(src.url, `${id} has no url`).toMatch(/^https:\/\//)
      expect(src.sha256, `${id} has no digest`).toMatch(/^[0-9a-f]{64}$/)
      expect(src.discoveredFrom, `${id} does not say where the link was found`).toMatch(/^https:\/\//)
    }
  })
})
