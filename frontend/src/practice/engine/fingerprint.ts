import type { CandidateQuestion, SimilarityStatus } from './types';

/**
 * Telling two questions apart, when changing the numbers is not a difference.
 *
 * THE FAILURE THIS EXISTS TO PREVENT
 * ----------------------------------
 * Ask for ten diverse questions on one topic and what usually comes back is one
 * question ten times: same concept, same inference, same sentence shape, with
 * 4.2 where 3.7 used to be. Every pair is a different string, so exact-match
 * deduplication reports ten unique questions and the student does the same
 * exercise ten times.
 *
 * So similarity is measured on STRUCTURE, and the surface is compared only
 * after the numbers have been erased. Two questions are the same question when
 * they test the same idea by the same route, however different they read.
 *
 * FOUR SIGNALS, BECAUSE ANY ONE OF THEM ALONE IS FOOLED
 * ----------------------------------------------------
 * Skeleton similarity catches "same sentence, new numbers" but not a genuine
 * rewrite of the same idea. Structural identity catches the rewrite but fires
 * on questions that merely share a concept and honestly differ. Numeric shape
 * catches templated arithmetic that has been reworded. Answer-position pattern
 * catches nothing on its own and is deliberately weak — it exists so that a set
 * whose answer is always C is visible, not to judge a pair.
 */

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Words that carry no structure. Kept deliberately short: an aggressive
 * stopword list starts deleting the words that distinguish "increase" from
 * "decrease", and then opposite questions look identical.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'in',
  'on', 'at', 'for', 'and', 'or', 'if', 'it', 'its', 'this', 'that', 'these',
  'those', 'what', 'which', 'how', 'why', 'when', 'does', 'do', 'did', 'will',
  'would', 'with', 'as', 'by', 'from', 'has', 'have', 'had',
]);

/**
 * The question with its numbers taken out.
 *
 * Every numeral becomes `#`. This is the whole trick: it makes "a gas at 300 K"
 * and "a gas at 450 K" the same string, which is the correct answer to whether
 * they are the same question.
 */
export function skeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\d]+(?:\.[\d]+)?/g, '#')
    .replace(/[^a-z#\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word))
    .join(' ');
}

/** Overlapping word pairs. Pairs keep word order in play; single words do not. */
function shingles(normalised: string): Set<string> {
  const words = normalised.split(' ').filter(Boolean);
  if (words.length <= 1) return new Set(words);

  const out = new Set<string>();
  for (let i = 0; i < words.length - 1; i += 1) out.add(`${words[i]} ${words[i + 1]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/* -------------------------------------------------------------------------- */
/* Fingerprints                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The arithmetic shape, with the actual numbers thrown away.
 *
 * `mul,add` over three inputs is the same shape whether the inputs are
 * (2, 3, 4) or (91, 0.5, 17). Two questions sharing it are one template.
 */
export function numericShape(candidate: CandidateQuestion): string {
  const { computation } = candidate;
  if (!computation) return 'none';

  const ops = computation.steps.map((step) => step.op).join(',');
  const arity = Object.keys(computation.inputs).length;
  return `${arity}:${ops || 'noop'}`;
}

/**
 * A stable signature for one question.
 *
 * Concept, type and reasoning structure identify the exercise; the numeric
 * shape identifies the template; the skeleton hash identifies the wording once
 * numbers are gone. Stable across sessions, so a question served last week can
 * be recognised this week.
 */
export function fingerprintOf(candidate: CandidateQuestion): string {
  const { spec } = candidate;
  const shape = numericShape(candidate);
  const surface = hash(skeleton(candidate.questionText));
  return [spec.conceptId, spec.questionType, spec.reasoningStructure, shape, surface].join('|');
}

/**
 * FNV-1a. Not cryptographic and does not need to be — it identifies wording,
 * and a collision costs one unnecessary regeneration.
 */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36);
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* -------------------------------------------------------------------------- */

export interface SimilarityReport {
  readonly status: SimilarityStatus;
  readonly score: number;
  /** Which signals fired, so a rejection can be explained rather than trusted. */
  readonly reasons: readonly string[];
}

export const DUPLICATE_AT = 0.85;
export const NEAR_DUPLICATE_AT = 0.6;

/**
 * How much two questions are the same question.
 *
 * Exact text match short-circuits to 1. Otherwise the score is the strongest
 * single signal rather than an average: a pair that is structurally identical
 * AND numerically identical is a duplicate even if it has been reworded past
 * all surface resemblance, and averaging would let the rewrite hide it.
 */
export function compare(a: CandidateQuestion, b: CandidateQuestion): SimilarityReport {
  const reasons: string[] = [];

  if (a.questionText.trim() === b.questionText.trim()) {
    return { status: 'DUPLICATE', score: 1, reasons: ['identical text'] };
  }

  const sameConcept = a.spec.conceptId === b.spec.conceptId;
  const sameStructure = a.spec.reasoningStructure === b.spec.reasoningStructure;
  const sameType = a.spec.questionType === b.spec.questionType;
  const sameShape = numericShape(a) === numericShape(b) && numericShape(a) !== 'none';

  const surface = jaccard(shingles(skeleton(a.questionText)), shingles(skeleton(b.questionText)));
  if (surface >= NEAR_DUPLICATE_AT) reasons.push(`wording overlap ${surface.toFixed(2)}`);

  let structural = 0;
  if (sameConcept && sameStructure) {
    structural = sameShape ? 0.95 : 0.75;
    reasons.push(sameShape ? 'same concept, route and template' : 'same concept and route');
    if (sameType) structural += 0.02;
  } else if (sameConcept) {
    structural = 0.4;
    reasons.push('same concept, different route');
  } else if (sameShape && sameStructure) {
    /*
     * Different concepts sharing a route.
     *
     * THIS SAT ABOVE THE NEAR-DUPLICATE THRESHOLD AND SHOULD NOT HAVE.
     * ---------------------------------------------------------------
     * It scored 0.62 against a threshold of 0.60, which meant no two questions
     * in a set could ever share a reasoning structure. There are ten structures
     * and a set may be fifteen questions, so a full set was unsatisfiable by
     * construction — the rule forbade what the product requires. It surfaced as
     * the pipeline refusing every 15-question set, which reads as a generator
     * problem and was not one.
     *
     * The judgement was also just wrong. Moment of inertia and angular momentum
     * asked by the same route are two questions about two ideas; the route is
     * how you think, not what you think about. Sharing one is a weak signal, so
     * it now sits BELOW the threshold and only pushes a pair over when the
     * wording is close too — which is the case that actually matters, and which
     * the surface score already measures.
     */
    structural = 0.45;
    reasons.push('different concept, shared route');
  }

  const score = Math.min(1, Math.max(structural, surface));

  return { status: classify(score), score: round2(score), reasons };
}

function classify(score: number): SimilarityStatus {
  if (score >= DUPLICATE_AT) return 'DUPLICATE';
  if (score >= NEAR_DUPLICATE_AT) return 'NEAR_DUPLICATE';
  return 'UNIQUE';
}

/**
 * Compare one candidate against everything already accepted, and against what
 * this student has seen before.
 *
 * Returns the WORST verdict, because being unlike nine questions does not
 * excuse being identical to the tenth.
 */
export function compareAgainst(
  candidate: CandidateQuestion,
  accepted: readonly CandidateQuestion[],
  seenFingerprints: ReadonlySet<string> = new Set(),
): SimilarityReport {
  if (seenFingerprints.has(fingerprintOf(candidate))) {
    return {
      status: 'DUPLICATE',
      score: 1,
      reasons: ['this student has already been served this question'],
    };
  }

  let worst: SimilarityReport = { status: 'UNIQUE', score: 0, reasons: [] };
  for (const other of accepted) {
    const report = compare(candidate, other);
    if (report.score > worst.score) worst = report;
  }
  return worst;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
