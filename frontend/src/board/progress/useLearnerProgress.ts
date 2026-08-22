/* THE BOARD'S MEMORY, WIRED TO A LESSON.
 *
 * One hook owns the whole loop: read a saved position when a board opens,
 * report changes as the learner moves, and write them without ever writing on
 * a frame.
 *
 * WHY NOTHING HERE WRITES PER FRAME. The camera runs at animation-frame rate
 * and writes CSS variables directly, never React state. The only camera value
 * this hook can see is the COMMITTED one, which the camera publishes when an
 * interaction ends — so a drag of two hundred frames offers this hook one
 * value, at the end. That is a structural guarantee rather than a debounce
 * doing its best.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasCamera } from '../camera/camera'
import type { ReleasedStep } from '../teaching/useTeachingSession'
import { attachFlushOnHide, createProgressStore, type ProgressStore } from './progressStore'
import { progressFromSession } from './hydrate'
import type { LearnerProgress, QuizAnswerRecord } from './types'
import { mark, measureFrom } from '../perf/marks'

export interface LearnerProgressApi {
  /** The position found in storage when this board opened, if any. Read once;
   *  it does not change as the session advances. */
  saved: LearnerProgress | null
  /** Answers the learner has given, restored and live. */
  quizAnswers: Record<string, QuizAnswerRecord>
  answerQuiz: (blockId: string, optionId: string, correct: boolean) => void
  /** Report the session's position. Safe to call on every render: a report
   *  that matches what is stored is dropped before it becomes a write. */
  report: (input: {
    released: ReleasedStep[]
    clarificationCount: number
    lastCamera?: CanvasCamera
  }) => void
  /** Forget this board's position. */
  reset: () => void
  /** Anything the learner should be told about storage. */
  problems: string[]
}

/* A session id is generated once per board-open and stored with the record, so
 * a resumed lesson can be recognised as a continuation of the same sitting
 * rather than a new one. crypto.randomUUID is present in every browser this
 * ships to; the fallback exists for a test runner without it. */
function newSessionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `session-${Math.floor(performance.now() * 1000).toString(36)}`
}

export interface UseLearnerProgressOptions {
  boardId: string
  /** Which learner. The dashboard's current student when there is one, so two
   *  people sharing a machine keep separate positions. */
  scope: string
  /** Injectable for tests; defaults to the real localStorage-backed store. */
  store?: ProgressStore
  enabled?: boolean
}

export function useLearnerProgress(opts: UseLearnerProgressOptions): LearnerProgressApi {
  const { boardId, scope, enabled = true } = opts
  const [problems, setProblems] = useState<string[]>([])

  /* One store per board-open. The store is created lazily so that constructing
   * it — which touches storage — happens inside the component's lifetime and
   * can report its problems through the same channel as everything else. */
  const storeRef = useRef<ProgressStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = opts.store ?? createProgressStore({
      onProblem: (m) => setProblems((prev) => (prev.includes(m) ? prev : [...prev, m])),
    })
  }
  const store = storeRef.current

  const sessionIdRef = useRef<string>('')
  if (!sessionIdRef.current) sessionIdRef.current = newSessionId()

  /* Read once, at open. Resuming is a decision made from the position the
   * board had when it loaded — re-reading later would race the writes this
   * hook is itself making. */
  const saved = useMemo(() => {
    if (!enabled) return null
    mark('progress-restore')
    const found = store.read(scope, boardId)
    if (found) measureFrom('progress-restore', 'resume-hydrate')
    return found
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, scope, enabled])

  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerRecord>>(
    () => saved?.quizAnswers ?? {},
  )

  /* A useState initialiser runs ONCE, on the first render — and on that render
   * `saved` is still null, because the learner's identity has not arrived yet
   * and nothing is read until it does. Without this the restored answers were
   * computed correctly and then never reached the component that needed them:
   * a reload showed the question again, unanswered.
   *
   * Applied once, and local answers win: if the learner somehow answered
   * between the first render and the record arriving, their answer is the
   * newer fact. */
  const adoptedSaved = useRef(false)
  useEffect(() => {
    if (adoptedSaved.current || !saved) return
    adoptedSaved.current = true
    setQuizAnswers((local) => ({ ...saved.quizAnswers, ...local }))
  }, [saved])

  /* The last position reported, so a re-render that changes nothing does not
   * reach the store at all — the store would drop it, but not calling is
   * cheaper than being dropped. */
  const lastReported = useRef<string>('')

  const report = useCallback((input: {
    released: ReleasedStep[]
    clarificationCount: number
    lastCamera?: CanvasCamera
  }) => {
    if (!enabled) return
    const next = progressFromSession({
      sessionId: sessionIdRef.current,
      boardId,
      released: input.released,
      quizAnswers,
      clarificationCount: input.clarificationCount,
      lastCamera: input.lastCamera,
      now: new Date().toISOString(),
    })
    if (!next) return
    /* Cheap identity check before the store's content check. Both exist for
     * the same reason and neither is redundant: this one skips the work, the
     * store's one guarantees the invariant. */
    const fingerprint = `${next.currentStepId}|${next.completedStepIds.length}|${next.clarificationCount}|${Object.keys(next.quizAnswers).length}|${Math.round(next.lastCamera?.x ?? 0)},${Math.round(next.lastCamera?.y ?? 0)},${(next.lastCamera?.zoom ?? 1).toFixed(2)}`
    if (fingerprint === lastReported.current) return
    lastReported.current = fingerprint

    mark('progress-save')
    if (store.save(scope, next)) measureFrom('progress-save', 'progress-save-ack')
  }, [boardId, scope, enabled, quizAnswers, store])

  const answerQuiz = useCallback((blockId: string, optionId: string, correct: boolean) => {
    setQuizAnswers((prev) => {
      /* An answered question stays answered. A second call for the same block
       * is the double-submission guard's other half: even if a control let one
       * through, the record does not change. */
      if (prev[blockId]) return prev
      return { ...prev, [blockId]: { optionId, correct, at: new Date().toISOString() } }
    })
  }, [])

  const reset = useCallback(() => {
    store.clear(scope, boardId)
    setQuizAnswers({})
    lastReported.current = ''
  }, [store, scope, boardId])

  /* Two ways a pending write can still be completed.
   *
   * The page going away — handled by listeners with the same lifetime as this
   * component, so React remounting does not leave them detached. And the board
   * closing while the page stays, handled by the cleanup below. */
  useEffect(() => attachFlushOnHide(store), [store])
  useEffect(() => () => { store.flush() }, [store])

  return { saved, quizAnswers, answerQuiz, report, reset, problems }
}
