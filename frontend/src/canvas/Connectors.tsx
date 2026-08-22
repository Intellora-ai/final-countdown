import React from 'react'

/* THE CURVES BETWEEN PANELS — the board's claim that these are one argument.
 *
 * Every path is a cubic with HORIZONTAL tangents at both ends, so a connector
 * always leaves a panel sideways and arrives sideways. That single rule is
 * what makes six independently-placed panels look deliberately wired rather
 * than joined by whatever straight line was shortest.
 *
 * They are drawn in world space, beneath the panels and above the background,
 * with pointer-events off: a connector is a statement, never a target.
 */

export interface Wire {
  /** World-space start and end. */
  from: [number, number]
  to: [number, number]
  /** Tangent strength. Larger swings wider before turning. */
  bow?: number
  /** Route out of `from` leftwards / into `to` from the right. */
  reverse?: boolean
  dashed?: boolean
  opacity?: number
}

export function wirePath(w: Wire): string {
  const [x0, y0] = w.from
  const [x1, y1] = w.to
  const bow = w.bow ?? Math.max(40, Math.abs(x1 - x0) * 0.45)
  const s = w.reverse ? -1 : 1
  return `M ${x0} ${y0} C ${x0 + bow * s} ${y0}, ${x1 - bow * s} ${y1}, ${x1} ${y1}`
}

export function Connectors({ wires, width, height }: { wires: Wire[]; width: number; height: number }) {
  return (
    <svg className="sc-connectors" width={width} height={height} aria-hidden="true">
      {wires.map((w, i) => (
        <path
          key={i}
          d={wirePath(w)}
          strokeDasharray={w.dashed ? '4 4' : undefined}
          opacity={w.opacity ?? 1}
        />
      ))}
    </svg>
  )
}
