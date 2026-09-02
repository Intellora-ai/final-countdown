/**
 * D3 — THE CURRICULUM IS A PRIOR, NEVER THE TRUTH.
 *
 * Three questions that must never collapse into one boolean:
 *   1. Does the curriculum say A comes before B?   (506-1252 real edges/class)
 *   2. Is A actually necessary for B?
 *   3. Does THIS learner lack A?
 *
 * Factorisation is listed before quadratics. If she has already been taught it
 * and answered without pleading, reteaching it wastes her time and insults
 * her; if she has never met it, explaining quadratics again cannot work.
 */
import { describe, expect, it } from 'vitest'
import { blocking, type Known } from './prerequisites.ts'

const listed = [
  { id: 'polynomials--factorisation', name: 'Factorisation of polynomials' },
  { id: 'algebra--like-terms', name: 'Collecting like terms' },
]
const nothingKnown: Known = { taught: [], answered: [], pleaded: [] }

describe('what is actually blocking her', () => {
  it('a prerequisite she has never met is what blocks, and it is named', () => {
    const found = blocking(listed, nothingKnown)
    expect(found.map((one) => one.id)).toEqual(['polynomials--factorisation', 'algebra--like-terms'])
    expect(found[0]?.name).toBe('Factorisation of polynomials')
    expect(found[0]?.because).toMatch(/never/i)
  })

  it('one she was taught and answered on is not blocking, and is never retaught', () => {
    const found = blocking(listed, { taught: ['polynomials--factorisation'], answered: ['polynomials--factorisation'], pleaded: [] })
    expect(found.map((one) => one.id)).toEqual(['algebra--like-terms'])
  })

  it('one she was taught and then pleaded about IS blocking, however much it was covered', () => {
    const found = blocking(listed, { taught: ['polynomials--factorisation'], answered: ['polynomials--factorisation'], pleaded: ['polynomials--factorisation'] })
    expect(found[0]?.id).toBe('polynomials--factorisation')
    expect(found[0]?.because).toMatch(/did not land|pleaded/i)
  })

  it('taught but never answered is weaker than never met, and comes after it', () => {
    const found = blocking(listed, { taught: ['polynomials--factorisation'], answered: [], pleaded: [] })
    expect(found.map((one) => one.id)).toEqual(['algebra--like-terms', 'polynomials--factorisation'])
  })

  it('everything covered and answered means nothing is blocking -- look elsewhere', () => {
    const found = blocking(listed, {
      taught: ['polynomials--factorisation', 'algebra--like-terms'],
      answered: ['polynomials--factorisation', 'algebra--like-terms'],
      pleaded: [],
    })
    expect(found).toEqual([])
  })

  it('a curriculum that lists nothing blocks nothing, and never invents a prerequisite', () => {
    expect(blocking([], nothingKnown)).toEqual([])
  })
})
