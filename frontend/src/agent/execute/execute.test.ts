import { describe, expect, it } from 'vitest'

import type { Step, TaskState, Understanding } from '../kernel/contracts'
import { understand } from '../understand/understand'
import { EMPTY_WORKING } from '../memory/memory'
import {
  blocked,
  deserialize,
  nextStep,
  pause,
  planFrom,
  progress,
  replan,
  resume,
  runTask,
  serialize,
  startTask,
  summary,
  type Executor,
  type StepSpec,
} from './execute'

const AT = '2026-08-24T00:00:00.000Z'
const now = () => AT

function goal(text = 'Plan my JEE revision'): Understanding {
  return understand({ parts: [{ modality: 'text', content: text }], at: AT })
}

const THREE: StepSpec[] = [
  { goal: 'gather syllabus', capability: 'search' },
  { goal: 'assess weak areas', capability: 'memory-read', after: ['gather syllabus'] },
  { goal: 'build schedule', capability: 'plan', after: ['assess weak areas'] },
]

function task(specs: StepSpec[] = THREE): TaskState {
  return startTask(goal(), planFrom('JEE revision', specs), AT)
}

const always = (ok: boolean, retryable = false): Executor =>
  async () => (ok ? { ok: true, value: 'v' } : { ok: false, error: 'nope', retryable })

describe('planning refuses impossible plans at construction', () => {
  it('rejects a dependency cycle with a named path', () => {
    /* A cycle discovered at run time is indistinguishable from a stalled
       task: nothing running, nothing blocked externally, nothing ever ready. */
    expect(() =>
      planFrom('x', [
        { goal: 'a', capability: 'reason', after: ['b'] },
        { goal: 'b', capability: 'reason', after: ['a'] },
      ]),
    ).toThrow(/cycle/)
  })

  it('rejects a dependency on a step that does not exist', () => {
    expect(() => planFrom('x', [{ goal: 'a', capability: 'reason', after: ['ghost'] }])).toThrow(/unknown step/)
  })

  it('accepts a plan with no dependencies', () => {
    expect(planFrom('x', [{ goal: 'a', capability: 'reason' }]).steps).toHaveLength(1)
  })
})

describe('sequencing', () => {
  it('offers only the step whose dependencies are met', () => {
    const t = task()
    expect(nextStep(t)?.goal).toBe('gather syllabus')
  })

  it('offers nothing when everything is done', async () => {
    const done = await runTask(task(), always(true), { now })
    expect(nextStep(done)).toBeNull()
  })
})

describe('the loop', () => {
  it('runs every step in dependency order', async () => {
    const order: string[] = []
    const spy: Executor = async (s) => {
      order.push(s.goal)
      return { ok: true, value: s.goal }
    }
    const done = await runTask(task(), spy, { now })
    expect(order).toEqual(['gather syllabus', 'assess weak areas', 'build schedule'])
    expect(progress(done).complete).toBe(true)
    expect(done.status).toBe('done')
  })

  it('keeps each step’s result', async () => {
    const done = await runTask(task(), async (s) => ({ ok: true, value: `${s.goal}!` }), { now })
    expect(done.plan.steps[0]?.result).toBe('gather syllabus!')
  })

  it('retries a retryable failure and stops at the budget', async () => {
    let calls = 0
    const flaky: Executor = async () => {
      calls++
      return calls < 2 ? { ok: false, error: 'flaky', retryable: true } : { ok: true, value: 'ok' }
    }
    const done = await runTask(task([{ goal: 'a', capability: 'reason' }]), flaky, { now, maxAttempts: 3 })
    expect(done.plan.steps[0]?.state).toBe('done')
    expect(done.plan.steps[0]?.attempts).toBe(2)
  })

  it('does NOT retry a non-retryable failure', async () => {
    let calls = 0
    const hard: Executor = async () => {
      calls++
      return { ok: false, error: 'hard', retryable: false }
    }
    await runTask(task([{ goal: 'a', capability: 'reason' }]), hard, { now, maxAttempts: 5 })
    expect(calls).toBe(1)
  })

  it('survives an executor that throws', async () => {
    /* "Do not allow one failed tool call ... to collapse the whole task." */
    const bomb: Executor = async () => {
      throw new Error('kaboom')
    }
    const done = await runTask(task(), bomb, { now })
    expect(done.plan.steps[0]?.state).toBe('failed')
    expect(done.plan.steps[0]?.error).toBe('kaboom')
    expect(done.journal.length).toBeGreaterThan(1)
  })

  it('does not hammer a throwing executor', async () => {
    let calls = 0
    const bomb: Executor = async () => {
      calls++
      throw new Error('kaboom')
    }
    await runTask(task([{ goal: 'a', capability: 'reason' }]), bomb, { now, maxAttempts: 5 })
    expect(calls).toBe(1)
  })
})

describe('partial completion is reported as partial', () => {
  it('marks downstream steps blocked, not failed', async () => {
    /* "Failed" and "never got the chance" are different facts, and a report
       that conflates them overstates how much actually broke. */
    let first = true
    const failFirst: Executor = async () => {
      if (first) {
        first = false
        return { ok: false, error: 'no network' }
      }
      return { ok: true }
    }
    const done = await runTask(task(), failFirst, { now })
    expect(done.plan.steps[0]?.state).toBe('failed')
    expect(done.plan.steps[1]?.state).toBe('blocked')
    expect(done.plan.steps[2]?.state).toBe('blocked')
  })

  it('propagates blocking transitively through a chain', () => {
    const t: TaskState = {
      ...task(),
      plan: {
        goal: 'x',
        revisions: [],
        steps: [
          { id: 'a', goal: 'a', capability: 'reason', state: 'failed', dependsOn: [], attempts: 1 },
          { id: 'b', goal: 'b', capability: 'reason', state: 'pending', dependsOn: ['a'], attempts: 0 },
          { id: 'c', goal: 'c', capability: 'reason', state: 'pending', dependsOn: ['b'], attempts: 0 },
        ] as Step[],
      },
    }
    expect(blocked(t).map((s) => s.id).sort()).toEqual(['b', 'c'])
  })

  it('NEVER reports a task with blocked steps as complete', async () => {
    /* "Nothing left to run" is not "finished". Conflating them is how partial
       work gets delivered as done. */
    const done = await runTask(task(), always(false), { now })
    expect(progress(done).complete).toBe(false)
    expect(done.status).toBe('blocked')
  })

  it('an empty plan is not complete', () => {
    expect(progress(task([])).complete).toBe(false)
  })
})

describe('continuity across sessions', () => {
  it('round-trips through JSON with nothing lost', () => {
    /* THE PROPERTY CAPABILITY 32 RESTS ON. One closure anywhere in this state
       and resuming tomorrow becomes impossible --- silently, and only
       discovered when a user actually comes back. */
    const t = task()
    expect(deserialize(serialize(t))).toEqual(t)
  })

  it('a mid-run task round-trips too', async () => {
    const half = await runTask(task(), always(true), { now, budget: 2 })
    expect(deserialize(serialize(half))).toEqual(half)
    expect(half.status).toBe('paused')
  })

  it('a budget stop PAUSES rather than failing', () => {
    /* A paused task is resumed; a failed one is restarted. */
    return runTask(task(), always(true), { now, budget: 1 }).then((t) => {
      expect(t.status).toBe('paused')
      expect(t.plan.steps.filter((s) => s.state === 'done')).toHaveLength(1)
    })
  })

  it('resumes and finishes the rest', async () => {
    const half = await runTask(task(), always(true), { now, budget: 1 })
    const done = await runTask(resume(half, AT), always(true), { now })
    expect(progress(done).complete).toBe(true)
  })

  it('puts an interrupted running step back to pending', async () => {
    /* The most likely cross-session bug: a step left `running` is neither
       pending nor done, so the resumed task skips it and declares itself
       stuck. Invisible until someone actually returns. */
    const stuck: TaskState = {
      ...task(),
      plan: {
        goal: 'x',
        revisions: [],
        steps: [{ id: 'a', goal: 'a', capability: 'reason', state: 'running', dependsOn: [], attempts: 1 }] as Step[],
      },
    }
    expect(nextStep(stuck)).toBeNull()
    const back = resume(stuck, AT)
    expect(nextStep(back)?.id).toBe('a')
  })

  it('keeps intermediate results across a pause', async () => {
    const t = pause(task(), { ...EMPTY_WORKING, intermediates: { total: 42 } }, AT)
    expect(deserialize(serialize(t)).working.intermediates['total']).toBe(42)
  })

  it('summarises where the user left off', async () => {
    const half = await runTask(task(), always(true), { now, budget: 1 })
    const text = summary(half)
    expect(text).toContain('1 of 3')
    expect(text).toContain('Next:')
  })

  it('summarises a finished task without a next step', async () => {
    const done = await runTask(task(), always(true), { now })
    expect(summary(done)).toContain('finished')
  })
})

describe('replanning is recorded, not silent', () => {
  it('keeps completed work and records why the plan changed', async () => {
    /* Silently rewriting the plan makes the finished task look like it always
       intended this, which destroys "why did it do that?". */
    const half = await runTask(task(), always(true), { now, budget: 1 })
    const revised = replan(half, 'user added chemistry', [{ goal: 'add chemistry', capability: 'plan' }], AT)
    expect(revised.plan.revisions).toEqual(['user added chemistry'])
    expect(revised.plan.steps.filter((s) => s.state === 'done')).toHaveLength(1)
    expect(revised.status).toBe('active')
    expect(revised.journal.some((j) => j.event === 'replanned')).toBe(true)
  })

  it('runs the added step', async () => {
    const half = await runTask(task(), always(true), { now, budget: 3 })
    const revised = replan(half, 'more', [{ goal: 'extra', capability: 'reason' }], AT)
    const done = await runTask(revised, always(true), { now })
    expect(progress(done).complete).toBe(true)
    expect(done.plan.steps.map((s) => s.goal)).toContain('extra')
  })
})

describe('the journal is append-only', () => {
  it('only ever grows', async () => {
    const t = task()
    const before = t.journal.length
    const done = await runTask(t, always(true), { now })
    expect(done.journal.length).toBeGreaterThan(before)
    expect(done.journal.slice(0, before)).toEqual(t.journal)
  })

  it('records the failure reason where it happened', async () => {
    const done = await runTask(task(), always(false), { now })
    const entry = done.journal.find((j) => j.event === 'failed')
    expect(entry?.detail).toBe('nope')
    expect(entry?.stepId).toBe(done.plan.steps[0]?.id)
  })

  it('never mutates the task it was given', async () => {
    const t = task()
    const snapshot = JSON.stringify(t)
    await runTask(t, always(true), { now })
    expect(JSON.stringify(t)).toBe(snapshot)
  })
})

describe('progress answers the brief’s state questions', () => {
  it('reports what remains, what failed, and what is blocked', async () => {
    let first = true
    const done = await runTask(
      task(),
      async () => {
        if (first) {
          first = false
          return { ok: false, error: 'x' }
        }
        return { ok: true }
      },
      { now },
    )
    const p = progress(done)
    expect(p.total).toBe(3)
    expect(p.failed).toBe(1)
    expect(p.blocked).toBe(2)
    expect(p.remaining).toEqual([])
    expect(p.complete).toBe(false)
  })
})
