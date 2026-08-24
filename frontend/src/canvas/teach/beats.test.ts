import { describe, expect, it } from 'vitest'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { classifierEvaluation } from '../lessons/classifierEvaluation'
import { gasPressure } from '../lessons/gasPressure'
import type { Lesson, LessonInput } from '../spec/spec'
import { validateLesson } from '../spec/validate'
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

function validated(input: LessonInput): Lesson {
  const result = validateLesson(input)
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
  return validated({ id: 'edge-case', question: 'Does the cut hold here?', blocks, relations })
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
      ['particle-model'],
      ['causal-chain'],
      ['proportionality', 'ideal-gas-law'],
      ['pressure-vs-temperature', 'what-changes', 'energy-split'],
      ['misconception', 'result', 'summary'],
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
    expect(checkBeats(beats, lesson)).toHaveLength(0)
  })
})

describe('a lesson with no primary block at all', () => {
  it('still cuts, rather than handing over everything at once', () => {
    /*
     * `emphasis` defaults to `supporting`, so a lesson written without thinking
     * about emphasis lands here. Left to the emphasis rule alone it would be a
     * single beat containing the lesson.
     */
    const lesson = lessonOf([
      say('one', 'supporting', 'First thing'),
      say('two', 'supporting'),
      say('three', 'supporting'),
      say('four', 'supporting', 'Fourth thing'),
      say('five', 'supporting'),
    ])

    const beats = deriveBeats(lesson)
    expect(beats.map((beat) => [...beat.blockIds])).toEqual([
      ['one', 'two', 'three'],
      ['four', 'five'],
    ])
    expect(beatAt(beats, 0).checkpoint).toContain('Next: fourth thing.')
    expect(checkBeats(beats, lesson)).toHaveLength(0)
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
    expect(checkBeats(beats, lesson)).toHaveLength(0)
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
    expect(checkBeats(beats, lesson)).toHaveLength(0)
  })

  it('does not reach back past the current beat', () => {
    /*
     * `blockIds` must stay contiguous, so a derivation whose source is several
     * beats back cannot pull it in without scattering the slice. Classifier
     * evaluation has exactly this shape: `takeaway` derives from `confusion`
     * with three blocks between them.
     */
    const lesson = lessonOf(
      [
        say('source', 'primary', 'The source'),
        say('elsewhere', 'primary', 'Somewhere else'),
        say('derived', 'primary', 'The derived claim'),
      ],
      [{ from: 'derived', to: 'source', kind: 'derives' }],
    )

    const beats = deriveBeats(lesson)
    expect(beats.map((beat) => [...beat.blockIds])).toEqual([
      ['source'],
      ['elsewhere'],
      ['derived'],
    ])
    expect(checkBeats(beats, lesson)).toHaveLength(0)
  })

  it('is still bound by the cap', () => {
    const lesson = lessonOf(
      [
        say('premise', 'primary', 'The premise'),
        say('a', 'supporting'),
        say('b', 'supporting'),
        say('conclusion', 'primary', 'The conclusion'),
      ],
      [{ from: 'conclusion', to: 'premise', kind: 'derives' }],
    )

    expect(deriveBeats(lesson).map((beat) => [...beat.blockIds])).toEqual([
      ['premise', 'a', 'b'],
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
    expect(beats).toHaveLength(3)
    for (const beat of beats) expect(beat.blockIds.length).toBeLessThanOrEqual(3)
    expect(checkBeats(beats, lesson)).toHaveLength(0)
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
    const lesson = lessonOf([
      say('opening', 'primary', 'The opening'),
      say('counted', 'primary', 'Section 2 of 3'),
    ])

    const beats = deriveBeats(lesson)
    expect(beatAt(beats, 0).checkpoint).not.toContain('2 of 3')
    expect(READS_AS_A_COUNT.test(beatAt(beats, 0).checkpoint)).toBe(false)
    expect(checkBeats(beats, lesson)).toHaveLength(0)
  })

  it('still names an ordinary title that happens to contain a number', () => {
    const lesson = lessonOf([
      say('opening', 'primary', 'The opening'),
      say('measured', 'primary', 'At 450 K'),
    ])
    expect(beatAt(deriveBeats(lesson), 0).checkpoint).toContain('Next: at 450 K.')
  })
})

describe('a beat whose next lead has no title', () => {
  it('still asks something the learner can answer', () => {
    const lesson = lessonOf([
      say('opening', 'primary', 'The opening'),
      say('untitled', 'primary'),
    ])

    const beats = deriveBeats(lesson)
    expect(beatAt(beats, 0).checkpoint).not.toContain('Next:')
    expect(beatAt(beats, 0).checkpoint.trim().length).toBeGreaterThan(0)
    expect(checkBeats(beats, lesson)).toHaveLength(0)
  })
})
