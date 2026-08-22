import React from 'react'
import type { DiagramBlock as DiagramBlockData } from '../types/learningBoard'
import { layoutDiagram, NODE_W, NODE_H } from '../lib/diagramLayout'
import { useBoardInteraction } from '../teaching/BoardInteractionContext'

/* Nodes and relationships, spatial INSIDE this block's own viewBox and
 * nowhere else. The board's grid places the block; the block places its
 * nodes. Spatial data cannot leak outward because the coordinate space ends
 * at this SVG's edge.
 *
 * Labels go through foreignObject — the same technique the chapter map uses —
 * so node text wraps instead of clipping. Below 600px of board width the
 * stylesheet swaps the SVG for the stacked list rendered alongside it: a
 * concept map scaled to a phone is a smudge, and the list carries the same
 * nodes and relationships in reading order. The list doubles as the
 * accessible description at EVERY width.
 *
 * SELECTION, AND WHY IT LIVES IN THE LIST.
 * Choosing a node dims everything it is not connected to, which is the whole
 * point of a concept map: seeing what touches what. The SVG is aria-hidden, so
 * putting focusable controls inside it would create things a keyboard can
 * reach and a screen reader cannot describe. The list items become the
 * buttons instead — they are already the accessible rendering of the same
 * graph — and the SVG mirrors the selection visually. Pointer users click the
 * shapes; everyone else uses the list; both drive one piece of state.
 */
export function DiagramBlock({ block }: { block: DiagramBlockData }) {
  const interaction = useBoardInteraction()
  const nodes = Array.isArray(block.nodes) ? block.nodes : []
  const edges = Array.isArray(block.edges) ? block.edges : []
  if (!nodes.length) return null
  const lay = layoutDiagram(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  /* Selection is board state, so a diagram rendered without a board — a
   * fixture, a test, the gallery — simply has none, and every node draws
   * plainly. Nothing here needs a board to work. */
  const selected = interaction?.selectedNodeId ?? null
  const selectedExists = selected !== null && byId.has(selected)
  const activeId = selectedExists ? selected : null

  /* A node is related to the selection if an edge touches both. Computed from
   * the edges the block declares, never from proximity on screen: two nodes
   * can sit beside each other and mean nothing to one another. */
  const related = new Set<string>()
  if (activeId) {
    related.add(activeId)
    for (const e of edges) {
      if (e.from === activeId) related.add(e.to)
      if (e.to === activeId) related.add(e.from)
    }
  }
  const nodeState = (id: string) =>
    !activeId ? 'plain' : id === activeId ? 'selected' : related.has(id) ? 'related' : 'dimmed'
  const edgeState = (from: string, to: string) =>
    !activeId ? 'plain' : from === activeId || to === activeId ? 'related' : 'dimmed'
  const toggle = (id: string) => interaction?.selectNode(activeId === id ? null : id)

  return (
    <div data-board="diagram">
      <svg viewBox={`0 0 ${lay.width} ${lay.height}`} data-board="diagram-svg" aria-hidden="true">
        {edges.map((e, i) => {
          const a = lay.pos[e.from], b = lay.pos[e.to]
          if (!a || !b) return null
          /* Leave from the facing edge: bottom of the source when the target
           * sits below it, top otherwise. */
          const down = b.y >= a.y + NODE_H
          const sx1 = a.x + NODE_W / 2, sy1 = down ? a.y + NODE_H : a.y
          const sx2 = b.x + NODE_W / 2, sy2 = down ? b.y : b.y + NODE_H
          const my = (sy1 + sy2) / 2
          return (
            <g key={i}>
              <path d={`M ${sx1} ${sy1} C ${sx1} ${my} ${sx2} ${my} ${sx2} ${sy2}`}
                data-board="diagram-edge" data-kind={e.kind || 'reference'}
                data-state={edgeState(e.from, e.to)} fill="none" />
              {e.label && (
                <text x={(sx1 + sx2) / 2} y={my - 6} data-board="diagram-edge-label" textAnchor="middle">{e.label}</text>
              )}
            </g>
          )
        })}
        {nodes.map((n) => {
          const p = lay.pos[n.id]
          if (!p) return null
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={12}
                data-board="diagram-node" data-state={nodeState(n.id)}
                /* Pointer only. The keyboard path is the list below, which a
                 * screen reader can actually describe. */
                onPointerUp={interaction ? () => toggle(n.id) : undefined}
                style={interaction ? { cursor: 'pointer' } : undefined} />
              <foreignObject x={p.x} y={p.y} width={NODE_W} height={NODE_H} style={{ pointerEvents: 'none' }}>
                <div data-board="diagram-node-body">
                  <div data-board="diagram-node-label">{n.label}</div>
                  {n.detail ? <div data-board="diagram-node-detail">{n.detail}</div> : null}
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
      {/* The same graph as text: the phone layout AND the screen-reader path. */}
      <ul data-board="diagram-list">
        {nodes.map((n) => {
          const out = edges.filter((e) => e.from === n.id && byId.has(e.to))
          return (
            <li key={n.id} data-board="diagram-list-node" data-state={nodeState(n.id)}>
              {interaction ? (
                <button
                  type="button"
                  data-board="diagram-list-select"
                  aria-pressed={activeId === n.id}
                  onClick={() => toggle(n.id)}
                >
                  <span data-board="diagram-list-label">{n.label}</span>
                </button>
              ) : (
                <span data-board="diagram-list-label">{n.label}</span>
              )}
              {n.detail ? <span data-board="diagram-list-detail">{n.detail}</span> : null}
              {out.length > 0 && (
                <span data-board="diagram-list-edges">
                  {out.map((e, i) => (
                    <span key={i}>
                      {(e.kind === 'causal' ? 'leads to ' : e.kind === 'sequence' ? 'then ' : 'relates to ')}
                      {byId.get(e.to)!.label}
                      {e.label ? ` (${e.label})` : ''}
                      {i < out.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
