import type { Subject } from '../curriculum';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOPIC DRIFT — the gate that does not read our own stamp.
 *
 * THE PROBLEM WITH EVERY OTHER SCOPE CHECK HERE
 * ---------------------------------------------
 *     boundary.ts   question.topicId === boundary.topicId
 *                   question.conceptId ∈ boundary.allowedConceptIds
 *     verify.ts     candidate.spec.topicId === expectedTopicId
 *
 * Every field on the left is stamped BY US at generation, from the same spec
 * the boundary is built from. Those gates compare our stamp to our stamp, so on
 * the generation path they cannot fail. Measured: 12 of 12 questions that were
 * a physics template with a maths heading pasted in passed all of them.
 *
 * Stamping at birth guarantees the LABEL is right. It says nothing about the
 * question. This is the other half.
 *
 * WHAT THIS IS, EXACTLY — AND WHAT IT IS NOT
 * ------------------------------------------
 * A LEXICAL centroid, not a neural embedding. Each topic is represented by the
 * words of its own heading, its chapter's heading, and its sibling topics,
 * weighted so a rare word counts for more than a common one. A question is
 * scored against EVERY topic, and the nearest wins.
 *
 * Calling it an embedding would be a lie, and the difference is real: this
 * cannot see that "discriminant" and "nature of roots" are the same idea in
 * different words. It catches VOCABULARY drift, which is the failure that
 * actually ships -- a linear-equation question inside a quadratics session
 * says "linear" and "substitution", and those are not quadratics words.
 *
 * WHY NEAREST RATHER THAN A THRESHOLD. "Does this look enough like quadratics"
 * needs a cut-off nobody can defend. "Is quadratics the CLOSEST of the 1,850
 * topics we know" is a comparison, and a comparison needs no magic number.
 *
 * WHY IT FAILS OPEN. A question whose words this gate does not recognise is
 * UNJUDGED, not rejected. A lexical centroid is shallow and a large part of any
 * curriculum is beyond it; a gate that rejected everything it could not read
 * would refuse most of the product and be switched off within a day.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface TopicCentroid {
  readonly topicId: string;
  /** Term -> weight. Rare across the curriculum means heavier. */
  readonly terms: ReadonlyMap<string, number>;
}

export interface NearestTopic {
  readonly topicId: string;
  readonly score: number;
  /** The second-best score, so a caller can see how decisive the win was. */
  readonly runnerUp: number;
  /**
   * True when the winner barely beat the runner-up.
   *
   * A question can genuinely belong to two topics at once -- and, more often
   * here, a question can be a template for one topic with another topic's name
   * pasted into it, which lands both vocabularies in the same sentence at
   * roughly equal strength.
   *
   * AMBIGUOUS IS A THIRD ANSWER, not a weak version of the first. Reporting a
   * near-tie as a confident winner is how a gate produces a verdict it has no
   * evidence for, in either direction.
   */
  readonly ambiguous: boolean;
}

/**
 * How far ahead the winner must be to count as decisive.
 *
 * A ratio rather than a difference, because cosine scores are not comparable in
 * absolute terms between a three-word heading and a thirty-word one.
 */
const DECISIVE = 1.25;

/**
 * Words carried by every heading in every subject, which therefore separate
 * nothing. Left in the text they dominate the score by sheer frequency.
 */
const STOP = new Set([
  'and', 'the', 'of', 'in', 'to', 'a', 'an', 'for', 'with', 'on', 'at', 'by', 'from',
  'its', 'their', 'this', 'that', 'these', 'those', 'is', 'are', 'be', 'as', 'or',
  'introduction', 'basic', 'basics', 'simple', 'general', 'related', 'using', 'use',
  'what', 'which', 'how', 'find', 'value', 'values', 'given', 'two', 'one', 'three',
]);

/**
 * Crude stemming, so an inflection is not a different word.
 *
 * Found while building the solution-scope gate: "the maximum of x SQUARED"
 * scored nothing against a topic whose concept is "Completing the SQUARE". The
 * only shared idea, spelled two ways, and an exact-match bag of words called
 * them unrelated.
 *
 * That is not an edge case. A syllabus heading is written in the infinitive and
 * a question is written in the past tense, so it is the NORMAL relationship
 * between the two texts this gate compares.
 *
 * DELIBERATELY CRUDE, and it is not linguistics. Anything cleverer has to earn
 * its keep against the self-identification rate over the real curriculum, which
 * this must not lower. Guarded on length, because stripping from a short word
 * turns distinct ideas into the same stub.
 */
function stem(word: string): string {
  const trimmed = trimSuffix(word);
  /*
   * A TRAILING `e` IS DROPPED LAST, and that line is why this works at all.
   *
   * "squared" loses `ed` and becomes `squar`; "square" is untouched and stays
   * `square`. Two spellings of one idea, still unequal -- which is exactly the
   * failure this stemmer was added to fix, surviving the fix.
   *
   * Dropping the final `e` from both lands them on `squar`. Same for
   * `circle`/`circles` -> `circl`. The stem is not a word and does not need to
   * be; it only needs to be the SAME for words that mean the same thing.
   */
  return trimmed.length > 4 && trimmed.endsWith('e') ? trimmed.slice(0, -1) : trimmed;
}

function trimSuffix(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2 && !STOP.has(word))
    .map(stem);
}

/**
 * One centroid per TOPIC, not per chapter.
 *
 * A topic borrows its chapter's words at a discount. A heading alone is three
 * or four words and loses to any longer one on sheer surface area; the chapter
 * is what tells you that "zeros" belongs with "polynomial" even when the topic
 * heading says only "zeros".
 *
 * SIBLING TOPICS WERE INCLUDED AT 0.25 AND HAVE BEEN REMOVED. Mutation testing
 * said they were dead, and measuring on the real Class 10 curriculum agreed
 * exactly: self-identification was 250/251 with them and 250/251 without. They
 * changed nothing, so they were complexity that read like a design decision.
 * Recorded rather than silently deleted, so the next person to reach for the
 * idea knows it was tried and measured.
 */
export function buildCentroids(curriculum: readonly Subject[]): TopicCentroid[] {
  const documents: { topicId: string; counts: Map<string, number> }[] = [];

  for (const subject of curriculum) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        const counts = new Map<string, number>();
        const add = (term: string, weight: number) =>
          counts.set(term, (counts.get(term) ?? 0) + weight);

        for (const word of words(topic.name)) add(word, 3);
        for (const word of words(chapter.name)) add(word, 1.5);

        /*
         * A TOPIC'S SCOPE IS ITS HEADING PLUS THE CONCEPTS IT OWNS.
         *
         * Leaving these out refused the product, and the refusal said exactly
         * why: a question about `Scarcity` -- a concept inside the topic
         * `Central problems` -- scored 0.000 against its own topic, because it
         * shared not one word with the heading.
         *
         * These are the same `allowed_concepts` the admission gate checks
         * membership against. Building the centroid from the title alone was
         * measuring the LABEL again, which is the exact mistake this gate
         * exists to stop making.
         *
         * WEIGHTED BELOW THE HEADING, deliberately. A topic with twenty
         * concepts would otherwise outweigh its neighbours on volume alone and
         * be nearest to everything -- which turns the gate off by making it
         * always agree.
         */
        for (const concept of topic.concepts ?? []) {
          for (const word of words(concept.name)) add(word, 1);
        }

        documents.push({ topicId: topic.id, counts });
      }
    }
  }

  /*
   * NO INVERSE-DOCUMENT-FREQUENCY WEIGHTING, AND THAT IS A MEASURED DECISION.
   *
   * One was written first, on the reasonable argument that "equation" appears
   * across a large part of a maths syllabus while "discriminant" appears in a
   * handful, so the rare word should count for more.
   *
   * It did nothing. Measured on the real Class 10 curriculum, self-identifying
   * every topic from its own heading:
   *
   *     with IDF     250 / 251
   *     without IDF  250 / 251
   *
   * and on six real generated questions the nearest topic and the drift verdict
   * were identical either way -- 5 of 6 caught, both times.
   *
   * It looked load-bearing for one measurement, at 250 against 248, and that
   * turned out to be IDF cancelling noise from a SIBLING-TOPIC term that has
   * also now been removed. Two mechanisms whose only effect was each other.
   *
   * Recorded rather than quietly dropped, because "we should weight by rarity"
   * is the obvious next idea and it has now been tried and measured.
   */
  return documents.map(({ topicId, counts }) => ({ topicId, terms: counts }));
}

/**
 * The topic whose vocabulary this text is closest to, or null when nothing is.
 *
 * Cosine similarity, so a long question is not favoured over a short one purely
 * for having more words. `null` when no topic shares a single term with the
 * text: no nearest is a real answer, and returning the least-bad topic would
 * invent a match.
 */
/** Term counts for a piece of text, and its vector length. */
function vectorFor(text: string): { counts: Map<string, number>; norm: number } {
  const counts = new Map<string, number>();
  for (const word of words(text)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const norm = Math.sqrt([...counts.values()].reduce((sum, n) => sum + n * n, 0));
  return { counts, norm };
}

function cosine(counts: ReadonlyMap<string, number>, norm: number, centroid: TopicCentroid): number {
  let dot = 0;
  for (const [term, count] of counts) dot += count * (centroid.terms.get(term) ?? 0);
  if (dot === 0) return 0;

  const centroidNorm = Math.sqrt(
    [...centroid.terms.values()].reduce((sum, weight) => sum + weight * weight, 0),
  );
  return dot / (norm * centroidNorm || 1);
}

/**
 * How close this text is to ONE named topic. Zero when they share no words.
 *
 * Exposed because a rule nobody can inspect is a rule nobody can debug: a
 * refusal that cannot say "your topic scored 0 and physics scored 0.4" is an
 * error message that helps no one.
 */
export function scoreFor(
  text: string,
  topicId: string,
  centroids: readonly TopicCentroid[],
): number {
  const centroid = centroids.find((each) => each.topicId === topicId);
  if (!centroid) return 0;

  const { counts, norm } = vectorFor(text);
  if (counts.size === 0) return 0;

  return cosine(counts, norm, centroid);
}

export function nearestTopic(
  text: string,
  centroids: readonly TopicCentroid[],
): NearestTopic | null {
  const { counts, norm } = vectorFor(text);
  if (counts.size === 0) return null;

  let bestId: string | null = null;
  let bestScore = 0;
  let second = 0;

  for (const centroid of centroids) {
    const score = cosine(counts, norm, centroid);
    if (score === 0) continue;

    if (bestId === null || score > bestScore) {
      second = bestScore;
      bestId = centroid.topicId;
      bestScore = score;
    } else if (score > second) {
      second = score;
    }
  }

  if (bestId === null) return null;

  return {
    topicId: bestId,
    score: bestScore,
    runnerUp: second,
    ambiguous: second > 0 && bestScore < second * DECISIVE,
  };
}

/**
 * Has this question drifted away from the topic it was generated for?
 *
 * FAILS OPEN, DELIBERATELY, IN THREE CASES:
 *
 *   the text matches no topic       unjudged, not guilty
 *   the session topic is unknown    nothing to compare against
 *   the nearest topic IS the one    no drift
 *
 * A lexical centroid is shallow, and a gate that rejected everything it could
 * not read would refuse most of the product. What it does catch is the case
 * that ships: a question whose words belong to a DIFFERENT topic we know about.
 */
export function driftsFrom(
  text: string,
  topicId: string,
  centroids: readonly TopicCentroid[],
): boolean {
  if (!centroids.some((centroid) => centroid.topicId === topicId)) return false;

  const near = nearestTopic(text, centroids);
  if (near === null) return false;
  if (near.topicId === topicId) return false;

  /*
   * MEASURED AGAINST THE REQUESTED TOPIC, NOT AGAINST THE WINNER.
   *
   * "Some other topic scored higher" was the first rule, and wired onto the
   * real path it refused every session. A template question shares little
   * vocabulary with ANY topic, so whichever topic wins that weak contest wins
   * by noise -- and a coin toss reported as a verdict is worse than no gate.
   *
   * The question that matters is whether the requested topic is a plausible
   * home for these words, and there are exactly two ways it is not:
   *
   *   it scores NOTHING while another topic scores something -- the question
   *   shares not one word with the topic it claims;
   *
   *   another topic beats it DECISIVELY -- not by a nose.
   *
   * Both are comparisons, so neither needs a threshold anybody has to defend.
   */
  const mine = scoreFor(text, topicId, centroids);
  if (mine === 0) return true;

  return near.score > mine * DECISIVE;
}
