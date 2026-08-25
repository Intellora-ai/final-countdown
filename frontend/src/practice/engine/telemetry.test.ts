import { describe, expect, it } from 'vitest';

import { DEFAULT_BUDGET_MS, generateSet } from './pipeline';
import { fixtureProvider } from './provider';
import { concernsIn, healthOf, percentile, recordRun, type RunRecord } from './telemetry';
import type { SetMetrics } from './pipeline';
import type { TopicProfile } from './plan';

const PROFILE: TopicProfile = {
  topicId: 'rotational-motion',
  chapterId: 'mechanics',
  quantitative: 0.8,
  concepts: [
    { id: 'moment-of-inertia', name: 'Moment of inertia', topicId: 'rotational-motion', numeric: true, prerequisites: ['mass'], commonMisconception: 'treats it as mass' },
    { id: 'angular-momentum', name: 'Angular momentum', topicId: 'rotational-motion', numeric: true, prerequisites: [], commonMisconception: 'ignores the axis' },
    { id: 'torque', name: 'Torque', topicId: 'rotational-motion', numeric: true, prerequisites: ['force'], commonMisconception: 'ignores the lever arm' },
    { id: 'rolling', name: 'Rolling', topicId: 'rotational-motion', numeric: true, prerequisites: [], commonMisconception: 'adds the speeds' },
    { id: 'rotational-ke', name: 'Rotational KE', topicId: 'rotational-motion', numeric: true, prerequisites: [], commonMisconception: 'forgets the half' },
  ],
};

function metrics(over: Partial<SetMetrics> = {}): SetMetrics {
  return {
    totalMs: 100,
    generationMs: 60,
    verificationMs: 20,
    candidatesGenerated: 10,
    verificationFailures: 0,
    duplicatesRejected: 0,
    regenerations: 0,
    rejectionsByCheck: {},
    ...over,
  };
}

function run(over: Partial<RunRecord> = {}): RunRecord {
  return {
    at: 0,
    topicId: 'rotational-motion',
    requested: 10,
    delivered: 10,
    failure: null,
    metrics: metrics(),
    ...over,
  };
}

describe('percentiles', () => {
  /*
   * Nearest-rank, not interpolated. With a handful of runs, interpolation
   * invents a latency no run actually had, and the point of p99 here is to
   * name a real slow run.
   */
  it('returns a value that was actually observed', () => {
    const values = [10, 20, 30, 40, 100];
    for (const p of [50, 90, 95, 99]) {
      expect(values).toContain(percentile(values, p));
    }
  });

  it('puts p99 on the slowest run rather than near the middle', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 900];
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 99)).toBe(900);
  });

  it('handles an empty window without dividing by zero', () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe('rates are denominated in the thing that varies', () => {
  /*
   * A run that regenerated four times before succeeding had four verification
   * failures. Denominating over RUNS would report that as one clean success and
   * hide a generator producing mostly bad questions.
   */
  it('measures verification against candidates, not against runs', () => {
    const records = [
      run({ metrics: metrics({ candidatesGenerated: 20, verificationFailures: 10 }) }),
    ];
    const health = healthOf(records, DEFAULT_BUDGET_MS);

    expect(health.successRate).toBe(1);
    expect(health.verificationPassRate).toBe(0.5);
  });

  it('counts a refusal against the success rate', () => {
    const records = [run(), run({ failure: 'TIMEOUT', delivered: 4 })];
    const health = healthOf(records, DEFAULT_BUDGET_MS);

    expect(health.successRate).toBe(0.5);
    expect(health.failures['TIMEOUT']).toBe(1);
  });

  it('sums rejection reasons across runs so a trend is visible', () => {
    const records = [
      run({ metrics: metrics({ rejectionsByCheck: { duplicate: 3 } }) }),
      run({ metrics: metrics({ rejectionsByCheck: { duplicate: 2, solution_completeness: 1 } }) }),
    ];
    const health = healthOf(records, DEFAULT_BUDGET_MS);

    expect(health.rejections['duplicate']).toBe(5);
    expect(health.rejections['solution_completeness']).toBe(1);
  });
});

describe('the near-budget warning', () => {
  /*
   * The number that matters before anything breaks. A run at 9s against a 10s
   * budget has not failed and is one slow call from failing, and an average
   * would never show it.
   */
  it('flags runs approaching the ceiling while they are still succeeding', () => {
    const records = [
      run({ metrics: metrics({ totalMs: 200 }) }),
      run({ metrics: metrics({ totalMs: 9_000 }) }),
    ];
    const health = healthOf(records, 10_000);

    expect(health.successRate).toBe(1);
    expect(health.nearBudgetRate).toBe(0.5);
    expect(concernsIn(health).join(' ')).toContain('within');
  });

  it('says nothing when everything is comfortable', () => {
    const health = healthOf([run(), run()], 10_000);
    expect(concernsIn(health)).toEqual([]);
  });

  it('names a generator producing bad questions', () => {
    const records = [
      run({ metrics: metrics({ candidatesGenerated: 20, verificationFailures: 12 }) }),
    ];
    expect(concernsIn(healthOf(records, 10_000)).join(' ')).toContain('passed verification');
  });
});

describe('the window is bounded', () => {
  it('keeps the newest records and drops the oldest', () => {
    let records: readonly RunRecord[] = [];
    for (let i = 0; i < 250; i += 1) records = recordRun(records, run({ at: i }));

    expect(records).toHaveLength(200);
    expect(records[0]?.at).toBe(249);
  });
});

describe('a real run, measured', () => {
  /*
   * THE LATENCY REQUIREMENT, ASSERTED RATHER THAN ASSUMED.
   *
   * The budget is enforced in the pipeline and tested there with a fake clock.
   * This measures the real thing end to end on a real clock, so a change that
   * makes generation quietly slower shows up as a failing test rather than as a
   * learner watching a spinner.
   *
   * Against the fixture, so it measures the ENGINE. A model-backed run adds
   * network time this cannot control, which is exactly why the near-budget rate
   * above exists for production.
   */
  it.each([5, 10, 15] as const)('produces %i questions inside the budget', async (count) => {
    const started = Date.now();
    const outcome = await generateSet({
      sessionId: 'perf',
      profile: PROFILE,
      count,
      provider: fixtureProvider(),
    });
    const elapsed = Date.now() - started;

    expect(outcome.ok).toBe(true);
    expect(elapsed).toBeLessThan(DEFAULT_BUDGET_MS);
    expect(outcome.metrics.totalMs).toBeLessThan(DEFAULT_BUDGET_MS);
  });

  it('records a real run into the health window', async () => {
    const outcome = await generateSet({
      sessionId: 'perf-2',
      profile: PROFILE,
      count: 10,
      provider: fixtureProvider(),
    });

    const records = recordRun([], {
      at: 0,
      topicId: PROFILE.topicId,
      requested: 10,
      delivered: outcome.ok ? outcome.questions.length : 0,
      failure: outcome.ok ? null : outcome.error.failure,
      metrics: outcome.metrics,
    });

    const health = healthOf(records, DEFAULT_BUDGET_MS);
    expect(health.runs).toBe(1);
    expect(health.successRate).toBe(1);
    expect(health.latencyMs.p99).toBeLessThan(DEFAULT_BUDGET_MS);
    expect(concernsIn(health)).toEqual([]);
  });
});
