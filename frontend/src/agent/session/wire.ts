import type { Turn } from '../kernel/contracts'
import type { Understanding } from '../kernel/contracts'
import {
  advance,
  beginTurn,
  deserialize,
  established,
  interrupt,
  isComplete,
  mayClaim,
  record,
  resolveInterruption,
  serialize,
  type Ledger,
  type Position,
} from './ledger'
import type { Mastery } from '../learn/learn'

/**
 * THE WIRING BETWEEN A TURN AND THE TEACHING LEDGER.
 *
 * Kept out of both `ledger.ts` and `loop.ts` on purpose. The ledger is a data
 * structure and must stay ignorant of `Understanding`; the loop is already the
 * longest file in the area and its job is capability selection, not pedagogy.
 * This module is the only place that knows how an utterance maps onto a
 * teaching move, which makes that mapping one thing to review rather than a
 * behaviour smeared across two files.
 */

/* -------------------------------------------------------------------------- */
/* Turn identity                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A stable id for a turn, derived from the turn itself.
 *
 * WHY DERIVED AND NOT ASSIGNED. An assigned id has to come from the caller, and
 * the caller that forgets to assign one gets no deduplication and no error ---
 * which is the failure we already have. Deriving it means the guarantee holds
 * for every caller, including the ones that do not know the guarantee exists.
 *
 * `at` is part of the key, and that is the whole design. The same words at the
 * same instant are a RETRY; the same words a minute later are a student asking
 * again, which is a real and pedagogically important event --- it is the
 * strongest signal that the last explanation did not land. Collapsing those two
 * would trade one bug for a worse one.
 */
export function turnId(turn: Turn): string {
  /* Joined on a character that cannot appear in a typed message, so two parts
     ["a", "b"] and one part ["a b"] do not hash to the same turn. Written as an
     ESCAPE and not a literal: a raw NUL in a source file makes git treat the
     whole file as binary, which is how this line was found. */
  const text = turn.parts.map((p) => (typeof p.content === 'string' ? p.content : '')).join('\u0000')
  /* djb2. Not a security hash and does not need to be: the inputs are this
     process's own turns, and a collision costs one wrongly-deduplicated turn
     rather than anything an attacker chooses. */
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (((h << 5) + h) ^ text.charCodeAt(i)) >>> 0
  return `${turn.at}#${h.toString(36)}#${text.length}`
}

/* -------------------------------------------------------------------------- */
/* Teaching moves                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Is this turn asking to pick up where we left off?
 *
 * Read from the INTENT rather than from a phrase list, because the intent
 * classifier already does this work and a second list would drift from the
 * first. `continuation` is its own `IntentKind`; this is simply asking it.
 */
function asksToContinue(u: Understanding): boolean {
  return u.intents[0]?.kind === 'continuation'
}

/**
 * Fold one understood turn into the ledger.
 *
 * THE TWO MOVES, AND WHY THEY ARE THESE TWO.
 *
 * A student's turn either stays on the current subject or leaves it. Leaving it
 * is only a detour if there is something to come back to --- so a subject
 * change pushes the current position, and that is the only thing that makes
 * "return to the correct point" a lookup rather than a guess.
 *
 * Asking to continue pops. Popping an empty stack does nothing and says so,
 * rather than inventing a position, because a caller that announces "picking up
 * where we left off" and picks up somewhere else is worse than one that admits
 * it has nowhere to go back to.
 *
 * ORDER MATTERS AND IS ASSERTED BY TEST. Continue is handled BEFORE shift: with
 * the stopword fix in `understand.ts` a bare "continue" no longer registers as a
 * shift, but "continue with fractions" legitimately is both, and in that case
 * the student is asking to resume a subject they have just named. Resuming
 * first and then treating the named subject as the new detour is the reading
 * that loses nothing.
 */
export function foldTurn(l: Ledger, u: Understanding, at: string, id: string): Ledger {
  /* THE DEDUPLICATION LIVES HERE, NOT IN THE CALLER'S MEMORY.
     An in-process cache of applied turns is lost on restore, so a retry that
     straddles a reload would append to the evidence log a second time --- and
     an inflated history is what makes the learner model wrong in the direction
     of over-confidence. The seen-turn list is part of the ledger, so it is
     written down with everything else and survives the reload that the cache
     does not. */
  const claimed = beginTurn(l, id)
  if (claimed.alreadySeen) return l

  let next = record(claimed.ledger, {
    kind: 'asked',
    at,
    detail: u.goal,
    ...(u.entities[0] ? { conceptId: u.entities[0].id } : {}),
  })

  if (asksToContinue(u)) {
    const out = resolveInterruption(next, at)
    next = out.ledger
    if (out.returned) return next
  }

  if (u.topicShift) {
    next = interrupt(next, { reason: u.goal, at })
  }

  return next
}

/** Move the teaching position. Exposed so a caller can drive the lesson. */
export function moveTo(l: Ledger, to: Position, at: string): Ledger {
  return advance(l, to, at)
}

export function noteAttempt(
  l: Ledger,
  a: { conceptId: string; correct: boolean; difficulty: number; at: string },
): Ledger {
  return record(l, {
    kind: 'attempted',
    at: a.at,
    detail: `${a.conceptId} ${a.correct ? 'correct' : 'wrong'} at difficulty ${a.difficulty}`,
    conceptId: a.conceptId,
    correct: a.correct,
    difficulty: a.difficulty,
  })
}

/* -------------------------------------------------------------------------- */
/* Claims about the past                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What level of prior learning is this turn ASSERTING?
 *
 * MEASURED: "you taught me quadratics last week, continue from there" reached
 * the model with zero claims, an empty `unmet`, and nothing anywhere recording
 * that no such history existed. Agreeing was the fluent option and nothing
 * stood in its way. A teacher who accepts the student's account of what they
 * already know will skip the thing they actually needed.
 *
 * Deliberately narrow. It fires on an explicit assertion about the past, not on
 * a question, because the cost of a false positive is telling a student their
 * own memory is wrong. `mastered` is not in the ladder: nobody phrases it, and
 * a pattern nobody triggers is a pattern that only adds risk.
 */
const ASSERTS_HISTORY =
  /\b(?:you (?:taught|showed|explained|covered)|we (?:did|covered|finished|went through|already)|i (?:already|previously) (?:learn|learnt|learned|did|know|knew|studied)|last (?:time|week|session)|earlier you)\b/i

const ASSERTS_COMPETENCE =
  /\b(?:i (?:know|knew|understand|understood|get|got) (?:it|this|that)|i can (?:do|solve)|i'?ve mastered|already (?:know|understand))\b/i

export interface HistoryAssertion {
  /** The concept the student named, when they named one. */
  conceptId?: string
  /** The lowest level of prior learning the assertion implies. */
  mastery: Mastery
  /** The student's own words, for the report. */
  quote: string
}

export function assertedHistory(text: string, u: Understanding): HistoryAssertion | null {
  const past = ASSERTS_HISTORY.test(text)
  const competent = ASSERTS_COMPETENCE.test(text)
  if (!past && !competent) return null
  return {
    ...(u.entities[0] ? { conceptId: u.entities[0].id } : {}),
    /* "you taught me X" claims exposure. "I understand X" claims more than
       that, and claiming more is what makes it worth checking. */
    mastery: competent ? 'competent' : 'exposed',
    quote: text.slice(0, 160),
  }
}

/**
 * What this session can actually say about where it is and what is proven.
 *
 * Returned on the trace rather than folded into the answer, because a caller
 * needs to be able to READ it --- and because a test can assert on it. The
 * measured failure it replaces is a system that had no way to express "there is
 * no record of that" and therefore never said it.
 */
export interface Continuity {
  objective: string
  position: Position
  /** How many detours are open. Zero means we are on the main thread. */
  openDetours: number
  /** What the log supports about the concept the lesson is currently on. */
  establishedHere: Mastery
  /** True only when the phase says done, nothing is outstanding, and no detour is open. */
  complete: boolean
  /**
   * Set when the student asserted prior learning the log does not support.
   *
   * Its presence is the whole point: the turn carries a fact the model would
   * otherwise have had no reason to consider, and a reader of the trace can see
   * that the assertion was noticed rather than accepted.
   */
  unsupportedHistory?: string
}

export function continuityOf(l: Ledger, text: string, u: Understanding): Continuity {
  const asserted = assertedHistory(text, u)
  const unsupported =
    asserted && !mayClaim(l, { conceptId: asserted.conceptId ?? l.position.conceptId, mastery: asserted.mastery })
      ? `the student refers to prior learning this session has no record of: "${asserted.quote}"`
      : undefined

  return {
    objective: l.objective,
    position: l.position,
    openDetours: l.interrupted.length,
    establishedHere: established(l, l.position.conceptId),
    complete: isComplete(l),
    ...(unsupported ? { unsupportedHistory: unsupported } : {}),
  }
}

export { deserialize as readLedger, serialize as writeLedger }
