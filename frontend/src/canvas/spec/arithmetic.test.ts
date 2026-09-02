/**
 * F1 — NO NUMBER REACHES A LEARNER UNCHECKED.
 *
 * `evaluate` and `verifyArithmetic` were built, tested, and wired only into
 * the agent loop, which the canvas does not use. So a lesson could say
 * "2 x 3 = 7" and the gate that refuses a dangling relation would pass it
 * without a murmur. Every sum a lesson writes is now checked before it is
 * drawn, and a wrong one is refused with the right answer in the message.
 *
 * A step that cannot be checked is left alone -- never guessed at, never
 * silently accepted as correct. Refusing what it cannot read would refuse
 * every lesson with a sentence in it.
 */
import { describe, expect, it } from 'vitest'
import { sumsIn, wrongSums } from './arithmetic'

const prose = (body: string) => ({ id: 'p1', kind: 'prose', role: 'definition', body })

describe('finding the sums a lesson states', () => {
  it('finds one written plainly, in either notation', () => {
    expect(sumsIn([prose('So 2 + 3 = 5 in every case.')])).toEqual([{ expression: '2 + 3', stated: 5, said: '2 + 3 = 5' }])
    expect(sumsIn([prose('Here 4 × 6 = 24.')])[0]?.stated).toBe(24)
    expect(sumsIn([prose('And 10 ÷ 4 = 2.5 exactly.')])[0]?.stated).toBe(2.5)
  })

  it('finds every sum in a lesson, across its blocks', () => {
    const found = sumsIn([prose('First 2 + 2 = 4.'), { id: 'p2', kind: 'prose', role: 'support', body: 'Then 4 × 4 = 16.' }])
    expect(found.map((one) => one.stated)).toEqual([4, 16])
  })

  it('is not fooled by a date, a range, or an equation with a letter in it', () => {
    expect(sumsIn([prose('The war ran 1939-1945 and killed millions.')])).toEqual([])
    expect(sumsIn([prose('The formula is a + b = c for any two numbers.')])).toEqual([])
    expect(sumsIn([prose('Between 5 and 10 degrees.')])).toEqual([])
  })
})

describe('checking them', () => {
  it('says nothing when every sum is right', () => {
    expect(wrongSums([prose('So 2 + 3 = 5, and 6 × 7 = 42.')])).toEqual([])
  })

  it('names a wrong sum and gives the right answer', () => {
    const wrong = wrongSums([prose('So 2 × 3 = 7 and that is the rule.')])
    expect(wrong).toHaveLength(1)
    expect(wrong[0]?.said).toBe('2 × 3 = 7')
    expect(wrong[0]?.why).toContain('6')
  })

  it('catches the one wrong sum among right ones', () => {
    const wrong = wrongSums([prose('2 + 2 = 4, 3 + 3 = 6, 4 + 4 = 9.')])
    expect(wrong.map((one) => one.said)).toEqual(['4 + 4 = 9'])
  })

  it('leaves alone what it cannot read, rather than guessing', () => {
    expect(wrongSums([prose('The area of a circle is pi r squared.')])).toEqual([])
    expect(wrongSums([prose('Roughly 2 + 2 = about 4.')])).toEqual([])
  })

  it('allows a rounded answer to be stated as rounded', () => {
    expect(wrongSums([prose('So 10 ÷ 3 = 3.33 to two places.')])).toEqual([])
    expect(wrongSums([prose('So 10 ÷ 3 = 5.')])).toHaveLength(1)
  })
})
