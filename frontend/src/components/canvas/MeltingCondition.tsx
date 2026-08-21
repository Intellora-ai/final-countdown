/* THE EQUATION — structured maths, never a picture of maths.
 *
 * KaTeX renders from a LaTeX source string that the semantic model owns, so the
 * relationship stays inspectable, selectable, searchable and re-renderable at
 * any size. A bitmap of the same line would be none of those, and would also be
 * unreadable to a screen reader, which is why the accessible name is built from
 * the same values rather than from the markup.
 *
 * It reads temperature from the ONE variable store. There is no second copy to
 * drift: when the slider moves, the inequality and its verdict move with it,
 * because they are the same number rendered a different way.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { meltingConditionTex, phaseAt, WATER } from '../../lib/lesson-representations'

export function MeltingCondition({ temperatureK }: { temperatureK: number }) {
  const host = useRef<HTMLSpanElement | null>(null)
  const tex = useMemo(() => meltingConditionTex(temperatureK), [temperatureK])
  const phase = phaseAt(temperatureK)

  useEffect(() => {
    const node = host.current
    if (!node) return
    // throwOnError false: a malformed source must not blank the board. KaTeX
    // renders the offending source in its error colour, which is visible and
    // debuggable rather than silently absent.
    katex.render(tex, node, { throwOnError: false, displayMode: true, output: 'html' })
  }, [tex])

  const spoken =
    `Temperature ${temperatureK.toFixed(0)} kelvin, compared with the melting point of ` +
    `${WATER.fusionK} kelvin. Verdict: ${phase === 'melting' ? 'melting' : phase === 'solid' ? 'still solid' : 'no longer solid'}.`

  return (
    <div className="cv-equation" data-phase={phase}>
      {/* The rendered maths is decorative to assistive technology; the sentence
          beside it carries the same claim in words. */}
      <span ref={host} aria-hidden="true" />
      <span className="visually-hidden">{spoken}</span>
    </div>
  )
}
