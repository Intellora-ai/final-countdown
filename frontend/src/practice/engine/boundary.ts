import type { ChapterId, TopicId } from './ids';
import type { VerifiedQuestion } from './types';

/**
 * What a session declares its questions may be about.
 *
 * Carried explicitly rather than derived from the question, because a check
 * that reads its expectation off the thing being checked always passes.
 */
export interface TopicBoundary {
  readonly topicId: TopicId;
  readonly chapterId: ChapterId;
  /** The concepts this topic owns. A question may test one of these, and nothing else. */
  readonly allowedConceptIds: readonly string[];
  /**
   * Knowledge a question is permitted to ASSUME but not to test.
   *
   * §2 of the quality directive, and the clause it calls extremely important:
   * "if question.answer depends on out_of_scope_knowledge beyond permitted
   * dependencies: reject()". A quadratics question may legitimately assume
   * basic algebra; it may not assume differentiation.
   *
   * OPTIONAL, AND ITS ABSENCE MEANS "NO DEPENDENCY POLICY" -- never "nothing is
   * allowed". Every boundary written before this field omits it, and reading
   * that as an empty allow-list would refuse every question with any
   * prerequisite at all: a silent, total regression dressed as a new feature.
   */
  readonly allowedDependencies?: readonly string[];
}

export type BoundaryFailure =
  | 'topic-mismatch'
  | 'concept-outside-topic'
  | 'prerequisite-is-target'
  | 'dependency-outside-scope';

export interface BoundaryResult {
  readonly ok: boolean;
  readonly reasons: readonly BoundaryFailure[];
}

/**
 * THE LAST GATE BEFORE A QUESTION REACHES A STUDENT.
 *
 * `verify.ts` already refuses a candidate whose `topicId` differs from the
 * session's. That runs at GENERATION time, inside the pipeline, against the
 * profile the pipeline itself built. This runs at DELIVERY time, against the
 * boundary the SESSION declared, and asks more than one question.
 *
 * The distinction matters because the two failures look identical from outside
 * and have different causes: a generator that wandered, versus a question that
 * arrived from a cache, a fixture, a replayed request, or a code path nobody
 * has written yet. A check only the generator's own output passes through is
 * not a boundary; it is a self-assessment.
 *
 * EVERY REASON, NOT THE FIRST. One at a time turns a fix into a guessing game:
 * correct the topic, re-run, discover the concept was wrong too.
 */
export function validateQuestionTopic(
  question: VerifiedQuestion,
  boundary: TopicBoundary,
): BoundaryResult {
  const reasons: BoundaryFailure[] = [];

  if (question.topicId !== boundary.topicId) reasons.push('topic-mismatch');

  /*
   * The topic id can be right while the question tests something else entirely
   * -- a generator that took the correct label and the wrong idea. Comparing
   * topic ids alone cannot see that.
   */
  if (!boundary.allowedConceptIds.includes(question.conceptId)) {
    reasons.push('concept-outside-topic');
  }

  /*
   * §4. A prerequisite is a dependency, never the thing under test. If the two
   * are ever the same string the distinction has collapsed and the question is
   * testing its own precondition.
   */
  if (question.prerequisites.includes(boundary.topicId)) {
    reasons.push('prerequisite-is-target');
  }

  /*
   * §2 — A QUESTION MAY ONLY ASSUME WHAT THE SCOPE PERMITS.
   *
   * `prerequisites` has been on the question since it was written and was
   * checked exactly ONE way above: a prerequisite must not BE the target topic.
   * Nobody ever asked whether the prerequisite was ALLOWED.
   *
   * So a quadratics question whose answer needs differentiation passed: stamped
   * correctly, concept in scope, prerequisite not circular. The student cannot
   * answer it, and every gate said yes.
   *
   * The guard on `undefined` is what makes this safe to add: an absent list is
   * a scope with no dependency policy, not a scope that permits nothing.
   */
  if (boundary.allowedDependencies !== undefined) {
    const permitted = new Set(boundary.allowedDependencies);
    const assumesSomethingForeign = question.prerequisites.some(
      (prerequisite) => prerequisite !== boundary.topicId && !permitted.has(prerequisite),
    );

    if (assumesSomethingForeign) reasons.push('dependency-outside-scope');
  }

  return { ok: reasons.length === 0, reasons };
}
