import { arrow, space } from '../design/tokens'

/* FLOW LAYOUT — node placement and arrow geometry, both COMPUTED.
 *
 * A lesson supplies node labels and `from`/`to` ids. It never supplies a
 * coordinate, a control point, a curvature or a cap style, because an arrow
 * authored by a generator is an arrow that will one day point at nothing.
 * Everything below is derived from the node boxes plus the constants in
 * tokens.arrow, which is why every arrow on every board looks like a sibling
 * of every other.
 *
 * SHAPE FOLLOWS COUNT, and the thresholds are the design:
 *
 *   <= 5    one horizontal row — the eye reads a short chain straight across
 *   6-8     serpentine, two rows, connector turning at the fold
 *   > 8     vertical, because nine boxes across is unreadable at any width
 *   > 14    phase groups, each collapsible
 */

export interface FlowNode {
  id: string
  label: string
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
}

export type FlowShape = 'row' | 'serpentine' | 'column' | 'phases'

export interface PlacedNode extends FlowNode {
  x: number
  y: number
  w: number
  h: number
  /** Serpentine only: which row, so the fold can be drawn. */
  row: number
  /** Set when the label had to be shortened; a tooltip is then required. */
  truncated: boolean
  /** The full text, always preserved even when the label is shortened. */
  fullLabel: string
}

export interface PlacedEdge {
  from: string
  to: string
  path: string
  label?: string
}

export interface FlowLayout {
  shape: FlowShape
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  width: number
  height: number
  /** Set when the content wants a different representation entirely. */
  wrongRepresentation?: string
}

const NODE_W = 132
const NODE_H = 44
const GAP_X = space.xl
const GAP_Y = space.h1

/* LABEL LIMITS. Two lines is the most a node can hold before it stops being a
 * node and starts being a paragraph in a box. */
const TWO_LINE_LIMIT = 24
const WRONG_REPRESENTATION_LIMIT = 40

export function shapeFor(count: number): FlowShape {
  if (count > 14) return 'phases'
  if (count > 8) return 'column'
  if (count > 5) return 'serpentine'
  return 'row'
}

function fitLabel(label: string): { text: string; truncated: boolean } {
  if (label.length <= TWO_LINE_LIMIT) return { text: label, truncated: false }
  /* Truncate and REQUIRE a tooltip — never clip silently. The validator's
   * labelFits check fails a truncated label with no way to read it. */
  return { text: label.slice(0, TWO_LINE_LIMIT - 1) + '…', truncated: true }
}

/* ARROW GEOMETRY — a cubic with horizontal tangents at both ends.
 *
 * That single rule is what makes independently-placed nodes look deliberately
 * wired rather than joined by whatever straight line was shortest. The bow is
 * a fraction of the horizontal span, floored so that near-vertical connectors
 * still curve rather than collapsing into a spike. */
export function edgePath(a: PlacedNode, b: PlacedNode): string {
  const x0 = a.x + a.w
  const y0 = a.y + a.h / 2
  const x1 = b.x
  const y1 = b.y + b.h / 2

  /* Same row, adjacent: a short straight-ish link reads better than a bulge. */
  const bow = Math.max(arrow.minBow, Math.abs(x1 - x0) * arrow.curvature)

  /* A backwards edge (the serpentine fold, or a return arrow) leaves to the
   * RIGHT and enters from the RIGHT, so it loops rather than crossing back
   * through the nodes between. */
  if (x1 < x0) {
    const out = a.x + a.w + bow
    const inn = b.x - bow
    return `M ${x0} ${y0} C ${out} ${y0}, ${inn} ${y1}, ${x1} ${y1}`
  }

  return `M ${x0} ${y0} C ${x0 + bow} ${y0}, ${x1 - bow} ${y1}, ${x1} ${y1}`
}

export function layoutFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  availableWidth = 1200,
): FlowLayout {
  const shape = shapeFor(nodes.length)

  const tooLong = nodes.find((n) => n.label.length > WRONG_REPRESENTATION_LIMIT)
  const wrongRepresentation = tooLong
    ? `"${tooLong.label.slice(0, 30)}…" is ${tooLong.label.length} characters. A node that long is a paragraph; this wants a flowchart node with a body, or prose.`
    : undefined

  const perRow =
    shape === 'row' ? nodes.length
    : shape === 'serpentine' ? Math.ceil(nodes.length / 2)
    : 1

  const placed: PlacedNode[] = nodes.map((n, i) => {
    const { text, truncated } = fitLabel(n.label)
    const row = Math.floor(i / perRow)
    /* Serpentine reverses every second row, so the reading order follows the
     * boustrophedon a reader's eye actually takes. */
    const indexInRow = i % perRow
    const col = row % 2 === 1 && shape === 'serpentine'
      ? perRow - 1 - indexInRow
      : indexInRow

    return {
      ...n, label: text, fullLabel: n.label, truncated,
      x: shape === 'column' || shape === 'phases'
        ? Math.max(0, (availableWidth - NODE_W) / 2)
        : col * (NODE_W + GAP_X),
      y: shape === 'column' || shape === 'phases'
        ? i * (NODE_H + GAP_Y / 2)
        : row * (NODE_H + GAP_Y),
      w: NODE_W, h: NODE_H, row,
    }
  })

  const byId = new Map(placed.map((n) => [n.id, n]))
  const placedEdges: PlacedEdge[] = edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => ({
      from: e.from, to: e.to,
      path: edgePath(byId.get(e.from)!, byId.get(e.to)!),
      ...(e.label ? { label: e.label } : {}),
    }))

  const width = Math.max(...placed.map((n) => n.x + n.w), 0)
  const height = Math.max(...placed.map((n) => n.y + n.h), 0)

  return {
    shape, nodes: placed, edges: placedEdges, width, height,
    ...(wrongRepresentation ? { wrongRepresentation } : {}),
  }
}
