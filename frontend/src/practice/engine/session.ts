import { TIMER_MAX_MINUTES, TIMER_MIN_MINUTES } from '../store';
import {
  isQuestionCount,
  isTerminal,
  type EngineError,
  type OptionKey,
  type QuestionAttempt,
  type SessionResult,
  type SessionStatus,
  type VerifiedQuestion,
} from './types';

/**
 * The practice session: what the student is doing, and how long they have.
 *
 * IT IS A REDUCER, AND TIME IS AN ARGUMENT
 * ----------------------------------------
 * Every function here takes a session and returns a new one. Nothing mutates,
 * nothing reads a clock, nothing touches storage. Two things fall out of that.
 *
 * A thirty-minute timer is one function call instead of a thirty-minute test,
 * so the timeout path is actually covered rather than assumed. And the session
 * can be persisted, restored, or replayed without a second code path — the
 * state IS the record, so "recover after the app was backgrounded" is just
 * handing the same object back with a newer clock reading.
 *
 * THE CLOCK IS UNTRUSTED INPUT
 * ----------------------------
 * `Date.now()` is wall-clock time and it moves backwards: NTP corrections,
 * timezone changes, and a student deliberately setting their device back during
 * a timed test. Recomputing `now - startedAt` on every tick would refill the
 * timer in all three cases.
 *
 * So the session remembers the furthest point it has ever seen, and any reading
 * behind that is clamped to it. Under a hostile clock the timer can stall; it
 * can never reverse. That is the correct direction to fail: a student who
 * freezes their clock gets no more time than they already had, and an honest
 * reading afterwards times them out normally.
 */

export interface PracticeSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly topicId: string;
  readonly chapterId: string;
  readonly questions: readonly VerifiedQuestion[];
  readonly status: SessionStatus;
  readonly currentIndex: number;
  readonly attempts: readonly QuestionAttempt[];

  readonly timerEnabled: boolean;
  /** Meaningful only while `timerEnabled`. */
  readonly timerDurationMs: number;
  readonly startedAtMs: number;
  /**
   * The furthest clock reading this session has accepted. Never decreases.
   * This, not the caller's `now`, is what elapsed time is measured against.
   */
  readonly highWaterMs: number;
}

export interface CreateSessionInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly topicId: string;
  readonly chapterId: string;
  readonly questions: readonly VerifiedQuestion[];
  readonly timerEnabled: boolean;
  readonly timerMinutes: number;
  readonly startedAtMs: number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Open a session, or refuse to.
 *
 * Refusal returns an `EngineError` rather than throwing, because every caller
 * has to handle it: a session that cannot be created is a screen the student
 * has to be shown, not an exception to bubble.
 */
export function createSession(input: CreateSessionInput): PracticeSession | EngineError {
  const requested = input.questions.length;

  if (!isQuestionCount(requested)) {
    return {
      failure: 'INVALID_REQUEST',
      detail: `A session is 5, 10 or 15 questions. Got ${requested}.`,
      obtained: requested,
      requested,
    };
  }

  /*
   * Timer bounds are only a rule when the timer is on. With it off there is no
   * countdown to be out of range, and refusing a stale saved duration would
   * block a session that is entirely legal.
   */
  if (input.timerEnabled) {
    const { timerMinutes } = input;
    const inRange =
      Number.isFinite(timerMinutes) &&
      timerMinutes >= TIMER_MIN_MINUTES &&
      timerMinutes <= TIMER_MAX_MINUTES;

    if (!inRange) {
      return {
        failure: 'INVALID_REQUEST',
        detail: `A timed session runs ${TIMER_MIN_MINUTES}-${TIMER_MAX_MINUTES} minutes. Got ${timerMinutes}.`,
        obtained: 0,
        requested,
      };
    }
  }

  /*
   * The topic bound, enforced where it cannot be skipped. A question generated
   * for a neighbouring topic is not a small problem: the student chose what to
   * practise, and quietly practising something else is the feature failing at
   * the only thing it promised.
   */
  const foreign = input.questions.find((question) => question.topicId !== input.topicId);
  if (foreign) {
    return {
      failure: 'INVALID_TOPIC',
      detail: `Question ${foreign.questionId} belongs to topic ${foreign.topicId}, not ${input.topicId}.`,
      obtained: 0,
      requested,
    };
  }

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    topicId: input.topicId,
    chapterId: input.chapterId,
    questions: input.questions,
    status: 'IN_PROGRESS',
    currentIndex: 0,
    attempts: [],
    timerEnabled: input.timerEnabled,
    timerDurationMs: input.timerMinutes * MS_PER_MINUTE,
    startedAtMs: input.startedAtMs,
    highWaterMs: input.startedAtMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Take a clock reading, and time the session out if it is spent.
 *
 * Call this on a tick, on resume from background, and before anything that
 * depends on the session still being open. It is idempotent: syncing an
 * already-timed-out session changes nothing.
 */
export function syncClock(session: PracticeSession, nowMs: number): PracticeSession {
  const advanced = advance(session, nowMs);
  if (isTerminal(advanced.status)) return advanced;
  if (!advanced.timerEnabled) return advanced;

  return elapsedMs(advanced) >= advanced.timerDurationMs
    ? { ...advanced, status: 'TIMED_OUT' }
    : advanced;
}

/** Move the high-water mark forward. A reading behind it is discarded. */
function advance(session: PracticeSession, nowMs: number): PracticeSession {
  if (!Number.isFinite(nowMs) || nowMs <= session.highWaterMs) return session;
  return { ...session, highWaterMs: nowMs };
}

export function elapsedMs(session: PracticeSession): number {
  return Math.max(0, session.highWaterMs - session.startedAtMs);
}

/** Milliseconds left, or null when there is no countdown to report. */
export function remainingMs(session: PracticeSession): number | null {
  if (!session.timerEnabled) return null;
  return Math.max(0, session.timerDurationMs - elapsedMs(session));
}

/* -------------------------------------------------------------------------- */
/* Answering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Record a selection.
 *
 * Answering the same question again replaces the attempt rather than appending
 * one. Two attempts for one question would make `answeredCount` disagree with
 * the number of questions the student actually answered, and the disagreement
 * would only show up later, in a report nobody can reconcile.
 */
export function answer(
  session: PracticeSession,
  questionId: string,
  selected: OptionKey,
  nowMs: number,
): PracticeSession {
  const synced = syncClock(session, nowMs);
  if (isTerminal(synced.status)) return synced;

  const question = synced.questions.find((each) => each.questionId === questionId);
  if (!question) return synced;

  const previous = synced.attempts.find((each) => each.questionId === questionId);
  const since = previous ? previousMark(synced, questionId) : lastMark(synced);
  const correct = selected === question.correctOption;
  const chosen = question.options.find((option) => option.key === selected);

  const attempt: QuestionAttempt = {
    questionId,
    conceptId: question.conceptId,
    questionType: question.questionType,
    difficulty: question.difficulty,
    reasoningStructure: question.reasoningStructure,
    selectedOption: selected,
    correct,
    timeSpentMs: Math.max(0, synced.highWaterMs - since),
    /*
     * The distractor's own rationale IS the mistake pattern. Inferring one from
     * the option text later would be guessing at what the author already said.
     */
    mistakePattern: correct ? null : (chosen?.rationale ?? null),
  };

  const attempts = previous
    ? synced.attempts.map((each) => (each.questionId === questionId ? attempt : each))
    : [...synced.attempts, attempt];

  const answeredIndex = synced.questions.findIndex((each) => each.questionId === questionId);

  return {
    ...synced,
    attempts,
    currentIndex: Math.max(synced.currentIndex, answeredIndex),
  };
}

/** When the student started looking at whatever they just answered. */
function lastMark(session: PracticeSession): number {
  const spent = session.attempts.reduce((total, each) => total + each.timeSpentMs, 0);
  return session.startedAtMs + spent;
}

/** Re-answering does not restart the question's clock from zero. */
function previousMark(session: PracticeSession, questionId: string): number {
  const spent = session.attempts
    .filter((each) => each.questionId !== questionId)
    .reduce((total, each) => total + each.timeSpentMs, 0);
  return session.startedAtMs + spent;
}

/* -------------------------------------------------------------------------- */
/* Ending                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The student left.
 *
 * A first-class end, not a failure to finish. Whatever they answered stands.
 */
export function exitSession(session: PracticeSession, nowMs: number): PracticeSession {
  const synced = syncClock(session, nowMs);
  if (isTerminal(synced.status)) return synced;
  return { ...synced, status: 'EXITED' };
}

/**
 * The student sent it in.
 *
 * COMPLETED means every question was answered; SUBMITTED means it was sent
 * with some left blank. Collapsing the two would make "completed the set" and
 * "gave up two thirds of the way" indistinguishable in the record.
 */
export function submit(session: PracticeSession, nowMs: number): PracticeSession {
  const synced = syncClock(session, nowMs);
  if (isTerminal(synced.status)) return synced;

  const answered = synced.attempts.filter((each) => each.selectedOption !== null).length;
  const complete = answered === synced.questions.length;

  return { ...synced, status: complete ? 'COMPLETED' : 'SUBMITTED' };
}

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What happened, at the resolution the next session can use.
 *
 * `correctCount` is derived here rather than carried on the session, so there
 * is exactly one place that can be wrong about it and it is recomputed from the
 * attempts every time. A stored total that drifts from its own attempts is the
 * bug this shape makes impossible.
 */
export function resultOf(session: PracticeSession): SessionResult {
  const answered = session.attempts.filter((each) => each.selectedOption !== null);

  return {
    sessionId: session.sessionId,
    topicId: session.topicId,
    status: session.status,
    requested: session.questions.length,
    attempts: session.attempts,
    correctCount: answered.filter((each) => each.correct).length,
    answeredCount: answered.length,
    elapsedMs: elapsedMs(session),
  };
}
