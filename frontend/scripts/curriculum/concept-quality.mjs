/* What makes a string a teachable TOPIC rather than a piece of a page.
 *
 * ONE RULE, IMPORTED BY BOTH SIDES. `teachableItems` uses it to decide what to
 * emit and `concept-quality.test.mjs` uses it to gate what was emitted. Two
 * copies of a rule is one rule and one future disagreement -- which is exactly
 * how the required-skill list in this project's hooks drifted four times.
 *
 * WHY IT WAS NEEDED
 *   4564 concepts passed the provenance gate -- every one naming a real source
 *   page, inside the 10-25 minute band, with resolvable dependencies. 569 of
 *   them were not topics:
 *
 *       "Since"   "Here"   "Let A"   "Find n"   "CG-1"   "(a) Since"
 *
 *   They come from the "at advanced level" documents, which are worked-problem
 *   books rather than syllabi, so the extractor was reading solved examples as
 *   curriculum. A structural gate cannot see this: "Since" has a perfectly
 *   good page number.
 *
 * ON BEING CAREFUL IN THE OTHER DIRECTION
 *   Over-rejecting is the worse failure. A wrongly dropped topic is a hole in a
 *   student's revision that nobody can see, whereas a surviving fragment is at
 *   least visible. So each pattern is anchored at the START of the string or is
 *   a whole-string match; none of them scans for a word anywhere inside. That
 *   keeps "Structure of the Atom" and "Solutions of a quadratic equation by
 *   factorisation" while removing "Solve for x".
 */

export const NOT_A_TOPIC = [
  { why: 'a question, not a topic', re: /\?/ },
  {
    why: 'an instruction or worked-example opener',
    re: /^(Find|Prove|Show that|Calculate|Solve|Evaluate|Verify|Determine|Let|Given|Here|Since|Hence|Therefore|Thus|Example|Which of the following|Give one example)\b/i,
  },
  { why: 'carries multiple-choice option letters', re: /\b[a-d]\)\s/ },
  { why: 'a bare competency or outcome code', re: /^(CG|LO|C)[-\s]?\d+\.?$/i },
  { why: 'too short to name a topic', re: /^.{0,5}$/ },
]

/** The reason `name` is not a teachable topic, or null when it is one. */
export function whyNotATopic(name) {
  const n = (name ?? '').trim()
  for (const { why, re } of NOT_A_TOPIC) if (re.test(n)) return why
  return null
}
