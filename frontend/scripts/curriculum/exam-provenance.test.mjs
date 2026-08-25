/* Gates the SHIPPED exam data, not a fixture.
 *
 * A parser test proves the parser works on the text it was given. This proves
 * the files the product would actually load are sound -- which is a different
 * claim, and the only one a student is affected by.
 */

import { describe, expect, it } from 'vitest'
import { jee_main_2026 } from '../../src/data/exams/jee-main-2026'
import { neet_ug_2026 } from '../../src/data/exams/neet-ug-2026'

const EXAMS = [jee_main_2026, neet_ug_2026]

describe('shipped entrance-exam syllabi', () => {
  it('ships both exams with units in them', () => {
    // Evidence first: every check below is vacuous over an empty array.
    expect(EXAMS.map((e) => e.id)).toEqual(['jee-main-2026', 'neet-ug-2026'])
    for (const exam of EXAMS) {
      expect(exam.subjects.reduce((n, s) => n + s.units.length, 0)).toBeGreaterThan(40)
    }
  })

  for (const exam of EXAMS) {
    describe(exam.id, () => {
      const units = exam.subjects.flatMap((s) => s.units)

      it('names the page every unit came from', () => {
        const orphans = units.filter((u) => !u.source?.pdf || !(u.source.page > 0))
        expect(orphans.map((u) => u.title)).toEqual([])
      })

      it('records where the download link was discovered, not just the link', () => {
        /* The URL alone is what made this look blocked for a day: a guessed
         * link 404s exactly like a withdrawn document. The page it was read
         * off is what lets the next run re-find it. */
        expect(exam.source.discoveredFrom).toMatch(/^https:\/\/[^/]+\.(nic\.in|ac\.in|org\.in)\//)
        expect(exam.source.sha256).toMatch(/^[0-9a-f]{64}$/)
      })

      it('has no empty or duplicated unit titles within a subject', () => {
        for (const subject of exam.subjects) {
          const titles = subject.units.map((u) => u.title)
          expect(titles.filter((t) => t.trim().length < 3)).toEqual([])
          expect(new Set(titles).size, `${subject.id} has duplicate unit titles`).toBe(titles.length)
        }
      })

      it('keeps unit numbers ascending inside each subject', () => {
        /* Ascending, but NOT contiguous: JEE Chemistry legitimately skips 15.
         * Requiring contiguity would force the parser to invent a unit. */
        for (const subject of exam.subjects) {
          const ns = subject.units.map((u) => u.number)
          expect(ns, `${subject.id} unit numbers are out of order`).toEqual([...ns].sort((a, b) => a - b))
        }
      })

      it('is not padded with page furniture masquerading as a unit', () => {
        const junk = units.filter((u) =>
          /^(page|annexure|contents|note)\b/i.test(u.title) || /^\d+$/.test(u.title))
        expect(junk.map((u) => u.title)).toEqual([])
      })
    })
  }
})
