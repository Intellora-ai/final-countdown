import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url'
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  answer,
  createSession,
  elapsedMs,
  exitSession,
  remainingMs,
  resultOf,
  submit,
  syncClock,
} from './session';
import { TIMER_MAX_MINUTES, TIMER_MIN_MINUTES } from '../store';
import type { OptionKey, QuestionOption, VerifiedQuestion } from './types';

/**
 * The session's rules.
 *
 * Two of these are worth stating up front because they are the ones a session
 * usually gets wrong.
 *
 * A SESSION THAT ONLY KNOWS started AND completed LOSES THE INTERESTING CASES.
 * A student who leaves after two questions is neither finished nor absent, and
 * a model with two states has to record them as one of those. Every end here is
 * its own state and carries what was actually answered.
 *
 * THE CLOCK IS AN INPUT, WHICH IS THE ONLY WAY TO TEST IT.
 * `Date.now()` inside the session would make every timer test a sleep. Time
 * arrives as a number from the caller, so a 30-minute session is one function
 * call, and the "what if the clock jumps backwards" case is expressible at all.
 */

const OPTIONS: readonly QuestionOption[] = [
  { key: 'A', text: 'Pressure rises', rationale: '' },
  { key: 'B', text: 'Pressure falls', rationale: 'Confuses temperature with volume' },
  { key: 'C', text: 'Pressure is unchanged', rationale: 'Assumes the walls absorb the energy' },
  { key: 'D', text: 'Pressure oscillates', rationale: 'Reads the mean as a wave' },
];

function question(index: number, correct: OptionKey = 'A'): VerifiedQuestion {
  return {
    questionId: `q${index}`,
    sessionId: 's1',
    topicId: 't1',
    conceptId: `c${index}`,
    questionType: 'standard',
    difficulty: 'medium',
    questionText: `Question ${index}?`,
    options: OPTIONS,
    correctOption: correct,
    fullSolution: `Because of reason ${index}.`,
    reasoningStructure: 'single_step_application',
    prerequisites: [],
    generationSource: 'fixture',
    verificationStatus: 'PASSED',
    similarityStatus: 'UNIQUE',
    qualityScore: 0.9,
    fingerprint: `fp${index}`,
  };
}

const FIVE = [1, 2, 3, 4, 5].map((n) => question(n));

const MINUTE = 60_000;

function newSession(overrides: Partial<Parameters<typeof createSession>[0]> = {}) {
  const created = createSession({
    sessionId: 's1',
    userId: 'u1',
    topicId: 't1',
    chapterId: 'ch1',
    questions: FIVE,
    timerEnabled: false,
    timerMinutes: 10,
    startedAtMs: 1_000_000,
    ...overrides,
  });
  if ('failure' in created) throw new Error(`unexpected refusal: ${created.failure}`);
  return created;
}

describe('creating a session', () => {
  it('starts in progress with the first question current', () => {
    const session = newSession();
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.currentIndex).toBe(0);
    expect(session.questions).toHaveLength(5);
  });

  it('refuses a count the product never offers', () => {
    const created = createSession({
      sessionId: 's1',
      userId: 'u1',
      topicId: 't1',
      chapterId: 'ch1',
      questions: [question(1), question(2), question(3)],
      timerEnabled: false,
      timerMinutes: 10,
      startedAtMs: 0,
    });
    expect(created).toMatchObject({ failure: 'INVALID_REQUEST' });
  });

  it('refuses more than the maximum, whatever the caller says', () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => question(i));
    const created = createSession({
      sessionId: 's1',
      userId: 'u1',
      topicId: 't1',
      chapterId: 'ch1',
      questions: sixteen,
      timerEnabled: false,
      timerMinutes: 10,
      startedAtMs: 0,
    });
    expect(created).toMatchObject({ failure: 'INVALID_REQUEST' });
  });

  it('refuses a timer outside the product rule when the timer is on', () => {
    for (const minutes of [TIMER_MIN_MINUTES - 1, TIMER_MAX_MINUTES + 1, 0, 9999]) {
      const created = createSession({
        sessionId: 's1',
        userId: 'u1',
        topicId: 't1',
        chapterId: 'ch1',
        questions: FIVE,
        timerEnabled: true,
        timerMinutes: minutes,
        startedAtMs: 0,
      });
      expect(created, `${minutes} minutes should be refused`).toMatchObject({
        failure: 'INVALID_REQUEST',
      });
    }
  });

  it('ignores an out-of-range duration when the timer is off', () => {
    // Timer OFF means no countdown requirement at all, so the duration is not
    // a number anyone will read. Refusing here would block a legal session.
    const session = newSession({ timerEnabled: false, timerMinutes: 9999 });
    expect(session.status).toBe('IN_PROGRESS');
    expect(remainingMs(session)).toBeNull();
  });

  it('refuses a question that is not from the session topic', () => {
    const foreign = { ...question(6), topicId: 'somewhere-else' };
    const created = createSession({
      sessionId: 's1',
      userId: 'u1',
      topicId: 't1',
      chapterId: 'ch1',
      questions: [...FIVE.slice(0, 4), foreign],
      timerEnabled: false,
      timerMinutes: 10,
      startedAtMs: 0,
    });
    expect(created).toMatchObject({ failure: 'INVALID_TOPIC' });
  });
});

describe('answering', () => {
  it('records the selection and whether it was right', () => {
    let session = newSession();
    session = answer(session, 'q1', 'A', 1_005_000);

    const attempt = session.attempts.find((a) => a.questionId === 'q1');
    expect(attempt?.selectedOption).toBe('A');
    expect(attempt?.correct).toBe(true);
    expect(attempt?.timeSpentMs).toBe(5_000);
  });

  it('keeps the distractor rationale as the mistake pattern', () => {
    let session = newSession();
    session = answer(session, 'q1', 'B', 1_002_000);

    const attempt = session.attempts.find((a) => a.questionId === 'q1');
    expect(attempt?.correct).toBe(false);
    expect(attempt?.mistakePattern).toBe('Confuses temperature with volume');
  });

  it('lets a student change their mind, keeping one attempt per question', () => {
    let session = newSession();
    session = answer(session, 'q1', 'B', 1_002_000);
    session = answer(session, 'q1', 'A', 1_004_000);

    expect(session.attempts.filter((a) => a.questionId === 'q1')).toHaveLength(1);
    expect(session.attempts[0]?.selectedOption).toBe('A');
    expect(session.attempts[0]?.correct).toBe(true);
  });

  it('ignores an answer to a question this session does not contain', () => {
    let session = newSession();
    session = answer(session, 'not-in-this-session', 'A', 1_001_000);
    expect(session.attempts).toHaveLength(0);
  });

  it('accepts no answer once the session has ended', () => {
    let session = newSession();
    session = exitSession(session, 1_003_000);
    session = answer(session, 'q1', 'A', 1_004_000);

    expect(session.status).toBe('EXITED');
    expect(session.attempts).toHaveLength(0);
  });
});

describe('leaving', () => {
  it('exit is an end in its own right and keeps what was answered', () => {
    let session = newSession();
    session = answer(session, 'q1', 'A', 1_001_000);
    session = answer(session, 'q2', 'A', 1_002_000);
    session = exitSession(session, 1_002_500);

    expect(session.status).toBe('EXITED');
    const result = resultOf(session);
    expect(result.answeredCount).toBe(2);
    expect(result.correctCount).toBe(2);
    expect(result.attempts).toHaveLength(2);
  });

  it('a partial submission is SUBMITTED, a full one is COMPLETED', () => {
    let partial = newSession();
    partial = answer(partial, 'q1', 'A', 1_001_000);
    partial = submit(partial, 1_002_000);
    expect(partial.status).toBe('SUBMITTED');

    let full = newSession();
    for (const q of FIVE) full = answer(full, q.questionId, 'A', 1_001_000);
    full = submit(full, 1_002_000);
    expect(full.status).toBe('COMPLETED');
  });

  it('does not reopen a session that has already ended', () => {
    let session = newSession();
    session = exitSession(session, 1_001_000);
    session = submit(session, 1_002_000);
    expect(session.status).toBe('EXITED');
  });
});

describe('the timer', () => {
  it('counts down from the chosen duration', () => {
    const session = newSession({ timerEnabled: true, timerMinutes: 10 });
    expect(remainingMs(session)).toBe(10 * MINUTE);

    const later = syncClock(session, 1_000_000 + 4 * MINUTE);
    expect(remainingMs(later)).toBe(6 * MINUTE);
    expect(elapsedMs(later)).toBe(4 * MINUTE);
  });

  it('ends the session when the duration is spent', () => {
    const session = newSession({ timerEnabled: true, timerMinutes: 5 });
    const after = syncClock(session, 1_000_000 + 5 * MINUTE);

    expect(after.status).toBe('TIMED_OUT');
    expect(remainingMs(after)).toBe(0);
  });

  it('never reports negative time left', () => {
    const session = newSession({ timerEnabled: true, timerMinutes: 5 });
    const long = syncClock(session, 1_000_000 + 500 * MINUTE);
    expect(remainingMs(long)).toBe(0);
  });

  it('has no countdown at all when the timer is off', () => {
    const session = newSession({ timerEnabled: false });
    const later = syncClock(session, 1_000_000 + 900 * MINUTE);

    expect(remainingMs(later)).toBeNull();
    expect(later.status).toBe('IN_PROGRESS');
  });

  /*
   * A CLOCK THAT GOES BACKWARDS MUST NOT HAND BACK TIME.
   *
   * `Date.now()` is wall-clock: an NTP correction, a timezone change, or a
   * student setting their device clock back all move it backwards. If elapsed
   * time were `now - startedAt` recomputed each tick, any of those would refill
   * the timer, and the last is something a student can do deliberately during
   * a timed test.
   *
   * So the session carries the furthest point it has ever seen, and a reading
   * behind that is clamped to it. Time can stall under a hostile clock; it
   * cannot reverse.
   */
  it('does not give time back when the clock jumps backwards', () => {
    const session = newSession({ timerEnabled: true, timerMinutes: 10 });
    const advanced = syncClock(session, 1_000_000 + 7 * MINUTE);
    expect(remainingMs(advanced)).toBe(3 * MINUTE);

    const rewound = syncClock(advanced, 1_000_000 - 500 * MINUTE);
    expect(remainingMs(rewound)).toBe(3 * MINUTE);
    expect(elapsedMs(rewound)).toBe(7 * MINUTE);
  });

  it('still times out on the next honest reading after a rewind', () => {
    const session = newSession({ timerEnabled: true, timerMinutes: 5 });
    const rewound = syncClock(session, 0);
    expect(rewound.status).toBe('IN_PROGRESS');

    const honest = syncClock(rewound, 1_000_000 + 6 * MINUTE);
    expect(honest.status).toBe('TIMED_OUT');
  });

  it('keeps answers given before the timeout', () => {
    let session = newSession({ timerEnabled: true, timerMinutes: 5 });
    session = answer(session, 'q1', 'A', 1_060_000);
    session = syncClock(session, 1_000_000 + 5 * MINUTE);

    expect(session.status).toBe('TIMED_OUT');
    expect(resultOf(session).answeredCount).toBe(1);
  });
});

describe('the result', () => {
  it('reports per-question evidence, not just a score', () => {
    let session = newSession();
    session = answer(session, 'q1', 'A', 1_010_000);
    session = answer(session, 'q2', 'C', 1_020_000);
    session = submit(session, 1_030_000);

    const result = resultOf(session);
    expect(result.correctCount).toBe(1);
    expect(result.answeredCount).toBe(2);
    expect(result.requested).toBe(5);

    const wrong = result.attempts.find((a) => a.questionId === 'q2');
    expect(wrong?.conceptId).toBe('c2');
    expect(wrong?.reasoningStructure).toBe('single_step_application');
    expect(wrong?.difficulty).toBe('medium');
    expect(wrong?.mistakePattern).toBe('Assumes the walls absorb the energy');
  });

  it('matches the actual selections the student made, in order of answering', () => {
    let session = newSession();
    session = answer(session, 'q3', 'A', 1_001_000);
    session = answer(session, 'q1', 'B', 1_002_000);
    session = submit(session, 1_003_000);

    const result = resultOf(session);
    expect(result.attempts.map((a) => a.questionId)).toEqual(['q3', 'q1']);
    expect(result.attempts.map((a) => a.selectedOption)).toEqual(['A', 'B']);
  });
});

/* -------------------------------------------------------------------------- */

/*
 * ONE COUNTDOWN, NOT TWO THAT AGREE TODAY.
 *
 * Time remaining was computed in two places. `remainingMs` here, and
 * `remainingFor` in `sessionStore.ts` — the one the screen actually calls at
 * `SessionView.tsx:287`. The live one also inlined the body of `elapsedMs`
 * rather than calling it, so the elapsed calculation existed twice as well:
 *
 *     elapsedMs      Math.max(0, highWaterMs - startedAtMs)
 *     remainingFor   Math.max(0, timerDurationMs - (highWaterMs - startedAtMs))
 *
 * Two copies of a clock is the worst kind to have two of. They agree until one
 * is corrected — a pause, a recovery, a change to what "elapsed" counts — and
 * then the screen and the engine disagree about how long a learner has left,
 * with no test failing, because each was tested against itself.
 *
 * The only real difference was null-tolerance: the screen may hold no session.
 * So `remainingFor` keeps that and delegates the arithmetic.
 */
describe('the countdown is computed once', () => {
  /* `fileURLToPath`, NOT `.pathname`.
   *
   * A file URL percent-encodes, so on a checkout whose path contains a space
   * `.pathname` yields `/Users/.../final%20countdown/...` and every read of it
   * fails with ENOENT. The test then reports the product as broken when the
   * only broken thing is the path it built. This repository is checked out at
   * such a path today, which is how it was found. */
  const DIR = fileURLToPath(new URL('.', import.meta.url));
  const PRACTICE = join(DIR, '..');

  it('subtracts from timerDurationMs in engine/session.ts and nowhere else', () => {
    const offenders: string[] = [];
    const walk = (dir: string, prefix: string): void => {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(full).isDirectory()) {
          walk(full, rel);
        } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
          if (/timerDurationMs\s*-/.test(readFileSync(full, 'utf8'))) offenders.push(rel);
        }
      }
    };
    walk(PRACTICE, '');
    expect(offenders).toEqual(['engine/session.ts']);
  });
});
