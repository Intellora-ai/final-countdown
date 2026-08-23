/**
 * The practice session domain.
 *
 * WHY THE ANSWER IS NOT ON THE TYPE THE STUDENT RECEIVES
 * -----------------------------------------------------
 * A practice session must never show a question before its answer is known and
 * verified, and must never reveal that answer before the student has committed
 * to an option. Both are usually enforced by discipline: remember not to send
 * the field, remember not to render it.
 *
 * Discipline is the wrong mechanism, because the failure is silent and the
 * damage is total — one `JSON.stringify(question)` in a debug payload and the
 * answer key ships to the client. So the two shapes are different types.
 * `VerifiedQuestion` carries the answer and never leaves the engine.
 * `DeliverableQuestion` is what a screen may hold, and it has no field to leak:
 * `correctOption` and `fullSolution` do not exist on it. Forgetting to strip
 * them is not a mistake you can make, because there is nothing to strip — you
 * have to call `forDelivery()` to get the student's shape at all.
 *
 * The reveal is a separate, deliberate act (`reveal()`), and it only works on a
 * question the student has already answered.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The four shapes a question can take. All of them are MCQs — this is what the
 * question ASKS FOR, not how it is presented.
 *
 * standard     recall or direct application of a single stated rule
 * conceptual   why the rule holds; distinguishing it from a near neighbour
 * reasoning    multi-step inference where each step depends on the last
 * application  the concept embedded in a situation that must first be modelled
 */
export const QUESTION_TYPES = ['standard', 'conceptual', 'reasoning', 'application'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * The only counts a session may be started with.
 *
 * Not a range. The panel offers three buttons and the product specifies three
 * values, so an arbitrary 7 is not a smaller version of a legal request — it is
 * a request nobody was ever offered, and it would arrive only from a hand-built
 * payload or a bug.
 */
export const QUESTION_COUNTS = [5, 10, 15] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

export function isQuestionCount(value: number): value is QuestionCount {
  return (QUESTION_COUNTS as readonly number[]).includes(value);
}

/** Four options, fixed. A fifth would change what "exactly one correct" means. */
export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export function isOptionKey(value: string): value is OptionKey {
  return (OPTION_KEYS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every state a session can be in.
 *
 * `EXITED`, `TIMED_OUT` and `SUBMITTED` are all legitimate ends, and they are
 * NOT the same event. A session that assumed `IN_PROGRESS → COMPLETED` would
 * have to record a student who left after two questions as either finished or
 * never started, and both of those are lies the analytics would then repeat.
 *
 * COMPLETED is reserved for "answered everything and submitted". SUBMITTED is
 * "sent it in", which may be partial. They are distinguished because a partial
 * submission and a full one mean different things about the learner.
 */
export const SESSION_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'EXITED',
  'SUBMITTED',
  'TIMED_OUT',
  'COMPLETED',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Once a session reaches one of these it accepts no further answers. */
export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  'EXITED',
  'SUBMITTED',
  'TIMED_OUT',
  'COMPLETED',
];

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/* -------------------------------------------------------------------------- */
/* Failure                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why a set could not be produced.
 *
 * Each of these is a REFUSAL, not a degraded result. There is deliberately no
 * `PARTIAL` or `BEST_EFFORT` member: the one thing the engine must never do is
 * hand over an unverified question because the clock ran out, and the surest
 * way to guarantee that is to leave no way to express it.
 */
export const ENGINE_FAILURES = [
  'INVALID_TOPIC',
  'INVALID_REQUEST',
  'MODEL_UNAVAILABLE',
  'TOOL_FAILURE',
  'QUESTION_GENERATION_FAILED',
  'VERIFICATION_FAILED',
  'INSUFFICIENT_VALID_CANDIDATES',
  'TIMEOUT',
] as const;
export type EngineFailure = (typeof ENGINE_FAILURES)[number];

export interface EngineError {
  readonly failure: EngineFailure;
  /** Plain sentence for a human reading a log or an error screen. */
  readonly detail: string;
  /** How many valid questions did exist when we gave up. Diagnoses near-misses. */
  readonly obtained: number;
  readonly requested: number;
}

/* -------------------------------------------------------------------------- */
/* What a question must satisfy before it exists                              */
/* -------------------------------------------------------------------------- */

/**
 * The brief for ONE question, decided before anything generates it.
 *
 * Difficulty is a TARGET here, not a claim. What comes back is measured against
 * its own structure (see `difficulty.ts`) and the measurement wins. A generator
 * that returns `difficulty: "hard"` for a one-step lookup is not describing the
 * question, it is describing its intent, and intent is not a property of the
 * artefact.
 */
export interface QuestionSpec {
  readonly specId: string;
  readonly topicId: string;
  readonly chapterId: string;
  /** The specific idea under test. Narrower than the topic. */
  readonly conceptId: string;
  readonly questionType: QuestionType;
  readonly difficultyTarget: Difficulty;
  /** How the student has to get from the given to the asked. */
  readonly reasoningStructure: ReasoningStructure;
  /** Concepts the question is allowed to assume. Recorded, not silently used. */
  readonly prerequisites: readonly string[];
  /** The misconception the distractors should separate out, when there is one. */
  readonly misconceptionTested: string | null;
}

/**
 * The shape of the inference, which is the main lever on diversity.
 *
 * Two questions on the same concept with different reasoning structures are
 * genuinely different questions. Two with the same structure and different
 * numbers are the same question wearing a hat, which is exactly what a set of
 * ten "diverse" questions usually turns out to be.
 */
export const REASONING_STRUCTURES = [
  'direct_recall',
  'single_step_application',
  'multi_step_chain',
  'compare_and_contrast',
  'cause_to_effect',
  'effect_to_cause',
  'counterexample',
  'estimate_and_bound',
  'classify_instance',
  'diagnose_error',
] as const;
export type ReasoningStructure = (typeof REASONING_STRUCTURES)[number];

/* -------------------------------------------------------------------------- */
/* Questions                                                                  */
/* -------------------------------------------------------------------------- */

export interface QuestionOption {
  readonly key: OptionKey;
  readonly text: string;
  /**
   * Why a student might pick this one. Empty for the correct option.
   *
   * A distractor without a rationale is decoration: it tells the learner
   * nothing when they get it wrong, and it tells us nothing about what they
   * misunderstood. Requiring the field is how "plausible distractor" stops
   * being an aspiration.
   */
  readonly rationale: string;
}

/** What a generator hands back. Nothing here is trusted yet. */
export interface CandidateQuestion {
  readonly candidateId: string;
  readonly spec: QuestionSpec;
  readonly questionText: string;
  readonly options: readonly QuestionOption[];
  readonly correctOption: OptionKey;
  readonly fullSolution: string;
  /** Which generator produced it, for tracing a bad batch back to its source. */
  readonly generationSource: string;
  /**
   * Present only when the question is numeric. The verifier recomputes from
   * these rather than believing the stated answer.
   */
  readonly computation: NumericComputation | null;
}

/**
 * A numeric question's arithmetic, stated so it can be checked independently.
 *
 * The generator says what the inputs are, which operation chain applies, and
 * what it got. The verifier runs the chain itself and compares. This is the
 * difference between "the solution says 42" and "42 is what these numbers do".
 */
export interface NumericComputation {
  readonly inputs: Readonly<Record<string, number>>;
  readonly steps: readonly NumericStep[];
  readonly expected: number;
  readonly tolerance: number;
  readonly unit: string | null;
}

export interface NumericStep {
  readonly op: 'add' | 'sub' | 'mul' | 'div' | 'pow';
  /** Names of earlier inputs or step results. */
  readonly left: string;
  readonly right: string;
  /** Name this step's result is bound to, usable by later steps. */
  readonly into: string;
}

export type VerificationStatus = 'PASSED' | 'FAILED';
export type SimilarityStatus = 'UNIQUE' | 'NEAR_DUPLICATE' | 'DUPLICATE';

/**
 * A candidate that survived verification. Only these may be delivered.
 *
 * There is no constructor for this type outside `verify.ts`, and that is the
 * point: "verified" is not a boolean somebody sets, it is the only way an
 * instance comes into existence.
 */
export interface VerifiedQuestion {
  readonly questionId: string;
  readonly sessionId: string;
  readonly topicId: string;
  readonly conceptId: string;
  readonly questionType: QuestionType;
  /** Measured from structure, which may differ from the spec's target. */
  readonly difficulty: Difficulty;
  readonly questionText: string;
  readonly options: readonly QuestionOption[];
  readonly correctOption: OptionKey;
  readonly fullSolution: string;
  readonly reasoningStructure: ReasoningStructure;
  readonly prerequisites: readonly string[];
  readonly generationSource: string;
  readonly verificationStatus: 'PASSED';
  readonly similarityStatus: SimilarityStatus;
  /** 0..1. How well it met its own spec, not how hard it is. */
  readonly qualityScore: number;
  /** Stable structural signature, for cross-session duplicate avoidance. */
  readonly fingerprint: string;
}

/**
 * The student's shape. No answer, no solution, no rationales.
 *
 * The rationales go too: a distractor that explains why it is wrong is an
 * answer key written sideways.
 */
export interface DeliverableQuestion {
  readonly questionId: string;
  readonly questionText: string;
  readonly options: readonly { readonly key: OptionKey; readonly text: string }[];
  readonly questionType: QuestionType;
  readonly difficulty: Difficulty;
}

/** Strip a verified question down to what a screen may hold. */
export function forDelivery(question: VerifiedQuestion): DeliverableQuestion {
  return {
    questionId: question.questionId,
    questionText: question.questionText,
    options: question.options.map((option) => ({ key: option.key, text: option.text })),
    questionType: question.questionType,
    difficulty: question.difficulty,
  };
}

/** What the student sees once they have committed to an option. */
export interface RevealedAnswer {
  readonly questionId: string;
  readonly correctOption: OptionKey;
  readonly fullSolution: string;
  readonly options: readonly QuestionOption[];
}

/* -------------------------------------------------------------------------- */
/* Per-question evidence                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What actually happened on one question.
 *
 * Storing `score: 7/10` throws away everything that would let the next session
 * be better than this one. Which concept, which reasoning structure, which
 * distractor they fell for, and how long they took are the whole signal; the
 * total is a summary of it that anyone can recompute.
 */
export interface QuestionAttempt {
  readonly questionId: string;
  readonly conceptId: string;
  readonly questionType: QuestionType;
  readonly difficulty: Difficulty;
  readonly reasoningStructure: ReasoningStructure;
  /** Null when the session ended before the student reached it. */
  readonly selectedOption: OptionKey | null;
  readonly correct: boolean;
  readonly timeSpentMs: number;
  /**
   * The rationale of the option they chose, when they chose a wrong one. This
   * is the mistake pattern, in the question author's own words.
   */
  readonly mistakePattern: string | null;
}

export interface SessionResult {
  readonly sessionId: string;
  readonly topicId: string;
  readonly status: SessionStatus;
  readonly requested: number;
  readonly attempts: readonly QuestionAttempt[];
  readonly correctCount: number;
  readonly answeredCount: number;
  readonly elapsedMs: number;
}
