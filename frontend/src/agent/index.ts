import type { Turn, TaskState } from './kernel/contracts'
import {
  handle,
  NEW_SESSION,
  type LoopResult,
  type ModelPort,
  type Ports,
  type Session,
} from './kernel/loop'
import { createStore, inMemoryPersistence, type Persistence } from './memory/memory'
import { calculator, createRegistry, fileTools, type FileSource } from './tools/tools'
import { buildGraph, type Attempt, type Concept } from './learn/learn'
import type { SearchPort } from './knowledge/knowledge'
import { deserialize, pause, serialize } from './execute/execute'

/**
 * THE COMPOSITION ROOT --- the one place the agent is actually assembled.
 *
 * WHY THIS FILE HAD TO EXIST BEFORE ANYTHING ELSE COULD BE TRUSTED
 * ----------------------------------------------------------------
 * Before it, `handle()` took a `Ports` object and nothing in the shipping
 * codebase ever built one. Every registry, every store, every concept graph
 * that the loop ran against was constructed inside a test. The consequence was
 * not "less coverage" --- it was that `createRegistry`, `calculator`,
 * `fileTools`, `createStore`, `inMemoryPersistence` and `buildGraph` were all
 * dead code with green tests, and the `calculate` capability could not have
 * worked in production because no shipping file ever registered a calculator.
 *
 * A missing composition root does not look like a bug. It looks like a clean
 * dependency-injected design. The difference is whether anyone ever injects.
 *
 * WHY THE AGENT OWNS ITS SESSION
 * ------------------------------
 * `handle()` is deliberately pure: session in, session out. That is right for
 * the loop and wrong as an API, because it makes "remember the last turn" the
 * caller's problem, and a caller that forgets to thread the returned session
 * silently loses conversation memory --- entities stop resolving, `topicShift`
 * fires on every turn, and nothing errors. The threading happens here, once.
 *
 * WHAT IS STILL INJECTED, AND WHY
 * -------------------------------
 * The model, search, files and persistence are ports because they are I/O.
 * `now` is a port because a clock read inside the substrate makes the loop
 * unreplayable. Everything else is constructed here, so there is exactly one
 * answer to "what tools does the agent have".
 */

export interface AgentOptions {
  /** Required. The only thing that generates prose. */
  model: ModelPort
  /** Absent means the `search` capability is selected and reported unavailable. */
  search?: SearchPort
  /** Absent means file tools are not registered, so `files` degrades. */
  files?: FileSource
  /** Where memories live between sessions. Defaults to in-process. */
  persistence?: Persistence
  /** The concept graph for the learning layer. Absent means teaching is generic. */
  curriculum?: readonly Concept[]
  /** Injected so the whole loop is replayable. Defaults to the wall clock. */
  now?: () => string
}

export interface Agent {
  /** Take one turn. The session is threaded internally. */
  ask(turn: Turn | string): Promise<LoopResult>
  /** The conversation so far. Read-only; `ask` is the only thing that moves it. */
  session(): Session
  /** The assembled ports, exposed for inspection rather than for mutation. */
  ports: Ports
  /**
   * The in-flight task, if the last turn produced or advanced one.
   *
   * Returned as a STRING because that is the only form that survives being put
   * in a database and read back tomorrow. Handing out the live object invites a
   * caller to keep a reference to it, and a `TaskState` held in memory across a
   * deploy is a task that quietly disappears.
   */
  suspend(): string | null
  /** Put a suspended task back. The counterpart of `suspend`. */
  restore(json: string): void
  /**
   * Record that the learner attempted a concept, and whether they got it right.
   *
   * THIS EXISTED NOWHERE, AND ITS ABSENCE MADE A CAPABILITY UNREACHABLE.
   * `session.attempts` is the only source of `learner.attempts`, nothing in
   * `handle()` ever appended to it, and so it was permanently empty. Measured:
   * five turns through `ask()`, `session.attempts.length === 0`. Everything
   * downstream that reads attempt history was therefore dead through the loop
   * --- `feedbackFor` (what did they get wrong and how much to give away),
   * `nextDifficulty` (harder or easier next), `nextReview` (spacing), and
   * `dueForReview`.
   *
   * NOT INFERRED FROM THE CONVERSATION, deliberately. A turn is not an attempt.
   * Guessing "they probably got that right" from prose would write fabricated
   * mastery data into the thing that decides what to teach next, and wrong
   * mastery data is worse than none --- it moves the curriculum confidently in
   * the wrong direction. An attempt is something a practice surface KNOWS
   * happened, so it is something the caller states rather than something the
   * loop divines.
   *
   * Same root cause as the missing composition root: the logic was written and
   * tested, and nothing could reach it because no entry point existed.
   */
  recordAttempt(attempt: Attempt): void
}

export function createAgent(opts: AgentOptions): Agent {
  const now = opts.now ?? (() => new Date().toISOString())

  /* THE REGISTRY IS BUILT HERE AND NOWHERE ELSE. `calculator` is unconditional
     because arithmetic is never wrong to have; file tools appear only when a
     source was supplied, so `read_file` is absent rather than present-and-
     broken when there is nothing to read. An absent tool is a clean failure
     the recovery path already classifies as `not-found`. */
  const tools = createRegistry([calculator, ...(opts.files ? fileTools(opts.files) : [])])

  const memory = createStore(opts.persistence ?? inMemoryPersistence(), now)

  const ports: Ports = {
    memory,
    tools,
    model: opts.model,
    now,
    ...(opts.search ? { search: opts.search } : {}),
    ...(opts.curriculum ? { concepts: buildGraph(opts.curriculum) } : {}),
  }

  let session = NEW_SESSION

  return {
    ports,
    session: () => session,
    /* PAUSED, then serialised --- in that order, and never serialised alone.
       `pause` writes the journal entry and carries the working memory across,
       which is what makes the resume cheaper than a restart. Serialising an
       `active` task instead produces a file that, when restored, believes a
       step is still running and stalls waiting for it. */
    suspend() {
      if (!session.task) return null
      const stopped = pause(session.task, session.working, now())
      session = { ...session, task: stopped }
      return serialize(stopped)
    },
    /* THE WORKING MEMORY COMES BACK TOO, and it did not.
       This was `{ ...session, task: deserialize(json) }` --- task in, working
       untouched --- so the intermediate results `suspend()` had carefully saved
       were unreachable after a restore. Measured:

           suspend() returned    1449 chars
           BEFORE  working       7 entities
           AFTER   working       0 entities
           re-suspend            1005 chars

       The second half is the damaging one and it is DATA LOSS, not
       degradation: the next `suspend()` writes the fresh agent's EMPTY working
       memory over the saved one, so 444 characters of recovery state are
       destroyed BY A SAVE OPERATION, and the shorter file looks exactly as
       valid as the original. A periodic-checkpoint caller silently shortens its
       own recovery state every cycle.

       `pause()` already stores the working memory INSIDE the task, precisely so
       this is possible --- execute.ts says it carries `working` whole because
       "the intermediate results are the reason resuming is cheaper than
       restarting". The save side held up its end; the restore side did not. No
       format change is needed, only reading back what was already written. */
    restore(json: string) {
      const task = deserialize(json)
      session = { ...session, task, working: task.working ?? session.working }
    },
    recordAttempt(attempt: Attempt) {
      session = { ...session, attempts: [...session.attempts, attempt] }
    },
    async ask(input: Turn | string): Promise<LoopResult> {
      const turn = typeof input === 'string' ? textTurn(input, now()) : input
      const out = await handle(turn, session, ports)
      session = out.session
      return out
    },
  }
}

/** A plain text turn. The common case, spelled once. */
export function textTurn(text: string, at: string): Turn {
  return { parts: [{ modality: 'text', content: text }], at }
}

export type { LoopResult, ModelPort, Ports, Session, TaskState }
