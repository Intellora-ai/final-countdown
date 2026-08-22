/* RESUMING A LESSON, WITHOUT REPLAYING IT.
 *
 * A learner who left at step four should come back to step four. Not to step
 * one, and not to a lesson that types itself out again while they wait.
 *
 * The board is rebuilt by asking the plan for steps in the same order it gave
 * them the first time — the plan is deterministic, so step three is the same
 * step three — and stopping AT the saved step. Never past it. That is the
 * whole reason this pulls one step at a time instead of draining the plan and
 * slicing: draining would compute steps the learner has not reached, and a
 * future step that exists is a future step that can leak.
 *
 * Each restored step arrives fully applied, with a timeline it will never
 * play. The session installs them at a checkpoint, so the next step still
 * waits for the learner to ask for it.
 */
import type { TeachingPlan, PaceProfileName } from '../teaching/types'
import { PACE_PROFILES } from '../teaching/types'
import { reducedTimeline, stepTimeline } from '../teaching/reveal'
import type { ReleasedStep } from '../teaching/useTeachingSession'
import type { LearnerProgress } from './types'

export interface HydrationResult {
  released: ReleasedStep[]
  /** How many steps were restored. Zero means the saved position could not be
   *  found and the caller should start the lesson normally. */
  restored: number
  /** True when the plan ended before the saved step id was reached — the
   *  board changed under the record. The caller starts fresh rather than
   *  resuming into a lesson that no longer contains that step. */
  stale: boolean
}

/* A cap on how far the rebuild will walk. The plan is finite and the record
 * names a step inside it, so this is only reached when a record points at a
 * step that no longer exists — in which case walking the whole plan is the
 * cost of finding out. */
const MAX_STEPS = 500

export async function buildHydration(
  plan: TeachingPlan,
  progress: LearnerProgress,
  opts: { reducedMotion: boolean; pace: PaceProfileName },
): Promise<HydrationResult> {
  const released: ReleasedStep[] = []

  for (let i = 0; i < MAX_STEPS; i += 1) {
    const step = await plan.nextStep()
    if (!step) {
      /* Ran out of lesson before finding the saved step: the board is not the
       * one this record was written against. */
      return { released: [], restored: 0, stale: true }
    }

    /* The timeline is built because a ReleasedStep carries one, and the
     * accessible transcript and any later replay read it. It is never played:
     * applied is set to its full length, so every event is already counted as
     * shown. */
    const base = stepTimeline(step.blocks, PACE_PROFILES[opts.pace])
    const timeline = opts.reducedMotion ? reducedTimeline(base) : base
    released.push({ step, timeline, applied: timeline.events.length })

    if (step.id === progress.currentStepId) {
      return { released, restored: released.length, stale: false }
    }
  }

  return { released: [], restored: 0, stale: true }
}

/** The position to save for a session, derived from what it has released.
 *  Kept beside the rebuild so the two halves of resume cannot drift: this
 *  writes the id that the function above looks for. */
export function progressFromSession(input: {
  sessionId: string
  boardId: string
  released: ReleasedStep[]
  quizAnswers: LearnerProgress['quizAnswers']
  clarificationCount: number
  lastCamera?: LearnerProgress['lastCamera']
  now: string
}): LearnerProgress | null {
  const current = input.released[input.released.length - 1]
  if (!current) return null
  return {
    sessionId: input.sessionId,
    boardId: input.boardId,
    currentStepId: current.step.id,
    /* Everything before the current step is behind the learner. A
     * clarification is a re-run of a step, not a step of its own, so it is not
     * counted as completed — resuming into one would restart an explanation
     * the learner had already moved past. */
    completedStepIds: input.released
      .slice(0, -1)
      .filter((r) => !r.clarification)
      .map((r) => r.step.id),
    quizAnswers: input.quizAnswers,
    clarificationCount: input.clarificationCount,
    ...(input.lastCamera ? { lastCamera: input.lastCamera } : {}),
    updatedAt: input.now,
  }
}
