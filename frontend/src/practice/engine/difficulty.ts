import type {
  CandidateQuestion,
  Difficulty,
  QuestionType,
  ReasoningStructure,
} from './types';

/**
 * Difficulty, measured from the question rather than asserted about it.
 *
 * WHY A GENERATED LABEL IS WORTHLESS
 * ----------------------------------
 * Ask a model for a hard question and it will return one labelled "hard". The
 * label is a description of the request, not of the artefact — and a set that
 * trusts it ends up with three one-step lookups all claiming to be hard, which
 * is worse than no difficulty at all because now the ladder lies.
 *
 * So the label is computed from things that are actually present in the
 * question: how many inference steps it takes, how many distinct quantities
 * interact, how much it assumes you already know, how much arithmetic it
 * carries, and how abstract the ask is. A generator's own claim is not an input
 * to this function, and it cannot be.
 *
 * THE FACTORS ARE RETURNED, NOT JUST THE BAND
 * -------------------------------------------
 * "Hard" with no reason behind it cannot be argued with or debugged. When a set
 * comes out lopsided, the factors say which lever did it.
 */

export interface DifficultyFactors {
  /** Inference steps the student must chain. */
  readonly reasoningSteps: number;
  /** Distinct quantities that interact. Two is arithmetic; five is bookkeeping. */
  readonly interactingVariables: number;
  /** Concepts assumed rather than given. */
  readonly prerequisiteLoad: number;
  /** Arithmetic weight: multiplication and powers cost more than addition. */
  readonly calculationComplexity: number;
  /** How far from the concrete the ask sits. */
  readonly abstraction: number;
  /** How much has to be held at once while solving. */
  readonly workingMemory: number;
  /** Seconds a prepared student should need. Derived, not asserted. */
  readonly expectedSolutionSeconds: number;
}

export interface DifficultyAssessment {
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly factors: DifficultyFactors;
  /** One line naming what drove the band, for a human reading a bad set. */
  readonly explanation: string;
}

/**
 * How many inference steps each reasoning structure takes at minimum.
 *
 * These are floors, not estimates. A `multi_step_chain` cannot be a one-step
 * question whatever its numbers look like, and `direct_recall` cannot be three
 * steps however long the sentence is.
 */
const STRUCTURE_STEPS: Readonly<Record<ReasoningStructure, number>> = {
  direct_recall: 1,
  single_step_application: 1,
  classify_instance: 2,
  compare_and_contrast: 2,
  cause_to_effect: 2,
  counterexample: 3,
  effect_to_cause: 3,
  diagnose_error: 3,
  estimate_and_bound: 3,
  multi_step_chain: 4,
};

/**
 * Abstraction by question type.
 *
 * `application` scores highest not because it is hardest in the abstract, but
 * because the student has to build the model before they can use it — the
 * concept is not named for them.
 */
const TYPE_ABSTRACTION: Readonly<Record<QuestionType, number>> = {
  standard: 1,
  conceptual: 2,
  reasoning: 3,
  application: 3,
};

const OP_COST: Readonly<Record<string, number>> = {
  add: 1,
  sub: 1,
  mul: 2,
  div: 2,
  pow: 3,
};

/**
 * The band a question WOULD land in, from the properties a planner knows
 * before anything is generated.
 *
 * WHY THE PLANNER HAS TO USE THIS AND NOT ITS OWN RULE OF THUMB
 * ------------------------------------------------------------
 * The planner used to pick a difficulty target from a ladder and a structure
 * from a step-count table, while the verifier measured the finished question on
 * a richer score that also counts prerequisites, abstraction and arithmetic.
 * Two models, never compared, and the moment they disagreed the verifier
 * rejected questions for failing to be what the planner had asked for — a
 * defect the planner caused and the generator got blamed for.
 *
 * There is one model now. The planner asks this function what it is about to
 * order, and orders something the verifier will agree with.
 */
export function predictBand(input: {
  readonly questionType: QuestionType;
  readonly reasoningStructure: ReasoningStructure;
  readonly prerequisiteCount: number;
  readonly computeSteps: number;
  readonly variableCount: number;
  readonly calculationComplexity: number;
}): Difficulty {
  const reasoningSteps = Math.max(
    STRUCTURE_STEPS[input.reasoningStructure],
    input.computeSteps,
  );

  return band(
    reasoningSteps * 2.0 +
      input.variableCount * 0.8 +
      input.prerequisiteCount * 1.2 +
      input.calculationComplexity * 0.5 +
      TYPE_ABSTRACTION[input.questionType] * 1.0,
  );
}

export function assessDifficulty(candidate: CandidateQuestion): DifficultyAssessment {
  const { spec, computation } = candidate;

  const structureSteps = STRUCTURE_STEPS[spec.reasoningStructure];
  const computeSteps = computation?.steps.length ?? 0;
  /*
   * The floor wins over the arithmetic, not the sum. A three-step calculation
   * inside a `direct_recall` spec means the spec is wrong; adding them would
   * quietly launder that into a "hard" question.
   */
  const reasoningSteps = Math.max(structureSteps, computeSteps);

  const interactingVariables = computation ? Object.keys(computation.inputs).length : 0;
  const prerequisiteLoad = spec.prerequisites.length;

  const calculationComplexity =
    computation?.steps.reduce((total, step) => total + (OP_COST[step.op] ?? 1), 0) ?? 0;

  const abstraction = TYPE_ABSTRACTION[spec.questionType];

  /*
   * Working memory is not a sixth independent axis — it is what the others cost
   * you at once. Chained steps are the expensive part, because each one has to
   * survive until the next; a prerequisite is cheaper because it is recalled,
   * not held.
   */
  const workingMemory = reasoningSteps * 2 + interactingVariables + prerequisiteLoad;

  const expectedSolutionSeconds =
    20 + reasoningSteps * 25 + calculationComplexity * 8 + prerequisiteLoad * 10;

  const score =
    reasoningSteps * 2.0 +
    interactingVariables * 0.8 +
    prerequisiteLoad * 1.2 +
    calculationComplexity * 0.5 +
    abstraction * 1.0;

  const factors: DifficultyFactors = {
    reasoningSteps,
    interactingVariables,
    prerequisiteLoad,
    calculationComplexity,
    abstraction,
    workingMemory,
    expectedSolutionSeconds,
  };

  return {
    difficulty: band(score),
    score: round2(score),
    factors,
    explanation: explain(factors, score),
  };
}

/**
 * Where the bands sit.
 *
 * A one-step recall with no arithmetic scores 3.0 and must be easy. A four-step
 * chain over four variables with two prerequisites scores 15.8 and must be
 * hard. The thresholds are placed so those two land where anyone would put
 * them, and everything else falls out.
 */
export const EASY_CEILING = 6.5;
export const HARD_FLOOR = 11.0;

function band(score: number): Difficulty {
  if (score < EASY_CEILING) return 'easy';
  if (score < HARD_FLOOR) return 'medium';
  return 'hard';
}

function explain(factors: DifficultyFactors, score: number): string {
  const parts: string[] = [`${factors.reasoningSteps} reasoning step(s)`];
  if (factors.interactingVariables > 0) {
    parts.push(`${factors.interactingVariables} interacting variable(s)`);
  }
  if (factors.prerequisiteLoad > 0) parts.push(`${factors.prerequisiteLoad} prerequisite(s)`);
  if (factors.calculationComplexity > 0) {
    parts.push(`calculation weight ${factors.calculationComplexity}`);
  }
  parts.push(`abstraction ${factors.abstraction}`);
  return `${parts.join(', ')} -> score ${round2(score)} (${band(score)})`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** How far apart two bands are: 0 same, 1 adjacent, 2 opposite ends. */
export function bandDistance(a: Difficulty, b: Difficulty): number {
  const order: Difficulty[] = ['easy', 'medium', 'hard'];
  return Math.abs(order.indexOf(a) - order.indexOf(b));
}
