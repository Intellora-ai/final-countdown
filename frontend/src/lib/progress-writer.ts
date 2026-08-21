/* PROGRESS WRITES — observed events only, and nothing else.
 *
 * The rule this file exists to honour is already in the data layer's own words:
 *
 *   WEAKNESS IS NOT STORED. Nothing in the UI may display a number this file
 *   did not observe.
 *
 * So the canvas writes exactly three kinds of thing, all of which are events
 * that demonstrably happened:
 *
 *   attempts       the learner submitted a prediction. One prediction, one
 *                  attempt. Not "engagement", not a score.
 *   secondsSpent   wall time between opening the board and leaving it, measured
 *                  from a clock, floored, and never written when it rounds to
 *                  zero.
 *   activity       which representation was opened and when, in the existing
 *                  event log — NOT as a new progress field, because "how many
 *                  ways did they look at it" is not a measure of anything until
 *                  someone defines what it would mean.
 *
 * What it deliberately does NOT write: hints (there is no hint affordance on
 * this board, so a hint count would be a zero pretending to be an observation),
 * mastery (that is a declaration the learner makes, kept separate from evidence
 * by design), confidence, difficulty, or weakness. `weaknessHook` stays
 * returning null.
 *
 * WHY A WRAPPER RATHER THAN CALLING THE STORE DIRECTLY. One place decides what
 * the canvas is allowed to record. A component that wanted to invent a metric
 * would have to add it here, in front of this comment, rather than reaching
 * past it.
 */

import { store } from '../data/store'

export interface ProgressWriter {
  /** The learner committed to a prediction. */
  recordPrediction(optionId: string, wasCorrect: boolean): void
  /** The learner switched to another representation. */
  recordRepresentation(representationId: string): void
  /** Call when the board closes. Writes elapsed seconds, once. */
  close(): void
}

export function createProgressWriter(
  chapterId: string,
  conceptId: string,
  now: () => number = () => Date.now(),
): ProgressWriter {
  const openedAt = now()
  let closed = false

  return {
    recordPrediction(optionId, wasCorrect) {
      // One attempt. The correctness is recorded as an event, not folded into a
      // score — a ratio nobody defined is exactly the invented number the data
      // layer refuses to hold.
      store.touch(chapterId, conceptId, { attempts: 1 })
      store.log({
        type: 'prediction',
        chapterId,
        conceptId,
        from: optionId,
        to: wasCorrect ? 'correct' : 'incorrect',
      })
    },

    recordRepresentation(representationId) {
      store.log({
        type: 'representation',
        chapterId,
        conceptId,
        to: representationId,
      })
    },

    close() {
      if (closed) return
      closed = true
      const seconds = Math.floor((now() - openedAt) / 1000)
      // A board opened and closed in the same second is not time spent. Writing
      // a zero would add a record that observed nothing.
      if (seconds > 0) store.touch(chapterId, conceptId, { seconds })
    },
  }
}
