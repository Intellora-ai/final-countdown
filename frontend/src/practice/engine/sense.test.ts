import { describe, expect, it } from 'vitest';

import { reasonsSenseless } from './sense';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOES THIS QUESTION MEAN ANYTHING?
 *
 * Every check that existed compared IDENTIFIERS. `checkTopic` asks whether
 * `spec.topicId` equals the session's topic id. `boundary.ts` asks the same
 * question three ways. Not one of them reads the question TEXT.
 *
 * So a question tagged with the right id passes, whatever it says. Measured on
 * the real Class 10 curriculum -- 12 topics, one generated question each,
 * printed verbatim:
 *
 *     [Mathematics] Zeros of a polynomial
 *       "An examiner sets the following problem on Zeros of a polynomial under
 *        timed conditions. Two systems differ only in Zeros of a polynomial.
 *        One reads 100, the other 2. By how much does the first exceed the
 *        second?"
 *
 *     [Mathematics] Classical definition of probability
 *       "...Two systems differ only in Classical definition of probability.
 *        One reads 90, the other 4..."
 *
 *     [Mathematics] Area of sectors and segments of a circle
 *       "...Assume ideal behaviour throughout, neglect friction..."
 *
 * TWELVE OF TWELVE WERE NONSENSE. A physics template with a maths heading
 * pasted into the noun slot, and every existing check said PASS: the id was
 * right, the arithmetic was right, the distractors had rationales.
 *
 * This module reads the text. It cannot judge MEANING -- that needs a model,
 * and pretending otherwise would be the worst kind of green. What it judges is
 * SHAPE, and the two shapes above are both structural:
 *
 *   1. a slot was filled with a heading, which shows up as the same long
 *      phrase repeated verbatim inside one sentence
 *   2. the vocabulary belongs to a different subject than the question does
 *
 * WHAT THIS IS NOT. It does not certify a question is good. It rejects two
 * specific ways of being broken, both of which currently ship 100% of the time.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* Verbatim from the measurement above. Not invented, and that matters: a
   fixture written by hand would be a guess at what the generator does. */
const REAL = {
  polynomial:
    'An examiner sets the following problem on Zeros of a polynomial under timed conditions. Two systems differ only in Zeros of a polynomial. One reads 100, the other 2. By how much does the first exceed the second?',
  probability:
    'Reasoning from first principles about Classical definition of probability rather than quoting a formula: Two systems differ only in Classical definition of probability. One reads 90, the other 4. By how much does the first exceed the second?',
  circle:
    'Two systems differ only in Area of sectors and segments of a circle. One reads 20, the other 5. By how much does the first exceed the second? Assume ideal behaviour throughout, neglect friction, and report the numerical result.',
} as const;

describe('a heading pasted into a sentence slot', () => {
  it('rejects the question that is on screen today', () => {
    expect(reasonsSenseless(REAL.polynomial, 'Zeros of a polynomial', 'mathematics')).toContain(
      'topic-name-pasted',
    );
  });

  it('rejects it however the framing sentence is worded', () => {
    /*
     * Four framings rotate in front of the same template, so catching one
     * wording would leave three shipping.
     */
    expect(
      reasonsSenseless(REAL.probability, 'Classical definition of probability', 'mathematics'),
    ).toContain('topic-name-pasted');
  });

  it('lets a real question use the topic words without repeating the heading', () => {
    /*
     * THE PAIR, and the one that decides whether this rule is usable at all.
     * A question about zeros of a polynomial obviously SAYS "polynomial". If
     * mentioning the topic were the offence, the rule would reject every good
     * question and get switched off within a day.
     *
     * The offence is the whole heading appearing TWICE, verbatim, which is what
     * substitution into a template produces and what writing a sentence does
     * not.
     */
    const real =
      'The polynomial p(x) = x^2 - 5x + 6 has two zeros. What is the sum of those zeros?';
    expect(reasonsSenseless(real, 'Zeros of a polynomial', 'mathematics')).toEqual([]);
  });

  it('allows a heading mentioned once, which is normal writing', () => {
    const fine = 'Using the classical definition of probability, what is the chance of two heads?';
    expect(reasonsSenseless(fine, 'Classical definition of probability', 'mathematics')).toEqual([]);
  });

  it('allows a ONE-WORD topic to appear as often as the sentence needs', () => {
    /*
     * ADDED BECAUSE A MUTANT SURVIVED. Deleting the two-word guard entirely
     * changed no result, which proved nothing here covered a single-word
     * topic -- the exact case the guard exists for.
     *
     * "Probability" twice in a probability question is a sentence. Repetition
     * only signals a filled slot when the repeated run is long enough that no
     * writer would produce it twice by accident.
     */
    const fine =
      'The probability of rain is 0.3. What is the probability that it does not rain?';
    expect(reasonsSenseless(fine, 'Probability', 'mathematics')).toEqual([]);
  });
});

describe('vocabulary from the wrong subject', () => {
  it('rejects a maths question that neglects friction', () => {
    /*
     * "Assume ideal behaviour throughout, neglect friction" is a physics
     * framing. On a question about the area of a circle sector it is not a
     * stylistic wobble -- it means the sentence was written for a different
     * subject and reused.
     */
    expect(reasonsSenseless(REAL.circle, 'Area of sectors and segments of a circle', 'mathematics'))
      .toContain('wrong-subject-vocabulary');
  });

  it('leaves the same words alone in the subject they belong to', () => {
    /*
     * THE PAIR. Friction in physics is the topic, not a leak. A rule that fired
     * on the word alone would reject every real mechanics question -- which is
     * exactly how a quality gate becomes something people delete.
     */
    expect(reasonsSenseless(REAL.circle, 'Friction on an inclined plane', 'physics')).not.toContain(
      'wrong-subject-vocabulary',
    );
  });

  it('never treats the topic\'s OWN name as foreign vocabulary', () => {
    /*
     * A FALSE POSITIVE FOUND BY RUNNING IT, and it took the whole product down
     * for a moment: every session refused with
     * "Only 0 of 5 questions passed verification".
     *
     * The topic was `Opportunity cost` under a subject id of `mathematics`.
     * "opportunity cost" is on the economics term list, so the rule read the
     * topic's own heading as a leak from another subject and rejected every
     * question about it -- including perfectly correct ones.
     *
     * THE SCOPE CONTRACT SETTLES THIS. The topic IS the scope. Whatever the
     * topic is called, those words are on-topic by definition, so they are
     * removed from the text before foreign vocabulary is looked for. §33
     * INVARIANT 11 forbids lateral reasoning justifying unrelated concepts; a
     * topic's own name was never unrelated.
     */
    const question = 'Two systems differ only in opportunity cost. One reads 85, the other 5.';
    expect(reasonsSenseless(question, 'Opportunity cost', 'mathematics')).not.toContain(
      'wrong-subject-vocabulary',
    );
  });

  it('still catches a foreign term that is NOT part of the topic name', () => {
    /*
     * THE PAIR. Subtracting the topic name must not become a way to subtract
     * the whole check -- an implementation that stripped every word it saw
     * would pass the test above and find nothing ever again.
     */
    const question = 'Opportunity cost rises. Neglect friction and report the result.';
    expect(reasonsSenseless(question, 'Opportunity cost', 'mathematics')).toContain(
      'wrong-subject-vocabulary',
    );
  });

  it('says nothing about a subject it has no vocabulary for', () => {
    /*
     * An unknown subject means UNKNOWN, never "clean". Silently passing a
     * subject nobody listed is how a gate reports zero findings forever.
     */
    expect(reasonsSenseless(REAL.circle, 'Some topic', 'sanskrit')).toEqual([]);
  });
});

describe('the rules do not fire on ordinary questions', () => {
  it('accepts a plain, well-formed question', () => {
    const good = 'A bag holds 3 red and 5 blue balls. One is drawn at random. What is P(red)?';
    expect(reasonsSenseless(good, 'Classical definition of probability', 'mathematics')).toEqual([]);
  });

  it('accepts a physics question in physics', () => {
    const good =
      'A gas in a rigid vessel is at 120 kPa. The absolute temperature is doubled. What is the new pressure?';
    expect(reasonsSenseless(good, 'Gas laws', 'physics')).toEqual([]);
  });

  it('handles empty and absent text without throwing', () => {
    expect(reasonsSenseless('', 'Anything', 'mathematics')).toEqual([]);
    expect(reasonsSenseless('   ', '', 'mathematics')).toEqual([]);
  });
});
