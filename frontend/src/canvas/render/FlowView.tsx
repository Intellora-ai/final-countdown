import { useMemo } from 'react'

import { ArrowDefs, FigureSvg, arrowRef, curvePath, useArrowScope } from '../design/primitives'
import type { Block } from '../spec/spec'

type FlowBlock = Extract<Block, { kind: 'flow' }>

/**
 * The causal chain — the reference's ② row.
 *
 * WHY THE LAYOUT IS COMPUTED, NOT AUTHORED
 * ----------------------------------------
 * The spec gives nodes and links and nothing else. This decides whether five
 * steps run as one straight line or wrap onto two, from how much room there is
 * and how long the labels are. An author who could set that would set it for
 * their screen and break everyone else's.
 *
 * A CHAIN THAT WRAPS BADLY READS AS TWO CHAINS
 * --------------------------------------------
 * So wrapping is a real decision, not a fallback: when the row wraps, the
 * connector from the end of one row to the start of the next curves DOWN and
 * BACK, which is visibly different from a left-to-right step. Straight-line
 * wrapping would silently imply "collisions → temperature".
 */
export function FlowView({ block }: { block: FlowBlock }) {
  /* One scope per mounted diagram: two of these on a page would otherwise
     share an SVG id, and every arrowhead would resolve to the first. */
  const arrowScope = useArrowScope()

  const layout = useMemo(() => layoutChain(block), [block])

  return (
    /* A `flow` block reaches the page through BlockView, not FigureView, so it
       needs its own scroller — the one FigureView adds never wraps this. */
    <div className="lc-figure-scroll" data-overflow="scroll">
    <FigureSvg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={describe(block)}
    >
      <ArrowDefs scope={arrowScope} />

      {/*
        GLOW BY DOUBLE-STROKE, NOT BY FILTER.
        ------------------------------------
        The obvious version put `filter="url(#lc-bloom)"` on each link and the
        arrows vanished completely — path present, stroke correct, nothing
        painted. A filter region given in percentages is relative to the object
        BOUNDING BOX, and a horizontal connector's bbox is `{ w: 64, h: 0 }`.
        500% of zero is zero, so the filter output had no area and took the
        marker down with it.

        Two strokes have no such dependency: a wide faint one reads as bloom, a
        thin bright one carries the line, and neither cares what shape the path
        is. The arrowhead sits on the crisp pass so it is never blurred.
      */}
      {layout.links.map((link, i) => (
        <path key={`glow-${i}`} className="lc-flow__link-glow" d={link.d} />
      ))}
      {layout.links.map((link, i) => (
        <path key={i} className="lc-flow__link" d={link.d} markerEnd={arrowRef(arrowScope)} />
      ))}

      {layout.nodes.map((node) => (
        <g key={node.id}>
          {/* Multi-word labels wrap onto their own tspans: a chain node with one
              long line forces every other node wide and wastes the row. */}
          <text
            className={node.tone === 'neutral' ? 'lc-flow__node' : 'lc-flow__node lc-flow__node--emph'}
            x={node.cx}
            y={node.cy}
            textAnchor="middle"
          >
            {node.lines.map((line, i) => (
              <tspan key={i} x={node.cx} dy={i === 0 ? 0 : LINE_HEIGHT}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </FigureSvg>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Geometry — pure, so it can be tested without a DOM                         */
/* -------------------------------------------------------------------------- */

const NODE_W = 132
const NODE_H = 54
const GAP_X = 46
const GAP_Y = 34
const LINE_HEIGHT = 13
const PER_ROW_MAX = 5

export interface ChainNode {
  id: string
  lines: string[]
  cx: number
  cy: number
  tone: string
}

export interface ChainLink {
  d: string
  wrap: boolean
}

export function layoutChain(block: FlowBlock) {
  const perRow = Math.min(PER_ROW_MAX, block.nodes.length)
  const rows = Math.ceil(block.nodes.length / perRow)

  const nodes: ChainNode[] = block.nodes.map((node, index) => {
    const row = Math.floor(index / perRow)
    const col = index % perRow
    return {
      id: node.id,
      tone: node.tone,
      lines: wrapLabel(node.label),
      cx: col * (NODE_W + GAP_X) + NODE_W / 2,
      cy: row * (NODE_H + GAP_Y) + NODE_H / 2,
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))

  const links: ChainLink[] = block.links.flatMap((link) => {
    const from = byId.get(link.from)
    const to = byId.get(link.to)
    // The validator already refused unknown ids; this keeps the renderer total.
    if (!from || !to) return []

    const wrap = to.cy !== from.cy
    const start = { x: from.cx + NODE_W / 2 - 12, y: from.cy }
    const end = { x: to.cx - NODE_W / 2 + 6, y: to.cy }
    return [{ d: curvePath(start, end), wrap }]
  })

  return {
    nodes,
    links,
    width: perRow * (NODE_W + GAP_X) - GAP_X,
    height: rows * (NODE_H + GAP_Y) - GAP_Y + LINE_HEIGHT,
  }
}

/** Two lines maximum. A third means the label is a sentence, not a step. */
export function wrapLabel(label: string): string[] {
  const words = label.split(' ')
  if (words.length <= 2) return [label]

  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

/** The chain, as one sentence, for anyone who cannot see the diagram. */
export function describe(block: FlowBlock): string {
  const byId = new Map(block.nodes.map((n) => [n.id, n.label]))
  const steps = block.links.map((l) => `${byId.get(l.from) ?? l.from} leads to ${byId.get(l.to) ?? l.to}`)
  return `${block.title ?? 'Causal chain'}: ${steps.join('; ')}.`
}
