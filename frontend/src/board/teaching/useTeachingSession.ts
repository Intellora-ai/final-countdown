/* THE TEACHING SESSION — one step at a time, learner in charge.
 *
 * State machine:  loading → revealing ⇄ paused → settled → checkpoint → (continue) → revealing …
 * Auto-advance DOES NOT EXIST here: the only transition out of 'checkpoint'
 * is an explicit learner action. An animation finishing moves the machine to
 * 'checkpoint' and no further. Silence holds the machine still, forever.
 *
 * The reveal is timeline playback: reveal.ts computed WHEN each piece
 * appears; this hook owns the single timer that advances an index into that
 * schedule. Pause = stop the timer (position keeps). Finish-now = jump the
 * index to the end. Replay = index back to zero. Reduced motion swaps in the
 * zero-delay timeline — same events, same order.
 *
 * Prefetch: none. The allowance is "at most one after Continue"; zero
 * complies, keeps the loading boundary trivially provable, and locally a
 * step's data costs nothing to compute on demand.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { TeachingPlan, TeachingStep, PaceProfileName } from './types'
import { PACE_PROFILES, TIMING } from './types'
import { reducedTimeline, stepTimeline, type RevealTimeline } from './reveal'
import { mark, measureFrom } from '../perf/marks'

export interface ReleasedStep {
  step: TeachingStep
  timeline: RevealTimeline
  /** Events applied so far. Past steps: events.length (fully revealed). */
  applied: number
  /** A clarification re-run of an earlier step. */
  clarification?: boolean
}

export type SessionStatus = 'loading' | 'revealing' | 'paused' | 'settled' | 'checkpoint' | 'complete' | 'error'

export interface SessionState {
  status: SessionStatus
  released: ReleasedStep[]
  pace: PaceProfileName
  error?: string
}

export type SessionAction =
  | { kind: 'release'; step: TeachingStep; timeline: RevealTimeline; clarification?: boolean }
  | { kind: 'apply'; upTo: number }
  | { kind: 'pause' } | { kind: 'resume' }
  | { kind: 'settled' } | { kind: 'checkpoint' }
  | { kind: 'complete' } | { kind: 'fail'; error: string }
  | { kind: 'pace'; pace: PaceProfileName }
  | { kind: 'replay'; timeline: RevealTimeline }

export function reducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.kind) {
    case 'release':
      return {
        ...s, status: 'revealing',
        released: [...s.released, { step: a.step, timeline: a.timeline, applied: 0, clarification: a.clarification }],
      }
    case 'apply': {
      const released = [...s.released]
      const last = released[released.length - 1]
      if (!last) return s
      released[released.length - 1] = { ...last, applied: a.upTo }
      return { ...s, released }
    }
    case 'pause': return s.status === 'revealing' ? { ...s, status: 'paused' } : s
    case 'resume': return s.status === 'paused' ? { ...s, status: 'revealing' } : s
    case 'settled': return { ...s, status: 'settled' }
    case 'checkpoint': return { ...s, status: 'checkpoint' }
    case 'complete': return { ...s, status: 'complete' }
    case 'fail': return { ...s, status: 'error', error: a.error }
    case 'pace': return { ...s, pace: a.pace }
    case 'replay': {
      const released = [...s.released]
      const last = released[released.length - 1]
      if (!last) return s
      released[released.length - 1] = { ...last, timeline: a.timeline, applied: 0 }
      return { ...s, status: 'revealing', released }
    }
  }
}

export interface SessionApi extends SessionState {
  currentStep: ReleasedStep | null
  pause: () => void
  resume: () => void
  finishNow: () => void
  replay: () => void
  continueNext: () => void
  explainAgain: () => void
  showAnotherExample: (() => void) | null
  setPace: (p: PaceProfileName) => void
  reducedMotion: boolean
}

export function useTeachingSession(
  plan: TeachingPlan | null,
  extras?: { anotherExample?: TeachingStep },
  onStepReleased?: (index: number, clarification: boolean) => void,
): SessionApi {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', released: [], pace: 'standard' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playhead = useRef({ elapsed: 0, eventIndex: 0 })
  const stateRef = useRef(state)
  stateRef.current = state

  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  /* Walk the current step's timeline from the playhead. One timer at a time. */
  const play = useCallback(() => {
    clearTimer()
    const s = stateRef.current
    const cur = s.released[s.released.length - 1]
    if (!cur) return
    const { events } = cur.timeline
    const i = playhead.current.eventIndex
    if (i >= events.length) {
      dispatch({ kind: 'settled' })
      mark('step-reveal-complete')
      return
    }
    const delay = Math.max(0, events[i].at - playhead.current.elapsed)
    timer.current = setTimeout(() => {
      /* Apply every event that shares this timestamp in one commit. */
      let j = i
      while (j < events.length && events[j].at <= events[i].at) j++
      playhead.current = { elapsed: events[i].at, eventIndex: j }
      if (i === 0) {
        mark('first-reveal')
        measureFrom('step-request-start', 'step-to-first-reveal')
        /* The learner-facing latency: from the Continue press to the first
         * thing appearing. Distinct from step-to-first-reveal, which starts
         * when the plan was asked and so excludes the learner's own action. */
        measureFrom('continue-click', 'event-to-first-reveal')
      }
      dispatch({ kind: 'apply', upTo: j })
      play()
    }, delay)
  }, [reducedMotion])

  const release = useCallback(async (clarification = false, authored?: TeachingStep) => {
    if (!plan) return
    mark('step-request-start')
    try {
      const step = authored ?? (clarification ? null : await plan.nextStep())
      if (!step) { dispatch({ kind: 'complete' }); return }
      const base = stepTimeline(step.blocks, PACE_PROFILES[stateRef.current.pace])
      const tl = reducedMotion ? reducedTimeline(base) : base
      playhead.current = { elapsed: 0, eventIndex: 0 }
      dispatch({ kind: 'release', step, timeline: tl, clarification })
      onStepReleased?.(stateRef.current.released.length, clarification)
      mark('next-step-visible')
    } catch (e) {
      dispatch({ kind: 'fail', error: e instanceof Error ? e.message : 'The next step failed to load.' })
    }
  }, [plan, reducedMotion, onStepReleased])

  /* Session start: release step 1 when the plan arrives. */
  const started = useRef(false)
  useEffect(() => {
    if (!plan || started.current) return
    started.current = true
    mark('session-start')
    void release()
  }, [plan, release])

  /* THE ONE TIMER OWNER. revealing → walk the timeline; settled → schedule
   * the checkpoint after the settle pause; paused → silence. The cleanup
   * clears whatever timer the previous status owned, which is exactly right
   * now that no timer is set outside this effect. */
  useEffect(() => {
    if (state.status === 'revealing') play()
    if (state.status === 'settled') {
      timer.current = setTimeout(() => {
        dispatch({ kind: 'checkpoint' })
        mark('checkpoint-visible')
      }, reducedMotion ? 0 : TIMING.postStepSettleMs)
    }
    return clearTimer
  }, [state.status, state.released.length, state.released[state.released.length - 1]?.timeline, play, reducedMotion])

  const currentStep = state.released[state.released.length - 1] ?? null

  const finishNow = useCallback(() => {
    const cur = stateRef.current.released[stateRef.current.released.length - 1]
    if (!cur) return
    clearTimer()
    playhead.current = { elapsed: cur.timeline.endMs, eventIndex: cur.timeline.events.length }
    dispatch({ kind: 'apply', upTo: cur.timeline.events.length })
    dispatch({ kind: 'settled' })
    mark('step-reveal-complete')
  }, [])

  const replay = useCallback(() => {
    const cur = stateRef.current.released[stateRef.current.released.length - 1]
    if (!cur) return
    clearTimer()
    playhead.current = { elapsed: 0, eventIndex: 0 }
    const base = stepTimeline(cur.step.blocks, PACE_PROFILES[stateRef.current.pace])
    dispatch({ kind: 'replay', timeline: reducedMotion ? reducedTimeline(base) : base })
  }, [reducedMotion])

  const continueNext = useCallback(() => {
    if (stateRef.current.status !== 'checkpoint') return
    mark('continue-click')
    void release()
  }, [release])

  const explainAgain = useCallback(() => {
    const cur = stateRef.current.released[stateRef.current.released.length - 1]
    if (!cur || stateRef.current.status !== 'checkpoint') return
    mark('clarification-click')
    /* A clarification step: the same content again, slower, as a NEW released
     * step — the record shows the learner asked, and the original stays. */
    const again: TeachingStep = {
      ...cur.step,
      id: `${cur.step.id}-again-${Date.now() % 100000}`,
      title: 'Once more, slower',
    }
    const base = stepTimeline(again.blocks, PACE_PROFILES.calm)
    const tl = reducedMotion ? reducedTimeline(base) : base
    playhead.current = { elapsed: 0, eventIndex: 0 }
    dispatch({ kind: 'release', step: again, timeline: tl, clarification: true })
    onStepReleased?.(stateRef.current.released.length, true)
  }, [reducedMotion, onStepReleased])

  const showAnotherExample = useMemo(() => {
    if (!extras?.anotherExample) return null
    return () => {
      if (stateRef.current.status !== 'checkpoint') return
      mark('clarification-click')
      void release(true, extras.anotherExample)
    }
  }, [extras, release])

  return {
    ...state,
    currentStep,
    pause: () => dispatch({ kind: 'pause' }),
    resume: () => dispatch({ kind: 'resume' }),
    finishNow,
    replay,
    continueNext,
    explainAgain,
    showAnotherExample,
    setPace: (p) => dispatch({ kind: 'pace', pace: p }),
    reducedMotion,
  }
}
