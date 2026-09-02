/**
 * E3 — WHETHER, BEFORE WHICH. "No picture" is a real answer.
 *
 * Today every reading except `define` and `example` OWES a representation, so
 * a lesson about the word "onomatopoeia" must draw a chart of something. The
 * prompt even says "never add one because this list asked for one" while the
 * gate refuses the lesson that obeys -- a contradiction the model cannot
 * satisfy, and it resolves it by drawing a chart of nothing.
 *
 * So: a picture is owed when the CONTENT has something to show. When it has
 * not, the author may say so -- and must say WHY, in one sentence, so that
 * "no picture" is a decision on the record and never a silent omission.
 */
import { describe, expect, it } from 'vitest'
import { hasSomethingToShow, mayShowNothing } from './necessity'

const prose = (body: string) => ({ id: 'p1', kind: 'prose', role: 'definition', body })

describe('does this idea have anything to show', () => {
  it('numbers to compare do', () => {
    expect(hasSomethingToShow([prose('Copper melts at 1085 degrees, iron at 1538, and tungsten at 3422.')])).toBe(true)
  })

  it('steps in an order do', () => {
    expect(hasSomethingToShow([prose('First the water is heated, then the steam turns the turbine, and finally the generator spins.')])).toBe(true)
  })

  it('cases to set side by side do', () => {
    expect(hasSomethingToShow([prose('A mammal feeds its young on milk, whereas a reptile does not.')])).toBe(true)
  })

  it('parts of a whole do', () => {
    expect(hasSomethingToShow([prose('Air is roughly 78 percent nitrogen and 21 percent oxygen.')])).toBe(true)
  })

  it('a word and where it came from does not', () => {
    expect(hasSomethingToShow([prose('Onomatopoeia is a word that sounds like the noise it names, from the Greek for name-making.')])).toBe(false)
  })

  it('a convention people simply agreed on does not', () => {
    expect(hasSomethingToShow([prose('In English the adjective comes before the noun it describes.')])).toBe(false)
  })

  it('a block that already shows something always does', () => {
    expect(hasSomethingToShow([{ id: 'c', kind: 'chart', role: 'support' }])).toBe(true)
  })
})

describe('when the author may say there is nothing to draw', () => {
  it('may, when the content has nothing to show and a reason is given', () => {
    const verdict = mayShowNothing([prose('In English the adjective comes before the noun it describes.')], 'this is a convention, and a picture of it would invent structure that is not there')
    expect(verdict.ok).toBe(true)
  })

  it('may not, when the content plainly has something to show', () => {
    const verdict = mayShowNothing([prose('Copper melts at 1085 degrees, iron at 1538, and tungsten at 3422.')], 'nothing to draw here')
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/has something to show|numbers|compare/i)
  })

  it('may not without a reason, so it is never a silent omission', () => {
    expect(mayShowNothing([prose('In English the adjective comes before the noun.')], '').ok).toBe(false)
    expect(mayShowNothing([prose('In English the adjective comes before the noun.')], '   ').ok).toBe(false)
  })

  it('may not with a reason that says nothing', () => {
    const verdict = mayShowNothing([prose('In English the adjective comes before the noun.')], 'no')
    expect(verdict.ok).toBe(false)
  })
})
