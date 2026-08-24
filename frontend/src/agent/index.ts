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
import { buildGraph, type Concept } from './learn/learn'
import type { SearchPort } from './knowledge/knowledge'
import { pause } from './execute/execute'
import { openSession, type Ledger, type Position } from './session/ledger'
import { moveTo, noteAttempt, turnId } from './session/wire'
import { isEmpty, readSession, writeSession } from './session/persist'

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
  ask(turn: Turn | string): Promise<AskResult>
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
  /**
   * Put a suspended session back, or say why not.
   *
   * A RESULT, NOT A `void`. It used to return nothing, which meant a corrupt or
   * truncated blob was indistinguishable from a successful restore: the caller
   * carried on believing it had yesterday's lesson. A refusal the caller can
   * see is the difference between "start again, and say so" and teaching the
   * first concept to somebody who finished it last week.
   */
  restore(json: string): { ok: true } | { ok: false; why: string }

  /* ---- teaching ------------------------------------------------------- */

  /**
   * Open a teaching session with an explicit objective.
   *
   * The objective is a PARAMETER and not something the agent infers, because
   * every inferred version measured came from the last utterance --- after
   * "lets pause here" the system's idea of the topic was "lets pause here".
   * A caller that cannot say what the lesson is for should not be starting one.
   */
  teach(spec: { objective: string; conceptId: string; id?: string }): void
  /** The teaching ledger, or `null` when this session is not teaching. */
  ledger(): Ledger | null
  /** Move the lesson. The one way the position changes other than a detour. */
  advanceTeaching(to: Position): void
  /**
   * Record what the student actually did.
   *
   * Explicit rather than inferred from prose, and that is the point. Measured:
   * a student stating a wrong formula produced `intent=conversation`,
   * `executed=communicate`, and `attempts=0` --- so adaptation had no input at
   * all. Guessing correctness from wording would fill that gap with fiction,
   * and fabricated mastery data moves a curriculum confidently in the wrong
   * direction. A caller that knows the answer was wrong says so.
   */
  recordAttempt(a: { conceptId: string; correct: boolean; difficulty: number; at?: string }): void
}

/** What `ask` returns: the loop's result, plus whether this was a replay. */
export type AskResult = LoopResult & {
  /**
   * True when this exact turn had already been applied and the stored result
   * was returned instead of running the loop again.
   *
   * Measured before deduplication existed: the identical `Turn` object applied
   * twice took `turnIndex` from 1 to 2 and appended the goal twice. A timeout
   * that actually succeeded, a double-submitted form, an at-least-once queue ---
   * every one of them silently inflated the student's history.
   */
  replayed: boolean
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

  /* APPLIED TURNS, AND THE ANSWERS THEY PRODUCED.
     Bounded, because this is held for the life of the agent and a conversation
     is not a place to leak. The bound is generous relative to any retry window;
     a duplicate arriving after this many distinct turns is not a retry.

     KNOWN LIMIT --- THIS CACHE IS NOT PERSISTED, SO A RETRY THAT STRADDLES A
     RELOAD ADVANCES `turnIndex` BY ONE.

     Two mechanisms sit behind deduplication and only one of them survives a
     restore. This map holds the ANSWER, so an in-session retry returns the
     identical string without re-running the loop. The ledger's `turns` list
     holds the DECISION, is written down with everything else, and is what stops
     the evidence log being appended to twice --- see `foldTurn`.

     So after a restore, a retry of a pre-restore turn regenerates an answer and
     moves `turnIndex`. What it cannot do is corrupt the record: the log, the
     attempts and therefore every claim about what the student knows are all
     protected by the durable half. Left alone deliberately. Persisting the
     answer cache means writing every generated response into the session blob
     to defend against a retry arriving after a page reload, and the machinery
     costs more than the defect --- a turn counter off by one changes no
     teaching decision. Asserted rather than assumed: see the test named "the
     evidence log is never double-appended, even across a restore". */
  const REPLAY_MEMORY = 64
  const applied = new Map<string, AskResult>()

  const remember = (id: string, out: AskResult): AskResult => {
    applied.set(id, out)
    while (applied.size > REPLAY_MEMORY) {
      const oldest = applied.keys().next().value
      if (oldest === undefined) break
      applied.delete(oldest)
    }
    return out
  }

  return {
    ports,
    session: () => session,
    ledger: () => session.ledger ?? null,

    teach(spec) {
      session = {
        ...session,
        ledger: openSession({
          id: spec.id ?? `lesson-${now()}`,
          objective: spec.objective,
          conceptId: spec.conceptId,
          at: now(),
        }),
      }
    },

    advanceTeaching(to) {
      if (!session.ledger) return
      session = { ...session, ledger: moveTo(session.ledger, to, now()) }
    },

    recordAttempt(a) {
      if (!session.ledger) return
      session = {
        ...session,
        ledger: noteAttempt(session.ledger, { ...a, at: a.at ?? now() }),
      }
    },

    /* PAUSED, then serialised --- in that order, and never serialised alone.
       `pause` writes the journal entry and carries the working memory across,
       which is what makes the resume cheaper than a restart. Serialising an
       `active` task instead produces a file that, when restored, believes a
       step is still running and stalls waiting for it.

       WHAT CHANGED: the whole session is written, not just the task. Measured
       before: `suspend()` returned `null` whenever there was no task, and a
       teaching conversation never produces one, so the common case was that a
       session could not be saved at all. `null` still means "nothing to save",
       but "nothing" now means a session indistinguishable from a new one
       rather than a session without a task. */
    suspend() {
      if (isEmpty(session)) return null
      if (session.task) {
        session = { ...session, task: pause(session.task, session.working, now()) }
      }
      return writeSession(session)
    },

    /* READ, VALIDATED, AND ONLY THEN ASSIGNED.
       The live session is replaced as one atomic step after the read succeeds,
       so a refused blob leaves the agent exactly as it was. The previous
       version assigned `deserialize(json)` straight into the session, which
       meant a malformed blob replaced a live lesson with whatever the parse
       produced. */
    restore(json: string) {
      const read = readSession(json)
      if (!read.ok) return { ok: false, why: read.why }
      session = read.session
      /* A restored session is a different history. Keeping the replay cache
         would let a turn id from the old one suppress a real turn in the new. */
      applied.clear()
      return { ok: true }
    },

    async ask(input: Turn | string): Promise<AskResult> {
      const turn = typeof input === 'string' ? textTurn(input, now()) : input
      const id = turnId(turn)

      /* THE SAME TURN IS THE SAME TURN. The stored result is returned rather
         than a fresh run, because re-running would append to the evidence log a
         second time --- and an inflated history is exactly what makes the
         learner model wrong in the direction of over-confidence. */
      const already = applied.get(id)
      if (already) return { ...already, replayed: true }

      const out = await handle(turn, session, ports)
      session = out.session
      return remember(id, { ...out, replayed: false })
    },
  }
}

/** A plain text turn. The common case, spelled once. */
export function textTurn(text: string, at: string): Turn {
  return { parts: [{ modality: 'text', content: text }], at }
}

/* THE PORT IS PART OF THE PUBLIC SURFACE, and re-exporting it here is not
   tidiness. `index.ts` is the agent area's only declared entry point, so a
   product file importing `ports/httpModel` directly leaves that module
   unreachable from any entry and the reachability gate calls it an orphan ---
   correctly, because the gate cannot see outside the area. Routing it through
   the one surface keeps `createAgent()` the single way in and keeps the gate
   measuring something true. */
export { httpModel, buildPrompt, type HttpModelOptions } from './ports/httpModel'

export type { LoopResult, ModelPort, Ports, Session, TaskState }
