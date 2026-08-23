import { assessDifficulty, bandDistance } from './difficulty';
import { fingerprintOf } from './fingerprint';
import {
  OPTION_KEYS,
  type CandidateQuestion,
  type NumericComputation,
  type OptionKey,
  type SimilarityStatus,
  type VerifiedQuestion,
} from './types';

/**
 * The verifier. It does not believe the generator.
 *
 * WHY THIS IS NOT "ASK THE MODEL TO CHECK ITS WORK"
 * -------------------------------------------------
 * A generator that made an arithmetic slip will make the same slip explaining
 * itself, because the explanation is produced from the same wrong reasoning. So
 * the check has to be of a different KIND, not merely a second pass: the
 * numbers are recomputed here, in code, from the inputs the generator declared.
 * If the arithmetic disagrees with the stated answer, the stated answer is
 * wrong, whatever the solution text says about it.
 *
 * That is why `NumericComputation` exists at all. "The solution says 42" and
 * "42 is what these numbers actually do" are different claims, and only the
 * second one survives a generator having a bad day.
 *
 * EXACTLY ONE CORRECT OPTION IS THE HARDEST PART, NOT THE EASIEST
 * ---------------------------------------------------------------
 * The obvious reading of "one correct answer" is "the generator named one", and
 * that is satisfied by every broken question ever written. The real failure is
 * a second option that is ALSO defensible — a distractor that happens to be
 * true, or two options that say the same thing in different words. A student
 * who picks the other true one is marked wrong for being right, which is the
 * single worst thing this system can do to them.
 *
 * So both directions are checked: zero valid answers, and more than one.
 */

export interface VerificationFailure {
  readonly check: string;
  readonly detail: string;
}

export type VerificationOutcome =
  | { readonly ok: true; readonly question: VerifiedQuestion; readonly qualityScore: number }
  | { readonly ok: false; readonly failures: readonly VerificationFailure[] };

export interface VerifyInput {
  readonly candidate: CandidateQuestion;
  readonly sessionId: string;
  readonly expectedTopicId: string;
  readonly similarityStatus?: SimilarityStatus;
}

export function verify(input: VerifyInput): VerificationOutcome {
  const { candidate, sessionId, expectedTopicId } = input;
  const failures: VerificationFailure[] = [];

  failures.push(...checkShape(candidate));
  failures.push(...checkTopic(candidate, expectedTopicId));
  failures.push(...checkSingleCorrectAnswer(candidate));
  failures.push(...checkArithmetic(candidate));
  failures.push(...checkSolution(candidate));
  failures.push(...checkDistractors(candidate));

  const assessment = assessDifficulty(candidate);
  failures.push(...checkDifficultyConsistency(candidate, assessment.difficulty));

  if (failures.length > 0) return { ok: false, failures };

  const qualityScore = scoreQuality(candidate, assessment.difficulty);

  return {
    ok: true,
    qualityScore,
    question: {
      questionId: candidate.candidateId,
      sessionId,
      topicId: candidate.spec.topicId,
      conceptId: candidate.spec.conceptId,
      questionType: candidate.spec.questionType,
      /* The MEASURED band, never the requested one. */
      difficulty: assessment.difficulty,
      questionText: candidate.questionText,
      options: candidate.options,
      correctOption: candidate.correctOption,
      fullSolution: candidate.fullSolution,
      reasoningStructure: candidate.spec.reasoningStructure,
      prerequisites: candidate.spec.prerequisites,
      generationSource: candidate.generationSource,
      verificationStatus: 'PASSED',
      similarityStatus: input.similarityStatus ?? 'UNIQUE',
      qualityScore,
      fingerprint: fingerprintOf(candidate),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

function checkShape(candidate: CandidateQuestion): VerificationFailure[] {
  const out: VerificationFailure[] = [];

  if (candidate.questionText.trim().length < 10) {
    out.push({ check: 'well_formed', detail: 'Question text is too short to be a question.' });
  }

  if (candidate.options.length !== OPTION_KEYS.length) {
    out.push({
      check: 'well_formed',
      detail: `Expected ${OPTION_KEYS.length} options, got ${candidate.options.length}.`,
    });
    return out;
  }

  const keys = candidate.options.map((option) => option.key);
  const missing = OPTION_KEYS.filter((key) => !keys.includes(key));
  if (missing.length > 0) {
    out.push({ check: 'well_formed', detail: `Missing option key(s): ${missing.join(', ')}.` });
  }

  if (new Set(keys).size !== keys.length) {
    out.push({ check: 'well_formed', detail: 'Option keys are not unique.' });
  }

  if (candidate.options.some((option) => option.text.trim().length === 0)) {
    out.push({ check: 'well_formed', detail: 'An option has no text.' });
  }

  if (!keys.includes(candidate.correctOption)) {
    out.push({
      check: 'answer_exists',
      detail: `Correct option ${candidate.correctOption} is not among the options.`,
    });
  }

  return out;
}

/**
 * Two options are the same option when they say the same thing.
 *
 * WHY THIS IS NOT `skeleton()`, WHICH IS THE OBVIOUS REUSE
 * -------------------------------------------------------
 * `skeleton()` erases every numeral, and it is right to: it compares question
 * WORDING, where "heated to 300 K" and "heated to 450 K" are the same sentence.
 *
 * Applied to options that reasoning inverts. In an option the number IS the
 * content, so erasing it collapsed "200 kPa", "120 kPa", "50 kPa" and "400 kPa"
 * into one string and the verifier declared every numeric question to have four
 * identical answers. Every numeric question in the product would have been
 * rejected, and the failure would have read as "the generator is bad at
 * options" rather than "the check is wrong".
 *
 * So numbers are kept and only presentation is normalised: case, punctuation
 * and spacing. `2.50` and `2.5` still differ here, and they should - the
 * numeric equality check below handles value-identity with a tolerance, which
 * is the right tool for it.
 */
function normaliseOption(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkTopic(candidate: CandidateQuestion, expected: string): VerificationFailure[] {
  if (candidate.spec.topicId === expected) return [];
  return [
    {
      check: 'topic_relevance',
      detail: `Generated for topic ${candidate.spec.topicId}, session is ${expected}.`,
    },
  ];
}

/**
 * Zero valid answers, one, or more than one.
 *
 * Two ways a second correct answer sneaks in, and both are checked:
 *
 * 1. Two options that SAY the same thing. Compared with case, punctuation and
 *    spacing normalised but numbers KEPT — see `normaliseOption` for why
 *    erasing them here is a bug rather than a reuse.
 * 2. For numeric questions, two options whose VALUES both match the computed
 *    answer inside tolerance. A generator writing "2.0" and "2.00" as separate
 *    options has written a question with two correct answers.
 */
function checkSingleCorrectAnswer(candidate: CandidateQuestion): VerificationFailure[] {
  const out: VerificationFailure[] = [];

  const seen = new Map<string, OptionKey[]>();
  for (const option of candidate.options) {
    const normalised = normaliseOption(option.text);
    const group = seen.get(normalised) ?? [];
    group.push(option.key);
    seen.set(normalised, group);
  }

  for (const [normalised, keys] of seen) {
    if (keys.length > 1) {
      out.push({
        check: 'single_correct_answer',
        detail: `Options ${keys.join(' and ')} are the same answer ("${normalised}").`,
      });
    }
  }

  const { computation } = candidate;
  if (computation) {
    const value = evaluate(computation);
    if (value !== null) {
      const matching = candidate.options.filter((option) => {
        const parsed = parseNumeric(option.text);
        return parsed !== null && Math.abs(parsed - value) <= computation.tolerance;
      });

      if (matching.length === 0) {
        out.push({
          check: 'single_correct_answer',
          detail: `No option matches the computed answer ${value}.`,
        });
      } else if (matching.length > 1) {
        out.push({
          check: 'single_correct_answer',
          detail: `Options ${matching.map((o) => o.key).join(', ')} all match ${value}.`,
        });
      } else if (matching[0]?.key !== candidate.correctOption) {
        out.push({
          check: 'single_correct_answer',
          detail: `Answer key says ${candidate.correctOption}, arithmetic says ${matching[0]?.key}.`,
        });
      }
    }
  }

  return out;
}

/**
 * Recompute the arithmetic and compare against what the generator claimed.
 *
 * This is the check that cannot be satisfied by writing a confident solution.
 */
function checkArithmetic(candidate: CandidateQuestion): VerificationFailure[] {
  const { computation } = candidate;
  if (!computation) return [];

  const value = evaluate(computation);
  if (value === null) {
    return [
      {
        check: 'calculation_correctness',
        detail: 'The declared computation does not resolve: an operand is undefined.',
      },
    ];
  }

  if (Math.abs(value - computation.expected) > computation.tolerance) {
    return [
      {
        check: 'calculation_correctness',
        detail: `Declared ${computation.expected}, recomputed ${value} from the stated inputs.`,
      },
    ];
  }

  return [];
}

/**
 * Run the declared steps.
 *
 * Deliberately not an expression parser. A parser would accept anything and
 * silently evaluate whatever it was handed; this accepts only named operands
 * bound by earlier steps, so a step referring to something that does not exist
 * is a verification failure rather than a NaN travelling quietly downstream.
 */
export function evaluate(computation: NumericComputation): number | null {
  const bindings = new Map<string, number>(Object.entries(computation.inputs));

  for (const step of computation.steps) {
    const left = bindings.get(step.left);
    const right = bindings.get(step.right);
    if (left === undefined || right === undefined) return null;

    let result: number;
    switch (step.op) {
      case 'add': result = left + right; break;
      case 'sub': result = left - right; break;
      case 'mul': result = left * right; break;
      case 'div':
        if (right === 0) return null;
        result = left / right;
        break;
      case 'pow': result = left ** right; break;
    }

    if (!Number.isFinite(result)) return null;
    bindings.set(step.into, result);
  }

  const last = computation.steps[computation.steps.length - 1];
  if (!last) return null;
  return bindings.get(last.into) ?? null;
}

/** Read a number out of an option like "42.5 kPa" or "-3". */
export function parseNumeric(text: string): number | null {
  const match = text.trim().match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * A solution has to explain, not announce.
 *
 * "Option C is correct" is the failure mode this catches. It is a restatement
 * of the answer key, and a student who got it wrong learns nothing from it.
 */
function checkSolution(candidate: CandidateQuestion): VerificationFailure[] {
  const solution = candidate.fullSolution.trim();
  const out: VerificationFailure[] = [];

  if (solution.length < 30) {
    out.push({
      check: 'solution_completeness',
      detail: 'The solution is too short to explain anything.',
    });
    return out;
  }

  const announcesOnly = /^(option\s+)?[a-d][.)\s]*(is\s+)?(the\s+)?correct\.?$/i.test(solution);
  if (announcesOnly) {
    out.push({
      check: 'solution_completeness',
      detail: 'The solution states the answer without justifying it.',
    });
  }

  return out;
}

/**
 * Distractors must be wrong for a REASON somebody could have had.
 *
 * A distractor with no rationale is decoration: it tells the learner nothing
 * when they pick it and tells us nothing about what they misunderstood.
 */
function checkDistractors(candidate: CandidateQuestion): VerificationFailure[] {
  const out: VerificationFailure[] = [];

  for (const option of candidate.options) {
    if (option.key === candidate.correctOption) continue;
    if (option.rationale.trim().length === 0) {
      out.push({
        check: 'distractor_quality',
        detail: `Option ${option.key} has no rationale, so it is noise rather than a distractor.`,
      });
    }
  }

  return out;
}

/**
 * The measured band must be near the requested one.
 *
 * One band out is tolerated: difficulty is a judgement and the boundary is a
 * number, so a question can sit legitimately either side of it. Two bands out
 * means the generator was not steering on difficulty at all, and a set built
 * from those has a ladder that does not climb.
 */
function checkDifficultyConsistency(
  candidate: CandidateQuestion,
  measured: ReturnType<typeof assessDifficulty>['difficulty'],
): VerificationFailure[] {
  const distance = bandDistance(measured, candidate.spec.difficultyTarget);
  if (distance < 2) return [];

  return [
    {
      check: 'difficulty_consistency',
      detail: `Asked for ${candidate.spec.difficultyTarget}, the structure measures ${measured}.`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Quality                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How well the question met its own brief. Not how hard it is.
 *
 * Only ever computed for a candidate that has already passed every check, so
 * this is a ranking signal among valid questions, never a bar to clear.
 */
function scoreQuality(
  candidate: CandidateQuestion,
  measured: ReturnType<typeof assessDifficulty>['difficulty'],
): number {
  let score = 1;

  if (bandDistance(measured, candidate.spec.difficultyTarget) === 1) score -= 0.15;

  const rationales = candidate.options.filter(
    (option) => option.key !== candidate.correctOption && option.rationale.trim().length >= 12,
  ).length;
  const distractors = candidate.options.length - 1;
  score -= (1 - rationales / distractors) * 0.2;

  if (candidate.fullSolution.trim().length < 80) score -= 0.1;
  if (candidate.spec.misconceptionTested === null) score -= 0.05;

  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}
