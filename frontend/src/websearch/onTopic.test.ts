import { describe, expect, it } from 'vitest'

import { offTopic } from './select'
import type { SearchRequirements } from './interpret'
import type { SearchHit } from './port'

/**
 * A SOURCE MUST MENTION THE SUBJECT — AND ENGLISH DOES NOT SPELL A SUBJECT ONE
 * WAY.
 *
 * This rule was added on 2026-09-02 after a local SearxNG answered a question
 * about polynomials with song lyrics, Vietnamese food and a LibreOffice
 * download, all of which were fetched and would have been cited. It excludes a
 * hit whose title and snippet share no word with the question.
 *
 * MEASURED 2026-09-03: it also excluded **Wikipedia's "Trigonometry" article
 * for the question "trigonometric ratios"**, because the rule compared exact
 * substrings and "trigonometry" does not contain "trigonometric". The single
 * most trustworthy source in the reply was thrown away by the guard meant to
 * protect it, and the adult forum that Bing returned above it was excluded for
 * the right reason on the same pass — so that search had NOTHING left in it.
 *
 * The cases below are not invented. Every question is a real curriculum topic
 * from the CBSE data in this repository, and every source title is how an
 * encyclopedia or a textbook actually writes that subject. A rule that only
 * works on the one pair I happened to hit is not a rule.
 */

function req(query: string): SearchRequirements {
  return { query, normalized: query, aspects: [], entities: [], intent: 'explain', freshness: 'any' } as unknown as SearchRequirements
}

function hit(title: string, snippet = ''): SearchHit {
  return { url: 'https://example.test/a', title, snippet }
}

/* One entry per real way English writes the same subject differently. Left: a
   question a student types. Right: how a real source titles the same thing. */
const THE_SAME_SUBJECT: readonly (readonly [string, string])[] = [
  ['trigonometric ratios', 'Trigonometry'],
  ['trigonometry', 'Trigonometric functions'],
  ['photosynthesis', 'Photosynthetic organisms'],
  ['zeros of a polynomial', 'Polynomials and their zeroes'],
  ['electric circuits', 'Electrical circuit'],
  ['chemical reactions', 'Chemical reaction'],
  ['magnetic effects of current', 'Magnetism'],
  ['nationalism in India', 'Indian nationalist movement'],
  ['probability', 'Probabilistic reasoning'],
  ['linear equations', 'Linearity and equations'],
  ['refraction of light', 'Refractive index'],
  ['human digestive system', 'Digestion'],
]

/* Real rubbish, measured coming back from a real engine for a real question.
   None of it shares a subject with the question beside it. */
const NOT_THE_SUBJECT: readonly (readonly [string, string])[] = [
  ['zeros of a polynomial', 'Vietnamese Food: Top 100 Dishes'],
  ['trigonometric ratios', 'XNXX Adult Forum'],
  ['trigonometric ratios', 'Plumbers in Bedford: 24 hour callout'],
  ['photosynthesis', 'LibreOffice 7.6 download mirrors'],
  ['electric circuits', 'Bohemian Rhapsody lyrics'],
  ['probability', 'YouTube Help Center'],
]

describe('a source that says the subject a different way is still about the subject', () => {
  for (const [question, title] of THE_SAME_SUBJECT) {
    it(`"${title}" answers "${question}"`, () => {
      expect(
        offTopic(hit(title), req(question)),
        `a real source titled "${title}" was thrown away for a student asking "${question}"`,
      ).toBeUndefined()
    })
  }
})

describe('a source about something else is still thrown away', () => {
  for (const [question, title] of NOT_THE_SUBJECT) {
    it(`"${title}" does not answer "${question}"`, () => {
      expect(
        offTopic(hit(title), req(question)),
        `"${title}" was accepted as a source for "${question}"`,
      ).toBeDefined()
    })
  }
})

describe('the rule judges nothing it cannot judge', () => {
  it('lets everything through when the question has no subject words at all', () => {
    expect(offTopic(hit('Anything'), req('is it'))).toBeUndefined()
  })

  it('reads the snippet as well as the title, because engines put the subject there', () => {
    expect(offTopic(hit('Untitled page', 'A short note on photosynthetic pigments.'), req('photosynthesis'))).toBeUndefined()
  })

  it('never matches on a fragment so short it would match anything', () => {
    /* The danger of loosening the rule: a stem of one or two letters matches
       half the language and the guard stops guarding. Any two unrelated real
       subjects must still be told apart. */
    expect(offTopic(hit('Ice hockey results'), req('ice ages'))).toBeUndefined()
    expect(offTopic(hit('A history of jazz'), req('mitochondria'))).toBeDefined()
    expect(offTopic(hit('Car insurance quotes'), req('carbon cycle'))).toBeDefined()
  })
})
