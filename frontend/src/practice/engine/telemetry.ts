import type { SetMetrics } from './pipeline';
import type { EngineFailure } from './types';

/**
 * What the engine did, across runs rather than within one.
 *
 * WHY A SINGLE RUN'S METRICS DIAGNOSE ALMOST NOTHING
 * --------------------------------------------------
 * `SetMetrics` already says what one generation cost and why candidates were
 * rejected. That answers "what happened to this set" and nothing about "is this
 * getting worse". A duplicate rate of 20% is unremarkable in one run and an
 * emergency as a trend; a p99 of nine seconds against a ten-second budget is
 * invisible in an average and is the number that decides whether learners see
 * refusals.
 *
 * PERCENTILES, NOT AVERAGES
 * -------------------------
 * A mean latency hides the tail completely, and the tail is the whole question:
 * the budget is a hard ceiling, so what matters is how close the slowest runs
 * come to it, not where the middle sits. p50 is reported alongside so a shifted
 * median can be told apart from a lengthening tail — they call for different
 * fixes.
 */

export interface RunRecord {
  readonly at: number;
  readonly topicId: string;
  readonly requested: number;
  readonly delivered: number;
  readonly failure: EngineFailure | null;
  readonly metrics: SetMetrics;
}

export interface EngineHealth {
  readonly runs: number;
  /** Runs that delivered a full set, over all runs. */
  readonly successRate: number;
  /** Candidates that passed verification, over all candidates generated. */
  readonly verificationPassRate: number;
  readonly duplicateRate: number;
  readonly regenerationRate: number;
  readonly latencyMs: { p50: number; p95: number; p99: number; max: number };
  readonly generationMs: { p50: number; p95: number };
  readonly verificationMs: { p50: number; p95: number };
  /** Why sets failed, by failure. Empty when nothing failed. */
  readonly failures: Readonly<Record<string, number>>;
  /** Why candidates were rejected, by check, summed across runs. */
  readonly rejections: Readonly<Record<string, number>>;
  /** Runs that came within this fraction of the budget. The early warning. */
  readonly nearBudgetRate: number;
}

/** Keep the window bounded; a growing array in a browser tab is a leak. */
export const MAX_RECORDS = 200;

/** A run within 80% of budget is not yet failing and is about to. */
export const NEAR_BUDGET_FRACTION = 0.8;

export function recordRun(
  existing: readonly RunRecord[],
  record: RunRecord,
): readonly RunRecord[] {
  return [record, ...existing].slice(0, MAX_RECORDS);
}

export function healthOf(
  records: readonly RunRecord[],
  budgetMs: number,
): EngineHealth {
  if (records.length === 0) return EMPTY;

  const totalCandidates = sum(records.map((r) => r.metrics.candidatesGenerated));
  const totalFailures = sum(records.map((r) => r.metrics.verificationFailures));
  const totalDuplicates = sum(records.map((r) => r.metrics.duplicatesRejected));
  const totalRegenerations = sum(records.map((r) => r.metrics.regenerations));

  const failures: Record<string, number> = {};
  const rejections: Record<string, number> = {};
  for (const record of records) {
    if (record.failure) failures[record.failure] = (failures[record.failure] ?? 0) + 1;
    for (const [check, count] of Object.entries(record.metrics.rejectionsByCheck)) {
      rejections[check] = (rejections[check] ?? 0) + count;
    }
  }

  const totals = records.map((r) => r.metrics.totalMs);

  return {
    runs: records.length,
    successRate: ratio(records.filter((r) => r.failure === null).length, records.length),
    /*
     * Denominated in CANDIDATES, not runs. A run that regenerated four times
     * before succeeding had four verification failures, and a rate over runs
     * would report that as one clean success.
     */
    verificationPassRate:
      totalCandidates === 0 ? 1 : ratio(totalCandidates - totalFailures, totalCandidates),
    duplicateRate: totalCandidates === 0 ? 0 : ratio(totalDuplicates, totalCandidates),
    regenerationRate: totalCandidates === 0 ? 0 : ratio(totalRegenerations, totalCandidates),
    latencyMs: {
      p50: percentile(totals, 50),
      p95: percentile(totals, 95),
      p99: percentile(totals, 99),
      max: Math.max(...totals),
    },
    generationMs: {
      p50: percentile(records.map((r) => r.metrics.generationMs), 50),
      p95: percentile(records.map((r) => r.metrics.generationMs), 95),
    },
    verificationMs: {
      p50: percentile(records.map((r) => r.metrics.verificationMs), 50),
      p95: percentile(records.map((r) => r.metrics.verificationMs), 95),
    },
    failures,
    rejections,
    nearBudgetRate: ratio(
      totals.filter((ms) => ms >= budgetMs * NEAR_BUDGET_FRACTION).length,
      totals.length,
    ),
  };
}

/**
 * Nearest-rank percentile.
 *
 * Deliberately not interpolated. With a handful of runs, interpolation invents
 * a latency no run actually had — and the point of p99 here is to name a real
 * slow run, not to describe a distribution nobody sampled.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

/**
 * The health readings that should worry someone, in words.
 *
 * A dashboard nobody reads catches nothing. These thresholds are the ones where
 * a learner is about to be affected rather than where a number merely looks
 * unusual.
 */
export function concernsIn(health: EngineHealth): readonly string[] {
  const out: string[] = [];
  if (health.runs === 0) return out;

  if (health.successRate < 0.95) {
    out.push(`${pct(1 - health.successRate)} of sets were refused outright.`);
  }
  if (health.nearBudgetRate > 0.1) {
    out.push(
      `${pct(health.nearBudgetRate)} of runs came within ${pct(1 - NEAR_BUDGET_FRACTION)} of the budget.`,
    );
  }
  if (health.verificationPassRate < 0.7) {
    out.push(
      `Only ${pct(health.verificationPassRate)} of candidates passed verification — the generator is producing bad questions.`,
    );
  }
  if (health.duplicateRate > 0.25) {
    out.push(
      `${pct(health.duplicateRate)} of candidates were duplicates — the generator is not varying enough.`,
    );
  }
  return out;
}

const EMPTY: EngineHealth = {
  runs: 0,
  successRate: 1,
  verificationPassRate: 1,
  duplicateRate: 0,
  regenerationRate: 0,
  latencyMs: { p50: 0, p95: 0, p99: 0, max: 0 },
  generationMs: { p50: 0, p95: 0 },
  verificationMs: { p50: 0, p95: 0 },
  failures: {},
  rejections: {},
  nearBudgetRate: 0,
};

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 1000;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
