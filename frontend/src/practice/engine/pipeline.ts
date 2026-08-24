import { compareAgainst, fingerprintOf } from './fingerprint';
import { buildPlan, type TopicProfile } from './plan';
import type { QuestionProvider } from './provider';
import {
  type CandidateQuestion,
  type EngineError,
  type EngineFailure,
  type QuestionCount,
  type QuestionSpec,
  type VerifiedQuestion,
} from './types';
import { verify } from './verify';

/**
 * Plan, generate, verify, deduplicate, regenerate, assemble.
 *
 * THE ORDER IS THE POINT
 * ----------------------
 * The tempting shape is one call that returns ten questions, and it fails in a
 * way that is invisible: the ten come back looking fine, one of them has two
 * defensible answers, and nothing in the system is positioned to notice. Every
 * stage here exists because something has to be checked between two steps that
 * a single call collapses together.
 *
 * WHAT HAPPENS WHEN THE CLOCK RUNS OUT
 * ------------------------------------
 * It refuses. There is no path from "out of time" to "deliver what we have",
 * and `EngineFailure` has no member that could express one. The target is ten
 * seconds and the design meets it by generating in parallel rather than by
 * lowering the bar as the deadline approaches — a set with a wrong answer in it
 * is worse for the student than a set that did not arrive, because the second
 * one they can retry and the first one teaches them something false.
 *
 * PARALLEL, THEN SERIAL ONLY FOR WHAT MUST BE
 * -------------------------------------------
 * Candidates are generated and verified concurrently, because they do not
 * depend on each other. Deduplication cannot be: whether question 7 is a
 * duplicate depends on which of 1-6 were accepted, so acceptance is a serial
 * pass over concurrent results. Doing that pass concurrently is how two
 * identical questions both get accepted, each unaware of the other.
 */

export interface GenerateSetInput {
  readonly sessionId: string;
  readonly profile: TopicProfile;
  readonly count: QuestionCount;
  readonly provider: QuestionProvider;
  /** Fingerprints this student has already been served. */
  readonly seenFingerprints?: ReadonlySet<string>;
  /** Wall-clock ceiling for the whole operation. */
  readonly budgetMs?: number;
  /** Regeneration attempts per question before the set is abandoned. */
  readonly retriesPerQuestion?: number;
  /** Injected so latency is testable without sleeping. */
  readonly now?: () => number;
}

export interface SetMetrics {
  readonly totalMs: number;
  readonly generationMs: number;
  readonly verificationMs: number;
  readonly candidatesGenerated: number;
  readonly verificationFailures: number;
  readonly duplicatesRejected: number;
  readonly regenerations: number;
  /** Every rejection, by check name, so a bad batch can be diagnosed. */
  readonly rejectionsByCheck: Readonly<Record<string, number>>;
}

export type GenerateSetOutcome =
  | { readonly ok: true; readonly questions: readonly VerifiedQuestion[]; readonly metrics: SetMetrics }
  | { readonly ok: false; readonly error: EngineError; readonly metrics: SetMetrics };

export const DEFAULT_BUDGET_MS = 10_000;
export const DEFAULT_RETRIES = 3;

export async function generateSet(input: GenerateSetInput): Promise<GenerateSetOutcome> {
  const now = input.now ?? (() => Date.now());
  const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const retries = input.retriesPerQuestion ?? DEFAULT_RETRIES;
  const startedAt = now();

  const counters = {
    generationMs: 0,
    verificationMs: 0,
    candidatesGenerated: 0,
    verificationFailures: 0,
    duplicatesRejected: 0,
    regenerations: 0,
  };
  const rejectionsByCheck: Record<string, number> = {};

  const metrics = (): SetMetrics => ({
    totalMs: now() - startedAt,
    generationMs: counters.generationMs,
    verificationMs: counters.verificationMs,
    candidatesGenerated: counters.candidatesGenerated,
    verificationFailures: counters.verificationFailures,
    duplicatesRejected: counters.duplicatesRejected,
    regenerations: counters.regenerations,
    rejectionsByCheck,
  });

  const fail = (failure: EngineFailure, detail: string, obtained: number): GenerateSetOutcome => ({
    ok: false,
    error: { failure, detail, obtained, requested: input.count },
    metrics: metrics(),
  });

  const specs = buildPlan(input.profile, input.count);
  if (specs.length !== input.count) {
    return fail(
      'INVALID_TOPIC',
      `Topic ${input.profile.topicId} produced ${specs.length} specs for ${input.count} questions. It has ${input.profile.concepts.length} concept(s).`,
      0,
    );
  }

  const controller = new AbortController();
  const outOfTime = () => now() - startedAt >= budgetMs;

  /*
   * One slot per planned question. A slot is filled by the first candidate that
   * passes verification AND is not a duplicate of an already-accepted one.
   */
  const accepted = new Map<string, { verified: VerifiedQuestion; candidate: CandidateQuestion }>();
  const seen = new Set(input.seenFingerprints ?? []);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const outstanding = specs.filter((spec) => !accepted.has(spec.specId));
    if (outstanding.length === 0) break;

    if (outOfTime()) {
      controller.abort();
      return fail(
        'TIMEOUT',
        `Budget of ${budgetMs}ms spent with ${accepted.size}/${input.count} verified. Refusing to deliver an unverified set.`,
        accepted.size,
      );
    }

    if (attempt > 0) counters.regenerations += outstanding.length;

    /* Generation and verification fan out; only acceptance is serial. */
    const generated = await generateConcurrently(
      outstanding,
      attempt,
      input.provider,
      controller.signal,
      now,
      counters,
    );

    /*
     * "Every call this round failed" is only evidence of an outage while
     * nothing has succeeded yet.
     *
     * Once questions are in hand, a fully-failed round means the few specs
     * still outstanding are unobtainable — by the last retry the round may be a
     * single stubborn question, and calling that a model outage blames the
     * provider for a question it simply could not write. The honest report
     * there is INSUFFICIENT_VALID_CANDIDATES, which the loop reaches on its own.
     */
    if (accepted.size === 0 && generatedFailedEntirely(generated)) {
      controller.abort();
      const reason = firstError(generated);
      return fail(
        reason instanceof Error && /outage|unavailable/i.test(reason.message)
          ? 'MODEL_UNAVAILABLE'
          : 'QUESTION_GENERATION_FAILED',
        `Every generation attempt failed. Last error: ${reason instanceof Error ? reason.message : 'unknown'}.`,
        accepted.size,
      );
    }

    const verifyStart = now();
    for (const result of generated) {
      if (result.candidate === null) continue;

      const outcome = verify({
        candidate: result.candidate,
        sessionId: input.sessionId,
        expectedTopicId: input.profile.topicId,
      });

      if (!outcome.ok) {
        counters.verificationFailures += 1;
        for (const failure of outcome.failures) {
          rejectionsByCheck[failure.check] = (rejectionsByCheck[failure.check] ?? 0) + 1;
        }
        continue;
      }

      /*
       * Serial on purpose. Compared against what is ALREADY accepted, so two
       * copies of the same question arriving in one batch cannot both get in by
       * each checking a set that does not yet contain the other.
       */
      const similarity = compareAgainst(
        result.candidate,
        [...accepted.values()].map((entry) => entry.candidate),
        seen,
      );

      if (similarity.status !== 'UNIQUE') {
        counters.duplicatesRejected += 1;
        rejectionsByCheck['duplicate'] = (rejectionsByCheck['duplicate'] ?? 0) + 1;
        continue;
      }

      accepted.set(result.spec.specId, {
        verified: { ...outcome.question, similarityStatus: 'UNIQUE' },
        candidate: result.candidate,
      });
      seen.add(fingerprintOf(result.candidate));
    }
    counters.verificationMs += now() - verifyStart;
  }

  if (accepted.size < input.count) {
    controller.abort();
    return fail(
      'INSUFFICIENT_VALID_CANDIDATES',
      `Only ${accepted.size} of ${input.count} questions passed verification and deduplication within ${retries + 1} attempt(s).`,
      accepted.size,
    );
  }

  /* Deliver in plan order, so the difficulty ladder survives. */
  const questions = specs
    .map((spec) => accepted.get(spec.specId)?.verified)
    .filter((question): question is VerifiedQuestion => question !== undefined);

  return { ok: true, questions, metrics: metrics() };
}

/* -------------------------------------------------------------------------- */

interface GenerationResult {
  readonly spec: QuestionSpec;
  readonly candidate: CandidateQuestion | null;
  readonly error: unknown;
}

/**
 * Fan out one round of generation.
 *
 * A provider throwing takes out one slot, not the round: an outage on question
 * 3 must not discard the seven that succeeded beside it. The round-level
 * failure is decided by the caller, from whether ANY slot came back.
 */
async function generateConcurrently(
  specs: readonly QuestionSpec[],
  attempt: number,
  provider: QuestionProvider,
  signal: AbortSignal,
  now: () => number,
  counters: { generationMs: number; candidatesGenerated: number },
): Promise<readonly GenerationResult[]> {
  const started = now();

  const results = await Promise.all(
    specs.map(async (spec): Promise<GenerationResult> => {
      try {
        const candidate = await provider.generate(spec, attempt, signal);
        return { spec, candidate, error: null };
      } catch (error) {
        return { spec, candidate: null, error };
      }
    }),
  );

  counters.generationMs += now() - started;
  counters.candidatesGenerated += results.filter((r) => r.candidate !== null).length;
  return results;
}

function generatedFailedEntirely(results: readonly GenerationResult[]): boolean {
  return results.length > 0 && results.every((result) => result.candidate === null);
}

function firstError(results: readonly GenerationResult[]): unknown {
  return results.find((result) => result.error !== null)?.error;
}
