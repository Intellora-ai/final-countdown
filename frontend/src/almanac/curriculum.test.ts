/* The browser's copy of the curriculum Almanac plans from.
 *
 * WHY THIS FILE HAD TO EXIST
 *   Almanac plans from the generated CBSE data in `src/data/curriculum/`.
 *   The dashboard reads `src/data/curriculum.ts`, which is the older
 *   hand-written module. Measured: the generated class 9 has 9 subjects
 *   including `science` and `social-science`; the hand-written one has four,
 *   `mathematics physics chemistry biology`. CBSE class 9 has no separate
 *   physics subject at all.
 *
 *   So the planner was naming concepts the dashboard had never heard of, and
 *   every row would have rendered "Unknown (...)". Names have to come from the
 *   SAME curriculum the plan was built from, or they are not names of it.
 *
 * WHY IT LOADS LAZILY
 *   The four generated classes are ~100k lines. Importing them into the main
 *   bundle would put every class in front of every student to name a handful
 *   of rows. One dynamic import per class is one chunk, fetched only for the
 *   class that student is in -- the same shape the server's loader uses.
 */

import { describe, expect, it } from 'vitest'
import { loadPlannedSubjects, SUPPORTED_CLASSES } from './curriculum'

describe('loading the curriculum Almanac plans from', () => {
  it('returns the generated CBSE subjects, not the hand-written four', async () => {
    const subjects = await loadPlannedSubjects('9')
    const ids = subjects.map((s) => s.id)

    expect(ids).toContain('science')
    expect(ids.length).toBeGreaterThan(4)
    /* The hand-written module's class 9 lists a `physics` subject. CBSE's does
     * not. Finding one here would mean the old module is still being read. */
    expect(ids).not.toContain('physics')
  })

  it('gives every concept a name, which is the entire point', async () => {
    const subjects = await loadPlannedSubjects('9')
    const concepts = subjects.flatMap((s) => s.chapters.flatMap((c) => c.concepts))

    expect(concepts.length).toBeGreaterThan(100)
    expect(concepts.every((c) => typeof c.name === 'string' && c.name.length > 0)).toBe(true)
    expect(concepts.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true)
  })

  it('loads each supported class, and they are genuinely different', async () => {
    const nine = await loadPlannedSubjects('9')
    const twelve = await loadPlannedSubjects('12')

    expect(nine.length).toBeGreaterThan(0)
    expect(twelve.length).toBeGreaterThan(0)
    /* Classes 11 and 12 shipped byte-identical once, from one combined XI-XII
     * document filed under both. Cheap to check, expensive to miss. */
    const first = (s: Awaited<ReturnType<typeof loadPlannedSubjects>>) =>
      s.flatMap((x) => x.chapters.flatMap((c) => c.concepts)).map((c) => c.id).slice(0, 20)
    expect(first(nine)).not.toEqual(first(twelve))
  })

  it('answers an unsupported class with nothing, not a crash', async () => {
    /* A student record can hold anything a past version of setup wrote. */
    for (const cls of ['8', '13', '', 'Class 9', null]) {
      expect(await loadPlannedSubjects(cls), `class ${JSON.stringify(cls)}`).toEqual([])
    }
  })

  it('names the classes it supports, and they are the four that exist', () => {
    expect([...SUPPORTED_CLASSES]).toEqual(['9', '10', '11', '12'])
  })
})
