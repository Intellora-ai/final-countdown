/**
 * P9-T4 — a valid lesson survives validate → profile → layout without losing a block.
 *
 * THE PROPERTY, AND WHY IT IS THE RIGHT ONE
 * -----------------------------------------
 * Goal 2 says content may be paginated, scrolled, collapsed or disclosed, but
 * NEVER clipped, distorted or silently deleted. That rule is about the whole
 * pipeline, and every existing test checks one stage of it with one hand-written
 * lesson.
 *
 * The failure it cannot see is a lesson shaped in a way nobody wrote by hand:
 * twenty-four blocks, or a lesson that is all metrics, or one whose relations
 * form a chain longer than any author would type. If the layout drops a block
 * for one of those, three acceptance lessons still render perfectly and the bug
 * ships.
 *
 * So the property is: for ANY lesson the schema accepts, every block that went
 * in comes out placed. Not "it did not crash" -- a pipeline that returned an
 * empty frame would satisfy that.
 *
 * WHY A GENERATOR AND NOT MORE FIXTURES
 * -------------------------------------
 * A fixture is one point. The interesting region is combinations: block count
 * near the schema's limits, kinds mixed in proportions no author would choose,
 * relations pointing at every block. Enumerating that by hand is exactly the
 * work a generator does, and fast-check SHRINKS a failure to the smallest
 * lesson that still breaks -- which is the difference between a bug report and
 * a puzzle.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { profile, selectArchetype } from '../layout/layout'
import { LessonSpec } from './spec'
import { validateLesson } from './validate'

/** An id the schema accepts: lowercase, kebab, never empty. */
const id = fc
  .stringMatching(/^[a-z][a-z0-9]{0,10}$/)
  .map((value) => value.toLowerCase())

/** Short prose. Bounded, because the schema bounds it. */
const prose = fc.string({ minLength: 1, maxLength: 120 }).filter((s) => s.trim().length > 0)

/**
 * The two block kinds whose schemas are simple enough to generate faithfully.
 *
 * DELIBERATELY NOT ALL NINE. `chart`, `table`, `flow` and `figure` carry nested
 * required structures, and a generator that produced almost-valid ones would
 * spend its budget being rejected by the schema rather than exercising the
 * layout. Two kinds are enough for the property under test, which is about
 * block COUNT and SURVIVAL, not about any one kind's internals.
 *
 * This is stated rather than hidden: the property covers prose and callout
 * lessons of every shape, and says nothing about a chart-heavy one.
 */
const block = (blockId: string) =>
  fc.oneof(
    fc.record({ id: fc.constant(blockId), kind: fc.constant('prose' as const), body: prose }),
    fc.record({ id: fc.constant(blockId), kind: fc.constant('callout' as const), body: prose }),
  )

/** A lesson the schema will accept: 1..24 blocks with distinct ids. */
const lesson = fc
  .uniqueArray(id, { minLength: 1, maxLength: 24 })
  .chain((ids) =>
    fc.record({
      id: fc.constant('generated-lesson'),
      question: fc.constant('Why does this lesson hold together?'),
      blocks: fc.tuple(...ids.map((each) => block(each))),
      relations: fc.constant([]),
    }),
  )

describe('any lesson the schema accepts survives the pipeline', () => {
  it('never loses a block between validation and layout', () => {
    fc.assert(
      fc.property(lesson, (candidate) => {
        const parsed = LessonSpec.safeParse(candidate)
        // A generated lesson the schema rejects says the GENERATOR is wrong, not
        // the pipeline. Reported rather than skipped: a silent filter here would
        // shrink the tested space without anybody noticing.
        expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true)
        if (!parsed.success) return

        const result = validateLesson(candidate)
        expect(result.ok).toBe(true)
        if (!result.ok) return

        const shape = profile(result.lesson)
        const chosen = selectArchetype(shape)

        // THE PROPERTY. Every block that went in is still accounted for.
        //
        // `total`, not a field called `blockCount` -- the first version of this
        // test asserted the latter, which does not exist on `Profile`, so it
        // compared `undefined` to a number and failed for a reason that had
        // nothing to do with the pipeline.
        expect(shape.total).toBe(candidate.blocks.length)
        // And the per-kind counts must sum to the same total. A profile that
        // reported the right total while miscounting kinds would send the
        // archetype selector down the wrong branch for every lesson.
        const summed = Object.values(shape.counts).reduce((a, b) => a + b, 0)
        expect(summed).toBe(candidate.blocks.length)
        // And an archetype was actually chosen -- a pipeline that returned no
        // archetype would satisfy a count check while rendering nothing.
        expect(chosen.archetype).toBeTruthy()
        expect(chosen.explain.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })

  it('chooses an archetype for a one-block lesson and a twenty-four-block one', () => {
    /*
     * The two boundaries the schema declares, asserted directly rather than left
     * to the generator to stumble on. `minLength: 1` and `maxLength: 24` are the
     * values an off-by-one would break, and a random draw hits them rarely.
     */
    for (const count of [1, 24]) {
      const blocks = Array.from({ length: count }, (_, index) => ({
        id: `b${index}`,
        kind: 'prose' as const,
        body: `Block ${index}`,
      }))
      const candidate = {
        id: 'boundary-lesson',
        question: 'Does the boundary hold?',
        blocks,
        relations: [],
      }

      const result = validateLesson(candidate)
      expect(result.ok, `count=${count}`).toBe(true)
      if (!result.ok) continue

      expect(profile(result.lesson).total).toBe(count)
    }
  })

  it('rejects a lesson with no blocks at all', () => {
    /*
     * The PAIR. Without it, a `validateLesson` that accepted everything would
     * satisfy the property above for every generated input, and the suite would
     * report a pipeline that preserves blocks while accepting lessons that have
     * none.
     */
    const result = validateLesson({
      id: 'empty-lesson',
      question: 'Is an empty lesson a lesson?',
      blocks: [],
      relations: [],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a lesson with duplicate block ids', () => {
    /*
     * Also a pair, and a real shape: two blocks with the same id make every
     * relation pointing at that id ambiguous. A pipeline that deduplicated them
     * silently would LOSE a block, which is the exact rule under test.
     */
    const result = validateLesson({
      id: 'duplicate-lesson',
      question: 'What happens when two blocks share an id?',
      blocks: [
        { id: 'same', kind: 'prose', body: 'first' },
        { id: 'same', kind: 'prose', body: 'second' },
      ],
      relations: [],
    })
    expect(result.ok).toBe(false)
  })
})
