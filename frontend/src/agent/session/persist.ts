import type { WorkingMemory } from '../kernel/contracts'
import type { Session } from '../kernel/loop'
import { deserialize as readTask, serialize as writeTask } from '../execute/execute'
import { deserialize, serialize, type Ledger } from './ledger'

/**
 * WRITING A WHOLE SESSION DOWN, AND READING IT BACK OR REFUSING.
 *
 * WHAT WAS WRONG BEFORE
 * ---------------------
 * `Agent.suspend()` serialised the TASK. `Agent.restore()` deserialised the
 * task. Measured on the shipping code, restoring a real blob into a fresh
 * agent:
 *
 *     conversation after  = turn 0, entities 0
 *     attempts after      = 0
 *     recentGoals after   = 0
 *     suspend bytes       = NULL          <- whenever there was no task
 *
 * The second line is the worse one. A teaching conversation almost never
 * produces a task --- `plan` is rejected as "the work has one obvious order"
 * for every phrasing of "teach me X" --- so the common case was that a session
 * could not be saved AT ALL, and `suspend()` returned `null` to say so. Nothing
 * checked that return value against an expectation, because `null` is also the
 * correct answer for a brand-new session.
 *
 * WHY VERSIONED AND VALIDATED RATHER THAN CAST
 * --------------------------------------------
 * `JSON.parse(blob) as Session` is one line and it is how a truncated write
 * becomes a session with no conversation: every read succeeds and the damage
 * surfaces later as an agent that has forgotten a lesson it is halfway through.
 * A refusal is recoverable --- start a fresh session and SAY SO, which is
 * honest and which the student can correct. A misread is not, because nothing
 * downstream has any reason to doubt it.
 */

/** Bumped when this envelope changes incompatibly. */
export const SESSION_VERSION = 1

export type SessionRead = { ok: true; session: Session } | { ok: false; why: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Is this session worth writing down?
 *
 * The pre-existing contract said `suspend()` returns `null` when there is
 * nothing to suspend, and that contract is kept --- what changes is the
 * definition of "nothing". It used to mean "no task", which discarded a
 * fourteen-turn conversation. It now means "indistinguishable from a session
 * that has not started", which is the only reading under which returning
 * `null` loses nothing.
 */
export function isEmpty(s: Session): boolean {
  return (
    s.conversation.turnIndex === 0 &&
    s.conversation.entities.length === 0 &&
    s.recentGoals.length === 0 &&
    s.attempts.length === 0 &&
    !s.task &&
    !s.ledger
  )
}

export function writeSession(s: Session): string {
  return JSON.stringify({
    v: SESSION_VERSION,
    conversation: s.conversation,
    working: s.working,
    recentGoals: s.recentGoals,
    attempts: s.attempts,
    /* EACH PART IS WRITTEN BY ITS OWN SERIALISER, and stored as a string.
       `execute.ts` owns what a task is and `ledger.ts` owns what a ledger is,
       so each one's shape travels with the code that understands it. Inlining
       either object would make a change to that shape silently a change to
       THIS envelope's shape, and only one of the two version numbers would get
       bumped --- which is the failure this envelope exists to prevent. */
    ...(s.task ? { task: writeTask(s.task) } : {}),
    ...(s.ledger ? { ledger: serialize(s.ledger) } : {}),
  })
}

export function readSession(json: string): SessionRead {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    return { ok: false, why: `not JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!isRecord(raw)) return { ok: false, why: 'not an object' }
  if (raw.v !== SESSION_VERSION) {
    return { ok: false, why: `session envelope version ${String(raw.v)} is not ${SESSION_VERSION}` }
  }

  const convo = raw.conversation
  if (!isRecord(convo) || typeof convo.turnIndex !== 'number' || typeof convo.topic !== 'string'
    || !Array.isArray(convo.entities)) {
    return { ok: false, why: 'conversation is missing or malformed' }
  }
  if (!isRecord(raw.working)) return { ok: false, why: 'working memory is missing or malformed' }
  if (!Array.isArray(raw.recentGoals) || raw.recentGoals.some((g) => typeof g !== 'string')) {
    return { ok: false, why: 'recentGoals is not an array of strings' }
  }
  if (!Array.isArray(raw.attempts)) return { ok: false, why: 'attempts is not an array' }

  let task: Session['task']
  if (raw.task !== undefined) {
    if (typeof raw.task !== 'string') return { ok: false, why: 'task is not a string' }
    try {
      task = readTask(raw.task)
    } catch (e) {
      /* `execute.deserialize` throws on a task it cannot make sense of, and
         that throw is information --- but it must not escape as an exception
         from a read. Same argument as the ledger below: refusing the whole
         session is recoverable, half-restoring it is not. */
      return { ok: false, why: `task unreadable: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  let ledger: Ledger | undefined
  if (raw.ledger !== undefined) {
    if (typeof raw.ledger !== 'string') return { ok: false, why: 'ledger is not a string' }
    const read = deserialize(raw.ledger)
    /* A SESSION WITH AN UNREADABLE LEDGER IS REFUSED WHOLE. Dropping the ledger
       and keeping the conversation would produce an agent that is mid-lesson
       and believes it has no lesson --- it would restart, which is the single
       behaviour the brief names as forbidden. */
    if (!read.ok) return { ok: false, why: `ledger unreadable: ${read.why}` }
    ledger = read.ledger
  }

  return {
    ok: true,
    session: {
      conversation: {
        entities: convo.entities as Session['conversation']['entities'],
        topic: convo.topic,
        turnIndex: convo.turnIndex,
      },
      working: raw.working as unknown as WorkingMemory,
      recentGoals: raw.recentGoals as string[],
      attempts: raw.attempts as Session['attempts'],
      ...(task ? { task } : {}),
      ...(ledger ? { ledger } : {}),
    },
  }
}
