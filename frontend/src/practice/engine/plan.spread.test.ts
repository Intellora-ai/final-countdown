import { describe, expect, it } from 'vitest';

import { asChapterId, asSubjectId, asTopicId } from './ids';
import { buildPlan, type TopicProfile } from './plan';
import { QUESTION_COUNTS, REASONING_STRUCTURES, type QuestionCount } from './types';

/**
 * THE PLAN THAT GUARANTEED ITS OWN SET WOULD BE REFUSED.
 *
 * Found in a browser, mid-session, on a real Class 10 topic: pressing Start on
 * a ten-question set produced
 *
 *     "Only 9 of 10 questions passed verification and deduplication
 *      within 4 attempt(s)."
 *
 * and the student got nothing at all. Five questions worked; ten never did.
 *
 * The cause was in the PLAN, not the generator. Asked for ten questions on a
 * topic with one concept, `buildPlan` handed out `estimate_and_bound` twice and
 * left `classify_instance` unused. Same concept, same reasoning route, so the
 * two questions are the same question -- the deduplicator was right to reject
 * one, and the set was then one short and correctly refused.
 *
 * Ten structures exist and ten were asked for. There was never a reason to
 * repeat one.
 *
 * WHY UNIQUENESS OUTRANKS THE DIFFICULTY BAND
 * -------------------------------------------
 * The repeat happened because the structure choice filtered by difficulty
 * FIRST: for the tenth slot no unused structure sat in the target band, so it
 * fell through to a tier that permits repeats. That trade is backwards. A
 * question one band off its target is still a real question a student can
 * answer. A repeated (concept, route) pair is guaranteed to be thrown away, and
 * throwing one away refuses the whole set. A slightly-off band costs a little;
 * a duplicate costs everything.
 */

function profileWith(concepts: number): TopicProfile {
  return {
    topicId: asTopicId('t'),
    chapterId: asChapterId('c'),
    subjectId: asSubjectId('s'),
    quantitative: 0.5,
    concepts: Array.from({ length: concepts }, (_, i) => ({
      id: `t--c${i}`,
      name: `Concept ${i}`,
      topicId: asTopicId('t'),
      numeric: true,
      prerequisites: [],
      commonMisconception: null,
    })),
  };
}

const pairs = (profile: TopicProfile, count: QuestionCount) =>
  buildPlan(profile, count).map((spec) => `${spec.conceptId}|${spec.reasoningStructure}`);

describe('a plan never asks the same thing twice', () => {
  it('gives ten questions on ONE concept ten different routes', () => {
    /*
     * The exact case that was broken. One concept, ten questions, ten
     * structures in the vocabulary -- a perfect fit with nothing to spare, and
     * therefore the case that catches any repeat at all.
     */
    const planned = pairs(profileWith(1), 10);

    expect(planned.length).toBe(10);
    expect(new Set(planned).size).toBe(10);
  });

  it('uses every reasoning structure exactly once when the count matches', () => {
    const structures = buildPlan(profileWith(1), 10).map((spec) => spec.reasoningStructure);
    expect([...structures].sort()).toEqual([...REASONING_STRUCTURES].sort());
  });

  it('never repeats a concept-and-route pair at any offered count', () => {
    /*
     * Over every count the product offers and every concept count either side
     * of the structure vocabulary.
     *
     * THE FIRST VERSION OF THIS TEST DEMANDED SOMETHING IMPOSSIBLE, and running
     * it is how that was found. It asked for 15 unique pairs from one concept.
     * A topic with one concept has exactly `1 x 10` pairs available, so the
     * fifteenth cannot exist however the planner is written -- the assertion
     * was not too strict, it was unsatisfiable.
     *
     * What is asserted instead is the real requirement, which is stronger than
     * "no duplicates": the plan is as long as capacity ALLOWS and every pair in
     * it is distinct. A planner that dodged duplicates by returning three specs
     * would satisfy a bare uniqueness check and starve the student.
     */
    for (const count of QUESTION_COUNTS) {
      for (const concepts of [1, 2, 3, 5, 8]) {
        const planned = pairs(profileWith(concepts), count);
        const capacity = Math.min(count, concepts * REASONING_STRUCTURES.length);
        const where = `${count} questions on ${concepts} concept(s): ${JSON.stringify(planned)}`;

        expect(new Set(planned).size, where).toBe(planned.length);
        expect(planned.length, where).toBe(capacity);
      }
    }
  });

  it('stops at capacity rather than padding with repeats', () => {
    /*
     * §24 -- report insufficient capacity, never borrow. Fifteen questions on a
     * one-concept topic is impossible. The old behaviour planned fifteen anyway,
     * generated them, let the deduplicator delete five, and then refused the
     * whole set with "only 10 of 15 passed" -- a message that blames generation
     * for a shortfall the plan created before anything was generated.
     */
    expect(buildPlan(profileWith(1), 15).length).toBe(REASONING_STRUCTURES.length);
  });

  it('still spreads across concepts rather than draining one', () => {
    /*
     * The PAIR. Satisfying uniqueness by putting all ten questions on the first
     * concept and rotating the route would pass every test above and be a worse
     * product than the bug.
     */
    const used = new Set(buildPlan(profileWith(5), 10).map((spec) => spec.conceptId));
    expect(used.size).toBe(5);
  });
});
