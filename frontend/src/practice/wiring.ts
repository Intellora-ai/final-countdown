import { validateQuestionTopic, type TopicBoundary } from './engine/boundary'
import { setIsAllText, TEXT_ONLY } from './engine/representation'
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
 * Does this set draw anything at all?
 *
 * `setIsAllText` has lived in `engine/representation.ts` since it was written
 * and had ZERO non-test importers. It could not have fired even once, because
 * no question carried a figure for it to look at.
 *
 * ONE FIGURE IS THE BAR, on purpose. Requiring one per question forces a
 * diagram onto questions that genuinely do not need one, and a decorative chart
 * is its own kind of noise.
 *
 * An EMPTY set is refused. Zero of zero questions carry a figure, so the
 * arithmetic says the ban is satisfied while usefulness says nothing was
 * delivered -- and reading that as a pass is how a generator that produced
 * nothing reports success.
 */
export function setDrawsSomething(questions: readonly VerifiedQuestion[]): boolean {
  if (questions.length === 0) return false

  return !setIsAllText(
    /*
     * A falsy figure counts as text, which fails SAFE. The field is required by
     * the type, but a question can arrive from JSON that never met the
     * compiler, and there the missing field should make the set refuse rather
     * than throw -- a refusal is recoverable and names itself, a crash in the
     * ban is neither.
     */
    questions.map((question) => question.figure?.as ?? TEXT_ONLY),
  )
}
