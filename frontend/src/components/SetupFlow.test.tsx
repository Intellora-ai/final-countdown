// @vitest-environment jsdom
/* Setup must offer the subjects Almanac can actually plan.
 *
 * THE DEFECT
 *   Setup listed `mathematics physics chemistry biology` for class 9. CBSE's
 *   class 9 has no separate physics subject -- it has `science`, plus
 *   `social-science`, `english-language-and-literature` and five more.
 *
 *   A student who chose "physics" therefore chose something the planner has
 *   never heard of. `/api/day` filters to subjects it knows, so their day was
 *   built from whatever happened to overlap -- `mathematics` alone -- and
 *   nothing anywhere said why.
 *
 * THE CHECK THAT MATTERS
 *   Every option this screen offers must be plannable. It is asserted against
 *   the planner's own curriculum rather than a list written here, because a
 *   list written here is the same mistake one level up.
 */

import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import CURRICULUM from '../data/curriculum'
import { loadPlannedSubjects } from '../almanac/curriculum'
import { selectableSubjects } from './SetupFlow'

describe('the subjects setup offers', () => {
  it('has classes to check, so this file is not vacuous', () => {
    expect(CURRICULUM.classes.length).toBeGreaterThan(0)
  })

  it('offers something for every class the screen lists', async () => {
    for (const cls of CURRICULUM.classes) {
      const offered = await selectableSubjects(cls)
      expect(offered.length, `no subjects offered for ${cls}`).toBeGreaterThan(0)
    }
  })

  it('offers ONLY subjects the planner can build a day from', async () => {
    /* The whole defect in one assertion. */
    for (const cls of CURRICULUM.classes) {
      const plannable = new Set((await loadPlannedSubjects(cls)).map((s) => s.id))
      for (const subject of await selectableSubjects(cls)) {
        expect(
          plannable.has(subject.id),
          `${cls} offers "${subject.id}", which Almanac cannot plan`,
        ).toBe(true)
      }
    }
  })

  it('offers the subjects CBSE actually has, not the invented four', async () => {
    const nine = (await selectableSubjects('Class 9')).map((s) => s.id)

    expect(nine).toContain('science')
    expect(nine, 'CBSE class 9 has no separate physics subject').not.toContain('physics')
    expect(nine.length).toBeGreaterThan(4)
  })

  it('gives every option a readable name, not an id', async () => {
    /* A student picking "english-language-and-literature" from a list of slugs
     * is reading a database, not choosing a subject. */
    for (const subject of await selectableSubjects('Class 9')) {
      expect(subject.name.length, subject.id).toBeGreaterThan(2)
      expect(subject.name, subject.id).not.toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('offers nothing for a class it cannot plan, rather than guessing', async () => {
    expect(await selectableSubjects('Class 8')).toEqual([])
    expect(await selectableSubjects(null)).toEqual([])
  })
})

describe('what a student sees beside each subject', () => {
  it('says how many chapters it has, so the size is visible before choosing', async () => {
    const offered = await selectableSubjects('Class 9')
    expect(offered.length).toBeGreaterThan(0)
    for (const subject of offered) {
      expect(subject.chapters, subject.id).toBeGreaterThan(0)
    }
  })
})
