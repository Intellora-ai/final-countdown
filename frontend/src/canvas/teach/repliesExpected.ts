/*
 * THE GATE'S VERDICT ON EACH CAPTURED REPLY, AS IT STANDS TODAY.
 *
 * Not a wish list. Several of these replies are refused, and recording the
 * refusal is the point: the corpus catches a CHANGE in the answer, which is
 * what a regression looks like from outside. An entry with an empty array is a
 * reply the gate accepts.
 *
 * Updating an entry is a claim that the gate's behaviour was meant to change.
 * Say which rule moved and why in the same commit, or the entry is being edited
 * to make a red build green, which is the failure this file exists to catch.
 */
export const EXPECTED_VERDICTS: Record<string, readonly string[]> = {
  /*
   * qwen2.5:7b, one attempt, no repair pass. Four issues, two causes: three
   * prose blocks carry no marked term, and two blocks both claim the
   * definition role. Both rules are stated in `teachingSystemPrompt` and the
   * model ignored both, so the gap is that the prompt TELLS without SHOWING —
   * there is no worked example of a prose block with its terms filled in.
   */
  'accountancy-admission-of-partners.json': [
    'many-definitions',
    'nothing-marked',
    'nothing-marked',
    'nothing-marked',
  ],
}
