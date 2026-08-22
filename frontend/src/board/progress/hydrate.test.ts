import { describe, it, expect } from 'vitest'
import { buildHydration, progressFromSession } from './hydrate'
import { validateBoard } from '../renderer/validateBoard'
import { planFromBoard } from '../teaching/plan'
import { CHANGE_OF_STATE_BOARD } from '../fixtures/change-of-state'
import type { BoardSource } from '../types/learningBoard'
import type { LearnerProgress } from './types'
import type { TeachingPlan, TeachingStep } from '../teaching/types'

function board() {
  const r = validateBoard(CHANGE_OF_STATE_BOARD as BoardSource)
  if (r.status === 'failed') throw new Error('fixture failed to validate')
  return r.board
}

function progress(over: Partial<LearnerProgress> = {}): LearnerProgress {
  return {
    sessionId: 's1',
    boardId: 'change-of-state',
    currentStepId: 'step-3',
    completedStepIds: [],
    quizAnswers: {},
    clarificationCount: 0,
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...over,
  }
}

const OPTS = { reducedMotion: false, pace: 'standard' as const }

/** A plan that counts how many steps were actually asked for. */
function countingPlan(steps: TeachingStep[]): TeachingPlan & { asked: () => number } {
  let i = 0
  return {
    title: 'T',
    subtitle: null,
    asked: () => i,
    nextStep: () => Promise.resolve(i < steps.length ? steps[i++] : null),
  }
}

function step(id: string): TeachingStep {
  return {
    id,
    purpose: 'explain',
    blocks: [{ id: `${id}-b`, type: 'explanation', content: 'Some content for this step.' }],
    checkpoint: { question: 'Clear?', continueLabel: 'Continue', unclearLabel: 'Explain again' },
  }
}

describe('rebuilding a lesson in progress', () => {
  it('restores exactly up to the saved step', async () => {
    const r = await buildHydration(planFromBoard(board()), progress({ currentStepId: 'step-3' }), OPTS)
    expect(r.stale).toBe(false)
    expect(r.restored).toBe(3)
    expect(r.released.map((x) => x.step.id)).toEqual(['step-1', 'step-2', 'step-3'])
  })

  it('never asks the plan for a step past the saved one', async () => {
    /* THE INVARIANT THAT MATTERS. Draining the plan and slicing would compute
     * steps the learner has not reached; a future step that exists is a future
     * step that can leak into the tree. */
    const plan = countingPlan([step('step-1'), step('step-2'), step('step-3'), step('step-4'), step('step-5')])
    await buildHydration(plan, progress({ currentStepId: 'step-2' }), OPTS)
    expect(plan.asked()).toBe(2)
  })

  it('marks every restored step fully revealed, so nothing replays', async () => {
    const r = await buildHydration(planFromBoard(board()), progress({ currentStepId: 'step-2' }), OPTS)
    for (const rel of r.released) {
      expect(rel.applied).toBe(rel.timeline.events.length)
      expect(rel.applied).toBeGreaterThan(0)
    }
  })

  it('restores the first step when that is where the learner stopped', async () => {
    const r = await buildHydration(planFromBoard(board()), progress({ currentStepId: 'step-1' }), OPTS)
    expect(r.restored).toBe(1)
    expect(r.stale).toBe(false)
  })

  it('reports staleness rather than resuming into a lesson that changed', async () => {
    /* The record names a step this board no longer produces. Starting fresh is
     * the honest outcome; guessing at the nearest step would put the learner
     * somewhere they never were. */
    const r = await buildHydration(planFromBoard(board()), progress({ currentStepId: 'step-999' }), OPTS)
    expect(r.stale).toBe(true)
    expect(r.restored).toBe(0)
    expect(r.released).toEqual([])
  })

  it('builds a reduced-motion timeline when that is the preference', async () => {
    const r = await buildHydration(
      planFromBoard(board()),
      progress({ currentStepId: 'step-2' }),
      { reducedMotion: true, pace: 'standard' },
    )
    for (const rel of r.released) {
      /* Same events, same order, no delays — the transcript is identical, the
       * theatre is gone. */
      expect(rel.timeline.events.every((e) => e.at === 0)).toBe(true)
    }
  })

  it('is deterministic: two rebuilds of the same record agree', async () => {
    const a = await buildHydration(planFromBoard(board()), progress(), OPTS)
    const b = await buildHydration(planFromBoard(board()), progress(), OPTS)
    expect(a.released.map((x) => x.step.id)).toEqual(b.released.map((x) => x.step.id))
    expect(a.released.map((x) => x.applied)).toEqual(b.released.map((x) => x.applied))
  })
})

describe('deriving what to save from a session', () => {
  const released = [
    { step: step('step-1'), timeline: { events: [], endMs: 0, checkpointAtMs: 0 }, applied: 0 },
    { step: step('step-2'), timeline: { events: [], endMs: 0, checkpointAtMs: 0 }, applied: 0 },
    { step: step('step-3'), timeline: { events: [], endMs: 0, checkpointAtMs: 0 }, applied: 0 },
  ]

  it('names the last released step as the current one', () => {
    const p = progressFromSession({
      sessionId: 's1', boardId: 'b', released,
      quizAnswers: {}, clarificationCount: 0, now: 'now',
    })
    expect(p?.currentStepId).toBe('step-3')
    expect(p?.completedStepIds).toEqual(['step-1', 'step-2'])
  })

  it('does not count a clarification as a completed step', () => {
    /* A clarification re-explains the step the learner is on. Counting it as
     * completed would resume them into a repeat of something they had already
     * moved past. */
    const withClarification = [
      released[0],
      { ...released[1], clarification: true },
      released[2],
    ]
    const p = progressFromSession({
      sessionId: 's1', boardId: 'b', released: withClarification,
      quizAnswers: {}, clarificationCount: 1, now: 'now',
    })
    expect(p?.completedStepIds).toEqual(['step-1'])
    expect(p?.clarificationCount).toBe(1)
  })

  it('returns nothing when no step has been released yet', () => {
    expect(progressFromSession({
      sessionId: 's1', boardId: 'b', released: [],
      quizAnswers: {}, clarificationCount: 0, now: 'now',
    })).toBeNull()
  })

  it('omits the camera entirely rather than storing an undefined one', () => {
    const p = progressFromSession({
      sessionId: 's1', boardId: 'b', released,
      quizAnswers: {}, clarificationCount: 0, now: 'now',
    })
    expect('lastCamera' in (p as object)).toBe(false)
  })

  it('round-trips: what it saves is what the rebuild looks for', async () => {
    /* The two halves of resume, checked against each other. If one ever names
     * a step the other cannot find, this fails rather than a learner
     * discovering it. */
    const plan = planFromBoard(board())
    const first = await plan.nextStep()
    const second = await plan.nextStep()
    if (!first || !second) throw new Error('expected two steps')

    const saved = progressFromSession({
      sessionId: 's1', boardId: 'change-of-state',
      released: [
        { step: first, timeline: { events: [], endMs: 0, checkpointAtMs: 0 }, applied: 0 },
        { step: second, timeline: { events: [], endMs: 0, checkpointAtMs: 0 }, applied: 0 },
      ],
      quizAnswers: {}, clarificationCount: 0, now: 'now',
    })
    if (!saved) throw new Error('expected progress')

    const rebuilt = await buildHydration(planFromBoard(board()), saved, OPTS)
    expect(rebuilt.stale).toBe(false)
    expect(rebuilt.released.map((r) => r.step.id)).toEqual([first.id, second.id])
  })
})
