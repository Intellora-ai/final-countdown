import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { MOST_CHARACTERS, bound } from './bounds'

/**
 * The bound stated as laws, because the interesting inputs are the ones nobody
 * thinks to write down.
 *
 * WHY `fullUnicodeString` AND NOT `string`
 * ----------------------------------------
 * `fc.string()` defaults to the printable ASCII range, and every property below
 * passes trivially against it. The product is taught in Hindi, Tamil, Bengali
 * and Urdu, and learners paste emoji. Those are exactly the characters that live
 * OUTSIDE the Basic Multilingual Plane, are stored as two UTF-16 code units, and
 * get cut in half by a naive `slice`. Generating only ASCII would have proved
 * the bound safe for a product nobody here is building.
 *
 * fast-check 4 removed `fullUnicodeString`; `unit` replaces it. Two units are
 * used and the difference is load-bearing:
 *
 *   'binary'    any code point, INCLUDING an unpaired surrogate. The hostile
 *               input. Used for the laws that must hold whatever arrives.
 *   'grapheme'  whole characters as a person writes them. Used for the law
 *               about not cutting one in half, which needs input that was
 *               whole to begin with or it asserts nothing.
 *
 * `fc.constantFrom` appears only as a bias, never as the generator: a fixed set
 * of examples is the thing these laws exist to replace.
 */

/** A code-point count, which is what a person means by "characters". */
function characters(text: string): number {
  return Array.from(text).length
}

/** Whether the string can survive being encoded — no half of a surrogate pair
 *  left stranded at either end. */
function wellFormed(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    const isHigh = code >= 0xd800 && code <= 0xdbff
    const isLow = code >= 0xdc00 && code <= 0xdfff
    if (isHigh) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (isLow) {
      return false
    }
  }
  return true
}

/*
 * EVERY GENERATOR BELOW IS FORCED PAST THE BOUND, AND THAT IS THE POINT.
 *
 * MEASURED. The first version of this file used `maxLength` alone. fast-check
 * biases hard toward short values, so almost nothing it produced was longer
 * than 2,000 characters and the clamping branch was barely entered -- a naive
 * `text.slice(0, MOST_CHARACTERS)`, which cuts astral characters in half, PASSED
 * all five laws. A property that never reaches the code under test is a green
 * tick measuring nothing, which is the failure this whole plan is about.
 *
 * `minLength` is what fixes it: the clamp is now the path, not an occasional
 * visitor.
 */

/** Whole characters, mixing ones a naive cut breaks with ones it does not. */
const alphabet = fc.constantFrom('a', ' ', 'क', 'ஃ', '😀', '🇮🇳', '𝔘', '\n')

/** Always longer than the bound, and always made of whole characters. */
const overLong = fc
  .array(alphabet, { minLength: MOST_CHARACTERS + 1, maxLength: MOST_CHARACTERS + 400 })
  .map((parts) => parts.join(''))

/** Hostile: any code point at all, unpaired surrogates included, at any length. */
const anything = fc.oneof(
  { weight: 2, arbitrary: overLong },
  {
    weight: 2,
    arbitrary: fc.string({
      unit: 'binary',
      minLength: MOST_CHARACTERS + 1,
      maxLength: MOST_CHARACTERS + 400,
    }),
  },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 400 }) },
)

/** Whole characters only, so "did it cut one in half" is a question about the
 *  bound rather than about the generator. */
const whole = fc.oneof(overLong, fc.string({ unit: 'grapheme', maxLength: 400 }))

/*
 * One string pinned by hand beside the generators.
 *
 * 1,501 characters -- comfortably WITHIN the bound -- but 3,001 UTF-16 code
 * units, so any implementation counting code units clamps it when it must not,
 * and cuts the emoji at unit 2,000 in half doing so. It is the exact shape of
 * a learner pasting a line of emoji, and it is not a case a generator is likely
 * to land on.
 */
const EMOJI_UNDER_THE_BOUND = `a${'😀'.repeat(1500)}`

describe('nothing unbounded reaches the model', () => {
  it('never returns more than the bound, whatever it is given', () => {
    fc.assert(
      fc.property(anything, (text) => {
        expect(characters(bound(text).text)).toBeLessThanOrEqual(MOST_CHARACTERS)
      }),
      { numRuns: 300 },
    )
  })

  it('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(anything, (text) => {
        expect(() => bound(text)).not.toThrow()
      }),
      { numRuns: 300 },
    )
  })

  it('never cuts a character in half', () => {
    /*
     * THE LAW A NAIVE `slice` BREAKS. Cutting at code unit 2000 inside a
     * surrogate pair leaves half a character; `fetch` encodes it as U+FFFD, so
     * the model is asked a question ending in a replacement glyph. Every
     * emoji, and every character above U+FFFF, is a candidate.
     */
    fc.assert(
      fc.property(whole, (text) => {
        expect(wellFormed(bound(text).text), JSON.stringify(text.slice(0, 40))).toBe(true)
      }),
      { numRuns: 500, examples: [[EMOJI_UNDER_THE_BOUND]] },
    )
  })

  it('leaves anything within the bound exactly as it was', () => {
    fc.assert(
      fc.property(whole.filter((text) => characters(text) <= MOST_CHARACTERS), (text) => {
        expect(bound(text)).toEqual({ text, clamped: false })
      }),
      { numRuns: 300, examples: [[EMOJI_UNDER_THE_BOUND]] },
    )
  })

  it('reports the cut whenever it made one, and never otherwise', () => {
    fc.assert(
      fc.property(anything, (text) => {
        expect(bound(text).clamped).toBe(characters(text) > MOST_CHARACTERS)
      }),
      { numRuns: 300, examples: [[EMOJI_UNDER_THE_BOUND]] },
    )
  })
})
