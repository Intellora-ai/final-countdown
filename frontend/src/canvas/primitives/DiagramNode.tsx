import React from 'react'
import { color, type, radius, stroke, accentAlpha } from '../design/tokens'

/* A NODE IN A DIAGRAM — one shape, every graph.
 *
 * Concept maps, causal chains and flowcharts all draw the same box, and until
 * now each drew its own. One primitive means a node in a physics lesson and a
 * node in a history lesson are recognisably the same object, which is what
 * Goal 1 asks for at the level a learner actually notices.
 *
 * The full label is kept in a <title> whenever the visible text was shortened.
 * That is not a nicety: the layout validator's labelFits check refuses a
 * truncated label with no way to read it.
 */

export interface DiagramNodeProps {
  x: number
  y: number
  w: number
  h: number
  label: string
  /** Present when `label` was shortened; rendered as the accessible title. */
  fullLabel?: string
  /** Marks the nodes a lesson is actually about. */
  emphasis?: boolean
}

export function DiagramNode({ x, y, w, h, label, fullLabel, emphasis }: DiagramNodeProps) {
  const truncated = Boolean(fullLabel && fullLabel !== label)
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={radius.md}
        fill={emphasis ? accentAlpha.wash : color.surfaceRaised}
        stroke={emphasis ? accentAlpha.node : color.border}
        strokeWidth={stroke.hair}
      />
      <text
        x={x + w / 2} y={y + h / 2}
        textAnchor="middle" dominantBaseline="middle"
        fill={emphasis ? color.accentGlow : color.text}
        fontSize={type.label.size}
        fontFamily={type.label.family}
      >
        {label}
        {truncated && <title>{fullLabel}</title>}
      </text>
    </g>
  )
}
