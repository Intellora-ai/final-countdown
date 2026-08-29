import { describe, expect, it } from 'vitest'

import { validateLesson } from '../spec/validate'
import { MARK_REQUIRED_ABOVE_WORDS } from './teaching'
import { WORKED_EXAMPLE, teachingSystemPrompt } from './authorLesson'

/*
 * THE EXAMPLE THE PROMPT SHOWS MUST SURVIVE THE GATE THE MODEL IS JUDGED BY.
 *
 * `repliesExpected.ts` recorded four refusals on the one captured reply and
 * named the cause: the two rules the model broke are STATED in the prompt and
 * never DEMONSTRATED, so "there is no worked example of a prose block with its
 * terms filled in".
 *
 * Adding an example is the fix. Adding a WRONG example is worse than adding
 * none -- a model copies what it is shown far more reliably than what it is
 * told, so an example the gate would refuse teaches the failure instead of the
 * rule, and does it more effectively than the prose ever did.
 *
 * This is the check that cannot be satisfied by writing plausible-looking JSON:
 * the example goes through `validateLesson`, the same function the model's
 * output goes through, with `teaching: 'lesson'` -- the same mode.
 */
describe('the worked example in the system prompt', () => {
  it('passes the same gate the model is judged by, with zero issues', () => {
    const result = validateLesson(WORKED_EXAMPLE)

    /* Printed rather than counted: a bare `toBe(0)` on a length says a number
       changed and not which rule moved, and the whole point of this file is to
       name the rule. */
    const messages = result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`)
    expect(messages).toEqual([])
    expect(result.ok).toBe(true)
  })

  /*
   * The two rules the captured reply actually broke. Checked SEPARATELY from
   * "the gate accepts it", because a future example could pass the gate while
   * quietly dropping the one thing it exists to demonstrate -- and the gate
   * would not complain, since neither rule fires on a short block.
   */
  it('demonstrates rule 5: a long prose block with a marked term', () => {
    const prose = WORKED_EXAMPLE.blocks.filter(
      (b): b is Extract<typeof b, { kind: 'prose' }> => b.kind === 'prose',
    )
    const longEnough = prose.filter(
      (b) => b.body.trim().split(/\s+/).length > MARK_REQUIRED_ABOVE_WORDS,
    )

    expect(longEnough.length).toBeGreaterThan(0)
    for (const block of longEnough) {
      expect(block.terms?.length ?? 0).toBeGreaterThan(0)
      /* The marked text must be findable in the body. A mark naming a word the
         block never says is the shape of the rule without its substance. */
      for (const term of block.terms ?? []) {
        expect(block.body).toContain(term.text)
      }
    }
  })

  it('demonstrates rule 2: exactly one block holds the definition role', () => {
    const definitions = WORKED_EXAMPLE.blocks.filter((b) => b.role === 'definition')
    expect(definitions).toHaveLength(1)
  })

  /*
   * The example is INTERPOLATED, never retyped. A second copy pasted into the
   * prompt string is a copy that drifts, and the drift is invisible: the test
   * would keep checking the object while the model kept reading the stale
   * paste. Same discipline the prompt already uses for MAX_RUN_WORDS.
   */
  it('is the object this test checked, embedded in the prompt itself', () => {
    const prompt = teachingSystemPrompt()
    expect(prompt).toContain(WORKED_EXAMPLE.blocks[0]!.id)
    expect(prompt).toContain(JSON.stringify(WORKED_EXAMPLE, null, 2))
  })
})
