import { describe, expect, it } from 'vitest';

import { asChapterId, asSubjectId, asTopicId } from './ids';
import { GENERATION_VERSION } from './types';
import { verify } from './verify';
import type { CandidateQuestion } from './types';

/**
 * §19 — WHAT A QUESTION MUST BE ABLE TO SAY ABOUT ITSELF.
 *
 * A verified question already carried its topic, concept, type, difficulty and
 * fingerprint. It could not say which SUBJECT or CHAPTER it came from, which
 * misconception it was built to catch, or which version of the generator made
 * it -- even though the spec it was generated from knew all four.
 *
 * The information was thrown away one step before the only place it is read.
 *
 * WHY THAT IS NOT COSMETIC
 * ------------------------
 * `misconceptionTested` is the input to targeted practice: a student who keeps
 * choosing the distractor for "confuses range with y-intercepts" can only be
 * given more of those questions if the delivered question remembers which
 * misconception it tested. Dropping it makes §16 unimplementable.
 *
 * `generationVersion` is what makes a bad batch recallable. Without it, "every
 * question made between Tuesday and Thursday has the same flaw" is a sentence
 * nobody can act on.
 */

function candidate(): CandidateQuestion {
  return {
    candidateId: 'c1',
    spec: {
      specId: 'spec-1',
      topicId: asTopicId('functions--graphs'),
      chapterId: asChapterId('functions'),
      subjectId: asSubjectId('mathematics'),
      conceptId: 'functions--graphs--intercepts',
      conceptName: 'Intercepts',
      questionType: 'standard',
      difficultyTarget: 'medium',
      reasoningStructure: 'direct',
      prerequisites: [],
      misconceptionTested: 'confuses the range with the y-intercepts',
    },
    questionText: 'Where does the curve cross the x-axis?',
    options: [
      { key: 'A', text: 'At x = 1', rationale: '' },
      { key: 'B', text: 'At x = 2', rationale: 'reads the y-intercept instead' },
      { key: 'C', text: 'At x = 3', rationale: 'solves for y rather than x' },
      { key: 'D', text: 'At x = 4', rationale: 'sign error when rearranging' },
    ],
    correctOption: 'A',
    fullSolution:
      'Set y to zero, because a crossing of the x-axis is exactly the point where the height is zero, and solve the resulting equation for x. That gives a single root at x = 1.',
    generationSource: 'fixture',
  } as unknown as CandidateQuestion;
}

describe('a verified question carries its whole provenance', () => {
  const outcome = verify({
    candidate: candidate(),
    sessionId: 's1',
    expectedTopicId: asTopicId('functions--graphs'),
  });

  it('verified the fixture, so the assertions below are about a real question', () => {
    /*
     * Stated first and on purpose. Every assertion after this reads a field off
     * `outcome.question`; if verification had failed, they would all be reading
     * from `undefined` and the failure would look like a missing field rather
     * than a broken fixture.
     */
    expect(outcome.ok).toBe(true);
  });

  it('remembers the chapter and subject it came from', () => {
    expect(outcome.ok && outcome.question.chapterId).toBe('functions');
    expect(outcome.ok && outcome.question.subjectId).toBe('mathematics');
  });

  it('remembers which misconception it was built to catch', () => {
    /* §16. Targeted practice cannot exist without this surviving delivery. */
    expect(outcome.ok && outcome.question.misconceptionTested).toBe(
      'confuses the range with the y-intercepts',
    );
  });

  it('stamps the generator version, so a bad batch can be found later', () => {
    expect(outcome.ok && outcome.question.generationVersion).toBe(GENERATION_VERSION);
    expect(GENERATION_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it('does not invent a misconception when the spec had none', () => {
    /*
     * A fabricated misconception is worse than a missing one: the engine builds
     * distractors around it and teaches a student something false about their
     * own error. `null` is the honest answer.
     */
    const bare = candidate();
    const withoutMisconception = {
      ...bare,
      spec: { ...bare.spec, misconceptionTested: null },
    } as CandidateQuestion;

    const result = verify({
      candidate: withoutMisconception,
      sessionId: 's1',
      expectedTopicId: asTopicId('functions--graphs'),
    });

    expect(result.ok && result.question.misconceptionTested).toBeNull();
  });
});
