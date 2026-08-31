/* PHASE 3 — "A NEW EXPLANATION MUST DIFFER FROM ALL PRIOR ONES."
 *
 * WHAT "DIFFER" HAS TO MEAN, AND WHY IT IS NOT STRING INEQUALITY.
 *   A model can change one word and produce a string that is not equal and is
 *   the same explanation. Byte inequality would call that new, serve it, and
 *   the learner would read the same paragraph twice. A rule that is satisfied
 *   by a comma is not a rule.
 *
 * THE MEASURE IS WHAT SHE GAINS, AND THE REPOSITORY ALREADY CHOSE IT.
 *   `tests/integration/law-a-asking-teaches-her-something.spec.ts` states it
 *   plainly: "A child only asks a question because she is stuck. If what comes
 *   back is made entirely of words she was already looking at, she has learned
 *   nothing, however confidently it is presented." It measures WORDS GAINED and
 *   requires at least three. This uses the same measure and the same number,
 *   because two different definitions of "she learned something" in one product
 *   is how the two quietly disagree.
 *
 * WHY NOT OVERLAP ALONE. `src/websearch/quality.ts` calls two documents the
 *   same story above 0.7 Jaccard overlap. That is right for news and wrong
 *   here: a long second explanation can overlap heavily with the first — it is
 *   the same topic, so of course it shares the topic's words — while still
 *   introducing twenty ideas she did not have. Overlap punishes staying on
 *   topic. Words gained does not.
 *
 * WRITTEN BEFORE THE IMPLEMENTATION. Every expectation below comes from the
 * phase text and from law-a, never from reading what the code happens to do.
 */

import { describe, expect, it } from 'vitest'

import { seededRandom } from './generate.test.ts'
import { contentTokens } from '../../src/canvas/teach/doubt.ts'

/* A first explanation, in the voice a lesson really uses. */
const FIRST =
  'Pressure is the push of gas particles against the walls of their container. ' +
  'Heating the gas makes the particles move faster, so they hit the walls harder.'

describe('R2 · an explanation she has already had is not a new explanation', () => {
  it('calls the very same words a repeat', () => {
    expect(noveltyAgainst(FIRST, [FIRST]).isRepeat).toBe(true)
  })

  it('calls it a repeat however the punctuation and capitals are changed', () => {
    /* THE CASE BYTE-INEQUALITY GETS WRONG. Not one idea has changed. A rule a
     * comma can satisfy would serve this to her as something new. */
    const fiddled = FIRST.toUpperCase().replace(/[.,]/g, ' ') + '   '
    expect(noveltyAgainst(fiddled, [FIRST]).isRepeat).toBe(true)
  })

  it('calls it a repeat when the new one only says LESS than before', () => {
    /* A strict subset adds nothing. Shorter is not newer. */
    const shorter = 'Pressure is the push of gas particles against the walls.'
    expect(noveltyAgainst(shorter, [FIRST]).isRepeat).toBe(true)
  })

  it('calls it a repeat when the sentences are merely reordered', () => {
    const reordered = FIRST.split('. ').reverse().join('. ')
    expect(noveltyAgainst(reordered, [FIRST]).isRepeat).toBe(true)
  })
})

describe('R2 · a genuinely different explanation is allowed through', () => {
  it('accepts one that teaches the same idea with different words', () => {
    /* THE PAIR. A checker that refused everything would pass every test above
     * and destroy the product: she would ask a second time and be told nothing.
     * This is the case that must stay allowed. */
    const byAnalogy =
      'Imagine a room full of bouncing tennis balls hitting the door. ' +
      'Warm them up and each bounce lands with more force, so the door feels a stronger shove.'
    expect(noveltyAgainst(byAnalogy, [FIRST]).isRepeat).toBe(false)
  })

  it('accepts one that keeps the topic words but brings real new ideas', () => {
    /* Staying on topic is not repeating. An explanation about pressure will
     * always contain the word "pressure"; punishing that would force the
     * product to change subject in order to look new. */
    const deeper =
      'Pressure is force spread over an area, measured in pascals. ' +
      'Doubling the temperature in kelvin doubles the pressure when the volume is fixed, ' +
      'which is why a sealed canister bursts near a flame.'
    const result = noveltyAgainst(deeper, [FIRST])
    expect(result.isRepeat).toBe(false)
    expect(result.wordsGained).toBeGreaterThanOrEqual(MIN_WORDS_A_NEW_EXPLANATION_ADDS)
  })

  it('accepts anything at all when she has never been told this before', () => {
    /* Nothing to repeat. A first explanation cannot be a second one. */
    expect(noveltyAgainst(FIRST, []).isRepeat).toBe(false)
    expect(noveltyAgainst('', []).isRepeat).toBe(false)
  })
})

describe('R2 · it must differ from ALL prior ones, not merely the last', () => {
  it('catches a repeat of something she was told several explanations ago', () => {
    /* THE RULE SAYS "ALL PRIOR", AND THE DIFFERENCE IS THE WHOLE POINT. A
     * checker that compared only against the most recent would let the product
     * alternate between two explanations forever, which is exactly the loop a
     * stuck learner ends up in. */
    const second = 'Think of a crowd pushing against a fence. More shoving means more force per plank.'
    const third = 'Gas particles are like a swarm of bees knocking on a window pane constantly.'
    expect(noveltyAgainst(FIRST, [FIRST, second, third]).isRepeat).toBe(true)
    expect(noveltyAgainst(second, [FIRST, second, third]).isRepeat).toBe(true)
  })

  it('reports which prior it was closest to, so a person can see the clash', () => {
    const second = 'Think of a crowd pushing against a fence. More shoving means more force per plank.'
    const verdict = noveltyAgainst(FIRST, [second, FIRST])
    expect(verdict.isRepeat).toBe(true)
    expect(verdict.closestPrior).toBe(FIRST)
  })
})

describe('R2 · it never falls over, whatever it is handed', () => {
  it('survives empty, blank and enormous inputs', () => {
    /* This runs on whatever a model returned, which is not a thing anyone
     * controls. Refusing to crash is the floor. */
    const HUGE = 'particle '.repeat(50_000)
    for (const candidate of ['', '   ', '\n\t', HUGE, '🧪🔥', '<script>alert(1)</script>']) {
      expect(() => noveltyAgainst(candidate, [FIRST, ''])).not.toThrow()
    }
    expect(() => noveltyAgainst(FIRST, [HUGE])).not.toThrow()
  })

  it('treats two blank explanations as the repeat they are', () => {
    /* Two empty answers are not two answers. Calling the second one "new"
     * because it is technically a different object would serve her nothing
     * twice and count it as progress. */
    expect(noveltyAgainst('   ', ['']).isRepeat).toBe(true)
  })

  it('is symmetric about wording it cannot read', () => {
    /* Text with no content words at all — punctuation, emoji — gains nothing
     * against anything, so it can never be a new explanation. */
    expect(noveltyAgainst('!!! ??? ...', [FIRST]).isRepeat).toBe(true)
  })
})

describe('R2 · the property, over many generated explanations', () => {
  it('never calls a text new against ITSELF, whatever the text is', () => {
    /* THE INVARIANT THAT CANNOT HAVE AN EXCEPTION. Whatever an explanation is,
     * it is not new to someone who has just read it. Four hundred draws. */
    const rng = seededRandom(6001)
    const VOCABULARY = [
      'pressure', 'particle', 'volume', 'temperature', 'kelvin', 'container',
      'force', 'area', 'collision', 'kinetic', 'energy', 'wall', 'faster',
      'heating', 'pascal', 'sealed', 'expand', 'compress', 'molecule', 'speed',
    ]
    for (let draw = 0; draw < 400; draw += 1) {
      const howMany = 1 + Math.floor(rng() * 12)
      const text = Array.from({ length: howMany }, () =>
        VOCABULARY[Math.floor(rng() * VOCABULARY.length)]).join(' ')
      expect(noveltyAgainst(text, [text]).isRepeat, `seed=6001 draw=${draw}: ${text}`).toBe(true)
    }
  })

  it('never calls a text new when the priors already contain it', () => {
    /* Adding MORE history can only ever make a candidate less new. A checker
     * that grew more permissive as she was told more things would be exactly
     * backwards. */
    const rng = seededRandom(6002)
    const pool = [FIRST, 'a crowd pushes a fence harder when it surges',
                  'bees knock on a window pane', 'force divided by area is pressure']
    for (let draw = 0; draw < 200; draw += 1) {
      const pick = pool[Math.floor(rng() * pool.length)] as string
      const priors = pool.slice(0, 1 + Math.floor(rng() * pool.length))
      if (!priors.includes(pick)) continue
      expect(noveltyAgainst(pick, priors).isRepeat, `seed=6002 draw=${draw}`).toBe(true)
    }
  })
})

describe('R2 · the boundary itself, pinned on both sides', () => {
  /* THIS EXISTS BECAUSE A MUTANT SURVIVED WITHOUT IT.
   *
   * Changing `<` to `<=` in the threshold comparison changed nothing any test
   * could see: no case gained EXACTLY the threshold number of words, so "at
   * least three" and "more than three" were indistinguishable. The off-by-one
   * every threshold invites was untested.
   *
   * The constant is read from the module rather than written as `3`, so these
   * stay true if the number is ever revised — the BOUNDARY is what is being
   * pinned here, not the value. */

  /** Words chosen to be plain content words: long enough, and not stopwords. */
  const SHARED = 'alpha bravo charlie'
  const EXTRA = ['delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india']

  const gaining = (howMany: number): string =>
    `${SHARED} ${EXTRA.slice(0, howMany).join(' ')}`

  it('accepts an explanation that gains EXACTLY the minimum', () => {
    const candidate = gaining(MIN_WORDS_A_NEW_EXPLANATION_ADDS)
    const verdict = noveltyAgainst(candidate, [SHARED])
    expect(verdict.wordsGained).toBe(MIN_WORDS_A_NEW_EXPLANATION_ADDS)
    /* "adds at least three" — three is enough. A rule that demanded four while
     * calling itself three would refuse a real explanation for no stated
     * reason, and nobody reading the constant would know. */
    expect(verdict.isRepeat).toBe(false)
  })

  it('refuses one that gains ONE FEWER than the minimum', () => {
    const candidate = gaining(MIN_WORDS_A_NEW_EXPLANATION_ADDS - 1)
    const verdict = noveltyAgainst(candidate, [SHARED])
    expect(verdict.wordsGained).toBe(MIN_WORDS_A_NEW_EXPLANATION_ADDS - 1)
    expect(verdict.isRepeat).toBe(true)
  })
})

describe('R2 · the number itself, tied to where it came from', () => {
  it('agrees with law-a about how many new words teach her something', () => {
    /* THE DRIFT THIS PINS IS NAMED IN THIS FILE'S OWN HEADER: "two different
     * definitions of 'she learned something' in one product is how the two
     * quietly disagree."
     *
     * `tests/integration/law-a-asking-teaches-her-something.spec.ts` sets
     * `NEW_WORDS_A_REAL_ANSWER_INTRODUCES = 3` and measures an answer on screen
     * against the words already on it. This module measures a new explanation
     * against every earlier one. Same question, two places, and they must not
     * answer it differently.
     *
     * ASSERTED AS A LITERAL ON PURPOSE. The boundary tests above read the
     * constant, so they follow it wherever it moves — which is right for a
     * boundary and useless for catching the value drifting away from its
     * source. If law-a's number changes, change this one in the same commit
     * and this test is where you will be told. */
    expect(MIN_WORDS_A_NEW_EXPLANATION_ADDS).toBe(3)
  })
})

/* ==========================================================================
 * THE RULE ITSELF LIVES HERE, AND THAT IS THE REACHABILITY GATE'S DOING.
 *
 * It was `server/memory/variation.ts`. The gate reported it, correctly:
 *
 *     ORPHAN server/memory/variation.ts --- built and tested, imported by
 *     nothing that ships
 *
 * That is the same rule `generate.test.ts` explains and the same one the
 * deleted `ledger.test.ts` recorded: "A test double in production code is
 * still production code nobody runs." A module only its own test imports is
 * exactly that, however good it is.
 *
 * IT MOVES BACK OUT the moment something shipping calls it -- Phase 4's M9
 * uses novelty to ask whether an answer taught her anything, and that is a
 * real caller. Until then it lives beside its proof, where the gate can see
 * that nothing is pretending to ship.
 * ========================================================================== */
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
