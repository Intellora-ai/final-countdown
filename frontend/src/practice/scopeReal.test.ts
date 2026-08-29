import { beforeAll, describe, expect, it } from 'vitest';

import { buildCentroids, driftsFrom, nearestTopic, scoreFor, type TopicCentroid } from './engine/drift';
import { scopeViolations } from './engine/requirements';
import { toPracticeCurriculum } from './officialCurriculum';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE RULE, WRITTEN TWICE, AND THE COPY KEPT THE BUG THE ORIGINAL LOST.
 *
 * `driftsFrom` started as "some other topic scored higher, therefore drift".
 * That refused every session, because a question shares vocabulary with several
 * topics and whichever wins a weak contest wins by noise. It was replaced with
 * two comparisons against the REQUESTED topic's own score, plus an ambiguity
 * guard for a near-tie.
 *
 * `scopeViolations` was then written with the ORIGINAL rule -- `nearest is not
 * in the allowed set` -- and reproduces the old failure exactly. Measured on
 * the real Class 10 curriculum:
 *
 *     Topic     Relationship between zeros and coefficients of quadratic
 *               polynomials                              scores 0.657
 *     Winner    Zeros of a polynomial                    scores 0.784
 *     Same chapter?  yes            Ambiguous?  yes
 *     driftsFrom     false          scopeViolations      question-out-of-scope
 *
 * The two gates disagree about the same question, and the one that is wrong is
 * the copy. A question about the relationship between zeros and coefficients
 * losing narrowly to "Zeros of a polynomial" is not evidence it belongs
 * somewhere else -- they are siblings in one chapter, and a near-tie between
 * siblings is what a correct question looks like.
 *
 * The repair is not a third rule. It is to REUSE `driftsFrom`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

let CENTROIDS: readonly TopicCentroid[] = [];
let RELATIONSHIP = '';

beforeAll(async () => {
  const mod: Record<string, unknown> = await import('../data/curriculum/class10');
  const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
  const subjects = toPracticeCurriculum(official);

  CENTROIDS = buildCentroids(subjects);
  RELATIONSHIP =
    subjects
      .flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.topics))
      .find((topic) => /relationship between (the )?zero/i.test(topic.name))?.id ?? '';
});

const QUESTION =
  'If the sum of the zeros of a quadratic polynomial is 5 and the product is 6, what is the polynomial?';

describe('the two scope gates must agree about the same question', () => {
  it('finds the topic, so the test is not vacuous', () => {
    expect(RELATIONSHIP).not.toBe('');
  });

  it('does not call a correct question out of scope', () => {
    /*
     * THE REPORTED FALSE POSITIVE. This question is unambiguously about the
     * relationship between the zeros and the coefficients -- it states the sum
     * and the product and asks for the polynomial. It was refused.
     */
    expect(scopeViolations(QUESTION, '', { topicId: RELATIONSHIP, allowedTopicIds: [] }, CENTROIDS))
      .toEqual([]);
  });

  it('agrees with driftsFrom, which is the corrected rule', () => {
    /*
     * The invariant that stops this recurring: two gates asking the same
     * question of the same text must not answer differently. If they ever do,
     * one of them is a stale copy.
     */
    const drifts = driftsFrom(QUESTION, RELATIONSHIP, CENTROIDS);
    const violates = scopeViolations(
      QUESTION,
      '',
      { topicId: RELATIONSHIP, allowedTopicIds: [] },
      CENTROIDS,
    ).includes('question-out-of-scope');

    expect(violates).toBe(drifts);
  });

  it('still refuses a question that genuinely belongs to another subject', () => {
    /*
     * THE PAIR. Making the two agree must not be achieved by making both say
     * yes to everything -- which is what `return []` would do.
     */
    const physics =
      'A block of mass 5 kg slides down an inclined plane. The coefficient of friction is 0.3. Find the acceleration.';

    expect(
      scopeViolations(physics, '', { topicId: RELATIONSHIP, allowedTopicIds: [] }, CENTROIDS),
    ).toContain('question-out-of-scope');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A HEADING IS META-LANGUAGE. A QUESTION IS CONCRETE. THEY SHARE NO WORDS.
 *
 * Four drift flags from a real generation run, measured against the class 10
 * curriculum:
 *
 *   Algebraic conditions for number of solutions   mine 0.217  amb=true
 *   Situational problems based on quadratic eqs    mine 0.000
 *   Coordinate Geometry                            mine 0.000
 *
 * Three of four score ZERO against the topic they were written for. Not
 * because they are off-topic -- "The points (1,3),(4,6),(7,9) lie on a straight
 * line, what is the slope" is coordinate geometry -- but because the heading
 * says "Coordinate Geometry" and the question says "points", "line", "slope".
 * A heading names a field; a question is an instance of it. They overlap far
 * less than they seem to.
 *
 * THIS OVERTURNS AN EARLIER DECISION OF MINE, AND THE REASON IS THE POINT.
 * Sibling-topic terms were removed from the centroid because they changed
 * nothing -- measured, self-identification was 250/251 with them and 250/251
 * without. That measurement was of HEADINGS matched against headings, where a
 * heading already contains its own words and needs no help.
 *
 * It is the wrong measurement for this gate. What the gate actually scores is a
 * QUESTION against a topic, and there the siblings are exactly the missing
 * vocabulary: the chapter holding "Coordinate Geometry" also holds "The line
 * passes through the coordinate point", which is where "line" and "point" live.
 *
 * I measured the easy thing and concluded about the hard one.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a concrete question finds its abstract topic', () => {
  /*
   * `Coordinate Geometry` IS DELIBERATELY NOT IN THIS LIST, AND THE REASON IS A
   * DATA DEFECT RATHER THAN A GATE DEFECT.
   *
   * Measured: that topic is filed under the chapter "ARITHMETIC PROGRESSIONS".
   * Its centroid is therefore {coordinate, geometry, arithmetic, progressions},
   * and a slope question -- points, straight, line, slope -- shares not one word
   * with any of them.
   *
   * No lexical method can repair that. The topic's own heading is two words of
   * meta-language and its chapter is the wrong chapter, so the only vocabulary
   * available describes something else. Demanding the gate succeed here would
   * be demanding it work around broken curriculum data, and the test would then
   * be pinning a workaround rather than a requirement.
   *
   * It is named here rather than deleted, because a case removed and a case
   * that was never written look identical to whoever reads this next. The fix
   * belongs in the extractor.
   */
  const FIT: readonly (readonly [RegExp, string])[] = [
    [
      /situational problems based on quadratic/i,
      'A rectangular garden has a length 5 metres more than its width. If the area is 150 square metres, what is the width?',
    ],
    [
      /algebraic conditions for number of solutions/i,
      'How many solutions does the equation x^2 = 4 have?',
    ],
  ];

  it('does not REFUSE a question it cannot place, which is the requirement', async () => {
    /*
     * THE REQUIREMENT WAS WRONG THE FIRST TIME, AND THE CORRECTION IS THE
     * FINDING.
     *
     * This asserted `scoreFor(question, topic) > 0` -- that a question must
     * share vocabulary with its own topic. Two real cases proved that
     * unachievable, and neither is a bug in the gate:
     *
     *   "Coordinate Geometry"  is filed under the chapter "ARITHMETIC
     *   PROGRESSIONS", so its whole vocabulary describes something else.
     *
     *   "Situational problems based on quadratic equations related to
     *    day-to-day activities to be incorporated" is a teaching INSTRUCTION,
     *   not a topic name -- and the question it produces is a word problem
     *   about a garden, which deliberately avoids naming its own topic.
     *   Avoiding it is what makes it a word problem.
     *
     * A LEXICAL GATE CANNOT MATCH A WORD PROBLEM TO ITS TOPIC. That is a real
     * limit of the method, not a defect to engineer around, and word problems
     * are a large share of any maths syllabus.
     *
     * So the requirement is the one that matters to a student: a question the
     * gate cannot place must be ADMITTED, never refused. Absence of evidence is
     * not evidence of absence.
     */
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);
    const centroids = buildCentroids(subjects);
    const topics = subjects.flatMap((subject) =>
      subject.chapters.flatMap((chapter) => chapter.topics),
    );

    const wordProblem =
      'A rectangular garden has a length 5 metres more than its width. If the area is 150 square metres, what is the width?';
    const topic = topics.find((each) => /situational problems based on quadratic/i.test(each.name))!;

    /* It genuinely shares no vocabulary -- stated, not hidden. */
    expect(scoreFor(wordProblem, topic.id, centroids)).toBe(0);
    /* And it is admitted anyway, which is the behaviour that matters. */
    expect(driftsFrom(wordProblem, topic.id, centroids)).toBe(false);
  });

  it('does not flag those questions as drift', async () => {
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);
    const centroids = buildCentroids(subjects);
    const topics = subjects.flatMap((subject) =>
      subject.chapters.flatMap((chapter) => chapter.topics),
    );

    for (const [pattern, question] of FIT) {
      const topic = topics.find((each) => pattern.test(each.name))!;
      expect(driftsFrom(question, topic.id, centroids), topic.name).toBe(false);
    }
  });

  it('still flags a physics question inside a maths topic', async () => {
    /*
     * THE PAIR. Widening the centroid must not widen it until everything fits.
     * A rule that admits every question is the same as no rule.
     */
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);
    const centroids = buildCentroids(subjects);
    const topic = subjects
      .flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.topics))
      .find((each) => /^coordinate geometry$/i.test(each.name))!;

    const physics =
      'A block of mass 5 kg slides down an inclined plane with coefficient of friction 0.3. Find its acceleration.';

    expect(driftsFrom(physics, topic.id, centroids)).toBe(true);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A REGRESSION I INTRODUCED, FOUND BY GREP AFTER THE PROBE POINTED AT IT.
 *
 * `NearestTopic.ambiguous` is computed on every call and READ BY NOTHING.
 * `driftsFrom` used to consult it -- a near-tie is not evidence -- and a later
 * rewrite of that function dropped the line while leaving the field in place.
 * A field nobody reads looks exactly like a field that is working.
 *
 * The cost was measured on a real generation run. Two questions were flagged as
 * drift while their nearest topic was AMBIGUOUS:
 *
 *     Algebraic conditions for number of solutions
 *       mine 0.217   winner "Chemical equation" 0.308   ambiguous=true  -> DRIFT
 *
 *     Situational problems based on quadratic equations
 *       mine 0.000   winner "Problems based on areas" 0.147  ambiguous=true -> DRIFT
 *
 * A margin of 0.217 against 0.308 is a coin toss reported as a verdict, and
 * that is the exact failure the ambiguity guard exists to prevent.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a near-tie is never evidence of drift', () => {
  it('admits a question whose nearest topic only just won', async () => {
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);
    const centroids = buildCentroids(subjects);
    const topic = subjects
      .flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.topics))
      .find((each) => /algebraic conditions for number of solutions/i.test(each.name))!;

    const question = 'How many solutions does the equation x^2 = 4 have?';

    /* The measurement that makes this a near-tie rather than a claim. */
    const near = nearestTopic(question, centroids)!;
    expect(near.ambiguous, `${near.score} vs ${near.runnerUp}`).toBe(true);

    expect(driftsFrom(question, topic.id, centroids)).toBe(false);
  });

  it('still flags a question that loses DECISIVELY', async () => {
    /*
     * THE PAIR. Treating every contest as too close to call is the same as
     * switching the gate off, and it would look identical from the outside.
     */
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);
    const centroids = buildCentroids(subjects);
    const topic = subjects
      .flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.topics))
      .find((each) => /algebraic conditions for number of solutions/i.test(each.name))!;

    const physics =
      'A block of mass 5 kg slides down an inclined plane with coefficient of friction 0.3. Find its acceleration.';

    const near = nearestTopic(physics, centroids)!;
    expect(near.ambiguous).toBe(false);
    expect(driftsFrom(physics, topic.id, centroids)).toBe(true);
  });
});
