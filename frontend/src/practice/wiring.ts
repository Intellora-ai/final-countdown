import type { Subject } from './curriculum'
import { validateQuestionTopic, type TopicBoundary } from './engine/boundary'
import { buildCentroids, driftsFrom, nearestTopic, scoreFor } from './engine/drift'
import { requirementsOf, scopeViolations, type QuestionRequirements } from './engine/requirements'
import type { TopicProfile } from './engine/plan'
import type { VerifiedQuestion } from './engine/types'

/**
 * THE WIRE BETWEEN THE SESSION AND THE ENGINES THAT NOTHING CALLED.
 *
 * `boundary.ts` was written, fully tested, and had ZERO non-test importers.
 * Every quality signal was green and not one line of it ever ran in the
 * product -- the state this repository's notes call `CONFIGURED TO BE CHECKED`,
 * and the most expensive kind of green there is.
 *
 * This module is deliberately thin. Every decision stays in the engine, so what
 * is tested here is that the engine is REACHED and its verdict ACTED ON. A wire
 * that calls a validator and ignores the answer is not a wire.
 */

/**
 * What this session will accept, derived from the PROFILE.
 *
 * The direction is the whole point. A boundary derived from the question would
 * accept whatever arrived, which is a check that cannot fail.
 */
export function boundaryFor(profile: TopicProfile): TopicBoundary {
  return {
    topicId: profile.topicId,
    chapterId: profile.chapterId,
    allowedConceptIds: profile.concepts.map((concept) => concept.id),
  }
}

/**
 * May this question reach the student?
 *
 * Catches what `verify.ts` structurally cannot: a question carrying the right
 * topic id while testing somebody else's concept, and a prerequisite that has
 * become the target.
 */
export function deliverable(question: VerifiedQuestion, boundary: TopicBoundary): boolean {
  return validateQuestionTopic(question, boundary).ok
}

/**
 * §35 REPLACED THE ALL-TEXT BAN. READ THIS BEFORE REINSTATING IT.
 *
 * `setDrawsSomething` used to refuse a set in which no question carried a
 * figure, on the reasoning that a practice set which draws nothing is not the
 * product that was promised. It ran on the real path and it refused real
 * sessions.
 *
 * The directive that replaced it is explicit and points the other way:
 *
 *   "A question must NEVER receive a graph, diagram, chart, table, image, or
 *    other visual merely because it is available."
 *   "Sometimes that is plain text." (§35.6)
 *   "Use the minimum representation necessary." (§35.7)
 *
 * The two rules cannot both hold. `figureFor` now omits a figure when the text
 * already states every quantity it would plot -- §35.3, "if I remove this
 * visual, does the question get materially worse?" -- and for the current
 * generator the answer is no on every question, so every set became all-text
 * and every session refused with SET_DRAWS_NOTHING. Measured, not predicted.
 *
 * A REQUIREMENT CONFLICT RESOLVED BY THE NEWER REQUIREMENT, not a gate
 * switched off because it was inconvenient. What replaces it is §35.1, which
 * binds just as hard in the opposite direction: a NECESSARY visual must not be
 * omitted, and that is enforced in `figure.ts` by keeping the figure the moment
 * the text withholds even one quantity.
 *
 * `setIsAllText` and `TEXT_ONLY` stay in `representation.ts` and are still
 * tested there. They are no longer wired to a refusal, and that is the honest
 * state: they describe a property of a set that nothing currently rejects on.
 */

/**
 * THE ADMISSION GATE. Can this question enter this session?
 *
 * `deliverable` above asks three questions and every one reads a field WE
 * stamped at generation: `question.topicId === boundary.topicId`, where both
 * sides come from the same spec. On the generation path that comparison cannot
 * fail -- measured, 12 of 12 nonsense questions passed it. Stamping guarantees
 * the LABEL, never the question.
 *
 * `driftsFrom` reads the TEXT and asks something a stamp cannot answer: of all
 * the topics in this curriculum, is the requested one really the nearest? A
 * linear-equations question inside a quadratics session is correctly stamped,
 * lives in the same chapter, and is still the wrong question.
 *
 * BOTH GATES RUN. The drift check does not replace the id checks -- a question
 * carrying a foreign topic id stays refused however plausible its wording, and
 * the two catch different defects.
 *
 * FAILS OPEN ON AN EMPTY CURRICULUM. A caller with no centroids -- a test, a
 * seeded session, a class whose data has not loaded -- must still get
 * questions. Refusing there would make "we could not check" indistinguishable
 * from "this question is bad".
 */
export interface Admission {
  readonly ok: boolean;
  /** Why it was refused, in words a log reader can act on. Empty when admitted. */
  readonly reason: string;
}

export function admits(
  question: VerifiedQuestion,
  boundary: TopicBoundary,
  curriculum: readonly Subject[],
): Admission {
  /*
   * A REASON, NOT A BOOLEAN, AND THAT IS A BUG FIX.
   *
   * The first version returned `boolean`, and the caller reported every refusal
   * as `INVALID_TOPIC: did not pass the topic boundary`. Two gates, one
   * message: when a session started refusing, the message said "boundary" while
   * the drift check was the one that fired, and finding that out took four
   * separate measurements that the message should have handed over for free.
   */
  const verdict = validateQuestionTopic(question, boundary);
  if (!verdict.ok) {
    return { ok: false, reason: `boundary: ${verdict.reasons.join(', ')}` };
  }

  /*
   * FAILS OPEN ON AN EMPTY CURRICULUM. A caller with no centroids -- a test, a
   * seeded session, a class whose data has not loaded -- must still get
   * questions. Refusing there would make "we could not check" indistinguishable
   * from "this question is bad".
   */
  if (curriculum.length === 0) return { ok: true, reason: '' };

  const centroids = buildCentroids(curriculum);

  if (driftsFrom(question.questionText, boundary.topicId, centroids)) {
    const near = nearestTopic(question.questionText, centroids);
    const mine = scoreFor(question.questionText, boundary.topicId, centroids);

    return {
      ok: false,
      reason: `drift: this topic scored ${mine.toFixed(3)}, ${near?.topicId ?? 'another topic'} scored ${(near?.score ?? 0).toFixed(3)}`,
    };
  }

  /*
   * THE SOLUTION HAS TO BE ADMISSIBLE TOO, and nothing checked it before.
   *
   * A question can sit perfectly inside its topic while the only route to the
   * answer lives outside it:
   *
   *     Session:   Quadratic equations
   *     Question:  "Find the maximum value of y = -x² + 6x - 5."
   *     Solution:  "Differentiate: dy/dx = -2x + 6..."
   *
   * The question is a quadratic and the SOLUTION is calculus. A student who has
   * not met differentiation cannot answer it. Every gate above admits it,
   * because every gate above reads the QUESTION -- `fullSolution` had exactly
   * two readers in this engine and both check its length.
   *
   * The scope here is the session topic ALONE. A caller wanting the
   * prerequisite-aware mode passes the extra topics to `scopeViolations`
   * directly: widening a scope is a decision, and it is one this wire
   * deliberately does not make on anybody's behalf.
   */
  const violations = scopeViolations(
    question.questionText,
    question.fullSolution,
    { topicId: boundary.topicId, allowedTopicIds: [] },
    centroids,
  );

  if (violations.includes('solution-out-of-scope')) {
    const near = nearestTopic(question.fullSolution, centroids);
    return {
      ok: false,
      reason: `solution out of scope: solving it needs ${near?.topicId ?? 'another topic'}, which this session does not allow`,
    };
  }

  return { ok: true, reason: '' };
}

/**
 * WHAT THIS QUESTION REQUIRES, READ OUT OF ITS OWN TEXT.
 *
 * The directive asks for questions that carry their own requirements rather
 * than being trusted because of where somebody filed them. That was declined
 * once, and the reason was good: a field nothing reads is how this repository
 * ended up with four engines that had green tests and no callers.
 *
 * It has a consumer now. `admits` already computes exactly this to decide
 * admission; this hands the same answer to a caller, so a refusal can be
 * explained and a question can be described by what it NEEDS.
 *
 * DERIVED, NEVER DECLARED, and that is the whole design. A stored field would
 * be a second source of truth for the same fact — and this file already carries
 * the scar from one of those: `question.topicId === boundary.topicId` compares
 * our stamp to our stamp and cannot fail. Reading the text answers `derivatives`
 * for a calculus question stamped `quadratics`, which is the fact a caller
 * actually needs.
 *
 * `null` for a half that cannot be placed. Unknown is a real answer, and naming
 * the least-bad topic would invent a requirement.
 */
export function requirementsFor(
  question: VerifiedQuestion,
  curriculum: readonly Subject[],
): QuestionRequirements {
  if (curriculum.length === 0) return { fromQuestion: null, fromSolution: null }

  return requirementsOf(question.questionText, question.fullSolution, buildCentroids(curriculum))
}
