import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateSet, type SetMetrics } from './engine/pipeline';
import { recordRun, type RunRecord } from './engine/telemetry';
import type { TopicProfile } from './engine/plan';
import type { QuestionProvider } from './engine/provider';
import {
  answer as answerSession,
  createSession,
  exitSession,
  resultOf,
  submit as submitSession,
  syncClock,
  type PracticeSession,
} from './engine/session';
import {
  forDelivery,
  isTerminal,
  type DeliverableQuestion,
  type EngineError,
  type OptionKey,
  type QuestionCount,
  type RevealedAnswer,
  type SessionResult,
} from './engine/types';

/**
 * The live practice session, and what the learner has seen before.
 *
 * WHY THIS IS NOT PART OF THE MAP STORE
 * -------------------------------------
 * `store.ts` holds the constellation: which chapters are open, what has been
 * practised, the settings for the next session. It is small, persisted whole,
 * and read by every node on the map.
 *
 * A live session is none of those things. It carries verified questions with
 * their answer keys, it changes on every tick of a timer, and it is meaningless
 * once the session ends. Merging the two would put an answer key inside the
 * object the map re-reads on every hover, and would persist a running countdown
 * into `localStorage` where a stale one would be restored as if still live.
 *
 * WHAT IS PERSISTED
 * -----------------
 * The fingerprints of questions this learner has been served, the per-question
 * record of what they did, one health record per generation, and the live
 * session itself.
 *
 * The session was deliberately left out at first, on the grounds that restoring
 * one resumes a countdown that stood still while the tab was closed. That was
 * the right worry and the wrong fix: it punishes an accidental refresh, which
 * is the case the product cares about. `recover()` applies the elapsed
 * wall-clock instead, so a refresh costs nothing and closing the tab for an
 * hour ends a thirty-minute session.
 */

export type RunStatus = 'idle' | 'generating' | 'ready' | 'failed';

export interface StartInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly profile: TopicProfile;
  readonly count: QuestionCount;
  readonly provider: QuestionProvider;
  readonly timerEnabled: boolean;
  readonly timerMinutes: number;
  /** Injected so the whole run is testable without a real clock. */
  readonly now?: () => number;
}

export interface SessionRunState {
  status: RunStatus;
  session: PracticeSession | null;
  error: EngineError | null;
  metrics: SetMetrics | null;

  /**
   * Which questions the learner has committed to and may now see the answer
   * for. Keyed by question id, never a blanket flag: a single boolean would
   * reveal the whole set the moment one question was answered.
   */
  revealed: Record<string, true>;

  /** Persisted. Semantic fingerprints already served to this learner. */
  seenFingerprints: string[];
  /** Persisted. Per-question evidence from finished sessions. */
  history: SessionResult[];
  /**
   * Persisted. One record per generation attempt, success or refusal.
   *
   * Kept because a single run's metrics diagnose almost nothing: a duplicate
   * rate of 20% is unremarkable once and an emergency as a trend, and a p99
   * near the budget is invisible in an average. `healthOf()` reads these.
   */
  runs: RunRecord[];

  start(input: StartInput): Promise<void>;
  answer(questionId: string, option: OptionKey, nowMs: number): void;
  /** Move to the next question. Stops at the last one rather than running off. */
  next(): void;
  /** Restore a persisted session, applying the time that really passed. */
  recover(session: PracticeSession, nowMs: number): void;
  exit(nowMs: number): void;
  submit(nowMs: number): void;
  tick(nowMs: number): void;
  dismiss(): void;
  clearHistory(): void;
}

function safeLocalStorage(): Storage | undefined {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const probe = '__practice_run_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function runStorage() {
  const raw = safeLocalStorage();
  return raw ? createJSONStorage(() => raw) : undefined;
}

/** Keep the served-question memory from growing without bound. */
const MAX_REMEMBERED_FINGERPRINTS = 400;
const MAX_REMEMBERED_SESSIONS = 50;

export const useSessionStore = create<SessionRunState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      session: null,
      error: null,
      metrics: null,
      revealed: {},
      seenFingerprints: [],
      history: [],
      runs: [],

      async start(input) {
        set({ status: 'generating', session: null, error: null, metrics: null, revealed: {} });

        const now = input.now ?? (() => Date.now());

        const outcome = await generateSet({
          sessionId: input.sessionId,
          profile: input.profile,
          count: input.count,
          provider: input.provider,
          seenFingerprints: new Set(get().seenFingerprints),
          now,
        });

        if (!outcome.ok) {
          set({
            status: 'failed',
            error: outcome.error,
            metrics: outcome.metrics,
            runs: [
              ...recordRun(get().runs, {
                at: now(),
                topicId: input.profile.topicId,
                requested: input.count,
                delivered: outcome.error.obtained,
                failure: outcome.error.failure,
                metrics: outcome.metrics,
              }),
            ],
          });
          return;
        }

        const session = createSession({
          sessionId: input.sessionId,
          userId: input.userId,
          topicId: input.profile.topicId,
          chapterId: input.profile.chapterId,
          questions: outcome.questions,
          timerEnabled: input.timerEnabled,
          timerMinutes: input.timerMinutes,
          startedAtMs: now(),
        });

        /*
         * `createSession` refuses rather than throws, and its refusals are the
         * same shape as the pipeline's. A set that verified but cannot open a
         * session is still a failure the learner has to be shown.
         */
        if ('failure' in session) {
          set({ status: 'failed', error: session, metrics: outcome.metrics });
          return;
        }

        set({
          status: 'ready',
          session,
          error: null,
          metrics: outcome.metrics,
          seenFingerprints: remember(
            get().seenFingerprints,
            outcome.questions.map((question) => question.fingerprint),
          ),
          runs: [
            ...recordRun(get().runs, {
              at: now(),
              topicId: input.profile.topicId,
              requested: input.count,
              delivered: outcome.questions.length,
              failure: null,
              metrics: outcome.metrics,
            }),
          ],
        });
      },

      answer(questionId, option, nowMs) {
        const session = get().session;
        if (!session) return;

        const next = answerSession(session, questionId, option, nowMs);
        /*
         * Reveal is a consequence of answering, never a separate call a screen
         * could make early. An answer that was not recorded - unknown question,
         * session already over - reveals nothing.
         */
        const recorded = next.attempts.some((attempt) => attempt.questionId === questionId);

        set({
          session: next,
          revealed: recorded ? { ...get().revealed, [questionId]: true } : get().revealed,
        });
      },

      /*
       * Advancing is the store's job, not a component's.
       *
       * A screen reaching in to set `currentIndex` would be writing session
       * state from outside the only place that understands it, and would walk
       * past the end of the set as readily as to the next question.
       */
      next() {
        const session = get().session;
        if (!session || isTerminal(session.status)) return;

        const last = session.questions.length - 1;
        if (session.currentIndex >= last) return;

        set({ session: { ...session, currentIndex: session.currentIndex + 1 } });
      },

      /*
       * Bring a persisted session back, with the clock it actually lived
       * through.
       *
       * The comfortable resume is the wrong one: pick the countdown up where it
       * stopped, as though closing the tab bought free time. That is precisely
       * the move a student would make on a timed test, and it would work. So
       * recovery syncs to the real `now` — an untimed session is unchanged, a
       * timed one comes back with what is genuinely left, and one whose budget
       * was spent while the tab was closed comes back already ended with every
       * answer intact.
       */
      recover(session, nowMs) {
        if (isTerminal(session.status)) return;

        const synced = syncClock(session, nowMs);
        set({ status: 'ready', session: synced, error: null, revealed: {} });

        /* A session that timed out while away is recorded like any other end. */
        if (isTerminal(synced.status)) finish(set, get, synced);
      },

      exit(nowMs) {
        const session = get().session;
        if (!session) return;
        finish(set, get, exitSession(session, nowMs));
      },

      submit(nowMs) {
        const session = get().session;
        if (!session) return;
        finish(set, get, submitSession(session, nowMs));
      },

      tick(nowMs) {
        const session = get().session;
        if (!session || isTerminal(session.status)) return;

        const next = syncClock(session, nowMs);
        /* A timeout is an ending like any other, and is recorded like one. */
        if (isTerminal(next.status)) {
          finish(set, get, next);
          return;
        }
        set({ session: next });
      },

      dismiss() {
        set({ status: 'idle', session: null, error: null, metrics: null, revealed: {} });
      },

      clearHistory() {
        set({ seenFingerprints: [], history: [], runs: [] });
      },
    }),
    {
      name: 'practice-run',
      storage: runStorage(),
      version: 1,
      skipHydration: true,
      /*
       * The live session IS persisted, and the clock is what makes that safe.
       *
       * It was left out at first on the grounds that restoring one resumes a
       * countdown that "ran" while the tab was closed. That was the right
       * worry and the wrong fix — dropping the session punishes a learner for
       * an accidental refresh, which the product explicitly says it should
       * survive. `recover()` applies the elapsed wall-clock instead, so a
       * refresh costs nothing and closing the tab for an hour ends a
       * thirty-minute session, which is what "timed" means.
       *
       * Only sessions still in progress are worth keeping; a finished one is
       * already in `history`.
       */
      partialize: (state) => ({
        seenFingerprints: state.seenFingerprints,
        history: state.history,
        runs: state.runs,
        session: state.session && !isTerminal(state.session.status) ? state.session : null,
      }),
    },
  ),
);

/**
 * Pull saved state in, and reconcile any session that came back with it.
 *
 * Called from an effect after the first client render, so the restored session
 * is reconciled against the real clock exactly once, at the moment the app is
 * ready to show it.
 */
export function hydrateAndRecover(nowMs: number = Date.now()): void {
  void useSessionStore.persist?.rehydrate();

  const restored = useSessionStore.getState().session;
  if (restored && !isTerminal(restored.status)) {
    useSessionStore.getState().recover(restored, nowMs);
  }
}

/** Record the ending once, and only once. */
function finish(
  set: (partial: Partial<SessionRunState>) => void,
  get: () => SessionRunState,
  session: PracticeSession,
): void {
  const alreadyRecorded = get().history.some((result) => result.sessionId === session.sessionId);
  if (alreadyRecorded) {
    set({ session });
    return;
  }

  set({
    session,
    history: [resultOf(session), ...get().history].slice(0, MAX_REMEMBERED_SESSIONS),
  });
}

function remember(existing: readonly string[], added: readonly string[]): string[] {
  return [...added, ...existing.filter((f) => !added.includes(f))].slice(
    0,
    MAX_REMEMBERED_FINGERPRINTS,
  );
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The current question, in the shape a screen may hold.
 *
 * Returns the DELIVERABLE shape, which has no `correctOption` and no
 * `fullSolution` field at all. A component cannot leak what it was never given.
 */
export function currentQuestion(session: PracticeSession | null): DeliverableQuestion | null {
  if (!session) return null;
  const question = session.questions[session.currentIndex];
  return question ? forDelivery(question) : null;
}

/**
 * The answer, but only for a question the learner has already committed to.
 *
 * The gate is here rather than in the component, because "remember not to call
 * this early" is not a mechanism. A screen that asks for an unanswered
 * question's answer gets null.
 */
export function revealFor(
  session: PracticeSession | null,
  revealed: Readonly<Record<string, true>>,
  questionId: string,
): RevealedAnswer | null {
  if (!revealed[questionId]) return null;

  const question = session?.questions.find((each) => each.questionId === questionId);
  if (!question) return null;

  return {
    questionId,
    correctOption: question.correctOption,
    fullSolution: question.fullSolution,
    options: question.options,
  };
}

/** How far through the set the learner is, one-based for display. */
export function progressOf(session: PracticeSession | null): { current: number; total: number } | null {
  if (!session) return null;
  return {
    current: Math.min(session.currentIndex + 1, session.questions.length),
    total: session.questions.length,
  };
}

/** Milliseconds left, or null when this session has no countdown. */
export function remainingFor(session: PracticeSession | null): number | null {
  if (!session || !session.timerEnabled) return null;
  return Math.max(0, session.timerDurationMs - (session.highWaterMs - session.startedAtMs));
}
