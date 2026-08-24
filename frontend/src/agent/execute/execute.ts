import type {
  Capability,
  JournalEntry,
  Plan,
  Step,
  StepState,
  TaskState,
  Understanding,
  WorkingMemory,
} from '../kernel/contracts'
import { EMPTY_WORKING } from '../memory/memory'

/**
 * DOING THE WORK --- Capabilities 11 to 14, and 32.
 *
 * WHY `TaskState` IS PLAIN DATA AND NOTHING HERE IS A CLASS
 * ---------------------------------------------------------
 * Capability 32 asks that a user come back tomorrow and continue. That is not
 * a feature you add at the end; it is a property you either have or have
 * permanently lost, and you lose it the moment any part of task state holds a
 * closure, a socket, a promise, or a class instance. So every function in this
 * file takes a `TaskState` and returns a NEW one, the whole thing survives
 * `JSON.parse(JSON.stringify(...))`, and there is a test that asserts exactly
 * that. Serialisability is the feature.
 *
 * WHY THE JOURNAL IS APPEND-ONLY
 * ------------------------------
 * It is both the audit trail and the resume point, and those two jobs pull in
 * the same direction: an entry that can be rewritten is an entry that cannot
 * be trusted to explain how the task reached its current state. "What is
 * blocked and why" is answerable only from a record nobody edited.
 */

/* -------------------------------------------------------------------------- */
/* Planning --- Capability 12                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ids are DERIVED, never counted.
 *
 * This used to be a module-level `let seq = 0`, which had two costs. The
 * visible one was a `resetIds()` export that existed only so tests could get
 * stable ids --- test-only production code, and the exact shape of thing that
 * rots. The invisible one was worse: two agents in one process shared the
 * counter, so a task's step ids depended on what some unrelated task had done
 * first, and a serialised task could not be compared to a replay of itself.
 *
 * Deriving the id from position within its own plan makes it a function of the
 * plan alone, which is what "resumable" quietly requires.
 */
const stepId = (index: number) => `s${index + 1}`

/** Stable, short, and dependent only on the goal. Not a security hash. */
function digest(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export interface StepSpec {
  goal: string
  capability: Capability
  /** Goals of steps that must finish first. Resolved to ids by `planFrom`. */
  after?: readonly string[]
}

/**
 * Build a plan, refusing to build an impossible one.
 *
 * A DEPENDENCY CYCLE IS REJECTED AT CONSTRUCTION, NOT DISCOVERED AT RUN TIME.
 * A cycle discovered while executing looks exactly like a task that has
 * stalled: nothing is running, nothing is blocked on anything external, and no
 * step will ever become ready. Catching it here turns a mysterious hang into
 * an error with a name.
 */
export function planFrom(goal: string, specs: readonly StepSpec[]): Plan {
  const byGoal = new Map<string, string>()
  const steps: Step[] = specs.map((s, i) => {
    const id = stepId(i)
    byGoal.set(s.goal, id)
    return {
      id,
      goal: s.goal,
      capability: s.capability,
      state: 'pending' as StepState,
      dependsOn: [],
      attempts: 0,
    }
  })

  specs.forEach((spec, i) => {
    const step = steps[i]
    if (!step) return
    const deps: string[] = []
    for (const g of spec.after ?? []) {
      const id = byGoal.get(g)
      if (!id) throw new Error(`step "${spec.goal}" depends on unknown step "${g}"`)
      deps.push(id)
    }
    steps[i] = { ...step, dependsOn: deps }
  })

  const cycle = findCycle(steps)
  if (cycle) throw new Error(`plan has a dependency cycle: ${cycle.join(' -> ')}`)

  return { goal, steps, revisions: [] }
}

function findCycle(steps: readonly Step[]): string[] | null {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []

  const walk = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'open') return [...stack.slice(stack.indexOf(id)), id]
    state.set(id, 'open')
    stack.push(id)
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      const found = walk(dep)
      if (found) return found
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }

  for (const s of steps) {
    const found = walk(s.id)
    if (found) return found
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Task state --- Capability 14                                               */
/* -------------------------------------------------------------------------- */

/**
 * Begin a task.
 *
 * THE ID IS A CONTENT HASH, AND THAT HAS A CONSEQUENCE WORTH STATING.
 *
 * It covers the goal, the step goals, and the start time, so two DIFFERENT
 * plans can never collide. Two IDENTICAL plans started at the same instant DO
 * share an id, and that is the deliberate trade: an id that is a pure function
 * of its inputs is what lets a serialised task be compared against a replay of
 * itself, which is the property `resume` and `deserialize` are built on.
 *
 * The first version hashed only `goal@at` and I found it collided across
 * genuinely different plans, which is not defensible. This one is narrower:
 * same goal, same steps, same millisecond. In production `at` is a real clock,
 * so that means a true duplicate submission. Under a FIXED clock --- every
 * test in this repo --- it is guaranteed, so any caller keying storage by id
 * must not assume uniqueness across two runs of the same fixture. Pinned by
 * test rather than left for someone to discover from a lost task.
 */
export function startTask(u: Understanding, plan: Plan, at: string): TaskState {
  return {
    id: `t${digest(`${plan.goal}@${at}@${plan.steps.map((s) => s.goal).join('|')}`)}`,
    plan,
    working: { ...EMPTY_WORKING, objective: u.goal, constraints: u.constraints, entities: u.entities },
    journal: [{ at, event: 'started', detail: plan.goal }],
    status: 'active',
  }
}

function log(task: TaskState, entry: JournalEntry): TaskState {
  return { ...task, journal: [...task.journal, entry] }
}

function setStep(task: TaskState, id: string, patch: Partial<Step>): TaskState {
  return {
    ...task,
    plan: {
      ...task.plan,
      steps: task.plan.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    },
  }
}

/**
 * The next step that can actually run.
 *
 * "Ready" means pending AND every dependency `done`. A step whose dependency
 * FAILED is not ready and never becomes ready --- see `blocked` below. Those
 * are different states and collapsing them is how a task reports "in progress"
 * forever.
 */
export function nextStep(task: TaskState): Step | null {
  const done = new Set(task.plan.steps.filter((s) => s.state === 'done').map((s) => s.id))
  return (
    task.plan.steps.find((s) => s.state === 'pending' && s.dependsOn.every((d) => done.has(d))) ?? null
  )
}

/** Steps that can never run because something they need failed. */
export function blocked(task: TaskState): readonly Step[] {
  const dead = new Set(
    task.plan.steps.filter((s) => s.state === 'failed' || s.state === 'blocked').map((s) => s.id),
  )
  if (dead.size === 0) return []
  /* Transitive: a step depending on a blocked step is itself blocked. Iterated
     to a fixed point rather than one pass, because a chain of three would
     otherwise report only the first as blocked. */
  let changed = true
  while (changed) {
    changed = false
    for (const s of task.plan.steps) {
      if (dead.has(s.id) || s.state === 'done') continue
      if (s.dependsOn.some((d) => dead.has(d))) {
        dead.add(s.id)
        changed = true
      }
    }
  }
  return task.plan.steps.filter((s) => dead.has(s.id) && s.state !== 'failed')
}

export interface Progress {
  done: number
  total: number
  failed: number
  blocked: number
  remaining: readonly string[]
  complete: boolean
}

/**
 * Where the task stands --- the brief's "current / previous / desired /
 * what changed / what remains / what is blocked / what is complete".
 */
export function progress(task: TaskState): Progress {
  const steps = task.plan.steps
  const blockedIds = new Set(blocked(task).map((s) => s.id))
  const done = steps.filter((s) => s.state === 'done').length
  const failed = steps.filter((s) => s.state === 'failed').length
  return {
    done,
    total: steps.length,
    failed,
    blocked: blockedIds.size,
    remaining: steps.filter((s) => s.state === 'pending' && !blockedIds.has(s.id)).map((s) => s.goal),
    /* COMPLETE MEANS EVERY STEP FINISHED. Not "nothing left to run" --- a task
       whose remaining steps are all blocked has also run out of things to do,
       and reporting that as complete is how partial work gets delivered as
       finished. */
    complete: done === steps.length && steps.length > 0,
  }
}

/* -------------------------------------------------------------------------- */
/* The loop --- Capability 13                                                 */
/* -------------------------------------------------------------------------- */

export interface StepOutcome {
  ok: boolean
  value?: unknown
  error?: string
  /** Only a failure the executor judged worth repeating unchanged. */
  retryable?: boolean
}

export type Executor = (step: Step, task: TaskState) => Promise<StepOutcome>

export interface RunOptions {
  maxAttempts?: number
  /** Injected so the journal is deterministic. */
  now: () => string
  /** Stop after this many steps, for a bounded slice of a long task. */
  budget?: number
}

/**
 * OBSERVE -> ACT -> INSPECT -> DECIDE -> ACT -> COMPLETE.
 *
 * Returns whatever state it reached, including a partial one. It does NOT
 * throw on a failed step and it does NOT unwind: the point of a resumable task
 * is that stopping halfway leaves something worth resuming, and an exception
 * that discards the journal destroys exactly the record needed to continue.
 */
export async function runTask(
  task: TaskState,
  execute: Executor,
  opts: RunOptions,
): Promise<TaskState> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2)
  let current = task
  let spent = 0

  for (;;) {
    if (opts.budget !== undefined && spent >= opts.budget) {
      /* PAUSED, not failed. The distinction is the whole of Capability 32:
         a paused task is resumed, a failed one is restarted. */
      return log({ ...current, status: 'paused' }, { at: opts.now(), event: 'paused', detail: 'budget spent' })
    }

    const step = nextStep(current)
    if (!step) break

    current = setStep(current, step.id, { state: 'running' })
    current = log(current, { at: opts.now(), stepId: step.id, event: 'running', detail: step.goal })

    let outcome: StepOutcome = { ok: false, error: 'not run' }
    let attempts = 0
    while (attempts < maxAttempts) {
      attempts++
      try {
        outcome = await execute(step, current)
      } catch (e) {
        /* A throwing executor is a bug in the executor, not weather. Recorded
           as non-retryable so it is not hammered. */
        outcome = { ok: false, error: e instanceof Error ? e.message : String(e), retryable: false }
      }
      if (outcome.ok || !outcome.retryable) break
      current = log(current, { at: opts.now(), stepId: step.id, event: 'retry', detail: outcome.error })
    }
    spent++

    current = setStep(current, step.id, {
      state: outcome.ok ? 'done' : 'failed',
      attempts,
      ...(outcome.ok ? { result: outcome.value } : { error: outcome.error }),
    })
    current = log(current, {
      at: opts.now(),
      stepId: step.id,
      event: outcome.ok ? 'done' : 'failed',
      detail: outcome.ok ? undefined : outcome.error,
    })

    if (!outcome.ok) {
      /* Mark what can never run now, so the report distinguishes "failed"
         from "never got the chance". */
      for (const b of blocked(current)) {
        current = setStep(current, b.id, { state: 'blocked' })
      }
    }
  }

  const p = progress(current)
  return log(
    { ...current, status: p.complete ? 'done' : 'blocked' },
    {
      at: opts.now(),
      event: p.complete ? 'complete' : 'stopped',
      detail: p.complete ? undefined : `${p.done}/${p.total} done, ${p.failed} failed, ${p.blocked} blocked`,
    },
  )
}

/* -------------------------------------------------------------------------- */
/* Replanning and continuity --- Capabilities 12 and 32                       */
/* -------------------------------------------------------------------------- */

/**
 * Add steps to a running task without losing what it already did.
 *
 * The revision is RECORDED. Silently rewriting the plan makes the finished
 * task look like it always intended to do this, which destroys the ability to
 * ask "why did it do that?" after the fact.
 */
export function replan(task: TaskState, why: string, extra: readonly StepSpec[], at: string): TaskState {
  /* Numbered on from the existing steps, so a replanned task still has ids
     that are a function of the plan and nothing else. */
  const added: Step[] = extra.map((s, i) => ({
    id: stepId(task.plan.steps.length + i),
    goal: s.goal,
    capability: s.capability,
    state: 'pending',
    dependsOn: [],
    attempts: 0,
  }))
  const next: TaskState = {
    ...task,
    plan: {
      ...task.plan,
      steps: [...task.plan.steps, ...added],
      revisions: [...task.plan.revisions, why],
    },
    status: 'active',
  }
  return log(next, { at, event: 'replanned', detail: why })
}

/**
 * Pause for later. `working` is carried whole --- the intermediate results are
 * the reason resuming is cheaper than restarting.
 */
export function pause(task: TaskState, working: WorkingMemory, at: string): TaskState {
  return log({ ...task, working, status: 'paused' }, { at, event: 'paused' })
}

/**
 * Resume, putting back any step that was mid-flight when we stopped.
 *
 * A step left `running` by an interrupted session would otherwise be neither
 * pending (so `nextStep` skips it) nor done --- the task would resume and
 * immediately declare itself stuck. This is the single most likely
 * cross-session bug and it is invisible until someone actually comes back.
 */
export function resume(task: TaskState, at: string): TaskState {
  const steps = task.plan.steps.map((s) => (s.state === 'running' ? { ...s, state: 'pending' as StepState } : s))
  return log(
    { ...task, plan: { ...task.plan, steps }, status: 'active' },
    { at, event: 'resumed', detail: summary(task) },
  )
}

/** One line a human can read to know where they left off. */
export function summary(task: TaskState): string {
  const p = progress(task)
  if (p.complete) return `"${task.plan.goal}" is finished.`
  const next = p.remaining[0]
  return (
    `"${task.plan.goal}": ${p.done} of ${p.total} steps done` +
    (p.failed > 0 ? `, ${p.failed} failed` : '') +
    (p.blocked > 0 ? `, ${p.blocked} blocked` : '') +
    (next ? `. Next: ${next}` : '')
  )
}

export function serialize(task: TaskState): string {
  return JSON.stringify(task)
}

export function deserialize(json: string): TaskState {
  return JSON.parse(json) as TaskState
}
