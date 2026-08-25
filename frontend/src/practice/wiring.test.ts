import { describe, expect, it } from 'vitest';

import { boundaryFor, deliverable } from './wiring';
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
