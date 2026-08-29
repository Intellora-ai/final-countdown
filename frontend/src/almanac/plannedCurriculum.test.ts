/* One curriculum for the whole product.
 *
 * WHY THIS EXISTS
 *   The dashboard read `data/curriculum.ts`; Almanac plans from the generated
 *   CBSE data. Measured, for class 9, the two share exactly ONE subject id:
 *
 *     old     mathematics physics chemistry biology
 *     planned mathematics science social-science english-… (9)
 *     overlap mathematics
 *
 *   So once setup started storing the planner's ids, the sidebar and the
 *   chapter browser -- which filter the OLD list by those ids -- would have
 *   found one subject out of nine and shown a nearly empty screen.
 *
 * WHY A SYNCHRONOUS READER OVER A LAZY LOAD
 *   The generated classes are ~100k lines and load as one chunk per class, but
 *   the sidebar, the chapter view and the store's planner all read the
 *   curriculum during render. So it is primed once, when the student's class is
 *   known, and read synchronously afterwards.
 *
 *   Before priming it returns EMPTY rather than the old list. Falling back to
 *   the wrong curriculum is how two sources of truth survive: the screen looks
 *   populated and is quietly describing a different syllabus.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  primePlannedCurriculum,
  plannedSubjects,
  isPlannedCurriculumReady,
  resetPlannedCurriculum,
} from './plannedCurriculum'

beforeEach(() => {
  resetPlannedCurriculum()
})

describe('before it is primed', () => {
  it('reports that it is not ready', () => {
    expect(isPlannedCurriculumReady('Class 9')).toBe(false)
  })

  it('returns nothing rather than a different curriculum', () => {
    /* An empty sidebar is a visible problem. A sidebar full of the wrong
     * subjects is an invisible one. */
    expect(plannedSubjects('Class 9')).toEqual([])
  })
})

describe('once primed', () => {
  it('reads synchronously, which is what the render path needs', async () => {
    await primePlannedCurriculum('Class 9')

    expect(isPlannedCurriculumReady('Class 9')).toBe(true)
    const subjects = plannedSubjects('Class 9')
    expect(subjects.length).toBeGreaterThan(4)
    expect(subjects.map((s) => s.id)).toContain('science')
  })

  it('gives the shape the dashboard already renders', async () => {
    await primePlannedCurriculum('Class 9')
    for (const subject of plannedSubjects('Class 9')) {
      expect(typeof subject.name).toBe('string')
      expect(Array.isArray(subject.chapters)).toBe(true)
      for (const chapter of subject.chapters) {
        expect(typeof chapter.name).toBe('string')
        expect(Array.isArray(chapter.concepts)).toBe(true)
      }
    }
  })

  it('keeps classes apart', async () => {
    await primePlannedCurriculum('Class 9')
    await primePlannedCurriculum('Class 12')

    expect(plannedSubjects('Class 9').length).toBeGreaterThan(0)
    expect(plannedSubjects('Class 12').length).toBeGreaterThan(0)
    expect(plannedSubjects('Class 9')[0]?.chapters[0]?.concepts[0]?.id)
      .not.toBe(plannedSubjects('Class 12')[0]?.chapters[0]?.concepts[0]?.id)
  })

  it('does not answer for a class it was never primed with', async () => {
    await primePlannedCurriculum('Class 9')
    expect(plannedSubjects('Class 10')).toEqual([])
  })

  it('primes only once per class, however often it is asked', async () => {
    await primePlannedCurriculum('Class 9')
    const first = plannedSubjects('Class 9')
    await primePlannedCurriculum('Class 9')
    /* Same array instance: re-priming must not rebuild it, or every render
     * that reads it would see a new object and re-render forever. */
    expect(plannedSubjects('Class 9')).toBe(first)
  })
})

describe('a class it cannot plan', () => {
  it('primes to nothing rather than throwing at a student', async () => {
    await expect(primePlannedCurriculum('Class 8')).resolves.toBeUndefined()
    expect(plannedSubjects('Class 8')).toEqual([])
    expect(isPlannedCurriculumReady('Class 8')).toBe(false)
  })

  it('handles a missing class the same way', async () => {
    await primePlannedCurriculum(null)
    expect(plannedSubjects(null)).toEqual([])
  })
})
