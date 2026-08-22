import React from 'react'

/* PANEL ⑥ — the four quantities, and the one place they meet.
 *
 * A force simulation was the obvious reach here and it is the wrong tool: five
 * nodes whose arrangement carries MEANING (three inputs converging on the
 * mechanism, one context node beneath) would be re-arranged into something
 * different on every mount, and a concept map that moves between loads is a
 * concept map the learner cannot re-recognise. Positions are therefore stated,
 * and the curve between two nodes is a pure function of their two anchors.
 */

export interface MapNode { id: string; label: string; x: number; y: number; accent?: boolean }
export interface MapEdge { from: string; to: string }

const W = 260
const NODE_H = 26

function widthFor(label: string) { return Math.max(58, label.length * 7.1 + 22) }

export function ConceptMap({
  nodes,
  edges,
  height = 170,
}: {
  nodes: MapNode[]
  edges: MapEdge[]
  height?: number
}) {
  const at = (id: string) => nodes.find((n) => n.id === id)

  return (
    <svg width={W} height={height} role="img"
      aria-label={`Concept map: ${edges.map((e) => `${at(e.from)?.label} relates to ${at(e.to)?.label}`).join('; ')}.`}>
      {edges.map((e, i) => {
        const a = at(e.from), b = at(e.to)
        if (!a || !b) return null
        const ax = a.x + widthFor(a.label) / 2
        const ay = a.y + NODE_H / 2
        const bx = b.x + widthFor(b.label) / 2
        const by = b.y + NODE_H / 2
        /* Horizontal-tangent cubic: the curve leaves and enters each node
         * sideways, which is what stops three edges converging on one node
         * from arriving as a spike. */
        const dx = Math.max(24, Math.abs(bx - ax) * 0.55)
        return (
          <path
            key={i}
            d={`M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`}
            fill="none"
            stroke="rgba(45,212,191,0.5)"
            strokeWidth={1.15}
          />
        )
      })}

      {nodes.map((n) => {
        const w = widthFor(n.label)
        return (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={w} height={NODE_H} rx={NODE_H / 2}
              fill={n.accent ? 'rgba(45,212,191,0.10)' : 'rgba(255,255,255,0.045)'}
              stroke={n.accent ? 'rgba(45,212,191,0.75)' : 'rgba(255,255,255,0.16)'}
              strokeWidth={1}
            />
            <text
              x={n.x + w / 2} y={n.y + NODE_H / 2 + 0.5}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill={n.accent ? '#7ee7d8' : '#d5dee3'}
              fontFamily="system-ui, sans-serif"
            >
              {n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
