import { describe, expect, it } from 'vitest'

import { readableText, sameAgain, signature } from './sameAgain'

/*
 * A MESSAGE THE RECEIVER COULD HAVE PREDICTED CARRIES ZERO INFORMATION.
 *
 * Shannon's definition, applied literally. A learner who has already read an
 * explanation learns nothing from reading it again, so shipping it twice is
 * shipping nothing. `route.ts` rotates twelve ways in so the SECOND attempt
 * comes out different; this file is the measurement that says whether it did.
 *
 * WHY THIS IS NOT A GATE RULE
 * ---------------------------
 * `CONSTRAINTS.md`: "a model optimising against a long rule list produces
 * output that passes and does not teach." A 32nd rule in `teaching.ts` would
 * be one more thing to satisfy, and it could not even be written honestly --
 * the gate sees ONE lesson, and duplication is a fact about a PAIR. It belongs
 * where the author can act on it: call it, and if it says duplicate, re-author
 * on a fresh axis.
 *
 * THE PAIR THIS MUST SEPARATE, AND WHY IT IS THE WHOLE DIFFICULTY
 * --------------------------------------------------------------
 * ACCEPT: same truth, different route. That is the entire point of `route.ts`
 *         and it MUST NOT be flagged. A detector asserted only to reject is
 *         satisfied by `return true`.
 * REJECT: the same explanation again, however lightly retouched.
 *
 * Both members of the pair below teach that pressure is molecules hitting the
 * walls. They differ only in whether the WORDING was reused.
 */

/** Same truth as the fixture below, reached by a different route entirely. */
const otherRoute = {
  title: 'Why a bike pump gets hot',
  blocks: [
    {
      id: 'b1',
      kind: 'prose',
      text: 'Push the handle down and the barrel warms under your palm. You did work on the air inside, and that work has to go somewhere.',
    },
    {
      id: 'b2',
      kind: 'prose',
      text: 'It went into the speed of the molecules. Faster molecules are what a thermometer reports as a higher temperature, and what the tyre wall feels as a harder shove.',
    },
  ],
}

/** The original. Molecules, walls, kinetic energy -- the standard route in. */
const original = {
  title: 'Why heating a gas raises its pressure',
  blocks: [
    {
      id: 'a1',
      kind: 'prose',
      text: 'A gas presses on its container because its molecules are constantly striking the walls. Each strike is a tiny push, and there are enormous numbers of them every second.',
    },
    {
      id: 'a2',
      kind: 'prose',
      text: 'Heating the gas raises the average kinetic energy of those molecules. They strike the walls harder and more often, so the total push per unit area goes up. That total push per unit area is what we call pressure.',
    },
  ],
}

/** The same explanation again, retouched: a synonym here, a clause reordered. */
const retouched = {
  title: 'Why heating a gas increases its pressure',
  blocks: [
    {
      id: 'c1',
      kind: 'prose',
      text: 'A gas presses on its container because its molecules are constantly striking the walls. Each strike is a small push, and there are enormous numbers of them every second.',
    },
    {
      id: 'c2',
      kind: 'prose',
      text: 'Heating the gas raises the average kinetic energy of those molecules. They strike the walls harder and more often, so the total push per unit area goes up. Pressure is what we call that total push per unit area.',
    },
  ],
}

describe('sameAgain', () => {
  it('REJECTS the same explanation dressed in synonyms', () => {
    const verdict = sameAgain(retouched, [original])

    expect(verdict.duplicate).toBe(true)
    expect(verdict.matched).toBe(0)
    expect(verdict.similarity).toBeGreaterThan(0.5)
  })

  it('ACCEPTS the same truth reached by a different route', () => {
    const verdict = sameAgain(otherRoute, [original])

    expect(verdict.duplicate).toBe(false)
    expect(verdict.matched).toBe(-1)
    expect(verdict.similarity).toBeLessThan(0.2)
  })

  it('ACCEPTS anything when nothing has been shown yet', () => {
    expect(sameAgain(original, [])).toEqual({ duplicate: false, similarity: 0, matched: -1 })
  })

  it('REJECTS a lesson identical to the SECOND thing shown, not only the first', () => {
    const verdict = sameAgain(retouched, [otherRoute, original])

    expect(verdict.matched).toBe(1)
    expect(verdict.duplicate).toBe(true)
  })

  it('reports a lesson against ITSELF as a similarity of exactly 1', () => {
    expect(sameAgain(original, [original]).similarity).toBe(1)
  })

  /*
   * The estimate must be an estimate OF something. Without this, a signature
   * that returned the same constant for every lesson would pass every test
   * above except the accept case, and would still look like it worked.
   */
  it('is deterministic: the same lesson signs identically every time', () => {
    expect(signature(original)).toEqual(signature(original))
    expect(signature(original)).not.toEqual(signature(otherRoute))
  })

  it('reads text out of every block, not only the first', () => {
    const words = readableText(original)

    expect(words).toContain('kinetic')
    expect(words).toContain('striking')
  })

  /*
   * Ids and kinds are NOT readable text. If they leaked into the shingles,
   * every lesson would share the words `prose`, `chart`, `summary` and the
   * floor of the similarity score would drift upward with lesson length --
   * quietly, and worst on exactly the long lessons that matter.
   */
  it('ignores ids and block kinds', () => {
    expect(readableText(original)).not.toContain('prose')
    expect(readableText(original)).not.toContain('a1')
  })

  /*
   * PAIRED AT THE BOUNDARY. A detector that rejects everything long enough is
   * satisfied by `return true`; one that never fires is satisfied by
   * `return false`. Two lessons sharing a topic and NO wording must score
   * lower than two sharing wording -- that ordering is the mechanism, and it
   * is what the fixed threshold is placed between.
   */
  it('scores a reworded lesson strictly higher than a rerouted one', () => {
    const rerouted = sameAgain(otherRoute, [original]).similarity
    const reworded = sameAgain(retouched, [original]).similarity

    expect(reworded).toBeGreaterThan(rerouted * 3)
  })
})
