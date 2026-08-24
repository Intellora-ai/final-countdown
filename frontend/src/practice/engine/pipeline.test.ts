import { describe, expect, it } from 'vitest';

import { DEFAULT_BUDGET_MS, generateSet } from './pipeline';
import { fixtureProvider } from './provider';
import type { TopicProfile } from './plan';
import { QUESTION_TYPES, type QuestionCount } from './types';

/**
 * The pipeline, end to end, with a provider that has no model behind it.
 *
 * That is what makes these assertions exact rather than indicative. A live
 * model answers differently every call, so "the whole set is verified" and
 * "nothing unverified ships when the clock runs out" could only be spot-checked
 * against one. Here they are asserted every run, offline.
 */

const PROFILE: TopicProfile = {
  topicId: 'rotational-motion',
  chapterId: 'mechanics',
  quantitative: 0.8,
  concepts: [
    { id: 'moment-of-inertia', name: 'Moment of inertia', numeric: true, prerequisites: ['mass'], commonMisconception: 'treats it as mass' },
    { id: 'angular-momentum', name: 'Angular momentum', numeric: true, prerequisites: [], commonMisconception: 'ignores the axis' },
    { id: 'torque', name: 'Torque', numeric: true, prerequisites: ['force'], commonMisconception: 'ignores the lever arm' },
    { id: 'rolling', name: 'Rolling without slipping', numeric: true, prerequisites: [], commonMisconception: 'adds the speeds' },
    { id: 'rotational-ke', name: 'Rotational kinetic energy', numeric: true, prerequisites: [], commonMisconception: 'forgets the half' },
  ],
};

/** A clock that only moves when the test says so. */
function fakeClock(stepMs = 0) {
  let t = 0;
  return {
    now: () => {
      const current = t;
      t += stepMs;
      return current;
    },
    set: (value: number) => {
      t = value;
    },
  };
}

async function run(count: QuestionCount, overrides: Partial<Parameters<typeof generateSet>[0]> = {}) {
  return generateSet({
    sessionId: 's1',
    profile: PROFILE,
    count,
    provider: fixtureProvider(),
    now: () => 0,
    ...overrides,
  });
}

describe('producing a set', () => {
  it.each([5, 10, 15] as const)('delivers exactly %i verified questions', async (count) => {
    const outcome = await run(count);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.questions).toHaveLength(count);
    for (const question of outcome.questions) {
      expect(question.verificationStatus).toBe('PASSED');
      expect(question.topicId).toBe(PROFILE.topicId);
      expect(question.correctOption).toBeTruthy();
      expect(question.fullSolution.length).toBeGreaterThan(30);
      expect(['easy', 'medium', 'hard']).toContain(question.difficulty);
    }
  });

  it('gives every question exactly one correct option', async () => {
    const outcome = await run(15);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    for (const question of outcome.questions) {
      const keys = question.options.map((o) => o.key);
      expect(new Set(keys).size).toBe(4);
      expect(keys).toContain(question.correctOption);
    }
  });

  it('ships no duplicates', async () => {
    const outcome = await run(15);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const fingerprints = outcome.questions.map((q) => q.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(outcome.questions.every((q) => q.similarityStatus === 'UNIQUE')).toBe(true);
  });

  it('covers more than one question type and more than one difficulty', async () => {
    const outcome = await run(10);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const types = new Set(outcome.questions.map((q) => q.questionType));
    const difficulties = new Set(outcome.questions.map((q) => q.difficulty));

    // Every type is planned for; a set that collapses to one is the failure.
    expect(types.size).toBeGreaterThan(1);
    expect(difficulties.size).toBeGreaterThan(1);
    for (const type of types) expect(QUESTION_TYPES).toContain(type);
  });

  it('spreads across the concepts rather than asking one thing repeatedly', async () => {
    const outcome = await run(10);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(new Set(outcome.questions.map((q) => q.conceptId)).size).toBe(5);
  });
});

describe('bad candidates are regenerated, not shipped', () => {
  it('recovers when a provider returns a broken question first', async () => {
    /*
     * The fixture breaks these by pointing the answer key at an option the
     * arithmetic does not support - the failure mode nothing on the surface
     * reveals - and repairs itself on the second attempt.
     */
    const outcome = await run(10, {
      provider: fixtureProvider({
        failSpecIds: new Set([`${PROFILE.topicId}-2`, `${PROFILE.topicId}-5`]),
        failUntilAttempt: 1,
      }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.questions).toHaveLength(10);
    expect(outcome.metrics.verificationFailures).toBeGreaterThanOrEqual(2);
    expect(outcome.metrics.regenerations).toBeGreaterThan(0);
  });

  it('refuses the set when a question can never be made valid', async () => {
    const outcome = await run(10, {
      provider: fixtureProvider({ failSpecIds: new Set([`${PROFILE.topicId}-3`]) }),
      retriesPerQuestion: 2,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.error.failure).toBe('INSUFFICIENT_VALID_CANDIDATES');
    expect(outcome.error.obtained).toBe(9);
    expect(outcome.error.requested).toBe(10);
  });

  it('records why candidates were rejected, by check', async () => {
    const outcome = await run(10, {
      provider: fixtureProvider({ failSpecIds: new Set([`${PROFILE.topicId}-1`]) }),
      retriesPerQuestion: 1,
    });

    expect(outcome.metrics.rejectionsByCheck['single_correct_answer']).toBeGreaterThan(0);
  });
});

describe('the budget refuses rather than degrades', () => {
  /*
   * THE INVARIANT THIS WHOLE FILE EXISTS FOR.
   *
   * The latency target is 10 seconds. The one thing that must never happen is
   * an unverified question shipping because the deadline was close. There is no
   * code path from "out of time" to "deliver what we have", and `EngineFailure`
   * has no member that could express one.
   */
  it('returns TIMEOUT rather than a short set when the clock runs out', async () => {
    const clock = fakeClock(6_000);

    const outcome = await generateSet({
      sessionId: 's1',
      profile: PROFILE,
      count: 10,
      // Fails forever, so every round needs another and the budget runs out.
      provider: fixtureProvider({ failSpecIds: new Set([`${PROFILE.topicId}-4`]) }),
      budgetMs: DEFAULT_BUDGET_MS,
      retriesPerQuestion: 10,
      now: clock.now,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.error.failure).toBe('TIMEOUT');
    expect(outcome.error.detail).toContain('Refusing to deliver an unverified set');
    expect(outcome.error.obtained).toBeLessThan(10);
  });

  it('reports where the time went', async () => {
    const outcome = await run(10, { now: fakeClock(5).now });
    expect(outcome.metrics.totalMs).toBeGreaterThanOrEqual(0);
    expect(outcome.metrics.candidatesGenerated).toBeGreaterThanOrEqual(10);
  });
});

describe('provider failure', () => {
  it('reports MODEL_UNAVAILABLE when generation fails outright', async () => {
    const all = new Set(Array.from({ length: 10 }, (_, i) => `${PROFILE.topicId}-${i}`));
    const outcome = await run(10, { provider: fixtureProvider({ throwFor: all }) });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.failure).toBe('MODEL_UNAVAILABLE');
  });

  it('survives one question failing while the rest succeed', async () => {
    const outcome = await run(10, {
      provider: fixtureProvider({ throwFor: new Set([`${PROFILE.topicId}-6`]) }),
      retriesPerQuestion: 1,
    });

    // Slot 6 never arrives, but the other nine did - so this is an
    // insufficient-candidates refusal, not a provider outage.
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.failure).toBe('INSUFFICIENT_VALID_CANDIDATES');
    expect(outcome.error.obtained).toBe(9);
  });
});

describe('history', () => {
  it('will not serve a question this student has already seen', async () => {
    const first = await run(10);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const seen = new Set(first.questions.map((q) => q.fingerprint));
    const second = await run(10, { seenFingerprints: seen, retriesPerQuestion: 6 });

    if (second.ok) {
      for (const question of second.questions) expect(seen.has(question.fingerprint)).toBe(false);
    } else {
      // Refusing is also correct: the fixture has a finite question space, and
      // running out of NEW questions must never become serving an old one.
      expect(second.error.failure).toBe('INSUFFICIENT_VALID_CANDIDATES');
    }
  });
});

describe('an unusable topic', () => {
  it('refuses a topic with no concepts rather than inventing some', async () => {
    const outcome = await run(5, { profile: { ...PROFILE, concepts: [] } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.failure).toBe('INVALID_TOPIC');
  });
});
