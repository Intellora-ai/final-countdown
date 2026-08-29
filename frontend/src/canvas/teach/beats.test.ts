import { describe, expect, it } from 'vitest'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { classifierEvaluation } from '../lessons/classifierEvaluation'
import { gasPressure } from '../lessons/gasPressure'
import type { Lesson, LessonInput } from '../spec/spec'
import { validateLesson, type TeachingLevel } from '../spec/validate'
import { checkBeats, type Beat, type Beats } from './contract'
import { deriveBeats } from './beats'

/**
 * One beat, by position, with a failure message worth reading.
 *
 * `beatAt(beats, 0).checkpoint` does not compile under `noUncheckedIndexedAccess`, and
 * the two usual escapes are both worse than this. A `!` silences the compiler
 * and, on the day the cut genuinely returns nothing, fails with
 * "Cannot read properties of undefined (reading 'checkpoint')" — which names
 * the property and hides the fact that NO BEATS WERE PRODUCED, the actual
 * defect. Turning the flag off for tests would hide the same class of thing
 * everywhere else in this directory.
 */
function beatAt(beats: Beats, index: number): Beat {
  const beat = beats[index]
  if (beat === undefined) {
    throw new Error(`no beat at index ${index} — the lesson was cut into ${beats.length}`)
  }
  return beat
}

/**
 * The cut, held to the contract.
 *
 * The regression this file is really guarding against is not a crash. It is a
 * `deriveBeats` that quietly returns one beat containing the whole lesson: the
 * view would render, nothing would throw, every block would be present, and the
 * feature would be gone. Several assertions below exist only to make that
 * outcome loud.
 */

/**
 * @param teaching The three real lessons are checked at `'lesson'` — they ARE
 * lessons, and this file should notice if one stops teaching. The edge-case
 * fixtures built by `lessonOf` below are checked at `'off'`: they are N blocks
 * of one emphasis, built to probe WHERE THE CUT FALLS, and a lesson arc would
 * change the very thing under test. Structure is still fully checked in both.
 */
function validated(input: LessonInput, teaching: TeachingLevel = 'lesson'): Lesson {
  const result = validateLesson(input, { teaching })
  if (!result.ok) throw new Error(`fixture is invalid: ${JSON.stringify(result.issues, null, 1)}`)
  return result.lesson
}

const LESSONS = [
  { name: 'gas pressure', lesson: validated(gasPressure) },
  { name: 'bill becomes law', lesson: validated(billBecomesLaw) },
  { name: 'classifier evaluation', lesson: validated(classifierEvaluation) },
] as const

/* The same rule `checkBeats` enforces, restated so this file fails on its own
   terms rather than only through the contract. */
const READS_AS_A_COUNT = /\b(step|part)\s*\d|\b\d+\s*(of|\/)\s*\d/i

/* -------------------------------------------------------------------------- */
/* Fixtures for the edges                                                     */
/* -------------------------------------------------------------------------- */

type Emphasis = 'primary' | 'supporting' | 'aside'

/** A prose block, the cheapest thing that can carry an emphasis and a title. */
function say(id: string, emphasis: Emphasis, title?: string): LessonInput['blocks'][number] {
  return { id, kind: 'prose', emphasis, title, body: `The body of ${id}.` }
}

/**
 * Edge-case lessons go through the real validator.
 *
 * A hand-cast object would let a fixture carry a shape the engine can never
 * actually receive, and the test would then be pinning behaviour that cannot
 * occur. If one of these fails to validate, the fixture is wrong, not the gate.
 */
function lessonOf(
  blocks: LessonInput['blocks'],
  relations: LessonInput['relations'] = [],
): Lesson {
  return validated({ id: 'edge-case', question: 'Does the cut hold here?', blocks, relations }, 'off')
}

/* -------------------------------------------------------------------------- */
/* The three real lessons                                                     */
/* -------------------------------------------------------------------------- */

describe('the real lessons cut cleanly', () => {
  for (const { name, lesson } of LESSONS) {
    it(`${name} produces beats the contract accepts`, () => {
      const beats = deriveBeats(lesson)
      const issues = checkBeats(beats, lesson)
      expect(issues, JSON.stringify(issues, null, 1)).toHaveLength(0)
    })

    it(`${name} is partitioned, not sampled`, () => {
      const beats = deriveBeats(lesson)
      const flat = beats.flatMap((beat) => [...beat.blockIds])
      expect(flat).toEqual(lesson.blocks.map((block) => block.id))
    })

    it(`${name} is taught in more than one beat`, () => {
      /*
       * The silent failure. A single beat holding every block passes every
       * other assertion in this file — it is a partition, it is contiguous, it
       * has exactly one last beat — and it is a lecture.
       */
      const beats = deriveBeats(lesson)
      expect(beats.length).toBeGreaterThan(1)
      expect(beatAt(beats, 0).blockIds.length).toBeLessThan(lesson.blocks.length)
    })

    it(`${name} marks exactly one last beat, at the end`, () => {
      const beats = deriveBeats(lesson)
      expect(beats.filter((beat) => beat.isLast)).toHaveLength(1)
      expect(beatAt(beats, beats.length - 1).isLast).toBe(true)
    })

    it(`${name} never tells the learner a number`, () => {
      for (const beat of deriveBeats(lesson)) {
        expect(READS_AS_A_COUNT.test(beat.checkpoint), beat.checkpoint).toBe(false)
        expect(beat.checkpoint.trim().length).toBeGreaterThan(0)
      }
    })

    it(`${name} derives the same beats every time`, () => {
      const once = deriveBeats(lesson)
      const twice = deriveBeats(lesson)
      expect(twice).toEqual(once)
      expect(twice).not.toBe(once)
    })

    it(`${name} identifies each beat by its lead block`, () => {
      const beats = deriveBeats(lesson)
      for (const beat of beats) expect(beat.id).toBe(beat.blockIds[0])
      expect(new Set(beats.map((beat) => beat.id)).size).toBe(beats.length)
    })

    it(`${name} does not ask the same question twice`, () => {
      /*
       * Not a universal law — two beats whose lead blocks share a kind and a
       * tone, followed by beats with the same titles, would legitimately read
       * alike. It is a claim about THESE lessons, and it is the assertion that
       * fails if the phrasing collapses back to one constant string.
       */
      const asked = deriveBeats(lesson).map((beat) => beat.checkpoint)
      expect(new Set(asked).size).toBe(asked.length)
    })
  }
})

describe('a checkpoint names what is coming', () => {
  it('uses the next beat lead block title', () => {
    const beats = deriveBeats(validated(gasPressure))
    // The block after the simulation beat is the causal chain, titled
    // "What actually happens".
    expect(beatAt(beats, 0).checkpoint).toContain('Next: what actually happens.')
  })

  it('keeps an acronym in a title intact', () => {
    // Lowercasing a title unconditionally would produce "rOC, and why ...".
    const beats = deriveBeats(validated(classifierEvaluation))
    const naming = beats.map((beat) => beat.checkpoint).join(' | ')
    expect(naming).not.toContain('rOC')
  })

  it('asks the last beat what is unclear, not whether to continue', () => {
    for (const { lesson } of LESSONS) {
      const beats = deriveBeats(lesson)
      const last = beatAt(beats, beats.length - 1)
      expect(last.checkpoint).not.toContain('Next:')
      expect(last.checkpoint.toLowerCase()).toMatch(/unclear|cleared up|adding up/)
    }
  })
})

describe('the cut follows emphasis', () => {
  it('cuts gas pressure where the primary blocks are', () => {
    /*
     * Written out rather than summarised, because the whole rule is visible in
     * it: three primary blocks lead beats of their own, `ideal-gas-law` joins
     * the equation it derives from, and the six-block tail after the chart is
     * broken by the cap instead of being handed over in one go.
     */
    expect(deriveBeats(validated(gasPressure)).map((beat) => [...beat.blockIds])).toEqual([
      ['what-pressure-is', 'the-whole-idea', 'particle-model'],
      ['causal-chain', 'proportionality', 'ideal-gas-law'],
      [
        'pressure-vs-temperature',
        'what-changes',
        'energy-split',
        'misconception',
        'result',
        'wall-collisions',
        'keep-this',
      ],
    ])
  })

  it('gives a primary block the supporting blocks that follow it', () => {
    const lesson = lessonOf([
      say('claim', 'primary', 'The claim'),
      say('evidence', 'supporting'),
      say('next-claim', 'primary', 'The next claim'),
    ])
    expect(deriveBeats(lesson).map((beat) => [...beat.blockIds])).toEqual([
      ['claim', 'evidence'],
      ['next-claim'],
    ])
  })
})

/* -------------------------------------------------------------------------- */
/* The edges                                                                  */
/* -------------------------------------------------------------------------- */

describe('a lesson that does not open on a primary block', () => {
  it('makes the run before the first primary a beat of its own', () => {
    const lesson = lessonOf([
      say('scene-one', 'supporting', 'Setting the scene'),
      say('scene-two', 'supporting'),
      say('the-claim', 'primary', 'The claim'),
      say('evidence', 'supporting'),
    ])

    const beats = deriveBeats(lesson)
    expect(beats.map((beat) => [...beat.blockIds])).toEqual([
      ['scene-one', 'scene-two'],
      ['the-claim', 'evidence'],
    ])
    expect(beatAt(beats, 0).id).toBe('scene-one')
    /* Structural beat rules only. These fixtures are runs of `say()` blocks
       built to probe WHERE THE CUT FALLS; none contains a representation, so
       "every beat shows something" could never pass and would say nothing
       about the cut. The partition, the ordering and the no-step-counting
       rules all still run, which is what these tests are actually about.
       The three real lessons above are checked with it ON. */
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })
})

describe('a lesson with no primary block at all', () => {
  it('still cuts, rather than handing over everything at once', () => {
    /*
     * `emphasis` defaults to `supporting`, so a lesson written without thinking
     * about emphasis lands here. Left to the emphasis rule alone it would be a
     * single beat containing the lesson.
     */
    /* SEVEN blocks, not five. With the cap at five a five-block fixture is one
       beat, and this test — whose whole name is "still cuts" — would have
       passed only because the assertion was rewritten to match. Seven keeps
       the cut being exercised, which is the thing under test. */
    const lesson = lessonOf([
      say('one', 'supporting', 'First thing'),
      say('two', 'supporting'),
      say('three', 'supporting'),
      say('four', 'supporting'),
      say('five', 'supporting'),
      say('six', 'supporting', 'Sixth thing'),
      say('seven', 'supporting'),
    ])

    const beats = deriveBeats(lesson)
    expect(beats.map((beat) => [...beat.blockIds])).toEqual([
      ['one', 'two', 'three', 'four', 'five'],
      ['six', 'seven'],
    ])
    expect(beatAt(beats, 0).checkpoint).toContain('Next: sixth thing.')
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })
})

describe('a single-block lesson', () => {
  it('is one beat, and that beat is the last one', () => {
    const lesson = lessonOf([say('only', 'primary', 'The only thing')])
    const beats = deriveBeats(lesson)

    expect(beats).toHaveLength(1)
    expect([...beatAt(beats, 0).blockIds]).toEqual(['only'])
    expect(beatAt(beats, 0).isLast).toBe(true)
    expect(beatAt(beats, 0).checkpoint).not.toContain('Next:')
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })
})

describe('a block that derives from the beat it follows', () => {
  it('joins that beat instead of starting a new one', () => {
    const blocks = [
      say('premise', 'primary', 'The premise'),
      say('working', 'supporting'),
      say('conclusion', 'primary', 'The conclusion'),
    ]

    /* Without the relation the conclusion leads its own beat — which is the
       control that proves the relation is what moved it. */
    expect(deriveBeats(lessonOf(blocks)).map((beat) => [...beat.blockIds])).toEqual([
      ['premise', 'working'],
      ['conclusion'],
    ])

    const lesson = lessonOf(blocks, [
      { from: 'conclusion', to: 'premise', kind: 'derives' },
    ])
    const beats = deriveBeats(lesson)
    expect(beats.map((beat) => [...beat.blockIds])).toEqual([
      ['premise', 'working', 'conclusion'],
    ])
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })

  it('does not reach back past the current beat', () => {
    /*
     * `blockIds` must stay contiguous, so a derivation whose source is several
     * beats back cannot pull it in without scattering the slice. Classifier
     * evaluation has exactly this shape: `takeaway` derives from `confusion`
     * with three blocks between them.
     */
    /* The two supporting blocks are load-bearing. A beat may no longer end
       before it holds two blocks, so with three bare primaries `source` was
       still inside the beat under construction when `derived` arrived — it
       joined for the RIGHT reason, and the fixture no longer built the case it
       is named for. These push `source` into a beat that has closed. */
    const lesson = lessonOf(
      [
        say('source', 'primary', 'The source'),
        say('source-detail', 'supporting'),
        say('elsewhere', 'primary', 'Somewhere else'),
        say('elsewhere-detail', 'supporting'),
        say('derived', 'primary', 'The derived claim'),
      ],
      [{ from: 'derived', to: 'source', kind: 'derives' }],
    )

    const beats = deriveBeats(lesson)
    expect(beats.map((beat) => [...beat.blockIds])).toEqual([
      ['source', 'source-detail'],
      ['elsewhere', 'elsewhere-detail'],
      ['derived'],
    ])
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })

  it('is still bound by the cap', () => {
    const lesson = lessonOf(
      [
        say('premise', 'primary', 'The premise'),
        say('a', 'supporting'),
        say('b', 'supporting'),
        say('c', 'supporting'),
        say('d', 'supporting'),
        say('conclusion', 'primary', 'The conclusion'),
      ],
      [{ from: 'conclusion', to: 'premise', kind: 'derives' }],
    )

    /* SIX blocks, because four of them fit inside a cap of five and the cap
       would never have been reached — the test would have gone green while
       proving nothing about the cap it names. */
    expect(deriveBeats(lesson).map((beat) => [...beat.blockIds])).toEqual([
      ['premise', 'a', 'b', 'c', 'd'],
      ['conclusion'],
    ])
  })
})

describe('a beat that would swallow the lesson', () => {
  it('is broken up rather than handed over whole', () => {
    const lesson = lessonOf([
      say('lead', 'primary', 'The lead'),
      say('s-one', 'supporting'),
      say('s-two', 'supporting'),
      say('s-three', 'supporting', 'Halfway'),
      say('s-four', 'supporting'),
      say('s-five', 'supporting'),
      say('s-six', 'supporting', 'The rest'),
      say('s-seven', 'supporting'),
      say('s-eight', 'supporting'),
    ])

    const beats = deriveBeats(lesson)
    /* Two, not three, and five, not three: the cap moved from 3 to 5 in this
       change. The property is unchanged and is the reason the test exists —
       nine blocks are broken up rather than handed over as one beat, and no
       beat exceeds the ceiling. */
    expect(beats).toHaveLength(2)
    for (const beat of beats) expect(beat.blockIds.length).toBeLessThanOrEqual(5)
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })
})

describe('a title that reads as a count', () => {
  it('is dropped rather than repeated to the learner', () => {
    /*
     * The phrasing pulls a title straight out of the lesson, and a lesson may
     * legitimately contain "Section 2 of 3". Naming it would put a count in
     * front of the learner through no fault of the phrasing, and `checkBeats`
     * would refuse the lesson at the door.
     */
    /* The filler is what makes this test test anything. Two bare primaries are
       now ONE beat, so beat 0 was the last beat, its checkpoint was "that is
       the whole answer", and `not.toContain('2 of 3')` passed without a title
       ever being read. Named plainly: this is the assertion being made real,
       not a fix. */
    const lesson = lessonOf([
      say('opening', 'primary', 'The opening'),
      say('filler', 'supporting'),
      say('counted', 'primary', 'Section 2 of 3'),
    ])

    const beats = deriveBeats(lesson)
    expect(beatAt(beats, 0).checkpoint).not.toContain('2 of 3')
    expect(READS_AS_A_COUNT.test(beatAt(beats, 0).checkpoint)).toBe(false)
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })

  it('still names an ordinary title that happens to contain a number', () => {
    const lesson = lessonOf([
      say('opening', 'primary', 'The opening'),
      say('filler', 'supporting'),
      say('measured', 'primary', 'At 450 K'),
    ])
    expect(beatAt(deriveBeats(lesson), 0).checkpoint).toContain('Next: at 450 K.')
  })
})

describe('a beat whose next lead has no title', () => {
  it('still asks something the learner can answer', () => {
    const lesson = lessonOf([
      say('opening', 'primary', 'The opening'),
      say('filler', 'supporting'),
      say('untitled', 'primary'),
    ])

    const beats = deriveBeats(lesson)
    expect(beatAt(beats, 0).checkpoint).not.toContain('Next:')
    expect(beatAt(beats, 0).checkpoint.trim().length).toBeGreaterThan(0)
    expect(checkBeats(beats, lesson, { teaching: false })).toHaveLength(0)
  })
})
