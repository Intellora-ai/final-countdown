import React from 'react'
import { useNavigate } from 'react-router-dom'
import './scene.css'
import { LessonRenderer } from './renderer/LessonRenderer'
import { registerRepresentations } from './contract/bootstrap'
import { gasPressure } from './lessons/acceptance'
import { cssVariables } from './design/generateCss'
import { color, space, radius, stroke, type } from './design/tokens'

/* THE GAS LESSON, THROUGH THE ENGINE THAT IS SUPPOSED TO DRAW EVERYTHING.
 *
 * This replaces GasPressureScene, which was 331 lines of hand-placed panels
 * reading a 75-line table of absolute pixel coordinates. That scene was the
 * visual specification the design grammar was extracted FROM, and it did its
 * job: tokens, primitives, panels and arrow geometry all came out of it. What
 * it could never do is generalise. Every position in it was a measurement off
 * one reference image at one size, so the layout could not respond, could not
 * reflow, and could not be reused by any other lesson.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. It states no position, no size and
 * no colour. The gas lesson is the same `Lesson` object every other lesson is,
 * and it goes through the same select -> capacity -> disclosure -> derive ->
 * validate -> repair path. If the composition is wrong, the fix is in the
 * grammar, not here -- which is the entire point of deleting the coordinate
 * table rather than porting it.
 *
 * WHAT IS GENUINELY LOST, recorded rather than glossed. The legacy scene drew
 * two decorative elements the lesson does not declare as content: a concept
 * map and a pencilled margin sketch, plus six half-clipped edge cards that
 * existed to suggest a larger board off-frame. They were chrome for a fixed
 * canvas, they have no semantic element behind them, and inventing payloads so
 * they would reappear would be putting appearance back into lesson data. The
 * four elements the lesson actually declares -- simulation, causal chain,
 * equation, P-T chart -- all render.
 */

/* Registering here as well as in the gallery is deliberate. A route must not
 * depend on another route having been visited first: opening /canvas/gas
 * directly is the common case, not the fallback. Registration is idempotent. */
registerRepresentations()

export function GasLesson() {
  const navigate = useNavigate()

  return (
    <div
      className="scene"
      data-canvas="gas-route"
      style={{ ...(cssVariables() as React.CSSProperties), overflowY: 'auto', minHeight: '100vh' }}
    >
      {/* The back affordance the old scene had, kept. Removing the route's only
        * way out would be a regression the layout work has nothing to do with. */}
      <button
        className="sc-round sc-chrome"
        style={{ left: 18, top: 12 }}
        onClick={() => navigate('/today')}
        aria-label="Back"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: space.xxl }}>
        <h1 style={{
          fontFamily: type.display.family, fontSize: type.display.size,
          fontWeight: type.display.weight, letterSpacing: type.display.tracking,
          lineHeight: type.display.lineHeight, color: color.text,
          margin: 0, marginBottom: space.xxl,
        }}>
          {gasPressure.question}
        </h1>

        <div style={{
          border: `${stroke.hair}px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: space.lg,
          background: color.surface,
        }}>
          <LessonRenderer lesson={gasPressure as never} />
        </div>
      </div>
    </div>
  )
}
