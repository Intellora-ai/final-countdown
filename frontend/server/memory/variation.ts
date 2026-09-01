/* PHASE 3, R2 — "A NEW EXPLANATION MUST DIFFER FROM ALL PRIOR ONES."
 *
 * BACK IN PRODUCTION, AND THE NOTE THAT EXILED IT SAID EXACTLY WHEN.
 *
 * This lived at the bottom of `variation.test.ts`, and the reachability gate
 * was right to put it there: "a module only its own test imports is a test
 * double in production code, however good it is." The note promised it "moves
 * back out the moment something shipping calls it".
 *
 * `handler.ts` now calls it. `conceptFor` was writing every explanation's
 * wording through `explanations.remember` and never comparing a new one
 * against it, so the phase's own done condition -- "asking for the same
 * concept twice never yields the same explanation" -- was persisted to disk
 * and never once checked. The store had a writer and no reader.
 *
 * The proofs stay in `variation.test.ts`, which imports from here.
 */

import { contentTokens } from '../../src/canvas/teach/doubt.ts'

/* R2 — HAS SHE ALREADY BEEN TOLD THIS?
 *
 * The rule this answers, from the phase: "a new explanation must differ from
 * all prior ones", and the product's own goal: "asking for the same concept
 * twice never yields the same explanation."
 *
 * WHY NOT STRING INEQUALITY.
 *   A model can change one word and produce a string that is not equal and is
 *   the same explanation. Byte inequality would call that new, serve it, and
 *   she would read the same paragraph twice. A rule a comma can satisfy is not
 *   a rule.
 *
 * WHY WORDS GAINED, AND WHY THAT NUMBER.
 *   `tests/integration/law-a-asking-teaches-her-something.spec.ts` already
 *   settled this for the product and said why: "If what comes back is made
 *   entirely of words she was already looking at, she has learned nothing,
 *   however confidently it is presented." It requires three new words. The same
 *   measure and the same number are used here on purpose -- two different
 *   definitions of "she learned something" inside one product is how the two
 *   quietly disagree, and then nobody can say which is right.
 *
 * WHY NOT OVERLAP, WHICH THIS REPOSITORY ALSO HAS.
 *   `src/websearch/quality.ts` calls two documents the same story above 0.7
 *   Jaccard overlap. That is right for news and wrong here. A second
 *   explanation of pressure will contain the word "pressure" -- it is the same
 *   topic, so of course it shares the topic's words -- and may still introduce
 *   twenty ideas she did not have. Overlap punishes staying on topic. Words
 *   gained does not, and staying on topic is what she asked for.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO.
 *   It takes no view on whether an explanation is GOOD, whether she understood
 *   it, or how well she is doing. Those are judgements this product cannot
 *   detect, and recording a number it cannot measure would poison every
 *   decision made from it later. It answers one question that is actually
 *   observable: are these the same words she has already seen.
 */


/**
 * How many content words a genuinely new explanation introduces.
 *
 * Three, matching `law-a`. Not a guess dressed as a constant: it is the number
 * the product already uses to decide whether an answer taught her anything,
 * and it is named here so the two can never drift apart silently.
 */
export const MIN_WORDS_A_NEW_EXPLANATION_ADDS = 3

export interface Novelty {
  /** True when she has effectively been told this already. */
  readonly isRepeat: boolean
  /**
   * New content words against the prior it resembles MOST.
   *
   * The minimum across all priors, never the average and never the latest:
   * "differs from ALL prior ones" fails on the single closest one, and an
   * average would let a near-copy hide behind three unrelated explanations.
   */
  readonly wordsGained: number
  /** The prior it resembled most, so a person can see the clash. */
  readonly closestPrior?: string
}

/** Content words, deduplicated. Case, punctuation and order carry no meaning here. */
function ideasIn(text: string): ReadonlySet<string> {
  return new Set(contentTokens(text))
}

/**
 * How new this explanation is, measured against every one she has had.
 *
 * NOTHING PRIOR MEANS NOTHING TO REPEAT. A first explanation cannot be a second
 * one, so it is always allowed -- including an empty one, because refusing that
 * here would hide an empty-answer bug behind a novelty error and send whoever
 * debugs it to the wrong file.
 */
export function noveltyAgainst(candidate: string, priors: readonly string[]): Novelty {
  const mine = ideasIn(candidate)

  if (priors.length === 0) {
    return { isRepeat: false, wordsGained: mine.size }
  }

  let fewestGained = Number.POSITIVE_INFINITY
  let closest = priors[0] as string

  for (const prior of priors) {
    const hers = ideasIn(prior)
    let gained = 0
    for (const idea of mine) if (!hers.has(idea)) gained += 1

    /* STRICTLY FEWER, so the FIRST prior at the minimum is the one reported.
     * With `<=` the answer would depend on the order history happens to be
     * stored in, and a message that changes for no reason is a message nobody
     * trusts. */
    if (gained < fewestGained) {
      fewestGained = gained
      closest = prior
    }
  }

  return {
    isRepeat: fewestGained < MIN_WORDS_A_NEW_EXPLANATION_ADDS,
    wordsGained: fewestGained,
    closestPrior: closest,
  }
}
