import { describe, expect, it } from 'vitest';

import { buildCentroids, type TopicCentroid } from './drift';
import { requirementsOf, scopeViolations } from './requirements';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT DOES THIS QUESTION ACTUALLY REQUIRE?
 *
 * Every scope check so far reads the QUESTION. None reads the SOLUTION, and a
 * question can sit perfectly inside its topic while the only way to answer it
 * lives outside:
 *
 *     Session:   Quadratic equations
 *     Question:  "Find the maximum value of y = -x² + 6x - 5."
 *     Solution:  "Differentiate: dy/dx = -2x + 6. Set it to zero..."
 *
 * The question is a quadratic. The SOLUTION is calculus. A student who has not
 * met differentiation cannot answer it, and every gate in this engine passes it
 * -- `boundary.ts` compares ids, `drift.ts` scores the question text, and
 * neither has ever opened `fullSolution`. Measured: the only two places that
 * read it check its LENGTH and look for reasoning keywords.
 *
 * A question is admissible only when the knowledge it REQUIRES -- to be read
 * and to be solved -- is inside the session's declared scope.
 *
 * WHAT THIS IS NOT. It does not parse mathematics or trace a derivation. It
 * asks which topic each half of the question is nearest to, using the same
 * lexical centroids the drift gate uses. A solution whose vocabulary belongs to
 * another topic is the case that ships; a solution that silently assumes an
 * idea without naming it is not caught, and saying otherwise would be the kind
 * of green this project keeps paying for.
 * ═══════════════════════════════════════════════════════════════════════════
 */

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
          {
            id: 'quadratics',
            name: 'Quadratic equations',
            concepts: [
              { id: 'q1', name: 'Roots and the discriminant', numeric: true },
              { id: 'q2', name: 'Completing the square', numeric: true },
            ],
          },
        ],
      },
      {
        id: 'calculus',
        number: 2,
        name: 'Differential calculus',
        topics: [
          {
            id: 'derivatives',
            name: 'Differentiation of a function',
            concepts: [{ id: 'd1', name: 'Derivative and stationary points', numeric: true }],
          },
        ],
      },
    ],
  },
] as never;

const CENTROIDS: readonly TopicCentroid[] = buildCentroids(CURRICULUM);

const SCOPE = { topicId: 'quadratics', allowedTopicIds: ['quadratics'] };

describe('a question describes itself from its own text', () => {
  it('reports the question and the solution SEPARATELY', () => {
    /*
     * Separately, because they fail differently and the fix differs. A question
     * from the wrong topic was generated wrong. A right question with a wrong
     * solution was generated for a student who has not got there yet, and the
     * repair is a different solution, not a different question.
     */
    const requirements = requirementsOf(
      'Find the maximum value of y = -x squared + 6x - 5.',
      'Differentiate to get the derivative, then find the stationary point.',
      CENTROIDS,
    );

    expect(requirements.fromQuestion).toBe('quadratics');
    expect(requirements.fromSolution).toBe('derivatives');
  });

  it('reports null for a half it cannot place, rather than guessing', () => {
    /*
     * Unknown is a real answer. Naming the least-bad topic invents a
     * requirement, and a fabricated requirement rejects a question for a reason
     * that was never true.
     */
    const requirements = requirementsOf('zzz qqq', 'wwww vvvv', CENTROIDS);

    expect(requirements.fromQuestion).toBeNull();
    expect(requirements.fromSolution).toBeNull();
  });

  it('handles an empty solution without throwing', () => {
    const requirements = requirementsOf('A quadratic equation and its roots.', '', CENTROIDS);

    expect(requirements.fromQuestion).toBe('quadratics');
    expect(requirements.fromSolution).toBeNull();
  });
});

describe('the solution has to stay inside the scope too', () => {
  it('REFUSES a quadratics question whose solution needs calculus', () => {
    /*
     * THE LOAD-BEARING TEST, and the exact example the directive names. Every
     * other gate in this engine admits this question.
     */
    const violations = scopeViolations(
      'Find the maximum value of y = -x squared + 6x - 5.',
      'Differentiate to get the derivative, then find the stationary point.',
      SCOPE,
      CENTROIDS,
    );

    expect(violations).toContain('solution-out-of-scope');
  });

  it('admits the same question when the solution stays in scope', () => {
    /*
     * THE PAIR, and it is the whole argument that this gate is about the
     * SOLUTION rather than about the question. Identical question, different
     * route: completing the square is inside quadratics, and a student who has
     * met quadratics can follow it.
     */
    const violations = scopeViolations(
      'Find the maximum value of y = -x squared + 6x - 5.',
      'Complete the square to write it as -(x - 3) squared + 4, so the maximum is 4.',
      SCOPE,
      CENTROIDS,
    );

    expect(violations).toEqual([]);
  });

  it('refuses a question that is out of scope on its own', () => {
    const violations = scopeViolations(
      'Differentiate the function and find its stationary points.',
      'The derivative is zero at the stationary point.',
      SCOPE,
      CENTROIDS,
    );

    expect(violations).toContain('question-out-of-scope');
  });

  it('admits a solution the gate cannot place, rather than refusing it', () => {
    /*
     * FAILS OPEN. A lexical centroid is shallow and most solutions will not
     * resolve to any topic. Refusing everything it cannot read would refuse the
     * product, and a gate that refuses the product gets deleted -- after which
     * it enforces nothing at all.
     */
    expect(
      scopeViolations('A quadratic equation and its roots.', 'zzz qqq wwww.', SCOPE, CENTROIDS),
    ).toEqual([]);
  });

  it('admits a solution that uses an EXPLICITLY allowed neighbour', () => {
    /*
     * MODE B from the directive -- prerequisite aware. A scope may permit
     * another topic on purpose, and then using it is not a violation. Without
     * this the gate could only ever express "one topic and nothing else", which
     * is not how a senior syllabus works.
     */
    const violations = scopeViolations(
      'Find the maximum value of y = -x squared + 6x - 5.',
      'Differentiate to get the derivative, then find the stationary point.',
      { topicId: 'quadratics', allowedTopicIds: ['quadratics', 'derivatives'] },
      CENTROIDS,
    );

    expect(violations).toEqual([]);
  });

  it('does not treat the session topic itself as a violation', () => {
    /* The trivial case, asserted because getting it wrong refuses everything. */
    expect(
      scopeViolations(
        'Solve the quadratic equation and state its roots.',
        'Use the discriminant to find the roots of the quadratic equation.',
        SCOPE,
        CENTROIDS,
      ),
    ).toEqual([]);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A TOPIC THE CURRICULUM DOES NOT CONTAIN CANNOT BE JUDGED.
 *
 * `driftsFrom` has guarded this since it was written: if the session topic is
 * not among the centroids there is nothing to compare against, so it fails
 * open. `scopeViolations` was written without the same guard, and the
 * consequence was immediate and total -- every session refused:
 *
 *     Question rotational-motion-0-a0 was refused for rotational-motion —
 *     solution out of scope: solving it needs mat-6-returns
 *
 * `rotational-motion` is not in that curriculum at all. With no centroid for
 * it, every solution's nearest topic is some unrelated one, and "nearest is not
 * allowed" is true for every question ever generated.
 *
 * THE SAME GUARD, IN A SIBLING FUNCTION THAT DID NOT INHERIT IT. Writing the
 * check twice is how the second copy comes out different; this is that, caught
 * by running it rather than by reading it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('an unknown session topic is unjudged, not guilty', () => {
  it('reports no violation when the session topic is not in the curriculum', () => {
    /*
     * A session for a topic this curriculum has never heard of -- a seeded
     * session, a class whose data has not loaded, a test. There is nothing to
     * compare against, so there is nothing to say.
     */
    const violations = scopeViolations(
      'Find the moment of inertia of a rotating disc.',
      'Differentiate to get the derivative, then find the stationary point.',
      { topicId: 'rotational-motion', allowedTopicIds: [] },
      CENTROIDS,
    );

    expect(violations).toEqual([]);
  });

  it('still reports violations for a topic the curriculum DOES contain', () => {
    /*
     * THE PAIR. Failing open on an unknown topic must not become failing open
     * on every topic -- which is what a guard placed one line too early does.
     */
    const violations = scopeViolations(
      'Find the maximum value of y = -x squared + 6x - 5.',
      'Differentiate to get the derivative, then find the stationary point.',
      SCOPE,
      CENTROIDS,
    );

    expect(violations).toContain('solution-out-of-scope');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE WAS WRITTEN TWICE, AND THE SECOND COPY HAD THE BUG THE FIRST ONE
 * HAD ALREADY LOST.
 *
 * `driftsFrom` began as "some other topic scored higher, therefore drift". That
 * refused every session, because a template question shares little vocabulary
 * with ANY topic and whichever one wins that weak contest wins by noise. It was
 * replaced with a comparison against the REQUESTED topic's own score.
 *
 * `scopeViolations` was then written with the ORIGINAL rule -- `nearest is not
 * in the allowed set` -- and reproduced the same failure exactly:
 *
 *     refused for eco-1-central-problems — solution out of scope:
 *     solving it needs mat-6-returns
 *
 * A generic template solution has no economics vocabulary, so its nearest topic
 * is whatever seed topic happens to share a word. Nearest was never evidence.
 *
 * The repair is not a third rule. It is to REUSE `driftsFrom`, which already
 * carries the corrected one. Two copies of a rule is how the second copy comes
 * out different, and this is the second time in this file that has happened --
 * the unknown-topic guard was the first.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a weak match is not evidence that the solution left the topic', () => {
  it('admits a solution with no strong match anywhere', () => {
    /*
     * THE FAILURE THAT REFUSED EVERY SESSION. This solution belongs to no
     * topic in particular; some topic will still be "nearest".
     */
    const violations = scopeViolations(
      'Solve the quadratic equation and state its roots.',
      'Halve the total, then subtract the smaller figure to get the result.',
      SCOPE,
      CENTROIDS,
    );

    expect(violations).toEqual([]);
  });

  it('still refuses a solution that decisively belongs elsewhere', () => {
    /*
     * THE PAIR. Requiring a decisive margin must not become requiring
     * certainty, or the gate never fires and is decoration.
     */
    const violations = scopeViolations(
      'Find the maximum value of y = -x squared + 6x - 5.',
      'Differentiate to get the derivative, then find the stationary point of the function.',
      SCOPE,
      CENTROIDS,
    );

    expect(violations).toContain('solution-out-of-scope');
  });
});
