import { predictBand } from './difficulty';
import {
  REASONING_STRUCTURES,
  type Difficulty,
  type QuestionCount,
  type QuestionSpec,
  type QuestionType,
  type ReasoningStructure,
} from './types';

/**
 * Deciding what the set should contain, before anything generates it.
 *
 * WHY THE MIX IS COMPUTED AND NOT A CONSTANT
 * ------------------------------------------
 * A fixed "3 standard, 3 conceptual, 2 reasoning, 2 application" is wrong for
 * almost every topic. Rotational motion earns its questions through
 * application; a topic like "what a limit means" earns almost none that way and
 * needs conceptual work instead. Hardcoding the split makes one of those two
 * topics badly served, permanently, and you cannot tell which from the code.
 *
 * So the split is derived from a property of the topic — how much of it is
 * quantitative — and the derivation is a pure function anyone can read and
 * argue with.
 *
 * WHY IT IS DETERMINISTIC AND NOT RANDOM
 * --------------------------------------
 * Random variety is unreproducible: a bad set cannot be re-run, and "the model
 * had an off day" becomes unfalsifiable. The same topic and count always
 * produce the same plan here. Variety comes from the plan being genuinely
 * varied, not from a dice roll.
 */

export interface Concept {
  readonly id: string;
  readonly name: string;
  /** Whether this concept supports questions with arithmetic in them. */
  readonly numeric: boolean;
  readonly prerequisites: readonly string[];
  /** The mistake this concept is most often got wrong by, when there is one. */
  readonly commonMisconception: string | null;
}

export interface TopicProfile {
  readonly topicId: string;
  readonly chapterId: string;
  readonly concepts: readonly Concept[];
  /**
   * 0 = purely qualitative, 1 = purely computational. Drives the mix.
   * A property of the subject matter, not a knob for tuning difficulty.
   */
  readonly quantitative: number;
}

/* -------------------------------------------------------------------------- */
/* Type mix                                                                   */
/* -------------------------------------------------------------------------- */

export type TypeMix = Readonly<Record<QuestionType, number>>;

/**
 * How many of each type, for this topic at this size.
 *
 * Every set keeps at least one of each type: a practice set with no conceptual
 * question cannot tell "can compute it" from "understands it", and that
 * distinction is most of what practice is for. The quantitative score moves the
 * remainder between application/reasoning and conceptual.
 */
export function typeMixFor(profile: TopicProfile, count: QuestionCount): TypeMix {
  const q = clamp01(profile.quantitative);

  const base: Record<QuestionType, number> = {
    standard: 1,
    conceptual: 1,
    reasoning: 1,
    application: 1,
  };

  /*
   * Four are spoken for. The rest are shared out by weight, then the largest
   * remainder takes any rounding slack so the total always lands exactly on
   * `count` — a mix summing to 9 or 11 for a 10-question set is the kind of
   * bug that shows up as one missing question much later.
   */
  const remaining = count - 4;
  const weights: Record<QuestionType, number> = {
    standard: 0.2 + q * 0.05,
    conceptual: 0.4 - q * 0.2,
    reasoning: 0.2 + q * 0.05,
    application: 0.2 + q * 0.1,
  };

  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const exact: Record<QuestionType, number> = {
    standard: (weights.standard / total) * remaining,
    conceptual: (weights.conceptual / total) * remaining,
    reasoning: (weights.reasoning / total) * remaining,
    application: (weights.application / total) * remaining,
  };

  const types: QuestionType[] = ['standard', 'conceptual', 'reasoning', 'application'];
  for (const type of types) base[type] += Math.floor(exact[type]);

  let assigned = types.reduce((sum, type) => sum + base[type], 0);
  const byRemainder = [...types].sort((a, b) => (exact[b] % 1) - (exact[a] % 1));
  let i = 0;
  while (assigned < count) {
    const type = byRemainder[i % byRemainder.length];
    if (type) {
      base[type] += 1;
      assigned += 1;
    }
    i += 1;
  }

  return base;
}

/* -------------------------------------------------------------------------- */
/* Difficulty ladder                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A set should climb, and should not be all one band.
 *
 * Roughly 30% easy, 45% medium, 25% hard, ordered so the student meets an easy
 * one first. Starting on the hardest question is how a practice set convinces
 * someone they cannot do the topic before they have tried.
 */
export function difficultyLadder(count: QuestionCount): readonly Difficulty[] {
  const easy = Math.max(1, Math.round(count * 0.3));
  const hard = Math.max(1, Math.round(count * 0.25));
  const medium = count - easy - hard;

  return [
    ...Array<Difficulty>(easy).fill('easy'),
    ...Array<Difficulty>(medium).fill('medium'),
    ...Array<Difficulty>(hard).fill('hard'),
  ];
}

/* -------------------------------------------------------------------------- */
/* Reasoning structures                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which inference shapes suit which question type.
 *
 * The lists are ordered, and the order is the diversity mechanism: walking them
 * position by position means a set of ten never uses the same structure twice
 * until it has used ten different ones.
 */
const STRUCTURES_BY_TYPE: Readonly<Record<QuestionType, readonly ReasoningStructure[]>> = {
  standard: ['direct_recall', 'single_step_application', 'classify_instance'],
  conceptual: ['compare_and_contrast', 'counterexample', 'classify_instance', 'direct_recall'],
  reasoning: ['multi_step_chain', 'effect_to_cause', 'diagnose_error', 'cause_to_effect'],
  application: ['single_step_application', 'multi_step_chain', 'estimate_and_bound', 'cause_to_effect'],
};

/**
 * The step range each band admits.
 *
 * THE CEILING IS NOT SYMMETRY, IT IS THE BUG
 * ------------------------------------------
 * A floor alone reads as sufficient: hard questions need at least three steps,
 * easy ones need at least none. But "at least none" admits everything, so
 * rotation happily handed a four-step `multi_step_chain` to a slot the ladder
 * had marked easy. The verifier then measured that question as hard, disagreed
 * with its own plan by two bands, and rejected it — a rejection caused entirely
 * by the planner asking for something incoherent.
 *
 * Caught by the verifier refusing spec `t-1`, which is the check doing exactly
 * what it is for: the plan was wrong and the plan is what got fixed.
 */
const MIN_STEPS_FOR: Readonly<Record<Difficulty, number>> = { easy: 1, medium: 2, hard: 3 };
const MAX_STEPS_FOR: Readonly<Record<Difficulty, number>> = { easy: 2, medium: 3, hard: 4 };

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
 * Pick a structure that fits both the type and the difficulty target.
 *
 * Falling back to the whole vocabulary rather than to a default matters: a
 * default would quietly make every hard question a `multi_step_chain`, which is
 * exactly the sameness this module exists to prevent.
 */
function structureFor(
  type: QuestionType,
  difficulty: Difficulty,
  prerequisiteCount: number,
  rotation: number,
  taken: ReadonlySet<string>,
  conceptId: string,
  usedStructures: ReadonlySet<ReasoningStructure>,
): ReasoningStructure {
  const min = MIN_STEPS_FOR[difficulty];
  const max = MAX_STEPS_FOR[difficulty];

  const inRange = (s: ReasoningStructure) =>
    STRUCTURE_STEPS[s] >= min && STRUCTURE_STEPS[s] <= max;

  /*
   * Agreeing with the verifier is the first filter, not a later adjustment.
   * `predictBand` is the same scoring the verifier will apply, so a structure
   * that fails here would have been rejected downstream for a mismatch the
   * planner created.
   */
  const agrees = (s: ReasoningStructure) =>
    predictBand({
      questionType: type,
      reasoningStructure: s,
      prerequisiteCount,
      computeSteps: 0,
      variableCount: 0,
      calculationComplexity: 0,
    }) === difficulty;

  /*
   * A concept asked the same way twice is one question asked twice, and the
   * deduplicator will say so. Cheaper to never plan it than to generate it,
   * verify it and throw it away.
   */
  const unused = (s: ReasoningStructure) => !taken.has(`${conceptId}|${s}`);

  /*
   * A structure not yet used ANYWHERE in this set is preferred over one merely
   * unused for this concept.
   *
   * Concept-level uniqueness is not enough on its own: two different concepts
   * asked by the same route read as the same question, because the route is
   * what shapes the sentence. Measured, not assumed — the deduplicator scored
   * exactly that pair at 0.70 and called it "different concept, identical
   * template and route". Spreading the routes first is what makes ten questions
   * ten questions.
   */
  const fresh = (s: ReasoningStructure) => !usedStructures.has(s);

  const tiers: readonly (readonly ReasoningStructure[])[] = [
    STRUCTURES_BY_TYPE[type].filter((s) => inRange(s) && agrees(s) && unused(s) && fresh(s)),
    REASONING_STRUCTURES.filter((s) => inRange(s) && agrees(s) && unused(s) && fresh(s)),
    REASONING_STRUCTURES.filter((s) => inRange(s) && unused(s) && fresh(s)),
    STRUCTURES_BY_TYPE[type].filter((s) => inRange(s) && agrees(s) && unused(s)),
    REASONING_STRUCTURES.filter((s) => inRange(s) && agrees(s) && unused(s)),
    REASONING_STRUCTURES.filter((s) => inRange(s) && unused(s)),
    STRUCTURES_BY_TYPE[type].filter(inRange),
    STRUCTURES_BY_TYPE[type],
  ];

  for (const tier of tiers) {
    if (tier.length > 0) return tier[rotation % tier.length] ?? tier[0]!;
  }
  return 'single_step_application';
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build one spec per question.
 *
 * Concepts rotate so a five-concept topic asked for ten questions covers all
 * five twice rather than asking about the first one ten times. Type, difficulty
 * and structure are assigned independently of each other, which is what stops
 * "hard" from silently meaning "application" throughout.
 */
export function buildPlan(profile: TopicProfile, count: QuestionCount): readonly QuestionSpec[] {
  if (profile.concepts.length === 0) return [];

  const mix = typeMixFor(profile, count);
  const ladder = difficultyLadder(count);

  const types: QuestionType[] = [];
  for (const type of ['standard', 'conceptual', 'reasoning', 'application'] as QuestionType[]) {
    for (let i = 0; i < mix[type]; i += 1) types.push(type);
  }

  /*
   * Interleave the types rather than serving them in blocks, so the student
   * does not get four recall questions and then four applications. Difficulty
   * stays in ladder order because that one is meant to climb.
   */
  const interleaved = interleave(types, mix);

  const specs: QuestionSpec[] = [];
  const taken = new Set<string>();
  const usedStructures = new Set<ReasoningStructure>();

  for (let index = 0; index < count; index += 1) {
    const concept = profile.concepts[index % profile.concepts.length];
    if (!concept) continue;

    const questionType = interleaved[index] ?? 'standard';
    const difficultyTarget = ladder[index] ?? 'medium';

    const reasoningStructure = structureFor(
      questionType,
      difficultyTarget,
      concept.prerequisites.length,
      index,
      taken,
      concept.id,
      usedStructures,
    );
    taken.add(`${concept.id}|${reasoningStructure}`);
    usedStructures.add(reasoningStructure);
    /* Ten structures exist; a 15-question set must reuse them. Reset once every
       route has been spent so the second pass spreads as evenly as the first. */
    if (usedStructures.size >= REASONING_STRUCTURES.length) usedStructures.clear();

    specs.push({
      specId: `${profile.topicId}-${index}`,
      topicId: profile.topicId,
      chapterId: profile.chapterId,
      conceptId: concept.id,
      conceptName: concept.name,
      questionType,
      difficultyTarget,
      reasoningStructure,
      prerequisites: concept.prerequisites,
      misconceptionTested: concept.commonMisconception,
    });
  }

  return specs;
}

/** Round-robin the types so no two neighbours share one where it is avoidable. */
function interleave(types: readonly QuestionType[], mix: TypeMix): QuestionType[] {
  const buckets = new Map<QuestionType, QuestionType[]>();
  for (const type of types) {
    const bucket = buckets.get(type) ?? [];
    bucket.push(type);
    buckets.set(type, bucket);
  }

  const order = [...buckets.keys()].sort((a, b) => mix[b] - mix[a]);
  const out: QuestionType[] = [];

  while (out.length < types.length) {
    let placed = false;
    for (const type of order) {
      const bucket = buckets.get(type);
      const next = bucket?.pop();
      if (next) {
        out.push(next);
        placed = true;
      }
    }
    if (!placed) break;
  }

  return out;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
