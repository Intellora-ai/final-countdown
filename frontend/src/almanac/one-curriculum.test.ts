// @vitest-environment jsdom
/* The dashboard and the planner describe the SAME subjects.
 *
 * THE REGRESSION THIS GUARDS
 *   Setup now stores the planner's subject ids. The sidebar, the chapter
 *   browser and the store's own planner used to filter `data/curriculum.ts` by
 *   those ids -- and for class 9 the two lists share exactly ONE id out of
 *   nine. Every one of those screens would have shown a student one subject out
 *   of the nine they chose, with nothing saying why.
 *
 *   Measured before the fix:
 *     old     mathematics physics chemistry biology
 *     planned mathematics science social-science english-… (9)
 *     overlap mathematics
 */

import { beforeEach, describe, expect, it } from 'vitest'
import CURRICULUM from '../data/curriculum'
import { selectableSubjects } from '../components/SetupFlow'
import {
  primePlannedCurriculum,
  plannedSubjects,
  resetPlannedCurriculum,
} from './plannedCurriculum'

beforeEach(() => {
  resetPlannedCurriculum()
})

describe('what setup offers is what every screen can then show', () => {
  it('has classes to check, so this file is not vacuous', () => {
    expect(CURRICULUM.classes.length).toBeGreaterThan(0)
  })

  it('finds EVERY subject a student could have chosen', async () => {
    /* The exact failure, inverted into a check: for each class, take what setup
     * offers, and require the screens' curriculum to contain all of it. */
    for (const cls of CURRICULUM.classes) {
      const offered = await selectableSubjects(cls)
      await primePlannedCurriculum(cls)
      const shown = new Set(plannedSubjects(cls).map((s) => s.id))

      expect(offered.length, `setup offers nothing for ${cls}`).toBeGreaterThan(0)
      for (const subject of offered) {
        expect(
          shown.has(subject.id),
          `a student can choose "${subject.id}" in ${cls} and no screen can show it`,
        ).toBe(true)
      }
    }
  })

  it('would have caught the old mismatch', async () => {
    /* Proof that the check above is not vacuously satisfiable: the OLD
     * curriculum genuinely fails it, so the assertion has teeth. */
    const offered = await selectableSubjects('Class 9')
    const old = new Set(CURRICULUM.subjectsFor('Class 9', null).map((s: { id: string }) => s.id))
    const missing = offered.filter((s) => !old.has(s.id))

    expect(missing.length, 'the old curriculum now matches, so this test proves nothing').toBeGreaterThan(0)
  })

  it('gives every chosen subject real chapters to study', async () => {
    await primePlannedCurriculum('Class 9')
    for (const subject of plannedSubjects('Class 9')) {
      expect(subject.chapters.length, subject.id).toBeGreaterThan(0)
      const concepts = subject.chapters.flatMap((c) => c.concepts)
      expect(concepts.length, subject.id).toBeGreaterThan(0)
    }
  })
})
