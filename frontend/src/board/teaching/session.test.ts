/* SESSION REDUCER — the teaching state machine's transitions, DOM-free.
 *
 * The one that matters most is the last: at a checkpoint, NOTHING in the
 * action vocabulary reaches 'revealing' except an explicit release. That is
 * checkpoint blocking as an exhaustive property of the machine, not a hope
 * about the UI.
 */
import { describe, it, expect } from 'vitest'
import { reducer, type SessionAction, type SessionState } from './useTeachingSession'
import type { TeachingStep } from './types'
import type { RevealTimeline } from './reveal'

const STEP: TeachingStep = {
  id: 's1', purpose: 'explain',
  blocks: [{ id: 'e1', type: 'explanation', content: 'Hi there.' }],
  checkpoint: { question: 'Clear?', continueLabel: 'Continue', unclearLabel: 'Explain again' },
}
const TL: RevealTimeline = {
  events: [
    { at: 0, blockIndex: 0, kind: 'block-mount' },
    { at: 500, blockIndex: 0, kind: 'text-chunk', charEnd: 9 },
  ],
  endMs: 500, checkpointAtMs: 1300,
}
const base: SessionState = { status: 'loading', released: [], pace: 'standard' }
const releaseAction: SessionAction = { kind: 'release', step: STEP, timeline: TL }

function at(status: SessionState['status']): SessionState {
  return { ...reducer(base, releaseAction), status }
}

describe('session reducer transitions', () => {
  it('release → revealing, step appended with zero applied events', () => {
    const s = reducer(base, releaseAction)
    expect(s.status).toBe('revealing')
    expect(s.released).toHaveLength(1)
    expect(s.released[0].applied).toBe(0)
  })

  it('apply advances ONLY the last released step', () => {
    let s = reducer(base, releaseAction)
    s = reducer(s, { kind: 'release', step: { ...STEP, id: 's2' }, timeline: TL })
    s = reducer(s, { kind: 'apply', upTo: 2 })
    expect(s.released[0].applied).toBe(0)
    expect(s.released[1].applied).toBe(2)
  })

  it('pause only from revealing; resume only from paused', () => {
    expect(reducer(at('revealing'), { kind: 'pause' }).status).toBe('paused')
    expect(reducer(at('checkpoint'), { kind: 'pause' }).status).toBe('checkpoint')
    expect(reducer(at('paused'), { kind: 'resume' }).status).toBe('revealing')
    expect(reducer(at('settled'), { kind: 'resume' }).status).toBe('settled')
  })

  it('settled → checkpoint is an explicit two-stage transition', () => {
    const s1 = reducer(at('revealing'), { kind: 'settled' })
    expect(s1.status).toBe('settled')
    expect(reducer(s1, { kind: 'checkpoint' }).status).toBe('checkpoint')
  })

  it('replay resets the last step and re-enters revealing', () => {
    let s = at('checkpoint')
    s = reducer(s, { kind: 'apply', upTo: 2 })
    s = reducer(s, { kind: 'replay', timeline: TL })
    expect(s.status).toBe('revealing')
    expect(s.released[0].applied).toBe(0)
  })

  it('complete and fail are terminal statuses with the error preserved', () => {
    expect(reducer(at('checkpoint'), { kind: 'complete' }).status).toBe('complete')
    const f = reducer(at('revealing'), { kind: 'fail', error: 'boom' })
    expect(f.status).toBe('error')
    expect(f.error).toBe('boom')
  })

  it('retime swaps the schedule without restarting or releasing anything', () => {
    const revealing = { ...at('revealing') }
    revealing.released = [{ ...revealing.released[0], applied: 1 }]
    /* Same events in the same order, arriving sooner — which is exactly what a
     * pace change produces, because chunk boundaries do not depend on pace. */
    const faster: RevealTimeline = {
      events: [TL.events[0], { ...TL.events[1], at: 250 }],
      endMs: 250, checkpointAtMs: 650,
    }

    const out = reducer(revealing, { kind: 'retime', timeline: faster })

    /* What has been shown stays shown: applied is an index into an event list
     * that is the same at every pace. */
    expect(out.released[0].applied).toBe(1)
    expect(out.released[0].timeline).toBe(faster)
    expect(out.released).toHaveLength(1)
    /* Unlike replay, it does not reset the status or the progress. */
    expect(out.status).toBe('revealing')
  })

  it('retime on an empty session is a no-op rather than a crash', () => {
    const empty = { status: 'loading' as const, released: [], pace: 'standard' as const }
    expect(reducer(empty, { kind: 'retime', timeline: TL })).toBe(empty)
  })

  it('hydrate installs a resumed lesson at a checkpoint, not mid-reveal', () => {
    const empty = { status: 'loading' as const, released: [], pace: 'standard' as const }
    const restored = [
      { step: STEP, timeline: TL, applied: TL.events.length },
      { step: { ...STEP, id: 'step-2' }, timeline: TL, applied: TL.events.length },
    ]

    const out = reducer(empty, { kind: 'hydrate', released: restored, pace: 'calm' })

    /* A returning learner finds where they were — and the next step still
     * waits for them to ask for it. */
    expect(out.status).toBe('checkpoint')
    expect(out.released).toHaveLength(2)
    expect(out.pace).toBe('calm')
    expect(out.released.every((r) => r.applied === r.timeline.events.length)).toBe(true)
  })

  it('CHECKPOINT BLOCKING: exhaustively, only release escapes to revealing', () => {
    const cp = at('checkpoint')
    const everyAction: SessionAction[] = [
      { kind: 'apply', upTo: 1 },
      { kind: 'pause' }, { kind: 'resume' },
      { kind: 'settled' }, { kind: 'checkpoint' },
      { kind: 'pace', pace: 'fast' },
      /* Re-timing at a checkpoint changes a schedule nothing is playing. It
       * must not become a way to start revealing again. */
      { kind: 'retime', timeline: TL },
      /* replay is a learner-facing re-run of the CURRENT step — permitted. */
    ]
    for (const a of everyAction) {
      const out = reducer(cp, a)
      expect(out.status, a.kind).not.toBe('revealing')
      expect(out.released, a.kind).toHaveLength(1)   // and never a new step
    }
    /* The two sanctioned exits: an explicit release (Continue / clarification)… */
    expect(reducer(cp, releaseAction).status).toBe('revealing')
    expect(reducer(cp, releaseAction).released).toHaveLength(2)
    /* …and replay, which re-runs the same step without releasing anything. */
    const r = reducer(cp, { kind: 'replay', timeline: TL })
    expect(r.status).toBe('revealing')
    expect(r.released).toHaveLength(1)
  })
})
