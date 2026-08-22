import React from 'react'
import { layoutFlow } from '../layout/flow'
import { color, type, space, radius, stroke, accentAlpha, ink } from '../design/tokens'
import { arrow } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* THE DIAGRAM PANEL — placeholder in scope, real in behaviour.
 *
 * Phase 3 asked only for a diagram PLACEHOLDER, and there is no diagram
 * contract yet, so this reads its payload directly rather than a derived plan.
 * That is the honest limit of this slice and it is stated here rather than
 * discovered later.
 *
 * What it does NOT do is fake it. The node placement and every arrow path come
 * from layout/flow.ts, which is already built and has fifteen tests: shape
 * follows count, serpentine reverses alternate rows, labels truncate while
 * preserving their full text, and every bezier has horizontal tangents at both
 * ends. Drawing boxes with a hand-written path here would have made the panel
 * look finished while throwing that work away.
 */
export function DiagramPanel({ data, title }: PanelProps) {
  const d = data as {
    nodes?: Array<{ id: string; label: string }>
    edges?: Array<{ from: string; to: string; label?: string }>
  }
  const nodes = d.nodes ?? []
  const edges = d.edges ?? []

  if (!nodes.length) {
    return (
      <p style={{ fontFamily: type.mono.family, fontSize: type.mono.size, color: ink.axis }}>
        This diagram has no nodes.
      </p>
    )
  }

  const flow = layoutFlow(nodes, edges, 900)
  const pad = space.lg
  const W = flow.width + pad * 2
  const H = flow.height + pad * 2

  return (
    <div>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
        }}>{title}</h3>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`${flow.shape} diagram: ${nodes.map((n) => n.label).join(' then ')}.`}>
        <defs>
          <marker id="dp-head" markerWidth={arrow.headLength} markerHeight={arrow.headWidth * 2}
            refX={arrow.headLength} refY={arrow.headWidth} orient="auto">
            <path d={`M0,0 L${arrow.headLength},${arrow.headWidth} L0,${arrow.headWidth * 2} Z`} fill={color.accent} />
          </marker>
        </defs>

        <g transform={`translate(${pad},${pad})`}>
          {flow.edges.map((e, i) => (
            <path key={i} d={e.path} fill="none"
              stroke={accentAlpha.connector} strokeWidth={stroke.base}
              strokeLinecap={arrow.cap as 'round'} markerEnd="url(#dp-head)" />
          ))}

          {flow.nodes.map((n) => (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={radius.md}
                fill={color.surfaceRaised} stroke={color.border} strokeWidth={stroke.hair} />
              <text x={n.x + n.w / 2} y={n.y + n.h / 2} textAnchor="middle" dominantBaseline="middle"
                fill={color.text} fontSize={type.label.size} fontFamily={type.label.family}>
                {n.label}
                {/* Truncated for display, never lost: the title is what the
                  * validator's labelFits check requires. */}
                {n.truncated && <title>{n.fullLabel}</title>}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {flow.wrongRepresentation && (
        <p style={{
          fontFamily: type.mono.family, fontSize: type.mono.size,
          color: color.warning, margin: 0, marginTop: space.xs,
        }}>{flow.wrongRepresentation}</p>
      )}
    </div>
  )
}
