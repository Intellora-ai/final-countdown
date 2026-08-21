import React from 'react'
import type { EquationBlock as EquationBlockData } from '../types/learningBoard'

/* An equation as TEXT, in math typography — never an image, never HTML.
 *
 * The display face (Fraunces, italic) is the board's designated math
 * treatment: the dashboard reserves it for headings, the board's own headings
 * are sans, so on this surface the serif reads unambiguously as mathematics.
 * The string renders through React's text path, so `latex` can never carry
 * markup no matter what a generator puts in it.
 *
 * The variable legend is what makes the block teach rather than decorate: an
 * equation whose symbols are not named is a shape, not a statement.
 */
export function EquationBlock({ block }: { block: EquationBlockData }) {
  const eq = String(block.latex ?? '').trim()
  if (!eq) return null
  const vars = Array.isArray(block.variables) ? block.variables : []
  return (
    <div data-board="equation">
      <p data-board="equation-line" aria-label={'Equation: ' + eq}>{eq}</p>
      {vars.length > 0 && (
        <dl data-board="equation-vars">
          {vars.map((v, i) => (
            <div key={i} data-board="equation-var">
              <dt>{v.symbol}</dt>
              <dd>{v.meaning}{v.unit ? <span data-board="equation-unit"> ({v.unit})</span> : null}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
