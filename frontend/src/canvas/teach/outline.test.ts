import { describe, expect, it } from 'vitest'

import { outlineIssues, type BlockOutline, type Plan } from './outline'

/*
 * WHY AN OUTLINE STAGE EXISTS AT ALL.
 *
 * Authoring asked a 7B model for one whole lesson in one reply and gave it one
 * repair. Measured, that produced arrays with one item where two are required
 * and keys on the wrong block type -- the failures of a model asked to hold a
 * large document in its head at once.
 *
 * Splitting it needs care, because a lesson is NOT a bag of independent
 * blocks. Of the twenty-eight rules in `teaching.ts`, roughly nineteen are
 * CROSS-block: exactly one definition, summary closes the core, framework
 * before classification, a relation pointing at a representation. Generating
 * blocks independently and concurrently cannot satisfy those, because no block
 * can see the others.
 *
 * So the split is plan-then-fill. The model first writes a small plan --
 * ids, kinds, roles, relations, no prose -- and the cheap structural facts are
 * checked THERE, on a document small enough for a small model to get right.
 * Bodies are filled afterwards.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is NOT a second copy of the gate. It checks only what is knowable without
 * prose, and `validateLesson` still runs in full on the assembled lesson. A
 * rule reimplemented here would be a rule that drifts from the one that
 * actually refuses lessons; the names below match the real rules so a reader
 * can find them, and the real ones remain the authority.
 *
 * WHERE IT MUST NOT DIVERGE
 * -------------------------
 * A check that is LOOSER than the real rule is the expensive failure: the plan
 * passes, every body is paid for, and the assembled lesson is refused anyway --
 * which is the exact cost this stage exists to avoid. Review found two such
 * divergences (summaries counted over core only; relations not checked at all)
 * and the tests below pin both.
 */

const block = (id: string, kind: BlockOutline['kind'], role: BlockOutline['role']): BlockOutline => ({
  id,
  kind,
  role,
  title: id,
  depth: 'core',
})

/** The smallest skeleton that is structurally sound. */
const sound = (): BlockOutline[] => [
  block('anchor', 'prose', 'anchor'),
  block('what-it-is', 'prose', 'definition'),
  block('the-numbers', 'table', 'support'),
  block('in-short', 'summary', 'summary'),
]

/** A plan whose one representation is joined to the text, as the gate requires. */
const plan = (blocks: BlockOutline[] = sound()): Plan => ({
  blocks,
  relations: [{ from: 'the-numbers', to: 'what-it-is', kind: 'supports' }],
})

describe('outlineIssues', () => {
  it('accepts a sound plan', () => {
    expect(outlineIssues(plan())).toEqual([])
  })

  /*
   * The exact fault the one captured reply made. Catching it here means the
   * retry re-writes a four-line plan instead of a whole lesson.
   */
  it('catches two blocks claiming the definition role', () => {
    const blocks = sound()
    blocks[2] = block('the-numbers', 'prose', 'definition')

    expect(outlineIssues(plan(blocks))).toContain('many-definitions')
  })

  it('catches a plan with no definition at all', () => {
    expect(outlineIssues(plan(sound().filter((b) => b.role !== 'definition')))).toContain('no-definition')
  })

  /* R9. A lesson that only talks is the failure the Python engine can never
     escape, and it is knowable from `kind` alone. */
  it('catches a lesson that shows nothing', () => {
    const blocks = sound().filter((b) => b.kind !== 'table')

    expect(outlineIssues({ blocks, relations: [] })).toContain('nothing-is-shown')
  })

  it('catches a missing summary', () => {
    expect(outlineIssues(plan(sound().filter((b) => b.role !== 'summary')))).toContain('no-summary')
  })

  it('catches two summaries', () => {
    expect(outlineIssues(plan([...sound(), block('also', 'summary', 'summary')]))).toContain(
      'many-summaries',
    )
  })

  /*
   * REVIEW FINDING, VERIFIED AGAINST `teaching.ts:463`, WHICH COUNTS
   * `roleAt.filter(r => r === 'summary')` OVER EVERY BLOCK.
   *
   * The first version of this filter counted core blocks only, so a lesson with
   * a core summary AND a deeper summary passed the plan check and was refused
   * as `many-summaries` after every body had been written -- the expensive path
   * the stage exists to prevent.
   */
  it('counts a deeper summary too, exactly as the real rule does', () => {
    const deeperSummary: BlockOutline = { ...block('later', 'summary', 'summary'), depth: 'deeper' }

    expect(outlineIssues(plan([...sound(), deeperSummary]))).toContain('many-summaries')
  })

  /* Order is knowable without bodies: the summary is the last CORE block. */
  it('catches a summary that does not close the core', () => {
    expect(outlineIssues(plan([...sound(), block('one-more', 'prose', 'support')]))).toContain(
      'summary-does-not-close-the-core',
    )
  })

  /*
   * The real rule, quoted from `teaching.ts`: "everything before the definition
   * must be an anchor". So the fault is a NON-anchor sitting before it -- not,
   * as this test first asserted, an anchor sitting after it. That first version
   * failed, and the test was the thing that was wrong.
   */
  it('catches a non-anchor block placed before the definition', () => {
    const blocks = [
      block('the-numbers', 'table', 'support'),
      block('what-it-is', 'prose', 'definition'),
      block('in-short', 'summary', 'summary'),
    ]

    expect(outlineIssues(plan(blocks))).toContain('material-before-the-definition')
  })

  /* The other half of the same rule, and the reason it is not simply
     "definition first": a lesson may open on something the learner already
     knows. An anchor before the definition is legal and must stay legal. */
  it('allows an anchor before the definition', () => {
    expect(outlineIssues(plan())).not.toContain('material-before-the-definition')
  })

  /*
   * REVIEW FINDING. The plan carries relations, so this is knowable before any
   * body is paid for -- and it is the rule that already cost one red test on
   * this branch: "the table is joined to nothing by a relation".
   */
  it('catches a representation that no relation refers to', () => {
    expect(outlineIssues({ blocks: sound(), relations: [] })).toContain('representation-is-decoration')
  })

  it('accepts a representation referred to from either end of a relation', () => {
    const toward: Plan = {
      blocks: sound(),
      relations: [{ from: 'what-it-is', to: 'the-numbers', kind: 'supports' }],
    }

    expect(outlineIssues(toward)).not.toContain('representation-is-decoration')
  })

  /* Knowable from `depth` order alone: deeper material may not sit inside the
     core, it continues after it. */
  it('catches deeper material buried inside the core', () => {
    const blocks = sound()
    const buried: BlockOutline = { ...block('aside', 'prose', 'support'), depth: 'deeper' }
    blocks.splice(2, 0, buried)

    expect(outlineIssues(plan(blocks))).toContain('deeper-material-inside-the-core')
  })

  /*
   * NOT VACUOUS IN THE OTHER DIRECTION. Every check above asserts a failure;
   * without this one, `outlineIssues` returning every rule name for every input
   * would pass them all. This pins the stricter claim that a DEEPER block AFTER
   * the summary is legal, so the order checks cannot be a blanket "summary
   * last".
   */
  it('allows deeper blocks after the summary', () => {
    const deeper: BlockOutline = { ...block('going-further', 'prose', 'support'), depth: 'deeper' }

    expect(outlineIssues(plan([...sound(), deeper]))).toEqual([])
  })
})
