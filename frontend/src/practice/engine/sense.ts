/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOES THIS QUESTION MEAN ANYTHING? — the first check that reads the TEXT.
 *
 * Every check that existed compared IDENTIFIERS. `checkTopic` asks whether
 * `spec.topicId` equals the session's topic id; `boundary.ts` asks the same
 * question three ways. None of them opens the question.
 *
 * So a question tagged with the right id passed, whatever it said. Measured on
 * the real Class 10 curriculum -- 12 topics, one generated question each:
 *
 *     "An examiner sets the following problem on Zeros of a polynomial under
 *      timed conditions. Two systems differ only in Zeros of a polynomial.
 *      One reads 100, the other 2. By how much does the first exceed the
 *      second?"
 *
 *     "...Area of sectors and segments of a circle... Assume ideal behaviour
 *      throughout, neglect friction..."
 *
 * TWELVE OF TWELVE WERE NONSENSE, and every existing check said PASS. The id
 * was right, the arithmetic was right, the distractors carried rationales.
 *
 * WHAT THIS CANNOT DO, STATED FIRST
 * ---------------------------------
 * It cannot judge meaning. That needs a model reading the sentence, and a rule
 * claiming to do it with regular expressions would be the most expensive kind
 * of green in this repository -- a gate that reports zero findings forever
 * while everyone believes it is working.
 *
 * It judges SHAPE, and both shapes above are structural rather than semantic.
 * It rejects two specific ways of being broken. It certifies nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SenseFailure = 'topic-name-pasted' | 'wrong-subject-vocabulary';

/**
 * Vocabulary that belongs to one subject and reads as a leak in another.
 *
 * A LIST, AND NAMED AS ONE. There is no structural property that separates
 * "friction" from "factor"; what separates them is which subject uses the word,
 * and that is knowledge, not shape. Dressing it up as a rule would make it look
 * more general than it is.
 *
 * Terms are chosen to be DISTINCTIVE rather than complete. `force` is not here:
 * it appears in economics and in mathematics often enough to be a false
 * positive, and a gate that flags real questions is a gate that gets deleted.
 * Missing a leak costs one bad question; flagging a good one costs the gate.
 */
const SUBJECT_TERMS: Readonly<Record<string, readonly string[]>> = {
  physics: [
    'friction',
    'kpa',
    'pascal',
    'newton',
    'velocity',
    'acceleration',
    'momentum',
    'inclined plane',
    'ideal behaviour',
    'rigid vessel',
    'laboratory exercise',
  ],
  chemistry: ['mole', 'molar', 'reagent', 'titration', 'valency', 'isotope', 'catalyst'],
  biology: ['organism', 'chloroplast', 'enzyme', 'genotype', 'photosynthesis', 'mitosis'],
  mathematics: ['polynomial', 'quadratic', 'theorem', 'integer', 'coefficient', 'hypotenuse'],
  economics: ['demand curve', 'gdp', 'inflation', 'opportunity cost', 'elasticity'],
};

/** Which of the listed subjects a subject id belongs to, or null when unlisted. */
function known(subjectId: string): string | null {
  const id = subjectId.toLowerCase();
  for (const name of Object.keys(SUBJECT_TERMS)) {
    if (id.includes(name)) return name;
  }
  return null;
}

export function reasonsSenseless(
  text: string,
  topicName: string,
  subjectId: string,
): SenseFailure[] {
  const question = String(text ?? '').trim();
  const topic = String(topicName ?? '').trim();

  /*
   * NO EMPTY-TEXT GUARD, and its absence is deliberate.
   *
   * One was written first and mutation testing showed it was DEAD: deleting it
   * changed no result, because empty text contains no repeated heading and no
   * foreign term, so both rules already return nothing. Kept, it would have
   * looked like defensive care while defending against nothing -- and the
   * empty case is pinned by a test, so the reliance is not silent.
   *
   * Empty text is somebody else's failure anyway. `checkShape` in `verify.ts`
   * rejects a question with no text, and having two places refuse the same
   * thing is how two places start disagreeing about it.
   */
  const out: SenseFailure[] = [];
  const lower = question.toLowerCase();

  /*
   * 1. A HEADING PASTED INTO A SENTENCE SLOT.
   *
   * The offence is the whole heading appearing TWICE, verbatim. Substitution
   * into a template produces that; writing a sentence does not.
   *
   * MENTIONING THE TOPIC IS NOT THE OFFENCE, and getting that wrong would make
   * the rule unusable: a question about zeros of a polynomial obviously says
   * "polynomial". One mention is normal writing. Two identical multi-word runs
   * inside one question is a machine filling a slot.
   *
   * Guarded on length, because a one-word topic can legitimately repeat --
   * "probability" twice in a probability question is a sentence, not a paste.
   */
  const needle = topic.toLowerCase();

  /*
   * COUNTED BY SPLITTING, NOT BY A SEARCH LOOP, AND THAT IS A BUG FIX.
   *
   * The first version walked the string with `indexOf(needle, at + needle.length)`.
   * With an EMPTY needle that advances by zero and `indexOf('')` always
   * succeeds, so the loop never terminates -- the tab hangs, which is strictly
   * worse than a wrong answer because there is nothing to report.
   *
   * It was invisible in normal use only because the two-word guard happened to
   * exclude the empty string. Mutation testing removed that guard and the test
   * run stopped responding, which is how the hang was found: a guard that
   * prevents a crash BY ACCIDENT is not a guard, it is luck with good timing.
   *
   * `split` cannot loop. The empty case now returns a count of zero on its own
   * merits rather than on the shape of an unrelated condition.
   */
  const count = needle.length === 0 ? 0 : lower.split(needle).length - 1;

  /*
   * TWO WORDS MINIMUM, because a one-word topic legitimately repeats:
   * "probability" twice in a probability question is a sentence, not a paste.
   * Repetition only signals a filled slot when the run is long enough that no
   * writer would produce it twice by accident.
   */
  if (topic.split(/\s+/).length >= 2 && count >= 2) out.push('topic-name-pasted');

  /*
   * 2. VOCABULARY FROM A DIFFERENT SUBJECT.
   *
   * "Assume ideal behaviour throughout, neglect friction" on a question about
   * the area of a circle sector is not a stylistic wobble. It means the
   * sentence was written for another subject and reused, which is exactly what
   * the measurement found.
   *
   * A SUBJECT THIS DOES NOT KNOW RETURNS NOTHING. Unlisted means UNKNOWN, never
   * "clean" -- silently passing a subject nobody wrote terms for is how a gate
   * reports zero findings forever.
   */
  const own = known(subjectId);
  if (own !== null) {
    /*
     * THE TOPIC'S OWN NAME IS REMOVED FIRST, and skipping that step took the
     * whole product down: with the topic `Opportunity cost` under a subject id
     * of `mathematics`, the rule read the heading as an economics leak and
     * every session refused with "Only 0 of 5 questions passed verification".
     *
     * The scope contract settles it. The topic IS the scope, so whatever the
     * topic is called, those words are on-topic by definition. What is left
     * after removing them is the vocabulary the question brought with it.
     */
    const beyondTheTopic = needle.length === 0 ? lower : lower.split(needle).join(' ');

    const foreign = Object.entries(SUBJECT_TERMS)
      .filter(([name]) => name !== own)
      .some(([, terms]) => terms.some((term) => beyondTheTopic.includes(term)));

    if (foreign) out.push('wrong-subject-vocabulary');
  }

  return out;
}
