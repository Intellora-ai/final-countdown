/* Tests for the curriculum loader.
 *
 * DESIRED OUTCOME
 *   The server can turn "class 10, maths and science" into the real concepts
 *   built from the official documents in Phase 0.
 *
 * WHAT MUST BE TRUE
 *   1. Every class the app offers can be loaded.
 *   2. A subject id the student does not have is ignored, not guessed at.
 *   3. A class that does not exist is refused, not silently empty — those two
 *      look identical downstream and mean completely different things.
 */

import { describe, expect, it } from 'vitest'

import { loadClass, subjectsFor, SUPPORTED_CLASSES } from './curriculum.ts'

describe('loadClass', () => {
  it('supports classes 9, 10, 11 and 12', () => {
    expect([...SUPPORTED_CLASSES].sort()).toEqual([10, 11, 12, 9])
  })

  it('loads real subjects for every supported class', async () => {
    for (const cls of SUPPORTED_CLASSES) {
      const subjects = await loadClass(cls)
      expect(subjects.length, `class ${cls}`).toBeGreaterThan(0)
    }
  })

  it('loads subjects that actually contain concepts', async () => {
    const subjects = await loadClass(10)
    const concepts = subjects.flatMap((s) => s.chapters.flatMap((c) => c.concepts))
    expect(concepts.length).toBeGreaterThan(100)
  })

  it('gives every concept minutes inside the planner’s band', async () => {
    const subjects = await loadClass(10)
    for (const subject of subjects) {
      for (const chapter of subject.chapters) {
        for (const concept of chapter.concepts) {
          expect(concept.minutes, concept.id).toBeGreaterThanOrEqual(10)
          expect(concept.minutes, concept.id).toBeLessThanOrEqual(25)
        }
      }
    }
  })

  it('refuses a class that does not exist rather than returning nothing', async () => {
    /* An empty list and an unknown class look identical to a planner and mean
     * completely different things: "you have finished everything" versus
     * "your class was not recognised". */
    await expect(loadClass(7 as 9)).rejects.toThrow(/class/i)
  })
})

describe('subjectsFor', () => {
  it('returns only the subjects the student chose', async () => {
    const all = await loadClass(10)
    const first = all[0].id
    expect((await subjectsFor(10, [first])).map((s) => s.id)).toEqual([first])
  })

  it('ignores a subject id the class does not have', async () => {
    const all = await loadClass(10)
    const chosen = await subjectsFor(10, [all[0].id, 'not-a-real-subject'])
    expect(chosen.map((s) => s.id)).toEqual([all[0].id])
  })

  it('returns nothing when no chosen subject matches', async () => {
    expect(await subjectsFor(10, ['nope'])).toEqual([])
  })

  it('does not duplicate a subject listed twice', async () => {
    const all = await loadClass(10)
    const chosen = await subjectsFor(10, [all[0].id, all[0].id])
    expect(chosen).toHaveLength(1)
  })
})
