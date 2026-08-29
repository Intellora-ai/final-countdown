import { describe, expect, it } from 'vitest'

import { validateLesson } from '../spec/validate'
import { gasPressure } from '../lessons/gasPressure'
import type { Lesson } from '../spec/spec'
import {
  checkFrame,
  frameIsSafe,
  noAccidentalVoid,
  noCollision,
  noOrphanEdge,
  noOverflow,
  plan,
  profile,
  selectArchetype,
  type Archetype,
  type Frame,
  type Placed,
} from './layout'

/** The real lesson, through the real gate — a fixture that lies is worse than none. */
function realLesson(): Lesson {
  const result = validateLesson(gasPressure)
  if (!result.ok) throw new Error(`fixture is invalid: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

const WIDE = { width: 1440, height: 900 }
const NARROW = { width: 600, height: 900 }

/** A minimal lesson of one repeated kind, for profiling the selector. */
function lessonOf(kind: Lesson['blocks'][number]['kind'], count: number): Lesson {
  const blocks = Array.from({ length: count }, (_, i) => body(kind, `b${i}`))
  /* `'off'`: this fixture exists to PROFILE the selector -- N blocks of one
     kind -- and the archetype it picks is the subject. The teaching arc is
     not, and a repeated-kind fixture cannot carry one. Structure is still
     fully checked. */
  const result = validateLesson({ id: 'x', question: 'Q?', blocks }, { teaching: 'off' })
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.lesson
}

function body(kind: string, id: string): Record<string, unknown> {
  const base = { id, kind, emphasis: 'supporting', tone: 'neutral' }
  if (kind === 'prose' || kind === 'callout') return { ...base, body: 'text' }
  if (kind === 'metric') return { ...base, value: 1 }
  if (kind === 'equation') return { ...base, latex: 'x' }
  if (kind === 'table')
    return { ...base, columns: [{ key: 'a', label: 'A', type: 'text' }], rows: [{ a: '1' }] }
  if (kind === 'chart')
    return {
      ...base,
      chartType: 'line',
      series: [{ name: 's', colorIndex: 0, points: [{ x: 1, y: 1 }] }],
    }
  if (kind === 'flow')
    return {
      ...base,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      links: [{ from: 'a', to: 'b' }],
    }
  return {
    ...base,
    model: 'ideal-gas',
    controls: [{ key: 'temperature', label: 'T', min: 1, max: 2, initial: 1 }],
    readouts: ['pressure'],
  }
}

/* -------------------------------------------------------------------------- */

describe('the selector', () => {
  it('lets a simulation claim the composition', () => {
    const { archetype } = selectArchetype(profile(lessonOf('simulation', 1)))
    expect(archetype).toBe<Archetype>('centrepiece')
  })

  it('reads a table-and-chart lesson as reference material', () => {
    const mixed = validateLesson({
      id: 'x',
      question: 'Q?',
      blocks: [body('table', 't'), body('chart', 'c')],
    }, { teaching: 'off' })
    if (!mixed.ok) throw new Error('fixture invalid')
    expect(selectArchetype(profile(mixed.lesson)).archetype).toBe<Archetype>('reference')
  })

  it('reads a wall of prose as discourse', () => {
    expect(selectArchetype(profile(lessonOf('prose', 5))).archetype).toBe<Archetype>('discourse')
  })

  /*
   * TWO LESSONS THAT ARE CHAINS AND WERE READ AS EVIDENCE.
   *
   * Found by guarding `logarithms` and `tenses` in `lessons.test.ts`: a
   * flowchart (bill), a derivation (logs) and a grammar table (tenses) all
   * landed on `evidence`. Three unlike profiles on one composition is the exact
   * failure `does not give two unlike lessons the same archetype` names -- the
   * selector was not reading the content.
   *
   * Both cases below are chains the reader walks end to end, which is what
   * `sequence` means.
   */
  it('reads a flow-driven process as a sequence even when the steps are explained in prose', () => {
    /* `sequence` required `visual >= textual`, so explaining each step in prose
       -- which is what a civics lesson DOES -- disqualified the lesson from the
       archetype built for it. `hasSequence` plus a flow block already says the
       flow drives the lesson; counting prose against it punished teaching. */
    const lesson = validateLesson(
      {
        id: 'x',
        question: 'Q?',
        blocks: [
          body('flow', 'f'),
          body('prose', 'p1'),
          body('prose', 'p2'),
          body('prose', 'p3'),
        ],
      },
      { teaching: 'off' },
    )
    if (!lesson.ok) throw new Error('fixture invalid')
    expect(selectArchetype(profile(lesson.lesson)).archetype).toBe<Archetype>('sequence')
  })

  it('reads a multi-step derivation as a sequence', () => {
    /* A derivation is a chain walked end to end -- the same shape as a flow,
       written in equations instead of boxes. Nothing in the selector looked at
       `equation`, so every derivation fell through to `evidence`.

       TWO equations, not one: a lone formula sitting beside prose is a claim
       with its statement, which IS evidence. The chain only exists once one
       line follows from the one above it. */
    const lesson = validateLesson(
      {
        id: 'x',
        question: 'Q?',
        blocks: [
          body('prose', 'p'),
          body('equation', 'e1'),
          body('equation', 'e2'),
          body('equation', 'e3'),
        ],
      },
      { teaching: 'off' },
    )
    if (!lesson.ok) throw new Error('fixture invalid')
    expect(selectArchetype(profile(lesson.lesson)).archetype).toBe<Archetype>('sequence')
  })

  it('a single equation beside prose is still evidence, not a sequence', () => {
    /* THE PAIRED NEGATIVE, and it is load bearing. A selector that returned
       `sequence` for any equation at all passes the test above and destroys the
       distinction. One equation is a claim and its statement. */
    const lesson = validateLesson(
      {
        id: 'x',
        question: 'Q?',
        blocks: [body('prose', 'p'), body('equation', 'e'), body('table', 't')],
      },
      { teaching: 'off' },
    )
    if (!lesson.ok) throw new Error('fixture invalid')
    expect(selectArchetype(profile(lesson.lesson)).archetype).not.toBe<Archetype>('sequence')
  })

  it('always explains itself', () => {
    /* "If the selector cannot justify its archetype choice, the selector
       failed." An empty or boilerplate reason is that failure, so it is
       asserted rather than trusted. */
    for (const kind of ['simulation', 'prose', 'chart', 'flow'] as const) {
      const { explain } = selectArchetype(profile(lessonOf(kind, 2)))
      expect(explain.length).toBeGreaterThan(30)
      expect(explain).toMatch(/[a-z]/)
    }
  })
})

describe('placement', () => {
  it('never violates an invariant on the real lesson', () => {
    const frame = plan(realLesson(), WIDE)
    const failures = checkFrame(frame).filter((c) => !c.ok)
    expect(failures, JSON.stringify(failures)).toHaveLength(0)
    expect(frameIsSafe(frame)).toBe(true)
  })

  it('holds every invariant across a range of viewport widths', () => {
    const lesson = realLesson()
    for (const width of [420, 600, 900, 1200, 1440, 2200]) {
      const frame = plan(lesson, { width, height: 900 })
      const failures = checkFrame(frame).filter((c) => !c.ok)
      expect(failures, `width ${width}: ${JSON.stringify(failures)}`).toHaveLength(0)
    }
  })

  it('collapses to one column when narrow, without dropping a block', () => {
    const lesson = realLesson()
    const frame = plan(lesson, NARROW)
    expect(frame.columns).toBe(1)
    // "Make it smaller so it fits" is banned; the frame gets fewer columns and
    // every block survives at its designed size.
    expect(frame.blocks).toHaveLength(lesson.blocks.length)
  })

  it('places every block exactly once, at every width', () => {
    const lesson = realLesson()
    for (const width of [600, 1440]) {
      const ids = plan(lesson, { width, height: 900 }).blocks.map((b) => b.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(new Set(ids)).toEqual(new Set(lesson.blocks.map((b) => b.id)))
    }
  })

  it('is deterministic', () => {
    const lesson = realLesson()
    expect(plan(lesson, WIDE)).toEqual(plan(lesson, WIDE))
  })
})

describe('a derived block stacks under its source', () => {
  /*
   * REGRESSION GUARD — this shipped wrong.
   *
   * `PV = nRT` declares `derives` from `P ∝ T`. Laid out by width alone the two
   * equations landed side by side, which reads as "here are two facts" when the
   * author said "this one comes FROM that one". Reading order carries the
   * argument, so the derived block belongs directly beneath its source.
   */
  it('matches the source column and width, in a later band', () => {
    const frame = plan(realLesson(), WIDE)
    const source = frame.blocks.find((b) => b.id === 'proportionality')
    const derived = frame.blocks.find((b) => b.id === 'ideal-gas-law')

    expect(source).toBeDefined()
    expect(derived).toBeDefined()
    expect(derived?.col).toBe(source?.col)
    expect(derived?.span).toBe(source?.span)
    expect(derived?.band).toBeGreaterThan(source?.band ?? 0)
  })

  it('still passes the collision check with the stack in place', () => {
    // Stacking writes a band directly; the guard proves nothing else was
    // already sitting there.
    const frame = plan(realLesson(), WIDE)
    const collision = checkFrame(frame).find((c) => c.name === 'noCollision')
    expect(collision?.ok, JSON.stringify(collision?.offenders)).toBe(true)
  })
})


/* -------------------------------------------------------------------------- */
/* The detectors, pointed at frames that are actually broken                   */
/* -------------------------------------------------------------------------- */

/**
 * WHY THESE EXIST, AND WHAT THEY CAUGHT.
 *
 * Every other test in this file runs the layout checks over a frame `plan`
 * produced, and `plan` is correct — so the four detectors were only ever
 * observed AGREEING with it. The mutation gate proved what that costs: changing
 * `noCollision` to `return { ok: true }` unconditionally killed no test at all.
 * A frame with two blocks sitting on top of each other would have shipped, and
 * `frameIsSafe` would have said it was fine.
 *
 * That is the vacuous-validator failure this repo has hit before. The fix is
 * not more lessons — a valid lesson can never produce an invalid frame — it is
 * to hand-build the broken frames `plan` will never emit and check that each
 * detector says no, and names the right offenders.
 */

function placed(over: Partial<Placed> & Pick<Placed, 'id'>): Placed {
  return {
    kind: 'prose',
    band: 0,
    col: 0,
    span: 6,
    rows: 2,
    emphasis: 'supporting',
    tone: 'neutral',
    ...over,
  }
}

function frameOf(blocks: Placed[], edges: Frame['edges'] = []): Frame {
  return { archetype: 'reference', explain: 'hand-built for a detector test', columns: 12, blocks, edges }
}

describe('the layout detectors can actually fail', () => {
  it('noCollision refuses two blocks overlapping in one band, and names both', () => {
    const frame = frameOf([
      placed({ id: 'left', band: 0, col: 0, span: 8 }),
      placed({ id: 'right', band: 0, col: 6, span: 6 }),
    ])
    const result = noCollision(frame)
    expect(result.ok, 'an overlap in band 0 was not detected').toBe(false)
    expect([...result.offenders].sort()).toEqual(['left', 'right'])
  })

  it('noCollision allows the same columns in DIFFERENT bands', () => {
    /* Without this, "detects a collision" could be satisfied by a check that
       simply refuses every frame with two blocks in it. */
    const frame = frameOf([
      placed({ id: 'above', band: 0, col: 0, span: 12 }),
      placed({ id: 'below', band: 1, col: 0, span: 12 }),
    ])
    expect(noCollision(frame).ok).toBe(true)
  })

  it('noCollision allows blocks that merely touch', () => {
    /* col 0..5 and col 6..11 share an edge and no column. An off-by-one in the
       comparison would report this as an overlap. */
    const frame = frameOf([
      placed({ id: 'a', band: 0, col: 0, span: 6 }),
      placed({ id: 'b', band: 0, col: 6, span: 6 }),
    ])
    expect(noCollision(frame).ok).toBe(true)
  })

  it('noOverflow refuses a block running past the last column', () => {
    const frame = frameOf([placed({ id: 'wide', band: 0, col: 8, span: 8 })])
    const result = noOverflow(frame)
    expect(result.ok, 'a block ending at column 16 of 12 was not detected').toBe(false)
    expect(result.offenders).toContain('wide')
  })

  it('noOrphanEdge refuses an edge pointing at a block that was not placed', () => {
    const frame = frameOf(
      [placed({ id: 'real', band: 0, col: 0, span: 12 })],
      [{ from: 'real', to: 'ghost', kind: 'supports' }],
    )
    const result = noOrphanEdge(frame)
    expect(result.ok, 'an edge to a missing block was not detected').toBe(false)
  })

  it('frameIsSafe is false when any single detector is', () => {
    /* The aggregate must not be an independent opinion. If it can be true while
       noCollision is false, the checks below it are decoration. */
    const broken = frameOf([
      placed({ id: 'left', band: 0, col: 0, span: 8 }),
      placed({ id: 'right', band: 0, col: 6, span: 6 }),
    ])
    expect(noCollision(broken).ok).toBe(false)
    expect(frameIsSafe(broken)).toBe(false)

    const clean = frameOf([placed({ id: 'only', band: 0, col: 0, span: 12 })])
    expect(noCollision(clean).ok).toBe(true)
    expect(noAccidentalVoid(clean).ok).toBe(true)
    expect(frameIsSafe(clean)).toBe(true)
  })
})
