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
  /* Re-time the CURRENT step without restarting it. Distinct from replay,
   * which starts the reveal over: retime keeps everything already shown and
   * only changes how fast the rest arrives. */
  | { kind: 'retime'; timeline: RevealTimeline }
  /* Install a lesson already in progress — a resumed session. The steps
   * arrive fully applied, at a checkpoint, because a learner returning to a
   * lesson should find where they were, not watch it replay. */
  | { kind: 'hydrate'; released: ReleasedStep[]; pace: PaceProfileName }

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
    case 'retime': {
      const released = [...s.released]
      const last = released[released.length - 1]
      if (!last) return s
      /* `applied` is an index into the event list, and the event list is the
       * same at every pace — chunkText takes no pace, so chunk boundaries and
       * their order do not move. Event N means the same thing whether it
       * arrives at 16 or 40 characters a second, which is exactly why the
       * count can be carried across unchanged. */
      released[released.length - 1] = { ...last, timeline: a.timeline }
      return { ...s, released }
    }
    case 'hydrate':
      /* A resumed lesson lands at a checkpoint: everything restored is behind
       * the learner, and the next step still waits for them to ask. */
      return { ...s, status: 'checkpoint', released: a.released, pace: a.pace }
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

/* HOW A SESSION BEGINS. Three cases, stated rather than inferred, because
 * "has the saved position arrived yet" and "there is no saved position" look
 * identical from inside the hook and mean opposite things: starting fresh
 * while a resume is still loading would release step one over the top of a
 * lesson the learner had already worked through. */
export type SessionStartup =
  /* A resume is being looked up. Release nothing yet. */
  | { kind: 'wait' }
  /* No saved position, or it was stale. Release step one. */
  | { kind: 'fresh' }
  /* Install these already-revealed steps and hold at a checkpoint. */
  | { kind: 'resume'; released: ReleasedStep[]; pace: PaceProfileName }

export function useTeachingSession(
  plan: TeachingPlan | null,
  extras?: { anotherExample?: TeachingStep },
  onStepReleased?: (index: number, clarification: boolean) => void,
  startup: SessionStartup = { kind: 'fresh' },
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

  /* SESSION START — once, and once only.
   *
   * The `started` latch matters more now that there are two ways in. Without
   * it, a resume that resolves after a fresh start would release step one and
   * then install the restored lesson on top of it, and the learner would find
   * the opening step sitting below where they actually were. */
  const started = useRef(false)
  useEffect(() => {
    if (!plan || started.current) return
    if (startup.kind === 'wait') return          // the lookup is still running
    started.current = true
    mark('session-start')
    if (startup.kind === 'resume') {
      mark('resume-start')
      dispatch({ kind: 'hydrate', released: startup.released, pace: startup.pace })
      /* The camera follows the last restored step, exactly as it would have
       * followed a freshly released one. */
      onStepReleased?.(startup.released.length - 1, false)
      mark('resume-complete')
      measureFrom('resume-start', 'resume-to-visible')
      return
    }
    void release()
  }, [plan, release, startup, onStepReleased])

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

  /* A PACE CHANGE APPLIES NOW, NOT NEXT TIME.
   *
   * Choosing "calm" halfway through a paragraph used to change nothing until
   * the next step — the learner pressed a control that appeared to do nothing,
   * which is worse than not offering it. The current step is re-timed in
   * place: what has been revealed stays revealed, and the remainder arrives at
   * the new speed.
   *
   * A clarification is left alone. It was released at calm deliberately, and
   * speeding up the explanation someone just asked to have slowed down would
   * undo the thing they asked for. */
  const pace = state.pace
  useEffect(() => {
    if (state.status !== 'revealing' && state.status !== 'paused') return
    const cur = stateRef.current.released[stateRef.current.released.length - 1]
    if (!cur || cur.clarification) return
    const base = stepTimeline(cur.step.blocks, PACE_PROFILES[pace])
    const next = reducedMotion ? reducedTimeline(base) : base
    /* The event list is pace-invariant, so the applied count carries over and
     * the playhead moves to where that same event sits in the new schedule. */
    const applied = Math.min(cur.applied, next.events.length)
    playhead.current = {
      elapsed: applied > 0 ? next.events[applied - 1].at : 0,
      eventIndex: applied,
    }
    dispatch({ kind: 'retime', timeline: next })
    // The timeline object identity change restarts the play effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pace])

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
