import { beforeEach, describe, expect, it } from 'vitest';

import { fixtureProvider } from './engine/provider';
import type { TopicProfile } from './engine/plan';
import {
  currentQuestion,
  progressOf,
  remainingFor,
  revealFor,
  useSessionStore,
} from './sessionStore';

/**
 * The runtime that connects a verified set to a screen.
 *
 * The tests that matter here are the two the type system cannot enforce on its
 * own: that an answer is never available before the learner commits to one, and
 * that a finished session is recorded exactly once whichever way it ended.
 */

const PROFILE: TopicProfile = {
  topicId: 'rotational-motion',
  chapterId: 'mechanics',
  quantitative: 0.8,
  concepts: [
    { id: 'moment-of-inertia', name: 'Moment of inertia', numeric: true, prerequisites: ['mass'], commonMisconception: 'treats it as mass' },
    { id: 'angular-momentum', name: 'Angular momentum', numeric: true, prerequisites: [], commonMisconception: 'ignores the axis' },
    { id: 'torque', name: 'Torque', numeric: true, prerequisites: ['force'], commonMisconception: 'ignores the lever arm' },
    { id: 'rolling', name: 'Rolling', numeric: true, prerequisites: [], commonMisconception: 'adds the speeds' },
    { id: 'rotational-ke', name: 'Rotational KE', numeric: true, prerequisites: [], commonMisconception: 'forgets the half' },
  ],
};

const T0 = 1_000_000;
const MINUTE = 60_000;

async function startRun() {
  await useSessionStore.getState().start({
    sessionId: 's1',
    userId: 'u1',
    profile: PROFILE,
    count: 5,
    provider: fixtureProvider(),
    timerEnabled: false,
    timerMinutes: 10,
    now: () => T0,
  });
}

beforeEach(() => {
  useSessionStore.setState({
    status: 'idle',
    session: null,
    error: null,
    metrics: null,
    revealed: {},
    seenFingerprints: [],
    history: [],
  });
});

describe('starting a run', () => {
  it('produces a ready session of verified questions', async () => {
    await startRun();

    const state = useSessionStore.getState();
    expect(state.status).toBe('ready');
    expect(state.session?.questions).toHaveLength(5);
    expect(state.session?.status).toBe('IN_PROGRESS');
    expect(progressOf(state.session)).toEqual({ current: 1, total: 5 });
  });

  it('reports a refusal rather than a partial set', async () => {
    await useSessionStore.getState().start({
      sessionId: 's-fail',
      userId: 'u1',
      profile: { ...PROFILE, concepts: [] },
      count: 5,
      provider: fixtureProvider(),
      timerEnabled: false,
      timerMinutes: 10,
      now: () => T0,
    });

    const state = useSessionStore.getState();
    expect(state.status).toBe('failed');
    expect(state.session).toBeNull();
    expect(state.error?.failure).toBe('INVALID_TOPIC');
  });

  it('remembers what it served, so the next run can avoid it', async () => {
    await startRun();
    expect(useSessionStore.getState().seenFingerprints).toHaveLength(5);
  });
});

describe('the answer is not available before the learner commits', () => {
  /*
   * THE INVARIANT THE TYPES CANNOT CARRY ALONE.
   *
   * `DeliverableQuestion` has no answer field, so a screen cannot leak one it
   * was never handed. But the store DOES hold the verified question, and a
   * screen could ask it for the answer directly. That gate is here.
   */
  it('gives a screen a question with no answer field on it', async () => {
    await startRun();

    const question = currentQuestion(useSessionStore.getState().session);
    expect(question).not.toBeNull();
    expect(question).not.toHaveProperty('correctOption');
    expect(question).not.toHaveProperty('fullSolution');
    /* Nor the distractor rationales, which are an answer key written sideways. */
    for (const option of question?.options ?? []) {
      expect(option).not.toHaveProperty('rationale');
    }
  });

  it('refuses to reveal an answer for an unanswered question', async () => {
    await startRun();
    const state = useSessionStore.getState();
    const id = state.session!.questions[0]!.questionId;

    expect(revealFor(state.session, state.revealed, id)).toBeNull();
  });

  it('reveals only the question just answered, not the rest of the set', async () => {
    await startRun();
    const questions = useSessionStore.getState().session!.questions;
    const first = questions[0]!.questionId;
    const second = questions[1]!.questionId;

    useSessionStore.getState().answer(first, 'A', T0 + 5_000);

    const state = useSessionStore.getState();
    expect(revealFor(state.session, state.revealed, first)).not.toBeNull();
    expect(revealFor(state.session, state.revealed, second)).toBeNull();
  });

  it('reveals nothing when the answer was not recorded', async () => {
    await startRun();
    useSessionStore.getState().answer('not-a-question-in-this-set', 'A', T0 + 1_000);

    const state = useSessionStore.getState();
    expect(state.revealed).toEqual({});
    expect(state.session?.attempts).toHaveLength(0);
  });

  it('the revealed answer matches the verified one', async () => {
    await startRun();
    const question = useSessionStore.getState().session!.questions[0]!;

    useSessionStore.getState().answer(question.questionId, 'B', T0 + 2_000);
    const revealed = revealFor(useSessionStore.getState().session, useSessionStore.getState().revealed, question.questionId);

    expect(revealed?.correctOption).toBe(question.correctOption);
    expect(revealed?.fullSolution).toBe(question.fullSolution);
  });
});

describe('ending a session', () => {
  it('records an exit with what was answered', async () => {
    await startRun();
    const id = useSessionStore.getState().session!.questions[0]!.questionId;

    useSessionStore.getState().answer(id, 'A', T0 + 1_000);
    useSessionStore.getState().exit(T0 + 2_000);

    const state = useSessionStore.getState();
    expect(state.session?.status).toBe('EXITED');
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.answeredCount).toBe(1);
    expect(state.history[0]?.attempts[0]?.questionId).toBe(id);
  });

  it('records the ending once, not once per call', async () => {
    await startRun();
    useSessionStore.getState().exit(T0 + 1_000);
    useSessionStore.getState().exit(T0 + 2_000);
    useSessionStore.getState().submit(T0 + 3_000);

    expect(useSessionStore.getState().history).toHaveLength(1);
  });

  it('keeps per-question evidence, not just a score', async () => {
    await startRun();
    const questions = useSessionStore.getState().session!.questions;
    for (const question of questions) {
      useSessionStore.getState().answer(question.questionId, 'A', T0 + 1_000);
    }
    useSessionStore.getState().submit(T0 + 9_000);

    const result = useSessionStore.getState().history[0]!;
    expect(result.status).toBe('COMPLETED');
    expect(result.attempts).toHaveLength(5);
    for (const attempt of result.attempts) {
      expect(attempt.conceptId).toBeTruthy();
      expect(attempt.reasoningStructure).toBeTruthy();
      expect(typeof attempt.timeSpentMs).toBe('number');
    }
  });
});

describe('surviving a refresh', () => {
  /*
   * A CLOSED TAB DOES NOT PAUSE A TIMED SESSION.
   *
   * Restoring a session is only honest if the clock comes back with it. The
   * wrong resume is the comfortable one: pick up where the countdown stopped,
   * as though closing the tab bought free time. That is exactly the trick a
   * student would use on a timed test, and it would work.
   *
   * So recovery applies the wall-clock time that actually passed. An untimed
   * session resumes untouched; a timed one resumes with the time it has left,
   * and a timed one whose budget was spent while the tab was closed comes back
   * already ended, with every answer intact.
   */
  it('resumes an untimed session exactly where it was', async () => {
    await startRun();
    const id = useSessionStore.getState().session!.questions[0]!.questionId;
    useSessionStore.getState().answer(id, 'A', T0 + 1_000);

    const saved = useSessionStore.getState().session!;
    useSessionStore.getState().recover(saved, T0 + 900 * MINUTE);

    const state = useSessionStore.getState();
    expect(state.status).toBe('ready');
    expect(state.session?.status).toBe('IN_PROGRESS');
    expect(state.session?.attempts).toHaveLength(1);
  });

  it('gives back a timed session with the time that is actually left', async () => {
    await useSessionStore.getState().start({
      sessionId: 's-timed',
      userId: 'u1',
      profile: PROFILE,
      count: 5,
      provider: fixtureProvider(),
      timerEnabled: true,
      timerMinutes: 30,
      now: () => T0,
    });

    const saved = useSessionStore.getState().session!;
    useSessionStore.getState().recover(saved, T0 + 10 * MINUTE);

    expect(remainingFor(useSessionStore.getState().session)).toBe(20 * MINUTE);
    expect(useSessionStore.getState().session?.status).toBe('IN_PROGRESS');
  });

  it('ends a timed session whose budget was spent while the tab was closed', async () => {
    await useSessionStore.getState().start({
      sessionId: 's-timed-2',
      userId: 'u1',
      profile: PROFILE,
      count: 5,
      provider: fixtureProvider(),
      timerEnabled: true,
      timerMinutes: 10,
      now: () => T0,
    });
    const id = useSessionStore.getState().session!.questions[0]!.questionId;
    useSessionStore.getState().answer(id, 'A', T0 + 60_000);

    const saved = useSessionStore.getState().session!;
    useSessionStore.getState().recover(saved, T0 + 4 * 60 * MINUTE);

    const state = useSessionStore.getState();
    expect(state.session?.status).toBe('TIMED_OUT');
    /* The answer given before the tab closed still counts. */
    expect(state.history[0]?.answeredCount).toBe(1);
    expect(state.history[0]?.status).toBe('TIMED_OUT');
  });

  it('refuses to recover a session that had already ended', async () => {
    await startRun();
    useSessionStore.getState().exit(T0 + 1_000);
    const ended = useSessionStore.getState().session!;

    useSessionStore.setState({ status: 'idle', session: null });
    useSessionStore.getState().recover(ended, T0 + 2_000);

    /* Nothing to resume: an ended session is not a session in progress. */
    expect(useSessionStore.getState().status).toBe('idle');
    expect(useSessionStore.getState().session).toBeNull();
  });
});

describe('the timer', () => {
  async function startTimed(minutes: number) {
    await useSessionStore.getState().start({
      sessionId: 's-timed',
      userId: 'u1',
      profile: PROFILE,
      count: 5,
      provider: fixtureProvider(),
      timerEnabled: true,
      timerMinutes: minutes,
      now: () => T0,
    });
  }

  it('counts down and reports what is left', async () => {
    await startTimed(10);
    expect(remainingFor(useSessionStore.getState().session)).toBe(10 * MINUTE);

    useSessionStore.getState().tick(T0 + 4 * MINUTE);
    expect(remainingFor(useSessionStore.getState().session)).toBe(6 * MINUTE);
  });

  it('ends the session and records it when the time is spent', async () => {
    await startTimed(5);
    useSessionStore.getState().tick(T0 + 5 * MINUTE);

    const state = useSessionStore.getState();
    expect(state.session?.status).toBe('TIMED_OUT');
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.status).toBe('TIMED_OUT');
  });

  it('has no countdown when the timer is off', async () => {
    await startRun();
    useSessionStore.getState().tick(T0 + 900 * MINUTE);

    expect(remainingFor(useSessionStore.getState().session)).toBeNull();
    expect(useSessionStore.getState().session?.status).toBe('IN_PROGRESS');
  });

  it('does not hand time back when the clock jumps backwards', async () => {
    await startTimed(10);
    useSessionStore.getState().tick(T0 + 7 * MINUTE);
    useSessionStore.getState().tick(T0 - 500 * MINUTE);

    expect(remainingFor(useSessionStore.getState().session)).toBe(3 * MINUTE);
  });
});
