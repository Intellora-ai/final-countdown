import { describe, expect, it } from 'vitest'

import { SYSTEM } from './prompt.ts'

/*
 * THE PROMPT MUST STATE THE RULES THE VALIDATOR ENFORCES.
 *
 * Measured, not supposed. With the server finally reaching a model, the very
 * first live lesson came back in 5.6s and was refused with:
 *
 *   blocks[3]  24 words with no break, and the limit is 20 in one go
 *   blocks[1]  an example points at 0 rules via "exemplifies";
 *              it must point at exactly one
 *
 * Both are the same defect wearing different clothes, and it is the one this
 * repository keeps rediscovering: THE MODEL WAS REFUSED FOR A RULE NOBODY TOLD
 * IT. The prompt already carries six numbered shape rules and a comment saying
 * "a prompt that does not state them is a prompt that produces 502s" -- which
 * was exactly right, and then two rules went unstated anyway.
 *
 * Worse than unstated, in the first case. Rule 5 says "never more than thirty
 * words in one go". For a block whose role is `example` the enforced cap is
 * TWENTY. A model that obeys the prompt to the letter is refused, so the
 * instruction is not merely incomplete -- it is wrong, and following it is what
 * fails.
 *
 * These assertions are about the CONTRACT, not the wording: they check that the
 * number and the mechanism appear at all. A prompt may be rewritten freely; it
 * may not quietly stop mentioning a rule the student's lesson is refused for.
 */
describe('the prompt states what the validator enforces', () => {
  it('gives the example cap, which is not the ordinary run cap', () => {
    /*
     * The live failure: the model wrote 24 words in an example because the
     * prompt told it thirty were fine. Naming only the general number makes
     * the specific one invisible.
     */
    expect(
      SYSTEM,
      'the prompt never mentions the twenty-word cap that examples are refused for',
    ).toMatch(/\btwenty\b|\b20\b/i)
  })

  it('says an example must point at exactly one rule', () => {
    /* Three of the four issues on that first live lesson were this one. The
       model cannot satisfy a relation it has never been told to write. */
    expect(SYSTEM, 'the prompt never tells the model to link an example to a rule').toMatch(
      /exemplifies/i,
    )
  })

  it('still states the rules it already stated', () => {
    /*
     * THE PAIR, and it is load-bearing.
     *
     * Without it, deleting the six existing rules would satisfy nothing above
     * and break nothing here -- and the prompt would silently go back to
     * producing 502s for the definition, the summary and the marked terms
     * instead. Each of these is a rule `validateLesson` refuses a lesson for.
     */
    for (const [rule, pattern] of [
      ['open with a definition', /definition/i],
      ['close with a summary', /summary/i],
      ['show something', /table/i],
      /* `\s+` not a space: the prompt wraps this phrase across two array
         entries, so the joined string contains a newline mid-phrase. */
      ['break long text', /blank\s+line/i],
      ['mark what matters', /distinction/i],
    ] as const) {
      expect(SYSTEM, `the prompt stopped stating: ${rule}`).toMatch(pattern)
    }
  })
})
