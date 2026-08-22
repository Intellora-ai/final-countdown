import React from 'react'
import { arrow, accentAlpha, color, stroke } from '../design/tokens'

/* AN ARROW GENERATED FROM A RELATION, never authored.
 *
 * A lesson says `{ from: 'heat', to: 'motion', type: 'causes' }`. It does not
 * say where the arrow goes, how far it bows, or what its head looks like. All
 * of that comes from the two endpoints plus the constants in tokens.arrow,
 * which is why every arrow on every board looks like a sibling of every other.
 *
 * HORIZONTAL TANGENTS AT BOTH ENDS is the single rule that matters. It makes a
 * connector leave a panel sideways and arrive sideways, and that alone is the
 * difference between six panels that look deliberately wired and six panels
 * joined by whatever straight line was shortest.
 *
 * RELATION KIND CHANGES THE STROKE, NOT THE GEOMETRY. A causal arrow and a
 * reference arrow take the same path; only their weight and dash differ, so
 * the board's arrow language stays one language.
 */

export type RelationKind = 'causes' | 'supports' | 'precedes' | 'contrasts-with' | 'reference'

export interface Point { x: number; y: number }

export interface RelationArrowProps {
  from: Point
  to: Point
  kind?: RelationKind
  label?: string
  /** Route out to the right and back — for a fold or a return edge. */
  reverse?: boolean
  /** Overrides the computed bow. Used only by the legacy hand-placed scene. */
  bow?: number
}

/** The path, as a pure function. Exported so it can be tested without a DOM. */
export function relationPath(
  from: Point, to: Point, opts: { reverse?: boolean; bow?: number } = {},
): string {
  const span = Math.abs(to.x - from.x)
  const bow = opts.bow ?? Math.max(arrow.minBow, span * arrow.curvature)
  const s = opts.reverse ? -1 : 1
  return `M ${from.x} ${from.y} C ${from.x + bow * s} ${from.y}, ${to.x - bow * s} ${to.y}, ${to.x} ${to.y}`
}

const STROKES: Record<RelationKind, { width: number; dash?: string; colour: string }> = {
  causes: { width: stroke.base, colour: accentAlpha.connector },
  supports: { width: stroke.hair, colour: accentAlpha.line },
  precedes: { width: stroke.base, colour: accentAlpha.connector },
  'contrasts-with': { width: stroke.hair, dash: '4 4', colour: accentAlpha.line },
  reference: { width: stroke.hair, dash: '3 3', colour: accentAlpha.wash },
}

export function RelationArrow({
  from, to, kind = 'causes', label, reverse, bow,
}: RelationArrowProps) {
  const s = STROKES[kind]
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }

  return (
    <g>
      <path
        d={relationPath(from, to, { reverse, bow })}
        fill="none"
        stroke={s.colour}
        strokeWidth={s.width}
        strokeLinecap={arrow.cap as 'round'}
        {...(s.dash ? { strokeDasharray: s.dash } : {})}
      />
      {label && (
        <text
          x={mid.x} y={mid.y - arrow.headWidth}
          textAnchor="middle"
          fill={color.textMuted}
          fontSize={arrow.headLength * 1.6}
        >
          {label}
        </text>
      )}
    </g>
  )
}

/** The shared arrowhead. One definition per SVG, referenced by every arrow —
 *  so a board cannot end up with two head shapes. */
export function ArrowHead({ id = 'relation-head' }: { id?: string }) {
  return (
    <marker
      id={id}
      markerWidth={arrow.headLength}
      markerHeight={arrow.headWidth * 2}
      refX={arrow.headLength}
      refY={arrow.headWidth}
      orient="auto"
    >
      <path
        d={`M0,0 L${arrow.headLength},${arrow.headWidth} L0,${arrow.headWidth * 2} Z`}
        fill={color.accent}
      />
    </marker>
  )
}
