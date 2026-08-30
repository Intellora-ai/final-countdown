/**
 * `validateLesson` — the Learning Canvas gate — by all three unit techniques.
 *
 * WHY THIS FUNCTION AND NOT ANOTHER
 * ---------------------------------
 * Nothing renders that has not been through `validateLesson`. It is the single
 * place a malformed lesson is supposed to be stopped, so a hole here is a hole
 * in every lesson the canvas ever draws. It had no unit test of its own.
 *
 * THE THREE TECHNIQUES, AND WHAT EACH ONE IS FOR
 * ----------------------------------------------
 *   equivalence partitioning  one case per class of input the gate treats
 *                             alike — accepted, refused-for-structure,
 *                             refused-for-meaning. Proves each branch is live.
 *   boundary value analysis   N-1, N, N+1 at every limit. `min >= max` and
 *                             `initial < min` are comparisons, and a comparison
 *                             is where an off-by-one hides. Nothing in the
 *                             middle of a range can find it.
 *   property-based            fast-check generating inputs nobody would write,
 *                             checking rules that must hold for ALL of them.
 *                             It shrinks a failure to the smallest lesson that
 *                             still breaks.
 *
 * EVERY BOUND BELOW WAS READ OUT OF `spec.ts` AND `validate.ts`
 * ------------------------------------------------------------
 *   controls        1..4      readouts   1..4      blocks   1..24
 *   chart series    1..6      points     1..500    relations   max 48
 *   flow nodes      2..12     links      1..24     table columns 1..8
 *   Id              /^[a-z0-9][a-z0-9-]*$/, 1..64
 *   question        1..200
 *   simulation      `min >= max` is refused; `initial` must be within min..max
 *   pie             more than one series refused; a negative slice refused
 *
 * An invented bound tests the number I imagined. That is how a suite goes green
 * beside a product that is broken, so none of these were invented.
 *
 * WHY MOST TESTS PASS `teaching: 'off'`
 * -------------------------------------
 * `validate.ts` documents that level for "callers checking structure alone — a
 * fixture round-trip, a shape test", which is exactly what these are. The
 * teaching rules are a separate concern and get their own partition below,
 * where the level itself is what is under test. Using 'off' to dodge a teaching
 * failure elsewhere would be weakening; using it to isolate the structural gate
 * is what it is for.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { validateLesson, type Issue, type Result } from './validate'

/* -------------------------------------------------------------------------- */
/* Builders. Valid by construction, so a failure is the gate's and not mine.   */
/* -------------------------------------------------------------------------- */

type Json = Record<string, unknown>

const prose = (id: string, body = 'A sentence that says something.'): Json => ({
  id,
  kind: 'prose',
  body,
})

const lesson = (blocks: Json[], extra: Json = {}): Json => ({
  id: 'lesson-1',
  question: 'What is this?',
  blocks,
  ...extra,
})

/** One control, so a test can move exactly one bound at a time. */
const simulation = (control: Json, id = 'sim'): Json => ({
  id,
  kind: 'simulation',
  model: 'ideal-gas',
  controls: [{ key: 'temperature', label: 'Temperature', ...control }],
  readouts: ['pressure'],
})

const chart = (chartType: string, series: Json[], extra: Json = {}): Json => ({
  id: 'chart-1',
  kind: 'chart',
  chartType,
  series,
  ...extra,
})

const series = (name: string, ys: number[]): Json => ({
  name,
  points: ys.map((y, index) => ({ x: index, y })),
})

const structural = { teaching: 'off' } as const

/** Every path the gate names, so a test can assert on the reason and not merely
 *  on the refusal. A gate that refuses for the wrong reason is still wrong. */
const issuesOf = (result: Result): Issue[] => (result.ok ? [] : result.issues)
const messages = (result: Result): string => issuesOf(result).map((i) => i.message).join(' | ')

/* ========================================================================== */
/* EQUIVALENCE PARTITIONING                                                   */
/* ========================================================================== */

describe('equivalence partitioning — the classes of input the gate treats alike', () => {
  it('accepts a well-formed lesson', () => {
    const result = validateLesson(lesson([prose('intro')]), structural)
    expect(result.ok).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'not a lesson'],
    ['an array', []],
    ['an empty object', {}],
  ])('refuses %s rather than throwing', (_name, input) => {
    const result = validateLesson(input, structural)
    expect(result.ok).toBe(false)
    expect(issuesOf(result).length).toBeGreaterThan(0)
  })

  it('refuses a lesson with no blocks — there is nothing to teach', () => {
    expect(validateLesson(lesson([]), structural).ok).toBe(false)
  })

  it('refuses an appearance key, because the author says what exists, not how it looks', () => {
    const result = validateLesson(
      lesson([{ ...prose('intro'), color: 'red' }]),
      structural,
    )
    expect(result.ok).toBe(false)
    expect(messages(result)).toContain('carries appearance')
  })

  it('ALLOWS x and y inside chart points, which are data and not positions', () => {
    /* The first version of the appearance walk rejected any `x` anywhere, which
       refused a chart whose data points are literally {x, y}. A rule that
       cannot tell a POSITION from a MEASUREMENT refuses the lesson it exists
       to protect. */
    const result = validateLesson(
      lesson([chart('line', [series('a', [1, 2, 3])])]),
      structural,
    )
    expect(result.ok).toBe(true)
  })

  it('refuses a duplicate block id', () => {
    const result = validateLesson(lesson([prose('same'), prose('same')]), structural)
    expect(messages(result)).toContain('duplicate id')
  })

  it('refuses a relation pointing at a block that does not exist', () => {
    const result = validateLesson(
      lesson([prose('a'), prose('b')], {
        relations: [{ from: 'a', to: 'ghost', kind: 'supports' }],
      }),
      structural,
    )
    expect(result.ok).toBe(false)
  })

  /* THE REASON IS ASSERTED, NOT ONLY THE REFUSAL.
   *
   * This started as `expect(result.ok).toBe(false)` and a mutation run caught
   * it: deleting the self-link check entirely left every case still passing.
   * With nodes a and b and the single link a->a, node b is unreachable, so the
   * FLOATING-NODE rule refuses the lesson on its own -- and a test that only
   * asks "was it refused" cannot tell which rule did it. A gate that refuses
   * for the wrong reason is still wrong, and the author is sent to fix the
   * wrong line. */
  it.each([
    ['a link from a node that does not exist', { from: 'ghost', to: 'b' }, 'no node "ghost"'],
    ['a link to a node that does not exist', { from: 'a', to: 'ghost' }, 'no node "ghost"'],
    ['a node linking to itself', { from: 'a', to: 'a' }, 'a node cannot link to itself'],
  ])('refuses %s, and says so', (_name, link, because) => {
    const result = validateLesson(
      lesson([
        {
          id: 'flow-1',
          kind: 'flow',
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          links: [link],
        },
      ]),
      structural,
    )
    expect(result.ok).toBe(false)
    expect(messages(result)).toContain(because)
  })

  it('refuses a floating node, which would render as a word with no explanation', () => {
    const result = validateLesson(
      lesson([
        {
          id: 'flow-1',
          kind: 'flow',
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'lonely', label: 'Lonely' },
          ],
          links: [{ from: 'a', to: 'b' }],
        },
      ]),
      structural,
    )
    expect(messages(result)).toContain('would float')
  })

  it('refuses a table row using a column that was never declared', () => {
    const result = validateLesson(
      lesson([
        {
          id: 'table-1',
          kind: 'table',
          columns: [{ key: 'name', label: 'Name' }],
          rows: [{ name: 'ok' }, { nosuch: 'bad' }],
        },
      ]),
      structural,
    )
    expect(messages(result)).toContain('no column "nosuch"')
  })

  it('refuses an annotation pointing at an x value that has no point', () => {
    const result = validateLesson(
      lesson([
        chart('line', [series('a', [1, 2])], { annotate: { atX: 99, label: 'here' } }),
      ]),
      structural,
    )
    expect(messages(result)).toContain('to annotate')
  })

  /* THE TEACHING PASS ACTUALLY RUNS, AND THIS PROVES IT.
   *
   * This was `expect(typeof result.ok).toBe('boolean')`, which is true of every
   * possible return value and therefore asserts nothing. A mutation run caught
   * it: replacing the whole `teaching !== 'off' && issues.length === 0` guard
   * with `false` -- switching the teaching rules off entirely -- left all 66
   * tests green. The gate could have stopped checking whether a lesson TEACHES
   * and no test would have noticed.
   *
   * A lesson being TAUGHT owes the learner an arc: a definition, a summary, a
   * shape. One bare paragraph is structurally perfect and teaches nobody, so it
   * must pass at 'off' and be refused at 'lesson'. */
  it('a structurally perfect lesson that teaches nothing is refused at level "lesson"', () => {
    const bare = lesson([prose('intro', 'Some words that define nothing and summarise nothing.')])

    const structureOnly = validateLesson(bare, { teaching: 'off' })
    expect(structureOnly.ok, 'the structure itself is fine').toBe(true)

    const taught = validateLesson(bare, { teaching: 'lesson' })
    expect(taught.ok, 'a lesson with no arc must not pass as a lesson').toBe(false)
    expect(
      issuesOf(taught).some((issue) => issue.rule !== undefined),
      'a teaching refusal must name the teaching rule it broke',
    ).toBe(true)
  })

  it('the same bare block is judged differently as an ANSWER than as a LESSON', () => {
    /* A doubt answer is a reply to one question. Demanding it open with a
       definition and close with a progression would refuse every answer the
       resolvers produce, so the arc rules are scoped off for it. */
    const bare = lesson([prose('intro', 'Some words that define nothing and summarise nothing.')])
    const asLesson = issuesOf(validateLesson(bare, { teaching: 'lesson' }))
    const asAnswer = issuesOf(validateLesson(bare, { teaching: 'answer' }))
    expect(asAnswer.length).toBeLessThan(asLesson.length)
  })

  it('applies teaching rules only when the structure already passed', () => {
    /* Word-counting a body that failed to parse reports noise on top of the
       real fault, so the teaching pass is gated behind a clean structural one. */
    const broken = validateLesson({ id: 'x', question: 'q', blocks: 'not-an-array' }, {
      teaching: 'lesson',
    })
    expect(broken.ok).toBe(false)
    expect(issuesOf(broken).every((issue) => issue.rule === undefined)).toBe(true)
  })
})

/* ========================================================================== */
/* BOUNDARY VALUE ANALYSIS                                                    */
/* ========================================================================== */

describe('boundary value analysis — N-1, N, N+1 at every limit', () => {
  describe('a simulation control: min must be BELOW max', () => {
    it.each([
      [4, 5, true, 'min one below max'],
      [5, 5, false, 'min equal to max'],
      [6, 5, false, 'min above max'],
    ])('min=%i max=%i accepted=%s (%s)', (min, max, accepted) => {
      const result = validateLesson(
        lesson([simulation({ min, max, initial: min })]),
        structural,
      )
      expect(result.ok).toBe(accepted)
      if (!accepted) expect(messages(result)).toContain('min must be below max')
    })
  })

  describe('a simulation control: initial must be within min..max', () => {
    /* min=0 max=10, so the interesting values are -1, 0, 1 and 9, 10, 11.
       The comparison is `initial < min || initial > max`, which makes both
       ENDPOINTS legal — the classic place a `<` gets written as `<=`. */
    it.each([
      [-1, false, 'one below the floor'],
      [0, true, 'exactly the floor'],
      [1, true, 'one above the floor'],
      [9, true, 'one below the ceiling'],
      [10, true, 'exactly the ceiling'],
      [11, false, 'one above the ceiling'],
    ])('initial=%i accepted=%s (%s)', (initial, accepted) => {
      const result = validateLesson(
        lesson([simulation({ min: 0, max: 10, initial })]),
        structural,
      )
      expect(result.ok).toBe(accepted)
      if (!accepted) expect(messages(result)).toContain('outside min..max')
    })
  })

  describe('a pie shows ONE whole', () => {
    it.each([
      [1, true],
      [2, false],
    ])('%i series accepted=%s', (count, accepted) => {
      const all = Array.from({ length: count }, (_, i) => series(`s${i}`, [1, 2]))
      const result = validateLesson(lesson([chart('pie', all)]), structural)
      expect(result.ok).toBe(accepted)
      if (!accepted) expect(messages(result)).toContain('a pie shows ONE whole')
    })

    it.each([
      [-1, false, 'a negative slice'],
      [0, true, 'a zero slice'],
      [1, true, 'a positive slice'],
    ])('a slice of %i accepted=%s (%s)', (y, accepted) => {
      const result = validateLesson(lesson([chart('pie', [series('a', [y])])]), structural)
      expect(result.ok).toBe(accepted)
      if (!accepted) expect(messages(result)).toContain('negative parts')
    })

    it('allows a bar chart to go negative — only a PIE claims parts of a whole', () => {
      const result = validateLesson(lesson([chart('bar', [series('a', [-5])])]), structural)
      expect(result.ok).toBe(true)
    })
  })

  describe('collection sizes', () => {
    it.each([
      [0, false, 'no blocks'],
      [1, true, 'the minimum'],
      [24, true, 'the maximum'],
      [25, false, 'one over the maximum'],
    ])('%i blocks accepted=%s (%s)', (count, accepted) => {
      const blocks = Array.from({ length: count }, (_, i) => prose(`b${i}`))
      expect(validateLesson(lesson(blocks), structural).ok).toBe(accepted)
    })

    it.each([
      [0, false, 'no controls'],
      [1, true, 'the minimum'],
      [4, true, 'the maximum'],
      [5, false, 'one over the maximum'],
    ])('%i simulation controls accepted=%s (%s)', (count, accepted) => {
      const keys = ['temperature', 'volume', 'moles', 'temperature', 'volume']
      const controls = Array.from({ length: count }, (_, i) => ({
        key: keys[i],
        label: `C${i}`,
        min: 0,
        max: 10,
        initial: 5,
      }))
      const result = validateLesson(
        lesson([
          { id: 'sim', kind: 'simulation', model: 'ideal-gas', controls, readouts: ['pressure'] },
        ]),
        structural,
      )
      expect(result.ok).toBe(accepted)
    })

    it.each([
      [1, false, 'one node cannot form a chain'],
      [2, true, 'the minimum chain'],
      [12, true, 'the maximum'],
      [13, false, 'one over the maximum'],
    ])('%i flow nodes accepted=%s (%s)', (count, accepted) => {
      const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, label: `N${i}` }))
      /* Every node is linked, so this measures the SIZE limit and not the
         floating-node rule. A test that tripped two rules at once could not say
         which one it had found. */
      const links = nodes.slice(1).map((node, i) => ({ from: `n${i}`, to: node.id }))
      const result = validateLesson(
        lesson([{ id: 'flow-1', kind: 'flow', nodes, links: links.length ? links : [{ from: 'n0', to: 'n0' }] }]),
        structural,
      )
      expect(result.ok).toBe(accepted)
    })

    it.each([
      [0, false, 'an empty question'],
      [1, true, 'one character'],
      [200, true, 'the maximum'],
      [201, false, 'one over the maximum'],
    ])('a question of %i characters accepted=%s (%s)', (length, accepted) => {
      const result = validateLesson(
        lesson([prose('intro')], { question: 'q'.repeat(length) }),
        structural,
      )
      expect(result.ok).toBe(accepted)
    })

    it.each([
      [0, false, 'an empty id'],
      [1, true, 'one character'],
      [64, true, 'the maximum'],
      [65, false, 'one over the maximum'],
    ])('a block id of %i characters accepted=%s (%s)', (length, accepted) => {
      const result = validateLesson(lesson([prose('a'.repeat(length))]), structural)
      expect(result.ok).toBe(accepted)
    })
  })
})

/* ========================================================================== */
/* PROPERTY-BASED TESTING                                                     */
/* ========================================================================== */

describe('property-based — rules that must hold for inputs nobody would write', () => {
  it('never throws, whatever arrives', () => {
    /* A lesson can arrive as JSON from a model and never meet the TypeScript
       types at all. The gate throwing is a blank screen for the student; the
       gate REFUSING is a reason they can be shown. */
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => validateLesson(input, structural)).not.toThrow()
      }),
      { numRuns: 500 },
    )
  })

  it('always answers in exactly one of the two shapes', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = validateLesson(input, structural)
        if (result.ok) expect(result.lesson).toBeDefined()
        else expect(result.issues.length).toBeGreaterThan(0)
      }),
      { numRuns: 500 },
    )
  })

  it('every refusal names a path and a reason', () => {
    /* Silent repair teaches the author nothing. A refusal with no path is the
       same problem one step later: nobody can act on it. */
    fc.assert(
      fc.property(fc.anything(), (input) => {
        for (const issue of issuesOf(validateLesson(input, structural))) {
          expect(issue.path.length).toBeGreaterThan(0)
          expect(issue.message.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('no block is ever lost between input and output', () => {
    /* Goal 2: content may be paginated or collapsed, never silently deleted. */
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/), { minLength: 1, maxLength: 24 }),
        (rawIds) => {
          const ids = Array.from(new Set(rawIds))
          const result = validateLesson(lesson(ids.map((id) => prose(id))), structural)
          if (result.ok) {
            expect(result.lesson.blocks.map((b) => b.id)).toEqual(ids)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('a simulation control is accepted EXACTLY when min < max and initial is inside it', () => {
    /* The rule stated as one expression, checked against the implementation for
       every triple. Hand-picked cases prove the six points I thought of; this
       proves the whole space, and shrinks any disagreement to its smallest
       counter-example. */
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -60, max: 60 }),
        (min, max, initial) => {
          const shouldPass = min < max && initial >= min && initial <= max
          const result = validateLesson(
            lesson([simulation({ min, max, initial })]),
            structural,
          )
          expect(result.ok).toBe(shouldPass)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('a pie is accepted EXACTLY when it has one series and no negative slice', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 6 }), {
          minLength: 1,
          maxLength: 4,
        }),
        (allSeries) => {
          /* Destructured rather than indexed: `allSeries.length === 1` does not
             narrow `allSeries[0]` for TypeScript, so the index access is
             possibly-undefined and the canvas typecheck refused the build. */
          const [only] = allSeries
          const shouldPass =
            allSeries.length === 1 && only !== undefined && only.every((y) => y >= 0)
          const result = validateLesson(
            lesson([chart('pie', allSeries.map((ys, i) => series(`s${i}`, ys)))]),
            structural,
          )
          expect(result.ok).toBe(shouldPass)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('an appearance key anywhere in the structure is always refused', () => {
    const appearance = fc.constantFrom(
      'x', 'y', 'color', 'width', 'height', 'fontSize', 'padding', 'zIndex', 'opacity',
    )
    fc.assert(
      fc.property(appearance, (key) => {
        const result = validateLesson(
          lesson([{ ...prose('intro'), [key]: 1 }]),
          structural,
        )
        expect(result.ok).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('refusing is stable — the same lesson gets the same answer every time', () => {
    /* A gate whose verdict moves between two identical calls cannot be trusted
       to have a reason at all. */
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const first = validateLesson(input, structural)
        const second = validateLesson(input, structural)
        expect(first.ok).toBe(second.ok)
        expect(issuesOf(first)).toEqual(issuesOf(second))
      }),
      { numRuns: 300 },
    )
  })

  it('teaching rules can only ever ADD reasons to refuse, never remove one', () => {
    /* 'off' is the loosest level. If a lesson is refused with the gate at its
       loosest, no stricter level may accept it -- that would mean turning the
       teaching rules ON made a broken lesson pass. */
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const loose = validateLesson(input, { teaching: 'off' })
        if (!loose.ok) {
          expect(validateLesson(input, { teaching: 'lesson' }).ok).toBe(false)
          expect(validateLesson(input, { teaching: 'answer' }).ok).toBe(false)
        }
      }),
      { numRuns: 400 },
    )
  })
})
