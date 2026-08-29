import { describe, expect, it } from 'vitest'

import { outlineIssues, type BlockOutline } from './outline'

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
 * So the split is plan-then-fill. The model first writes a small skeleton --
 * ids, kinds, roles, no prose -- and the cheap structural facts are checked
 * THERE, on a document small enough for a small model to get right. Bodies are
 * filled afterwards.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is NOT a second copy of the gate. It checks only what is knowable from
 * roles and kinds alone, and `validateLesson` still runs in full on the
 * assembled lesson exactly as before. A rule reimplemented here would be a rule
 * that drifts from the one that actually refuses lessons; the names below match
 * the real rules so a reader can find them, and the real ones remain the
 * authority.
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

describe('outlineIssues', () => {
  it('accepts a sound skeleton', () => {
    expect(outlineIssues(sound())).toEqual([])
  })

  /*
   * The exact fault the one captured reply made. Catching it here means the
   * retry re-writes a four-line skeleton instead of a whole lesson.
   */
  it('catches two blocks claiming the definition role', () => {
    const blocks = sound()
    blocks[2] = block('the-numbers', 'prose', 'definition')

    expect(outlineIssues(blocks)).toContain('many-definitions')
  })

  it('catches a skeleton with no definition at all', () => {
    const blocks = sound().filter((b) => b.role !== 'definition')

    expect(outlineIssues(blocks)).toContain('no-definition')
  })

  /* R9. A lesson that only talks is the failure the Python engine can never
     escape, and it is knowable from `kind` alone. */
  it('catches a lesson that shows nothing', () => {
    const blocks = sound().filter((b) => b.kind !== 'table')

    expect(outlineIssues(blocks)).toContain('nothing-is-shown')
  })

  it('catches a missing summary', () => {
    const blocks = sound().filter((b) => b.role !== 'summary')

    expect(outlineIssues(blocks)).toContain('no-summary')
  })

  it('catches two summaries', () => {
    const blocks = [...sound(), block('also-in-short', 'summary', 'summary')]

    expect(outlineIssues(blocks)).toContain('many-summaries')
  })

  /* Order is knowable without bodies: the summary is the last CORE block. */
  it('catches a summary that does not close the core', () => {
    const blocks = [...sound(), block('one-more', 'prose', 'support')]

    expect(outlineIssues(blocks)).toContain('summary-does-not-close-the-core')
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

    expect(outlineIssues(blocks)).toContain('material-before-the-definition')
  })

  /* The other half of the same rule, and the reason it is not simply
     "definition first": a lesson may open on something the learner already
     knows. An anchor before the definition is legal and must stay legal. */
  it('allows an anchor before the definition', () => {
    expect(outlineIssues(sound())).not.toContain('material-before-the-definition')
  })

  /*
   * NOT VACUOUS IN THE OTHER DIRECTION. Every check above asserts a failure;
   * without this one, `outlineIssues` returning every rule name for every input
   * would pass them all. The sound skeleton must come back clean, and it does
   * in the first test -- this pins the stricter claim that a DEEPER block after
   * the summary is legal, so the order check cannot be a blanket "summary last".
   */
  it('allows deeper blocks after the summary', () => {
    const deeper: BlockOutline = { ...block('going-further', 'prose', 'support'), depth: 'deeper' }

    expect(outlineIssues([...sound(), deeper])).toEqual([])
  })
})
