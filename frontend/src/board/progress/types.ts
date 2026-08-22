/* WHAT THE BOARD REMEMBERS ABOUT A LEARNER.
 *
 * A lesson that forgets where you were is a lesson you start again. This is
 * the smallest record that lets the board resume: which step you reached, what
 * you have finished, what you answered, and where you were looking.
 *
 * WHAT IT DELIBERATELY IS NOT. It is not a copy of the board — the content
 * comes from the fixture or the provider every time, and storing a snapshot
 * would mean resuming into a lesson that no longer matches the one on disk. It
 * is not an event log; it is the current position. And it is not the
 * dashboard's progress record, which tracks mastery of a concept across
 * sessions and belongs to the dashboard. See
 * docs/engineering/board-progress-boundary.md for the two places these touch.
 */
import type { CanvasCamera } from '../camera/camera'

/** One answered question. The learner's choice, kept with its verdict so a
 *  resumed board can show the same feedback without re-deriving it. */
export interface QuizAnswerRecord {
  optionId: string
  correct: boolean
  /** ISO timestamp. Recorded for ordering and for the dashboard bridge; never
   *  used to expire an answer. */
  at: string
}

export interface LearnerProgress {
  sessionId: string
  boardId: string
  currentStepId: string
  completedStepIds: string[]
  quizAnswers: Record<string, QuizAnswerRecord>
  clarificationCount: number
  /** Where the learner was looking. Written when a camera interaction ENDS,
   *  never per frame — see progressStore.ts. */
  lastCamera?: CanvasCamera
  updatedAt: string
}

/* The stored shape is versioned from its first day.
 *
 * The dashboard's own store learned this the hard way: its localStorage key is
 * 'learning-os/v2', with the version in the key and no migration code, so a
 * v1 record is not upgraded — it is orphaned. Putting the version INSIDE the
 * envelope means a future shape can read the old one and decide, rather than
 * losing it by not looking. */
export const PROGRESS_VERSION = 1

export interface ProgressEnvelope {
  version: number
  records: Record<string, LearnerProgress>
}

/** Records are keyed by learner scope and board, so two learners on one
 *  machine do not overwrite each other and one learner keeps a position per
 *  board rather than a single global one. */
export function progressKey(scope: string, boardId: string): string {
  return `${scope}/${boardId}`
}

export function emptyEnvelope(): ProgressEnvelope {
  return { version: PROGRESS_VERSION, records: {} }
}

/** Everything except the timestamp. Two saves that differ only in when they
 *  happened are the same save, and writing the second one is the duplicate the
 *  milestone forbids. */
export function sameProgress(a: LearnerProgress | undefined, b: LearnerProgress): boolean {
  if (!a) return false
  return (
    a.sessionId === b.sessionId &&
    a.boardId === b.boardId &&
    a.currentStepId === b.currentStepId &&
    a.clarificationCount === b.clarificationCount &&
    a.completedStepIds.length === b.completedStepIds.length &&
    a.completedStepIds.every((id, i) => id === b.completedStepIds[i]) &&
    sameCamera(a.lastCamera, b.lastCamera) &&
    sameAnswers(a.quizAnswers, b.quizAnswers)
  )
}

function sameCamera(a: CanvasCamera | undefined, b: CanvasCamera | undefined): boolean {
  if (!a || !b) return a === b
  /* Sub-pixel camera drift is not a change worth a write. The threshold is
   * one world unit, well under the 8px grid the board snaps to. */
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.zoom - b.zoom) < 0.005
}

function sameAnswers(
  a: Record<string, QuizAnswerRecord>,
  b: Record<string, QuizAnswerRecord>,
): boolean {
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  /* The verdict is a function of the option, so comparing the choice is
   * enough; `at` is excluded for the same reason updatedAt is. */
  return ka.every((k) => a[k]?.optionId === b[k]?.optionId)
}
