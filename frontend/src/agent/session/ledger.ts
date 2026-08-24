import { masteryFromAttempts, masteryRank, type Attempt, type Mastery } from '../learn/learn'

/**
 * THE TEACHING LEDGER --- the durable record of where a lesson actually is.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN ARGUED
 * --------------------------------------------
 * The loop before this file could not answer "where were we" from anything but
 * the last thing the student said. Driving the real `createAgent` through the
 * student journey produced, in order:
 *
 *     conversation.topic  = "lets pause here"     <- the objective, destroyed
 *     session.task        = NONE                  <- after 14 teaching turns
 *     session.attempts    = 0                     <- after a wrong answer
 *     1000 turns          = 1137 bytes            <- nothing accumulates
 *     restore() ->        turn 0, 0 entities      <- a reload loses everything
 *     "continue"          -> topicShift = true    <- the word that means "don't"
 *
 * Every one of those is the same missing thing wearing a different hat: there
 * was no VALUE representing the teaching process, so every question about it
 * had to be re-derived from prose, and prose is what the last utterance
 * overwrites.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a memory store, not a curriculum, and not a mastery model. Mastery is
 * `masteryFromAttempts` in `learn.ts` and is imported rather than reimplemented
 * --- two definitions of "understood" that drift apart is precisely the silent
 * contradiction the brief forbids, and a second copy is how you get one.
 *
 * WHY THIS IS NOT `TaskState`, AND THE GAP THAT MADE IT NECESSARY
 * ---------------------------------------------------------------
 * `execute.ts` already models work in flight, with a plan, steps, a journal and
 * pause/resume. The obvious question is why teaching does not simply use it.
 * The answer is measured rather than argued: A TEACHING REQUEST NEVER PRODUCES
 * A TASK. The router rejects `plan` with "the work has one obvious order" for
 * every phrasing tried, including "teach me quadratics", "first explain
 * fractions then algebra then quadratics and then test me", and "plan how to
 * learn quadratics step by step" --- only the last selects `plan` at all. After
 * fourteen teaching turns `session.task` was still `NONE`, so there was nothing
 * to pause, nothing to resume, and `suspend()` returned `null`.
 *
 * This module ROUTES AROUND that rather than fixing it, and that is a choice
 * worth being explicit about. Fixing it properly means either lowering
 * `PLAN_THRESHOLD` (which makes the agent stall on requests with one obvious
 * order, the exact thing the threshold exists to prevent) or teaching
 * `stepsFor` to decompose pedagogical goals (a real piece of work, in the
 * router, with its own blast radius). Until one of those happens, a teaching
 * position is a different thing from a task and lives here.
 *
 * WHY IT IS PLAIN DATA
 * --------------------
 * Every field is JSON. The stack of interruptions is an array, not a closure or
 * a call stack, because a closure cannot be written to a database and read back
 * tomorrow --- and "the student left and came back on Tuesday" is the case this
 * file exists for. A resume that only works inside one process is not a resume.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Bumped when the persisted shape changes incompatibly.
 *
 * Read on the way in, and a HIGHER number is refused rather than parsed. A
 * ledger written by tomorrow's code and read by today's would otherwise be
 * silently misread, and a misread teaching position is worse than a missing one
 * --- it teaches the wrong thing confidently instead of asking.
 */
export const LEDGER_VERSION = 1

/**
 * What is being done with the concept, not how well it is known.
 *
 * These are separate questions and conflating them is a real bug: a student can
 * be at `practising` and still `partial`, and "resume where we were" needs the
 * first while "may I say you know this" needs the second. Mastery lives in
 * `learn.ts`; this is position.
 */
export type Phase = 'introducing' | 'explaining' | 'checking' | 'practising' | 'done'

export interface Position {
  conceptId: string
  phase: Phase
  /**
   * What this concept still owes before it can be called done.
   *
   * The reason completion is not "the phase says done": a phase is a label the
   * teacher sets, and a label can be set optimistically. An outstanding item is
   * a fact. `isComplete` requires both.
   */
  unfinished: readonly string[]
}

export type EventKind =
  | 'shown'
  | 'attempted'
  | 'asked'
  | 'interrupted'
  | 'returned'
  | 'advanced'
  | 'paused'
  | 'resumed'

/**
 * One thing that actually happened, in the student's real history.
 *
 * APPEND-ONLY, AND THAT IS THE WHOLE VALUE. This log is the only admissible
 * evidence for a sentence like "you already got this right" --- see
 * `mayClaim`. A log that can be rewritten is a log that can be made to agree
 * with whatever the model just said.
 */
export interface LedgerEvent {
  kind: EventKind
  /** ISO 8601. Supplied by the caller so the whole ledger stays replayable. */
  at: string
  /** Free text for a human reading the history. Never parsed for meaning. */
  detail: string
  conceptId?: string
  /** `attempted` only. */
  correct?: boolean
  /** `attempted` only. 1 (easiest) to 5, matching `learn.ts`. */
  difficulty?: number
}

/** A place the teaching was, waiting to be returned to. */
export interface Suspended {
  position: Position
  reason: string
  at: string
}

export interface Ledger {
  readonly version: number
  readonly id: string
  /**
   * What this session is FOR. Set once, at the top, and never reassigned.
   *
   * The measured failure it answers: `conversation.topic` tracked the last
   * utterance, so after "lets pause here" the system believed the topic was
   * "lets pause here". An objective that any turn can overwrite cannot hold a
   * lesson on course across a detour, which is the definition of drift.
   */
  readonly objective: string
  readonly position: Position
  /** Innermost last. A stack, so nesting is free. */
  readonly interrupted: readonly Suspended[]
  /**
   * Everything that happened, oldest first.
   *
   * KNOWN LIMIT --- THIS GROWS WITHOUT BOUND, AND IT IS NOT AN OVERSIGHT.
   * Measured through the real agent: one entry per turn, ~139 bytes each,
   * 139,597 bytes at a thousand turns. At ten thousand turns it is around
   * 1.4 MB, which is a real problem for any browser store with a 5 MB budget
   * shared with everything else.
   *
   * It is not bounded here because bounding it is a DELIBERATE EXCEPTION to the
   * append-only invariant this module asserts and tests, and an exception needs
   * its own design rather than a slice at the end of somebody else's change.
   * The shape that design should take, so the next person does not start from
   * nothing: `attempted` entries are irreplaceable evidence and must never be
   * dropped --- they are the entire basis for `established` and therefore for
   * every claim about what the student knows. `asked`, `advanced`, `shown`,
   * `interrupted` and `returned` are narrative, and a compaction that keeps all
   * attempts plus the most recent N of everything else loses nothing that any
   * decision reads. Whoever writes it must also decide what a compacted log
   * does to the append-only tests, which currently assert the log NEVER
   * shortens; the honest answer is probably a separate `compact()` that is the
   * only function permitted to, with its own tests.
   */
  readonly log: readonly LedgerEvent[]
  /** Turn ids already applied. See `beginTurn`. */
  readonly turns: readonly string[]
  readonly startedAt: string
}

/**
 * How many applied turn ids to remember.
 *
 * Unbounded, this is a slow leak in the one structure that must survive being
 * serialised on every turn. Bounded too tightly, a retry that arrives after a
 * few other turns is not recognised and double-counts. 512 is far past any
 * plausible retry window and costs about 6 KB at the ceiling.
 */
const TURN_MEMORY = 512

/* -------------------------------------------------------------------------- */
/* Construction                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `Object.freeze` on every returned ledger, deliberately.
 *
 * The append-only guarantee is otherwise a promise about the code that touches
 * this file, and this file is not where the mistake will happen --- it will
 * happen in a caller that pushes onto `log` because it is right there. Frozen,
 * that is a `TypeError` at the moment of the mistake instead of a corrupted
 * history discovered a week later.
 */
function seal(l: Ledger): Ledger {
  Object.freeze(l.position)
  Object.freeze(l.log)
  Object.freeze(l.interrupted)
  Object.freeze(l.turns)
  return Object.freeze(l)
}

export function openSession(spec: {
  id: string
  objective: string
  conceptId: string
  at: string
}): Ledger {
  return seal({
    version: LEDGER_VERSION,
    id: spec.id,
    objective: spec.objective,
    position: { conceptId: spec.conceptId, phase: 'introducing', unfinished: [] },
    interrupted: [],
    log: [{ kind: 'advanced', at: spec.at, detail: `opened: ${spec.objective}`, conceptId: spec.conceptId }],
    turns: [],
    startedAt: spec.at,
  })
}

/* -------------------------------------------------------------------------- */
/* Movement                                                                   */
/* -------------------------------------------------------------------------- */

export function record(l: Ledger, e: LedgerEvent): Ledger {
  return seal({ ...l, log: [...l.log, e] })
}

export function advance(l: Ledger, to: Position, at: string): Ledger {
  return seal({
    ...l,
    position: { ...to, unfinished: [...to.unfinished] },
    log: [
      ...l.log,
      { kind: 'advanced', at, detail: `${to.conceptId}/${to.phase}`, conceptId: to.conceptId },
    ],
  })
}

/**
 * Step away from here, remembering exactly here.
 *
 * The position is copied onto the stack BEFORE anything else moves, so the
 * detour is free to advance the position as far as it likes. That freedom is
 * the point: answering "what is a fraction" properly may itself be several
 * teaching moves, and a mechanism that only survives a one-line aside is not
 * the mechanism the brief asks for.
 */
export function interrupt(l: Ledger, spec: { reason: string; at: string }): Ledger {
  return seal({
    ...l,
    interrupted: [...l.interrupted, { position: l.position, reason: spec.reason, at: spec.at }],
    log: [...l.log, { kind: 'interrupted', at: spec.at, detail: spec.reason }],
  })
}

/**
 * Come back.
 *
 * `returned` is `null` when there was nothing to come back to, and a caller
 * that ignores it gets an unchanged ledger rather than a plausible-looking
 * wrong position. A silent no-op here would be the worst available outcome: the
 * caller announces "picking up where we left off" and picks up somewhere else.
 */
export function resolveInterruption(
  l: Ledger,
  at: string,
): { ledger: Ledger; returned: Position | null } {
  const top = l.interrupted[l.interrupted.length - 1]
  if (!top) return { ledger: l, returned: null }
  return {
    ledger: seal({
      ...l,
      position: top.position,
      interrupted: l.interrupted.slice(0, -1),
      log: [
        ...l.log,
        {
          kind: 'returned',
          at,
          detail: `back to ${top.position.conceptId}/${top.position.phase}`,
          conceptId: top.position.conceptId,
        },
      ],
    }),
    returned: top.position,
  }
}

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Claim a turn id, or report that it was already applied.
 *
 * MEASURED: applying the identical `Turn` twice took `turnIndex` from 1 to 2
 * and appended the goal twice. Retries are not exotic --- a timeout that
 * actually succeeded, a double-submitted form, an at-least-once queue --- and
 * every one of them silently inflated the student's history.
 *
 * `alreadySeen` is returned rather than thrown because a duplicate is a normal
 * event on a network, not a programmer error. The ledger returned in that case
 * is the SAME OBJECT, so `===` is a valid check and a caller cannot accidentally
 * keep a divergent copy.
 */
export function beginTurn(l: Ledger, turnId: string): { ledger: Ledger; alreadySeen: boolean } {
  if (l.turns.includes(turnId)) return { ledger: l, alreadySeen: true }
  return { ledger: seal({ ...l, turns: [...l.turns, turnId].slice(-TURN_MEMORY) }), alreadySeen: false }
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

function attemptsFor(l: Ledger, conceptId: string): Attempt[] {
  return l.log
    .filter((e) => e.kind === 'attempted' && e.conceptId === conceptId)
    .map((e) => ({
      conceptId,
      correct: e.correct === true,
      at: e.at,
      difficulty: e.difficulty ?? 1,
    }))
}

/**
 * What the log actually supports about this concept. The ONLY answer to "does
 * the student know this".
 *
 * Being shown something caps at `exposed` no matter how many times it happened.
 * Re-reading an explanation is not evidence of understanding it, and a system
 * that counts exposure as progress will confidently promote a student who has
 * never once been right.
 */
export function established(l: Ledger, conceptId: string): Mastery {
  const attempts = attemptsFor(l, conceptId)
  if (attempts.length > 0) return masteryFromAttempts(attempts)
  /* ONLY `shown` COUNTS, AND `advanced` DELIBERATELY DOES NOT.
     The first version of this function accepted either, and the test that
     caught it is the one worth keeping: opening a session on `quad` reported
     the student as `exposed` to quadratics before a single thing had been
     taught, because `openSession` logs an `advanced` entry.

     `advanced` is the TEACHER moving the lesson. `shown` is the STUDENT being
     shown something. Conflating them is the precise error the brief warns
     about --- "what the student has merely seen" is already the weakest kind of
     evidence, and this counted something weaker still: where we intended to
     go. A curriculum that treats intent as exposure will skip material nobody
     ever presented. */
  const seen = l.log.some((e) => e.conceptId === conceptId && e.kind === 'shown')
  return seen ? 'exposed' : 'unknown'
}

/**
 * May the teacher say this out loud?
 *
 * MEASURED: "you taught me quadratics last week, continue from there" was
 * answered with zero claims, an empty `unmet`, and nothing marking that no such
 * history existed. The model was free to agree, and agreeing is the fluent
 * option.
 *
 * This is the gate. A claim is permitted only when the LOG ranks at least as
 * high as the claim, so "you already understood this" cannot be said over a
 * history that contains one exposure --- and cannot be said at all about a
 * concept the log has never heard of.
 */
export function mayClaim(l: Ledger, claim: { conceptId: string; mastery: Mastery }): boolean {
  return masteryRank(established(l, claim.conceptId)) >= masteryRank(claim.mastery)
}

/* -------------------------------------------------------------------------- */
/* Completion                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Is the lesson actually over?
 *
 * Three conditions, and each one is a way the current system could stop early:
 * the phase must SAY done (a response ending is not a lesson ending), nothing
 * may be outstanding (an optimistic label is not evidence), and no interruption
 * may still be open (a student owed an answer is not a finished lesson).
 */
export function isComplete(l: Ledger): boolean {
  return l.position.phase === 'done' && l.position.unfinished.length === 0 && l.interrupted.length === 0
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export function serialize(l: Ledger): string {
  return JSON.stringify(l)
}

export type Read = { ok: true; ledger: Ledger } | { ok: false; why: string }

const PHASES: readonly Phase[] = ['introducing', 'explaining', 'checking', 'practising', 'done']
const KINDS: readonly EventKind[] = [
  'shown', 'attempted', 'asked', 'interrupted', 'returned', 'advanced', 'paused', 'resumed',
]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readPosition(v: unknown): Position | null {
  if (!isRecord(v)) return null
  const { conceptId, phase, unfinished } = v
  if (typeof conceptId !== 'string') return null
  if (typeof phase !== 'string' || !PHASES.includes(phase as Phase)) return null
  if (!Array.isArray(unfinished) || unfinished.some((u) => typeof u !== 'string')) return null
  return { conceptId, phase: phase as Phase, unfinished: unfinished as string[] }
}

function readEvent(v: unknown): LedgerEvent | null {
  if (!isRecord(v)) return null
  const { kind, at, detail } = v
  if (typeof kind !== 'string' || !KINDS.includes(kind as EventKind)) return null
  if (typeof at !== 'string' || typeof detail !== 'string') return null
  const e: LedgerEvent = { kind: kind as EventKind, at, detail }
  if (typeof v.conceptId === 'string') e.conceptId = v.conceptId
  if (typeof v.correct === 'boolean') e.correct = v.correct
  if (typeof v.difficulty === 'number') e.difficulty = v.difficulty
  return e
}

/**
 * Read a stored ledger, or say why not.
 *
 * VALIDATED FIELD BY FIELD, NOT CAST.
 *
 * `JSON.parse(blob) as Ledger` is one line and it is how a truncated write
 * becomes a teaching session with no position: every read after it succeeds,
 * and the failure surfaces later as the agent teaching the wrong concept. A
 * refusal here is recoverable --- the caller starts a fresh session and says
 * so, which is honest. A misread is not recoverable, because nothing downstream
 * knows to doubt it.
 */
export function deserialize(json: string): Read {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    return { ok: false, why: `not JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!isRecord(raw)) return { ok: false, why: 'not an object' }

  if (typeof raw.version !== 'number') return { ok: false, why: 'no version' }
  if (raw.version > LEDGER_VERSION) {
    return {
      ok: false,
      why: `version ${raw.version} is newer than this build understands (${LEDGER_VERSION}); refusing rather than misreading it`,
    }
  }
  if (raw.version < LEDGER_VERSION) {
    return { ok: false, why: `version ${raw.version} is older than ${LEDGER_VERSION} and no migration exists` }
  }

  if (typeof raw.id !== 'string') return { ok: false, why: 'no id' }
  if (typeof raw.objective !== 'string') return { ok: false, why: 'no objective' }
  if (typeof raw.startedAt !== 'string') return { ok: false, why: 'no startedAt' }

  const position = readPosition(raw.position)
  if (!position) return { ok: false, why: 'position is missing or malformed' }

  if (!Array.isArray(raw.log)) return { ok: false, why: 'log is not an array' }
  const log: LedgerEvent[] = []
  for (const entry of raw.log) {
    const e = readEvent(entry)
    if (!e) return { ok: false, why: 'log holds an entry this build does not recognise' }
    log.push(e)
  }

  if (!Array.isArray(raw.interrupted)) return { ok: false, why: 'interrupted is not an array' }
  const interrupted: Suspended[] = []
  for (const entry of raw.interrupted) {
    if (!isRecord(entry)) return { ok: false, why: 'interruption stack holds a non-object' }
    const p = readPosition(entry.position)
    if (!p || typeof entry.reason !== 'string' || typeof entry.at !== 'string') {
      return { ok: false, why: 'interruption stack holds a malformed frame' }
    }
    interrupted.push({ position: p, reason: entry.reason, at: entry.at })
  }

  if (!Array.isArray(raw.turns) || raw.turns.some((t) => typeof t !== 'string')) {
    return { ok: false, why: 'turns is not an array of strings' }
  }

  return {
    ok: true,
    ledger: seal({
      version: LEDGER_VERSION,
      id: raw.id,
      objective: raw.objective,
      position,
      interrupted,
      log,
      turns: raw.turns as string[],
      startedAt: raw.startedAt,
    }),
  }
}
