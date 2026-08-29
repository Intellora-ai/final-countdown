import { describe, expect, it } from 'vitest';

import { admits, boundaryFor, deliverable, requirementsFor } from './wiring';
import { asChapterId, asSubjectId, asTopicId } from './engine/ids';
import type { TopicProfile } from './engine/plan';
import type { VerifiedQuestion } from './engine/types';

/**
 * THE FOUR ENGINES THAT WERE BUILT AND CALLED BY NOTHING.
 *
 * `boundary.ts`, `representation.ts`, `officialCurriculum.ts` and `steer.ts`
 * were each written, each fully tested, and each had ZERO non-test importers.
 * Every quality signal was green and not one line of them ever ran in the
 * product. That is the state this repository's own notes call
 * `CONFIGURED TO BE CHECKED`, and it is the most expensive kind of green.
 *
 * This module is the wire. It is deliberately thin: the decisions all live in
 * the engines, so what is tested here is that the engines are REACHED and that
 * their verdict is ACTED ON -- not the decisions themselves, which have their
 * own tests.
 *
 * A wire that calls an engine and ignores what it says is not a wire.
 */

const PROFILE: TopicProfile = {
  topicId: asTopicId('functions--graphs'),
  chapterId: asChapterId('functions'),
  subjectId: asSubjectId('mathematics'),
  quantitative: 0.7,
  concepts: [
    {
      id: 'functions--graphs--intercepts',
      name: 'Intercepts',
      topicId: asTopicId('functions--graphs'),
      numeric: true,
      prerequisites: [],
      commonMisconception: null,
    },
    {
      id: 'functions--graphs--turning-points',
      name: 'Turning points',
      topicId: asTopicId('functions--graphs'),
      numeric: true,
      prerequisites: [],
      commonMisconception: null,
    },
  ],
};

function question(over: Partial<VerifiedQuestion> = {}): VerifiedQuestion {
  return {
    questionId: 'q1',
    sessionId: 's1',
    topicId: asTopicId('functions--graphs'),
    chapterId: 'functions',
    subjectId: 'mathematics',
    misconceptionTested: null,
    generationVersion: '1.0',
    conceptId: 'functions--graphs--intercepts',
    questionType: 'standard',
    difficulty: 'medium',
    questionText: 'Where does the curve cross the x-axis?',
    options: [
      { key: 'A', text: '1', rationale: '' },
      { key: 'B', text: '2', rationale: 'reads the y-intercept' },
      { key: 'C', text: '3', rationale: 'solves for y' },
      { key: 'D', text: '4', rationale: 'sign error' },
    ],
    correctOption: 'A',
    fullSolution: 'Set y to zero and solve for x.',
    reasoningStructure: 'direct',
    prerequisites: [],
    generationSource: 'fixture',
    figure: null,
    verificationStatus: 'PASSED',
    similarityStatus: 'novel',
    qualityScore: 1,
    fingerprint: 'fp',
    ...over,
  } as unknown as VerifiedQuestion;
}

describe('the boundary a session declares', () => {
  it('takes its allowed concepts from the profile, not from the question', () => {
    /*
     * The direction matters. A boundary derived from the question would accept
     * whatever arrived, which is a check that cannot fail.
     */
    const boundary = boundaryFor(PROFILE);
    expect(boundary.topicId).toBe(PROFILE.topicId);
    expect([...boundary.allowedConceptIds].sort()).toEqual([
      'functions--graphs--intercepts',
      'functions--graphs--turning-points',
    ]);
  });
});

describe('a question only reaches the student if the boundary passes it', () => {
  it('lets a question from the right topic through', () => {
    expect(deliverable(question(), boundaryFor(PROFILE))).toBe(true);
  });

  it('stops a sibling topic', () => {
    expect(deliverable(question({ topicId: asTopicId('functions--inverse') }), boundaryFor(PROFILE)))
      .toBe(false);
  });

  it('stops a concept the topic does not own, even with the right topic id', () => {
    /*
     * This is the case `verify.ts` cannot see, because it compares topic ids
     * and nothing else. If this returns true, the wire is calling the validator
     * and discarding its answer.
     */
    expect(deliverable(question({ conceptId: 'algebra--factorising' }), boundaryFor(PROFILE)))
      .toBe(false);
  });

  it('stops a question whose prerequisite became its target', () => {
    expect(deliverable(question({ prerequisites: ['functions--graphs'] }), boundaryFor(PROFILE)))
      .toBe(false);
  });
});

/*
 * THE BAN ON A SET THAT DRAWS NOTHING WAS REMOVED, AND ITS TESTS WITH IT.
 *
 * `setDrawsSomething` refused any set in which no question carried a figure.
 * §35 of the quality directive overrules it:
 *
 *   "A question must NEVER receive a graph, diagram, chart, table, image, or
 *    other visual merely because it is available."
 *   "Sometimes that is plain text." (§35.6)
 *
 * `figureFor` now omits a figure when the question text already states every
 * quantity the chart would plot. For the current generator that is every
 * question, so every set became all-text and every session refused with
 * SET_DRAWS_NOTHING -- measured in a test run, not predicted.
 *
 * A REQUIREMENT CONFLICT RESOLVED BY THE NEWER REQUIREMENT. It is recorded here
 * rather than quietly deleted, because a removed test and a test that was
 * always missing look identical to whoever reads this file next. The opposite
 * failure -- dropping a NECESSARY visual -- is §35.1 and is covered by
 * `figure.test.ts`, which asserts the figure survives the moment the text
 * withholds a quantity.
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ADMISSION GATE, ON THE REAL PATH.
 *
 * `boundary.ts` asks three questions and every one of them reads a field WE
 * stamped: `question.topicId === boundary.topicId`, where both sides come from
 * the same spec. On the generation path that comparison cannot fail, and
 * measured, 12 of 12 nonsense questions passed it.
 *
 * `drift.ts` reads the question TEXT and asks a different question: of all the
 * topics in this curriculum, is the requested one really the nearest? That is
 * the check a stamp cannot satisfy by construction.
 *
 * Wired here so it runs before a question reaches a student, rather than
 * becoming the fifth engine in this directory with green tests and no callers.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a question is admitted only if it belongs', () => {
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
            { id: 'functions--graphs', name: 'Quadratic equations and the discriminant' },
            { id: 'linear', name: 'Pair of linear equations by substitution' },
          ],
        },
      ],
    },
  ] as never;

  it('admits a question whose words match the topic it was made for', () => {
    const question2 = question({
      questionText: 'For which values of k does this quadratic equation have equal roots?',
    } as Partial<VerifiedQuestion>);

    expect(admits(question2, boundaryFor(PROFILE), CURRICULUM).ok).toBe(true);
  });

  it('refuses a question that belongs to a different topic', () => {
    /*
     * THE CASE EVERY EXISTING CHECK MISSES. Same subject, same chapter,
     * correctly stamped with the session's topic id -- and it is a
     * linear-equations question inside a quadratics session.
     */
    const wrong = question({
      questionText: 'Solve the pair of linear equations by substitution: 2x + y = 7, x − y = 2.',
    } as Partial<VerifiedQuestion>);

    const admission = admits(wrong, boundaryFor(PROFILE), CURRICULUM);
    expect(admission.ok).toBe(false);
    /* The reason names the gate that fired, so a log reader is not left guessing. */
    expect(admission.reason).toContain('drift');
  });

  it('still refuses what the boundary already refused', () => {
    /*
     * THE PAIR. Adding a drift check must not replace the id checks -- a
     * question from a genuinely different topic id has to stay refused even if
     * its wording happens to look right.
     */
    const foreign = question({
      topicId: asTopicId('somewhere-else'),
      questionText: 'For which values of k does this quadratic equation have equal roots?',
    } as Partial<VerifiedQuestion>);

    const admission = admits(foreign, boundaryFor(PROFILE), CURRICULUM);
    expect(admission.ok).toBe(false);
    expect(admission.reason).toContain('boundary');
  });

  it('admits when the curriculum is unknown, rather than refusing everything', () => {
    /*
     * FAILS OPEN. The drift gate needs a curriculum to compare against, and a
     * caller that has none -- a test, a seeded session, a class whose data has
     * not loaded -- must still get questions. Refusing here would make an
     * absent centroid indistinguishable from a bad question.
     */
    const any = question({ questionText: 'Anything at all, really.' } as Partial<VerifiedQuestion>);

    expect(admits(any, boundaryFor(PROFILE), []).ok).toBe(true);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SOLUTION HAS TO BE ADMISSIBLE TOO.
 *
 * `admits` checked the question three ways and never opened the solution. A
 * question can sit perfectly inside its topic while the only route to the
 * answer lives outside it, and that question passes every other gate here.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a question is refused when its SOLUTION leaves the topic', () => {
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
              id: 'functions--graphs',
              name: 'Quadratic equations',
              concepts: [{ id: 'q', name: 'Completing the square', numeric: true }],
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
              concepts: [{ id: 'd', name: 'Derivative and stationary points', numeric: true }],
            },
          ],
        },
      ],
    },
  ] as never;

  it('refuses a quadratics question solved by differentiation', () => {
    const calculus = question({
      questionText: 'Find the maximum value of y = -x squared + 6x - 5.',
      fullSolution: 'Differentiate to get the derivative, then find the stationary point.',
    } as Partial<VerifiedQuestion>);

    const admission = admits(calculus, boundaryFor(PROFILE), CURRICULUM);

    expect(admission.ok).toBe(false);
    /* The reason names the SOLUTION, so a log reader is not sent to the question. */
    expect(admission.reason).toContain('solution');
  });

  it('admits the same question solved inside the topic', () => {
    /*
     * THE PAIR, and it is the whole point. Identical question, different route.
     * A gate that refused both would be refusing the question, not the
     * solution, and would have no business reading `fullSolution` at all.
     */
    const inScope = question({
      questionText: 'Find the maximum value of y = -x squared + 6x - 5.',
      fullSolution: 'Complete the square to write it as -(x - 3) squared + 4, so the maximum is 4.',
    } as Partial<VerifiedQuestion>);

    expect(admits(inScope, boundaryFor(PROFILE), CURRICULUM).ok).toBe(true);
  });

  it('admits a solution it cannot place, rather than refusing it', () => {
    const unreadable = question({
      questionText: 'Solve the quadratic equation and state its roots.',
      fullSolution: 'zzz qqq wwww.',
    } as Partial<VerifiedQuestion>);

    expect(admits(unreadable, boundaryFor(PROFILE), CURRICULUM).ok).toBe(true);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * §3 — THE QUESTION DESCRIBES ITSELF, AND SOMETHING READS IT.
 *
 * The directive asks for questions carrying `required_topics` rather than
 * trusting where somebody filed them. That was declined once, on the grounds
 * that a field nothing reads is how this repository ended up with four engines
 * that had green tests and no callers -- adding one would have been adding the
 * disease.
 *
 * It has a consumer now. `admits` already computes what the question and its
 * solution require in order to decide admission; `requirementsFor` returns that
 * same answer to a caller, so a refusal can be explained and a question can be
 * filed by what it NEEDS rather than by where it was put.
 *
 * DERIVED, NEVER DECLARED. The requirement is read out of the question's own
 * text every time it is asked for. A stored field would be a second source of
 * truth for the same fact, and this file already carries the scar from one of
 * those: `question.topicId === boundary.topicId` compares our stamp to our
 * stamp and cannot fail.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a question can say what it requires', () => {
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
              id: 'functions--graphs',
              name: 'Quadratic equations',
              concepts: [{ id: 'q', name: 'Completing the square', numeric: true }],
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
              concepts: [{ id: 'd', name: 'Derivative and stationary points', numeric: true }],
            },
          ],
        },
      ],
    },
  ] as never;

  it('names the topic the question needs and the topic the SOLUTION needs', () => {
    const calculus = question({
      questionText: 'Find the maximum value of y = -x squared + 6x - 5.',
      fullSolution: 'Differentiate to get the derivative, then find the stationary point of the function.',
    } as Partial<VerifiedQuestion>);

    expect(requirementsFor(calculus, CURRICULUM)).toEqual({
      fromQuestion: 'functions--graphs',
      fromSolution: 'derivatives',
    });
  });

  it('is derived from the text, not from the stamp on the question', () => {
    /*
     * THE ASSERTION THAT MAKES THIS WORTH HAVING. The question is stamped
     * `functions--graphs` and its words are calculus. A field copied from the
     * stamp would answer `functions--graphs` and be useless; reading the text
     * answers `derivatives`, which is the fact a caller needs.
     */
    const mislabelled = question({
      questionText: 'Differentiate the function and find its stationary points.',
      fullSolution: 'The derivative is zero at the stationary point of the function.',
    } as Partial<VerifiedQuestion>);

    expect(mislabelled.topicId).toBe('functions--graphs');
    expect(requirementsFor(mislabelled, CURRICULUM).fromQuestion).toBe('derivatives');
  });

  it('answers null for a half it cannot place, rather than guessing', () => {
    const unreadable = question({
      questionText: 'zzz qqq',
      fullSolution: 'wwww vvvv',
    } as Partial<VerifiedQuestion>);

    expect(requirementsFor(unreadable, CURRICULUM)).toEqual({
      fromQuestion: null,
      fromSolution: null,
    });
  });

  it('answers null for everything when there is no curriculum to compare against', () => {
    const any = question({} as Partial<VerifiedQuestion>);

    expect(requirementsFor(any, [])).toEqual({ fromQuestion: null, fromSolution: null });
  });
});
