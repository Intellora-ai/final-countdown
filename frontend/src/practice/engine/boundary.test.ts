import { describe, expect, it } from 'vitest';

import { asChapterId, asTopicId } from './ids';
import { validateQuestionTopic, type TopicBoundary } from './boundary';
import type { VerifiedQuestion } from './types';

/**
 * THE LAST GATE BEFORE A QUESTION REACHES A STUDENT.
 *
 * `verify.ts` already refuses a candidate whose `topicId` differs from the
 * session's. That check runs at GENERATION time, inside the pipeline, against
 * the profile the pipeline itself built.
 *
 * This one runs at DELIVERY time, against the boundary the SESSION declared,
 * and it asks more than one question. The distinction matters because the two
 * failures look identical from the outside and have different causes: a
 * generator that wandered, versus a question that arrived from a cache, a
 * fixture, a replayed request, or a future code path nobody has written yet.
 *
 * A check that only the generator's own output passes through is not a
 * boundary. It is a self-assessment.
 */

const BOUNDARY: TopicBoundary = {
  topicId: asTopicId('functions--graphs'),
  chapterId: asChapterId('functions'),
  allowedConceptIds: ['functions--graphs--intercepts', 'functions--graphs--turning-points'],
};

function question(over: Partial<VerifiedQuestion> = {}): VerifiedQuestion {
  return {
    questionId: 'q1',
    sessionId: 's1',
    topicId: asTopicId('functions--graphs'),
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
    fullSolution: 'Set y to zero and solve for x, which gives one root.',
    reasoningStructure: 'direct',
    prerequisites: [],
    generationSource: 'fixture',
    verificationStatus: 'verified',
    similarityStatus: 'novel',
    qualityScore: 1,
    fingerprint: 'fp',
    ...over,
  } as VerifiedQuestion;
}

describe('the topic boundary validator', () => {
  it('passes a question that belongs', () => {
    expect(validateQuestionTopic(question(), BOUNDARY)).toEqual({ ok: true, reasons: [] });
  });

  it('rejects a sibling topic, which is the whole point', () => {
    const sibling = question({ topicId: asTopicId('functions--inverse') });
    const result = validateQuestionTopic(sibling, BOUNDARY);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('topic-mismatch');
  });

  it('rejects a concept the topic does not own', () => {
    /*
     * The topic id can be right while the question tests something else
     * entirely -- a generator that took the right label and the wrong idea.
     * `verify.ts` cannot see this, because it only compares topic ids.
     */
    const strayConcept = question({ conceptId: 'algebra--factorising' });
    const result = validateQuestionTopic(strayConcept, BOUNDARY);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('concept-outside-topic');
  });

  it('rejects a question whose prerequisite became its target', () => {
    /*
     * §4. A prerequisite is a dependency, never the thing under test. If the
     * two are ever the same string the distinction has collapsed, and the
     * question is testing its own precondition.
     */
    const confused = question({ prerequisites: ['functions--graphs'] });
    const result = validateQuestionTopic(confused, BOUNDARY);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('prerequisite-is-target');
  });

  it('reports every reason at once, not just the first', () => {
    /*
     * One reason at a time turns a fix into a guessing game: correct the topic,
     * re-run, discover the concept was also wrong. The caller gets the whole
     * picture in one pass.
     */
    const doubly = question({
      topicId: asTopicId('functions--inverse'),
      conceptId: 'algebra--factorising',
    });
    const result = validateQuestionTopic(doubly, BOUNDARY);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['topic-mismatch', 'concept-outside-topic']),
    );
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  it('holds for any topic, over a generated space', () => {
    /*
     * §29. For ANY valid request the topic that comes back is the topic asked
     * for -- and a question built for a neighbour is refused, every time.
     *
     * Both directions are generated. A property test that only ever feeds
     * matching questions is satisfied by `return { ok: true }`.
     */
    let accepted = 0;
    let refused = 0;

    for (let seed = 0; seed < 500; seed += 1) {
      const chapterId = asChapterId(`ch-${seed % 13}`);
      const topicId = asTopicId(`${chapterId}--topic-${seed}`);
      const conceptId = `${topicId}--idea`;
      const boundary: TopicBoundary = { topicId, chapterId, allowedConceptIds: [conceptId] };

      const belongs = question({ topicId, conceptId });
      expect(validateQuestionTopic(belongs, boundary).ok).toBe(true);
      accepted += 1;

      const neighbour = question({ topicId: asTopicId(`${chapterId}--topic-${seed + 1}`), conceptId });
      expect(validateQuestionTopic(neighbour, boundary).ok).toBe(false);
      refused += 1;
    }

    /* A run that checked nothing would satisfy every assertion above. */
    expect(accepted).toBe(500);
    expect(refused).toBe(500);
  });
});
