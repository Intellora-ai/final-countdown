import { nearestTopic, type TopicCentroid } from './drift';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT DOES THIS QUESTION ACTUALLY REQUIRE?
 *
 * Every scope check before this one reads the QUESTION. None reads the
 * SOLUTION, and a question can sit perfectly inside its topic while the only
 * route to the answer lives outside it:
 *
 *     Session:   Quadratic equations
 *     Question:  "Find the maximum value of y = -x² + 6x - 5."
 *     Solution:  "Differentiate: dy/dx = -2x + 6. Set it to zero..."
 *
 * The question is a quadratic. The SOLUTION is calculus. A student who has not
 * met differentiation cannot answer it, and every existing gate admits it:
 * `boundary.ts` compares ids, `drift.ts` scores the question text, and neither
 * has ever opened `fullSolution`. Measured -- the only two places that read it
 * check its LENGTH and look for reasoning keywords.
 *
 * A question is admissible only when the knowledge it REQUIRES, to be read and
 * to be solved, is inside the session's declared scope.
 *
 * WHAT THIS IS NOT, BEFORE WHAT IT IS
 * -----------------------------------
 * It does not parse mathematics and it does not trace a derivation. It asks
 * which topic each half is NEAREST to, using the same lexical centroids the
 * drift gate uses. A solution whose vocabulary belongs to another topic is the
 * case that ships. A solution that silently assumes an idea without naming it
 * is NOT caught, and claiming otherwise would be the kind of green this project
 * keeps paying for.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * What a question is built from, read out of its own text.
 *
 * SEPARATE HALVES, because they fail differently and the repairs differ. A
 * question from the wrong topic was generated wrong and should be regenerated.
 * A right question with an out-of-scope solution was written for a student who
 * has not got there yet, and the repair is a different ROUTE, not a different
 * question. Collapsing them into one field would lose that.
 *
 * `null` means "could not be placed", which is a real answer. Naming the
 * least-bad topic would invent a requirement, and a fabricated requirement
 * refuses a question for a reason that was never true.
 */
export interface QuestionRequirements {
  readonly fromQuestion: string | null;
  readonly fromSolution: string | null;
}

export interface Scope {
  readonly topicId: string;
  /**
   * Every topic this session is permitted to draw on.
   *
   * Usually just the session topic. A scope may name a neighbour ON PURPOSE --
   * the directive's prerequisite-aware mode -- and then using it is not a
   * violation. Without this the gate could only express "one topic and nothing
   * else", which is not how a senior syllabus works.
   */
  readonly allowedTopicIds: readonly string[];
}

export type ScopeViolation = 'question-out-of-scope' | 'solution-out-of-scope';

export function requirementsOf(
  questionText: string,
  solutionText: string,
  centroids: readonly TopicCentroid[],
): QuestionRequirements {
  return {
    fromQuestion: nearestTopic(questionText, centroids)?.topicId ?? null,
    fromSolution: nearestTopic(solutionText, centroids)?.topicId ?? null,
  };
}

/**
 * Which parts of this question fall outside the scope.
 *
 * FAILS OPEN ON A HALF IT CANNOT PLACE. A lexical centroid is shallow and most
 * solutions will not resolve to any topic at all. Refusing everything it cannot
 * read would refuse the product, and a gate that refuses the product gets
 * deleted -- after which it enforces nothing.
 *
 * Returns every violation rather than the first, so a caller can say what is
 * wrong instead of what it noticed first.
 */
export function scopeViolations(
  questionText: string,
  solutionText: string,
  scope: Scope,
  centroids: readonly TopicCentroid[],
): ScopeViolation[] {
  /*
   * A TOPIC THE CURRICULUM DOES NOT CONTAIN CANNOT BE JUDGED.
   *
   * `driftsFrom` has guarded this since it was written. This function was
   * written without the same guard, and the consequence was immediate and
   * total -- every session refused:
   *
   *     refused for rotational-motion — solution out of scope:
   *     solving it needs mat-6-returns
   *
   * `rotational-motion` was not in that curriculum at all. With no centroid for
   * it, every solution's nearest topic is some unrelated one, and "nearest is
   * not allowed" is true for every question ever generated.
   *
   * The same guard, in a sibling function that did not inherit it. Writing a
   * check twice is how the second copy comes out different.
   */
  if (!centroids.some((centroid) => centroid.topicId === scope.topicId)) return [];

  const allowed = new Set([scope.topicId, ...scope.allowedTopicIds]);
  const requirements = requirementsOf(questionText, solutionText, centroids);

  const out: ScopeViolation[] = [];

  if (requirements.fromQuestion !== null && !allowed.has(requirements.fromQuestion)) {
    out.push('question-out-of-scope');
  }

  if (requirements.fromSolution !== null && !allowed.has(requirements.fromSolution)) {
    out.push('solution-out-of-scope');
  }

  return out;
}
