/* THE LEARNER'S CONTROLS — pacing belongs to the person being taught.
 *
 * During a reveal: pause/resume, finish now, replay, pace. At a checkpoint:
 * the question plus explicit choices — its authored labels, and (when the
 * lesson provides one) another example. There is no timer on any of these.
 * Everything is a real button with a real 44px target and visible focus.
 */
import React, { useEffect, useRef } from 'react'
import type { SessionApi } from './useTeachingSession'
import type { PaceProfileName } from './types'

const PACES: Array<{ id: PaceProfileName; label: string }> = [
  { id: 'calm', label: 'Calm' },
  { id: 'standard', label: 'Standard' },
  { id: 'fast', label: 'Fast' },
]

export function TeachingControls({ session }: { session: SessionApi }) {
  const s = session
  const revealing = s.status === 'revealing' || s.status === 'paused'
  return (
    <div data-board="teach-controls" role="toolbar" aria-label="Lesson pacing controls">
      {revealing && (
        <>
          {s.status === 'paused'
            ? <button type="button" data-board="teach-btn" onClick={s.resume}>Resume</button>
            : <button type="button" data-board="teach-btn" onClick={s.pause}>Pause</button>}
          <button type="button" data-board="teach-btn" onClick={s.finishNow}>Finish now</button>
        </>
      )}
      {(s.status === 'settled' || s.status === 'checkpoint') && (
        <button type="button" data-board="teach-btn" onClick={s.replay}>Replay</button>
      )}
      <span data-board="teach-sep" aria-hidden="true" />
      <div data-board="pace" role="group" aria-label="Pace">
        {PACES.map((p) => (
          <button
            key={p.id}
            type="button"
            data-board="pace-btn"
            data-active={s.pace === p.id ? 'true' : 'false'}
            aria-pressed={s.pace === p.id}
            onClick={() => s.setPace(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CheckpointPanel({ session }: { session: SessionApi }) {
  const s = session
  const primary = useRef<HTMLButtonElement | null>(null)
  const atCheckpoint = s.status === 'checkpoint'

  /* MOVE FOCUS WHEN THE LESSON STOPS AND WAITS.
   *
   * A checkpoint is the one moment the board genuinely needs an answer, and a
   * keyboard learner would otherwise have to hunt for the control that appeared
   * somewhere below content they cannot see. Focus goes to the primary choice,
   * once, when the checkpoint arrives — not on every render, which would fight
   * a learner who deliberately tabbed to "Explain again". */
  useEffect(() => {
    if (atCheckpoint) primary.current?.focus()
  }, [atCheckpoint, s.released.length])

  if (!atCheckpoint || !s.currentStep) return null
  /* The question AND its button labels are authored content — chrome renders
   * what the checkpoint says, never a hardcoded pair of words. */
  const cp = s.currentStep.step.checkpoint ?? {
    question: 'Ready to continue?', continueLabel: 'Continue', unclearLabel: 'Explain again',
  }
  return (
    <div data-board="checkpoint" role="group" aria-label="Checkpoint">
      <p data-board="checkpoint-question">{cp.question}</p>
      <div data-board="checkpoint-actions">
        <button ref={primary} type="button" data-board="teach-btn" data-primary="true" onClick={s.continueNext}>
          {cp.continueLabel}
        </button>
        <button type="button" data-board="teach-btn" onClick={s.explainAgain}>
          {cp.unclearLabel}
        </button>
        {s.showAnotherExample && (
          <button type="button" data-board="teach-btn" onClick={s.showAnotherExample}>
            Show another example
          </button>
        )}
      </div>
    </div>
  )
}
