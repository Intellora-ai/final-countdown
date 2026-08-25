import { describe, expect, it } from 'vitest';

import { SYSTEM } from './modelProvider';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PROMPT ANSWERS THREE MEASURED FAILURES, AND THIS FILE STOPS THEM BEING
 * QUIETLY DELETED.
 *
 * A prompt is the one part of this pipeline with no compiler and no type. A
 * line can be removed while refactoring the array and nothing anywhere goes
 * red -- and the failure it prevented comes back weeks later looking new.
 *
 * Every rule pinned here was added because a REAL generation run failed on it.
 * The verifier's own words, from `npm run probe:ollama`:
 *
 *     "Options A and B are the same answer (sin a cos a)."
 *     "No option matches the computed answer 150."
 *     "The declared computation does not resolve: an operand is undefined."
 *
 * WHAT THIS TEST IS AND IS NOT. It asserts the instruction is PRESENT. It
 * cannot assert the model obeys it -- only the probe measures that, and the
 * probe needs a running model so it is not part of this suite. Presence is the
 * half that can be enforced automatically, and it is the half that rots.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('the system prompt states the rules that failures were traced to', () => {
  it('demands the expected value be the ANSWER, not a number from the question', () => {
    /*
     * MEASURED: "No option matches the computed answer 150."
     *
     * The question gave a garden of area 150 and asked for the WIDTH. The model
     * declared `expected: 150` -- a number from the question, not the answer to
     * it -- so the verifier recomputed 150, found no option saying 150, and
     * refused. Correctly: a question whose declared answer is not among its
     * options is broken however good the sentence is.
     */
    expect(SYSTEM).toMatch(/expected.*answer to the question|answer to the question.*expected/is);
    /*
     * Matched across line breaks. The prompt is an array joined with newlines,
     * so a sentence wraps mid-phrase -- and an exact-substring assertion would
     * fail on a reflow that changed nothing about the instruction.
     */
    expect(SYSTEM).toMatch(/not a number that\s+merely appears in it/);
  });

  it('demands every step operand be defined before it is used', () => {
    /* MEASURED: "The declared computation does not resolve: an operand is undefined." */
    expect(SYSTEM).toMatch(/every.*(left|right).*(input|earlier step)/is);
  });

  it('demands the four options be checked for duplicates before returning', () => {
    /*
     * MEASURED: "Options A and B are the same answer (sin a cos a)."
     *
     * "No two options may mean the same thing" was already there and was not
     * enough. The addition is an instruction to CHECK -- stating a constraint
     * and asking for the check are different requests, and the second one is
     * the one that survives contact with an 8B model.
     */
    expect(SYSTEM).toMatch(/before you return|check.*before/is);
    expect(SYSTEM).toContain('algebraically equal');
  });

  it('still carries the rules that were already earning their place', () => {
    /*
     * THE PAIR. Adding three rules must not quietly drop the ones that came
     * before, which is exactly the failure this file exists to catch.
     */
    expect(SYSTEM).toContain('Exactly four options');
    expect(SYSTEM).toContain('independently verified');
    expect(SYSTEM).toMatch(/rationale naming the mistake/i);
  });

  it('stays short enough to be obeyed', () => {
    /*
     * A prompt that lists thirty rules gets the last ten ignored, and a small
     * model degrades fastest. The cap is a ceiling on the temptation to answer
     * every future failure by adding a line.
     */
    expect(SYSTEM.split('\n').length).toBeLessThan(40);
  });
});
