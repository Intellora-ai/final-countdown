import { describe, expect, it } from 'vitest';

import { boundaryFor, deliverable, setDrawsSomething } from './wiring';
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
 * THE BAN ON A SET THAT DRAWS NOTHING.
 *
 * `engine/representation.ts` has held `setIsAllText` since it was written, with
 * ZERO non-test importers. It could not have fired even once: no question
 * carried a figure at all, so there was nothing for it to look at.
 *
 * Wiring it before questions had figures would have refused every session in
 * the product, which is why `engine/figure.ts` came first.
 *
 * ONE FIGURE IS THE BAR, on purpose. Requiring one per question forces a
 * diagram onto questions that do not need one, and a decorative chart is its
 * own kind of noise.
 */
describe('a set of questions has to draw something', () => {
  const withFigure = () =>
    question({
      figure: {
        kind: 'figure',
        id: 'f1',
        emphasis: 'supporting',
        tone: 'neutral',
        as: 'bar',
        data: {
          shape: 'series',
          series: [{ name: 's', colorIndex: 0, points: [{ x: 'a', y: 1 }] }],
          continuousX: false,
          stacked: false,
        },
      },
    } as unknown as Partial<VerifiedQuestion>);

  it('refuses a set where every question is text', () => {
    expect(setDrawsSomething([question(), question(), question()])).toBe(false);
  });

  it('accepts a set where one question carries a figure', () => {
    expect(setDrawsSomething([question(), withFigure(), question()])).toBe(true);
  });

  it('refuses an EMPTY set rather than passing it', () => {
    /*
     * Zero of zero questions carry a figure. Arithmetic says the ban is
     * satisfied; usefulness says nothing was delivered. Reading it as a pass is
     * how a generator that produced nothing reports success.
     */
    expect(setDrawsSomething([])).toBe(false);
  });
});
