import { describe, expect, it } from 'vitest';

import { buildCentroids, driftsFrom, nearestTopic, scoreFor, type TopicCentroid } from './drift';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GATE THAT COMPARES OUR OWN STAMP TO OUR OWN STAMP.
 *
 * Every scope check in this engine reads the question's DECLARED metadata:
 *
 *     boundary.ts   question.topicId === boundary.topicId
 *                   question.conceptId ∈ boundary.allowedConceptIds
 *                   boundary.topicId ∉ question.prerequisites
 *     verify.ts     candidate.spec.topicId === expectedTopicId
 *
 * Every one of those fields is stamped BY US at generation, from the same spec
 * the boundary is built from. The gate compares our stamp to our stamp, so on
 * the generation path it cannot fail. Measured: 12 of 12 questions that were a
 * physics template with a maths heading pasted in passed all four checks.
 *
 * Stamping at birth guarantees the LABEL is right. It says nothing about the
 * question. The verification layer is the load-bearing half, and this is it.
 *
 * WHAT THIS IS, EXACTLY
 * ---------------------
 * A LEXICAL centroid, not a neural embedding. Each topic is represented by the
 * words of its own heading, its chapter, and its sibling topics, weighted so a
 * rare word counts for more than a common one. A question is scored against
 * EVERY topic and the nearest one wins.
 *
 * Calling it an embedding would be a lie, and the difference matters: this
 * cannot see that "discriminant" and "nature of roots" are the same idea in
 * different words. It catches VOCABULARY drift, which is the failure mode that
 * actually ships -- a linear-equation question inside a quadratics session
 * says "linear" and "substitution", and those words are not quadratics words.
 *
 * WHY NEAREST AND NOT A THRESHOLD. "Does this look like quadratics" needs a
 * cut-off nobody can defend. "Is quadratics the CLOSEST of the 1,850 topics we
 * know" is a comparison, and a comparison needs no magic number.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** A miniature curriculum, shaped exactly like the real one. */
const CURRICULUM = [
  {
    id: 'mathematics',
    name: 'Mathematics',
    chapters: [
      {
        id: 'algebra',
        number: 1,
        name: 'Algebra',
        topics: [
          { id: 'quadratic-equations', name: 'Quadratic equations and the discriminant' },
          { id: 'linear-equations', name: 'Pair of linear equations in two variables' },
        ],
      },
      {
        id: 'circles',
        number: 2,
        name: 'Areas related to circles',
        topics: [{ id: 'sector-area', name: 'Area of sectors and segments of a circle' }],
      },
    ],
  },
  {
    id: 'physics',
    name: 'Physics',
    chapters: [
      {
        id: 'mechanics',
        number: 1,
        name: 'Laws of motion',
        topics: [{ id: 'friction', name: 'Friction on an inclined plane' }],
      },
    ],
  },
] as never;

const CENTROIDS: readonly TopicCentroid[] = buildCentroids(CURRICULUM);

describe('the curriculum becomes a set of topic centroids', () => {
  it('builds one centroid per topic, not per chapter', () => {
    expect(CENTROIDS).toHaveLength(4);
    expect(CENTROIDS.map((centroid) => centroid.topicId).sort()).toEqual([
      'friction',
      'linear-equations',
      'quadratic-equations',
      'sector-area',
    ]);
  });

  it('gives every centroid some vocabulary to compare against', () => {
    /*
     * An empty centroid scores zero against everything, so a topic with one
     * would never win and could never be the nearest -- it would be invisible
     * to the gate rather than protected by it.
     */
    for (const centroid of CENTROIDS) {
      expect(centroid.terms.size, centroid.topicId).toBeGreaterThan(2);
    }
  });
});

describe('a question is scored against every topic, and the nearest wins', () => {
  it('puts a quadratics question nearest to quadratics', () => {
    const near = nearestTopic(
      'The quadratic equation x² − 5x + 6 = 0 has a discriminant. What is its value?',
      CENTROIDS,
    );
    expect(near?.topicId).toBe('quadratic-equations');
  });

  it('puts a circle-area question nearest to circle area', () => {
    const near = nearestTopic(
      'A sector of a circle of radius 15 cm subtends 120° at the centre. Find its area.',
      CENTROIDS,
    );
    expect(near?.topicId).toBe('sector-area');
  });

  it('puts a friction question nearest to friction, across subjects', () => {
    /*
     * THE CROSS-SUBJECT CASE, which is the one a same-chapter check cannot see.
     */
    const near = nearestTopic(
      'A block slides down an inclined plane. The coefficient of friction is 0.3.',
      CENTROIDS,
    );
    expect(near?.topicId).toBe('friction');
  });

  it('returns null when a question matches nothing at all', () => {
    /*
     * NO NEAREST IS A REAL ANSWER. Returning the least-bad topic for a question
     * with no shared vocabulary invents a match, and a confidently wrong verdict
     * is worse than an absent one.
     */
    expect(nearestTopic('zzz qqq wwww', CENTROIDS)).toBeNull();
    expect(nearestTopic('', CENTROIDS)).toBeNull();
  });
});

describe('drift is rejected, and only drift', () => {
  it('rejects a linear-equation question inside a quadratics session', () => {
    /*
     * THE LOAD-BEARING TEST. Both topics live in the same chapter, both are
     * mathematics, and the question would be stamped `quadratic-equations` by
     * the generator. Every existing check passes it. This one does not.
     */
    const question = 'Solve the pair of linear equations by substitution: 2x + y = 7, x − y = 2.';

    expect(driftsFrom(question, 'quadratic-equations', CENTROIDS)).toBe(true);
  });

  it('admits a genuine quadratics question', () => {
    /*
     * THE PAIR, and it decides whether this gate is usable. A detector that
     * rejected everything would pass the test above and refuse every session.
     */
    const question = 'For which values of k does the quadratic equation have equal roots?';

    expect(driftsFrom(question, 'quadratic-equations', CENTROIDS)).toBe(false);
  });

  it('admits a question when nothing is nearest, rather than guessing', () => {
    /*
     * Absence of evidence is not evidence of drift. A question whose words this
     * gate does not know is UNJUDGED, and rejecting it would refuse everything
     * the lexical centroid is too shallow to recognise -- which is a large part
     * of any curriculum.
     */
    expect(driftsFrom('zzz qqq wwww', 'quadratic-equations', CENTROIDS)).toBe(false);
  });

  it('admits a question for a topic the gate has never heard of', () => {
    /*
     * An unknown session topic cannot be compared against, so it cannot be
     * judged. Rejecting here would break every topic outside this curriculum.
     */
    expect(driftsFrom('anything at all', 'no-such-topic', CENTROIDS)).toBe(false);
  });

  it('calls a mixed-vocabulary question AMBIGUOUS rather than picking a winner', () => {
    /*
     * THE DEFECT THIS PROJECT ALREADY SHIPPED, and the honest verdict on it.
     *
     * "Two systems differ only in Quadratic equations and the discriminant.
     *  Assume no friction on the inclined plane."
     *
     * That is a physics template with a maths heading pasted in. Both
     * vocabularies are present at roughly equal strength, so the first draft of
     * this test demanded that physics win -- and it did not. Making it win
     * would have meant tuning the weights until this one string flipped, which
     * is fitting a fixture rather than stating a principle.
     *
     * The true requirement is that the gate NOT PRETEND TO KNOW. A near-tie is
     * a third answer, and it is the correct one here. The pasted-heading shape
     * is `sense.ts`'s job -- two gates each doing their own work beats one gate
     * bent until a fixture passes.
     */
    const pasted =
      'Two systems differ only in Quadratic equations and the discriminant. Assume no friction on the inclined plane. One reads 65, the other 4.';

    const near = nearestTopic(pasted, CENTROIDS);
    expect(near?.ambiguous, `scores ${near?.score} vs ${near?.runnerUp}`).toBe(true);
    /* And therefore not reported as drift, in either direction. */
    expect(driftsFrom(pasted, 'quadratic-equations', CENTROIDS)).toBe(false);
    expect(driftsFrom(pasted, 'friction', CENTROIDS)).toBe(false);
  });

  it('still calls a clear winner clear', () => {
    /*
     * THE PAIR. Marking everything ambiguous would pass the test above and
     * disable the gate entirely -- the failure mode that looks like caution.
     */
    const near = nearestTopic(
      'A block slides down an inclined plane. The coefficient of friction is 0.3.',
      CENTROIDS,
    );
    expect(near?.ambiguous).toBe(false);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * "NEAREST ≠ REQUESTED" WAS TOO WEAK A RULE, AND IT REFUSED THE PRODUCT.
 *
 * The first version rejected whenever some other topic scored higher. Wired
 * onto the real path, every session refused: a template question shares little
 * vocabulary with ANY topic, so whichever topic wins that weak contest wins by
 * noise, and "nearest is not the requested one" is then a coin toss reported as
 * a verdict.
 *
 * The rule that survives is a COMPARISON WITH THE REQUESTED TOPIC ITSELF:
 *
 *     drift  ⟺  the requested topic scores nothing at all,
 *               while some other topic scores something
 *          or   another topic beats the requested one decisively
 *
 * Both halves are comparisons, so neither needs a threshold anybody has to
 * defend. And both mean the same thing in plain terms: this question's words
 * belong somewhere else, not merely "somewhere else did marginally better".
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('drift is measured against the requested topic, not against the winner', () => {
  it('does not call it drift when the requested topic also scores', () => {
    /*
     * THE FALSE POSITIVE THAT REFUSED EVERY SESSION. This question mentions
     * both a circle and an equation; another topic may edge it, and that is not
     * evidence that the question belongs elsewhere.
     */
    const both = 'Write the equation of a circle and find the area it encloses.';

    expect(driftsFrom(both, 'sector-area', CENTROIDS)).toBe(false);
  });

  it('calls it drift when the requested topic scores NOTHING', () => {
    /*
     * The decisive case, and it needs no threshold: the question shares not one
     * word with the topic it claims, while sharing several with another.
     */
    const physics = 'A block slides down an inclined plane against friction.';

    expect(driftsFrom(physics, 'sector-area', CENTROIDS)).toBe(true);
  });

  it('scores a question against a named topic, so the verdict can be inspected', () => {
    /*
     * Exposed because a rule nobody can inspect is a rule nobody can debug. A
     * refusal that cannot say "your topic scored 0 and physics scored 0.4" is
     * an error message that helps no one.
     */
    expect(scoreFor('A sector of a circle', 'sector-area', CENTROIDS)).toBeGreaterThan(0);
    expect(scoreFor('A sector of a circle', 'friction', CENTROIDS)).toBe(0);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A TOPIC'S SCOPE IS ITS HEADING PLUS ITS CONCEPTS.
 *
 * The centroid was built from the topic heading and its chapter. That refused
 * the product, and the refusal message said exactly why:
 *
 *     Question eco-1-central-problems-0-a0 was refused for
 *     eco-1-central-problems — drift: this topic scored 0.000,
 *     mat-1-numerical scored 0.169
 *
 * Zero. The question was legitimately about `Scarcity`, a concept INSIDE the
 * topic `Central problems`, and shared not one word with the heading. The gate
 * was right that the words did not match the heading and wrong that this meant
 * the question did not belong.
 *
 * A topic's scope is not its title. It is the set of concepts the topic OWNS --
 * the same `allowed_concepts` the admission gate checks membership against.
 * Building the centroid from the heading alone measured the label again, which
 * is the exact mistake this gate exists to stop making.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("a topic's own concepts are part of its vocabulary", () => {
  const WITH_CONCEPTS = [
    {
      id: 'economics',
      name: 'Economics',
      chapters: [
        {
          id: 'basics',
          number: 1,
          name: 'Introduction',
          topics: [
            {
              id: 'central-problems',
              name: 'Central problems',
              concepts: [
                { id: 'c1', name: 'Scarcity and unlimited wants', numeric: false },
                { id: 'c2', name: 'Opportunity cost of a choice', numeric: false },
              ],
            },
            { id: 'other', name: 'Numerical methods and estimation', topics: [] },
          ],
        },
      ],
    },
  ] as never;

  it('recognises a question about a concept inside the topic', () => {
    const centroids = buildCentroids(WITH_CONCEPTS);

    /*
     * The exact failure, as an assertion: the word "scarcity" appears nowhere
     * in the heading "Central problems", and it is unambiguously in scope.
     */
    expect(scoreFor('A question about scarcity and unlimited wants.', 'central-problems', centroids))
      .toBeGreaterThan(0);
    expect(driftsFrom('A question about scarcity and unlimited wants.', 'central-problems', centroids))
      .toBe(false);
  });

  it('does not let concepts drown out the heading', () => {
    /*
     * THE PAIR. Concepts count for LESS than the heading -- a topic with twenty
     * concepts would otherwise outweigh every neighbour on volume alone and win
     * every contest, which turns the gate off by making one topic nearest to
     * everything.
     */
    const centroids = buildCentroids(WITH_CONCEPTS);

    expect(nearestTopic('numerical methods and estimation', centroids)?.topicId).toBe('other');
  });

  it('still works for a topic with no concepts listed', () => {
    /*
     * Most topics have none -- the breakdown is written for a handful. A
     * centroid that needed them would be empty for almost every topic.
     */
    const centroids = buildCentroids(CURRICULUM);
    expect(scoreFor('quadratic equations and the discriminant', 'quadratic-equations', centroids))
      .toBeGreaterThan(0);
  });
});
