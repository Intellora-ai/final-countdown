import type { Concept } from './plan';
import type { Difficulty, QuestionAttempt, SessionResult } from './types';

/**
 * What the per-question record is FOR.
 *
 * THE EVIDENCE WAS BEING STORED AND NOTHING READ IT
 * ------------------------------------------------
 * Every attempt already carries the concept, the reasoning route, the measured
 * difficulty and — when the learner picked a distractor — the misconception its
 * author wrote down. That is a far richer signal than "7 out of 10", and until
 * this module existed it went straight into storage and stopped.
 *
 * A score tells a learner they got three wrong. This tells them the three were
 * all the same idea, that they were all the same inference shape, and that they
 * all came from the same misunderstanding. Those are different problems with
 * different fixes, and only the second reading suggests one.
 *
 * WHY IT FEEDS THE NEXT SET RATHER THAN A DASHBOARD
 * -------------------------------------------------
 * A learner does not need a chart. They need the next ten questions to be about
 * the thing they are getting wrong. `orderByNeed` is the payoff: the planner
 * already rotates through concepts, so putting the weak ones first is enough to
 * change what a set is about without touching the planner at all.
 */

export interface ConceptMastery {
  readonly conceptId: string;
  readonly attempts: number;
  readonly correct: number;
  /** 0..1, or null when never attempted. */
  readonly accuracy: number | null;
  /** Hardest band the learner has answered correctly. Null if none. */
  readonly ceiling: Difficulty | null;
  /** Misconceptions they fell for, most frequent first. */
  readonly mistakes: readonly { pattern: string; count: number }[];
  /** Median seconds spent. Slow AND correct is a different state from fast AND correct. */
  readonly medianSeconds: number;
}

export interface LearnerSignal {
  readonly byConcept: readonly ConceptMastery[];
  /** Weakest first. What the next set should be about. */
  readonly needsWork: readonly string[];
  /** Misconceptions recurring across concepts — a habit, not a gap. */
  readonly recurringMistakes: readonly { pattern: string; count: number }[];
  readonly totalAttempts: number;
}

const BAND_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** Below this, a concept is worth revisiting rather than moving past. */
export const SHAKY_BELOW = 0.7;
/** One attempt is an anecdote. Two is the least that can trend. */
export const MIN_ATTEMPTS_TO_JUDGE = 2;

export function signalFrom(history: readonly SessionResult[]): LearnerSignal {
  const attempts = history.flatMap((result) => result.attempts).filter(answered);

  const byId = new Map<string, QuestionAttempt[]>();
  for (const attempt of attempts) {
    const list = byId.get(attempt.conceptId) ?? [];
    list.push(attempt);
    byId.set(attempt.conceptId, list);
  }

  const byConcept = [...byId.entries()].map(([conceptId, list]) => masteryOf(conceptId, list));

  return {
    byConcept,
    needsWork: rankByNeed(byConcept),
    recurringMistakes: recurring(attempts),
    totalAttempts: attempts.length,
  };
}

function answered(attempt: QuestionAttempt): boolean {
  return attempt.selectedOption !== null;
}

function masteryOf(conceptId: string, attempts: readonly QuestionAttempt[]): ConceptMastery {
  const correct = attempts.filter((a) => a.correct).length;

  /*
   * The ceiling is the hardest band they got RIGHT, not the hardest they were
   * shown. Being handed a hard question proves nothing about the learner.
   */
  let ceiling: Difficulty | null = null;
  for (const attempt of attempts) {
    if (!attempt.correct) continue;
    if (ceiling === null || BAND_ORDER.indexOf(attempt.difficulty) > BAND_ORDER.indexOf(ceiling)) {
      ceiling = attempt.difficulty;
    }
  }

  return {
    conceptId,
    attempts: attempts.length,
    correct,
    accuracy: attempts.length === 0 ? null : correct / attempts.length,
    ceiling,
    mistakes: countPatterns(attempts),
    medianSeconds: median(attempts.map((a) => a.timeSpentMs / 1000)),
  };
}

/**
 * Weakest first, and a concept seen once does not outrank one seen five times.
 *
 * A single wrong answer scores 0% accuracy, which would otherwise dominate the
 * ranking forever on the strength of one unlucky question. Confidence scales
 * with attempts, so a concept has to be repeatedly weak to lead.
 */
function rankByNeed(masteries: readonly ConceptMastery[]): readonly string[] {
  return [...masteries]
    .filter((m) => m.accuracy !== null && m.accuracy < SHAKY_BELOW)
    .sort((a, b) => needScore(b) - needScore(a))
    .map((m) => m.conceptId);
}

function needScore(mastery: ConceptMastery): number {
  const accuracy = mastery.accuracy ?? 1;
  const confidence = Math.min(1, mastery.attempts / MIN_ATTEMPTS_TO_JUDGE);
  return (1 - accuracy) * confidence;
}

/**
 * Misconceptions appearing under more than one concept.
 *
 * This is the distinction a score cannot make. Getting three questions wrong on
 * one idea is a gap. Getting three wrong across three ideas for the SAME stated
 * reason is a habit, and the second is both more useful to hear and more
 * fixable.
 */
function recurring(
  attempts: readonly QuestionAttempt[],
): readonly { pattern: string; count: number }[] {
  const conceptsByPattern = new Map<string, Set<string>>();
  const counts = new Map<string, number>();

  for (const attempt of attempts) {
    const pattern = attempt.mistakePattern;
    if (attempt.correct || !pattern) continue;

    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    const concepts = conceptsByPattern.get(pattern) ?? new Set<string>();
    concepts.add(attempt.conceptId);
    conceptsByPattern.set(pattern, concepts);
  }

  return [...counts.entries()]
    .filter(([pattern]) => (conceptsByPattern.get(pattern)?.size ?? 0) > 1)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);
}

function countPatterns(
  attempts: readonly QuestionAttempt[],
): readonly { pattern: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    if (attempt.correct || !attempt.mistakePattern) continue;
    counts.set(attempt.mistakePattern, (counts.get(attempt.mistakePattern) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round1(sorted[mid] ?? 0);
  return round1(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* -------------------------------------------------------------------------- */
/* Feeding the next set                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Put the concepts a learner is getting wrong at the front.
 *
 * The planner rotates through concepts in order, so reordering is the entire
 * mechanism — no planner change, no special case, and a topic with no history
 * comes back untouched.
 *
 * Deliberately a REORDER and not a filter. Practising only the weak concepts
 * would stop testing the rest, and a learner who has quietly forgotten
 * something they once knew would never be shown it again.
 */
export function orderByNeed(
  concepts: readonly Concept[],
  signal: LearnerSignal,
): readonly Concept[] {
  if (signal.needsWork.length === 0) return concepts;

  const rank = new Map(signal.needsWork.map((id, index) => [id, index]));
  return [...concepts].sort((a, b) => {
    const rankA = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
    const rankB = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
    return rankA - rankB;
  });
}

/**
 * What to tell the learner, in their words rather than in metrics.
 *
 * Empty when there is nothing worth saying. A message on every session trains
 * people to skip it, and then the one that mattered gets skipped too.
 */
export function adviceFrom(signal: LearnerSignal): readonly string[] {
  const out: string[] = [];
  if (signal.totalAttempts < MIN_ATTEMPTS_TO_JUDGE) return out;

  const habit = signal.recurringMistakes[0];
  if (habit && habit.count > 1) {
    out.push(`Across different ideas, the same slip keeps coming up: ${habit.pattern}.`);
  }

  const weakest = signal.byConcept
    .filter((m) => m.accuracy !== null && m.accuracy < SHAKY_BELOW && m.attempts >= MIN_ATTEMPTS_TO_JUDGE)
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1))[0];

  if (weakest) {
    out.push(
      `${weakest.correct} of ${weakest.attempts} right on ${weakest.conceptId.replace(/-/g, ' ')} — worth another pass.`,
    );
  }

  return out;
}
