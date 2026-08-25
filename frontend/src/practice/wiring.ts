import { validateQuestionTopic, type TopicBoundary } from './engine/boundary'
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
