import { useMemo } from 'react'

import { ArrowDefs, GlowDot, Pill, arrowRef, curvePath, useArrowScope } from '../../design/primitives'
import { tokens } from '../../design/tokens'
import { checkGraph, findBipartiteConflict, findCycle } from '../../spec/shapeInvariants'
import type { GraphData, ShapeIssue } from '../../spec/shapeInvariants'
import { wrapLabel } from '../FlowView'

/**
 * The `graph` shape: nodes and edges, drawn 33 different ways.
 *
 * WHY ONE LAYOUT WOULD BE A LIE
 * -----------------------------
 * A dependency graph and a feedback loop are the same data structure and
 * completely different claims. A dependency graph says "this comes before
 * that", and only a layered layout — every edge pointing the same way down the
 * page — actually shows it. A feedback loop says "this closes on itself", and
 * only a ring shows THAT. Run both through one spring simulation and you get
 * two pleasant blobs, neither of which says anything.
 *
 * So the variant picks the layout, and each layout is chosen because it makes
 * that variant's specific claim visible. The mapping is in `GRAPH_STRATEGY`
 * below, one line per name, so a disagreement is a one-line disagreement.
 *
 * LAYOUT IS PURE AND DETERMINISTIC
 * --------------------------------
 * `layoutGraph` reads its arguments and nothing else: no DOM, no measurement,
 * no clock, no `Math.random`. The one place that would ordinarily want
 * randomness — the starting positions of the force layout — is seeded from a
 * hash of each node's own id, so the same graph produces byte-identical
 * coordinates on every run.
 *
 * That is not tidiness. A diagram that reshuffles on reload cannot be reviewed,
 * cannot be screenshotted for a regression test, and quietly teaches the reader
 * that position means nothing.
 */

/* -------------------------------------------------------------------------- */
/* Geometry constants                                                         */
/* -------------------------------------------------------------------------- */

/*
 * These are SVG USER UNITS inside a viewBox, not CSS pixels — the same footing
 * `FlowView` puts its `NODE_W`/`GAP_X` on. Law 4 governs colour, type, spacing
 * and stroke in the design system; the internal coordinate space of one drawing
 * is not a design token and cannot be one, because the numbers only mean
 * anything relative to each other.
 */
export const NODE_W = 132
export const NODE_H = 44
const GAP_X = 40
const GAP_Y = 56

/** One node plus its clearance. Every layout spaces on this lattice. */
export const CELL_W = NODE_W + GAP_X
export const CELL_H = NODE_H + GAP_Y

/**
 * The separation every strategy guarantees between two node centres.
 *
 * Two boxes can only overlap when the centres are closer than
 * `hypot(NODE_W, NODE_H)` ≈ 139, so a floor of `CELL_H` = 100 is not by itself
 * enough — but no layout here ever puts two nodes 100 apart *horizontally*:
 * 100 is the vertical row pitch, and rows are 172 apart across. The tests
 * check the real thing (box intersection) as well as this floor.
 */
export const MIN_NODE_DISTANCE = CELL_H

const LINE_H = 13
const PAD = 28
/** Arrowheads must land on the box edge, not inside it. */
const ANCHOR_PAD = 4

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type GraphStrategy = 'layered' | 'bipartite' | 'arc' | 'ring' | 'radial' | 'force'

export interface Vec {
  x: number
  y: number
}

/** One cubic Bézier. Every connector in this file is a list of these. */
export interface CubicSegment {
  p0: Vec
  c1: Vec
  c2: Vec
  p1: Vec
}

/**
 * The least a connector router needs to know about a thing it must avoid.
 *
 * Deliberately smaller than `GraphNodeBox`: `HierarchyShape` reuses the same
 * routing and the same collision check, and it should not have to pretend its
 * tree nodes have layers and groups to do it.
 */
export interface Box {
  id: string
  /** Centre of the box. */
  x: number
  y: number
  w: number
  h: number
}

export interface GraphNodeBox extends Box {
  label: string
  lines: string[]
  /** Layer index for layered layouts, ring index elsewhere, -1 when neither. */
  layer: number
  group?: string
  /** True for a source of the DAG, the hub of a radial, the head of a ring. */
  anchor: boolean
}

export interface GraphEdgeShape {
  from: string
  to: string
  label?: string
  d: string
  segments: CubicSegment[]
  /** 0 hair, 1 thin, 2 thick. Weighted graphs bucket; everything else is 1. */
  weightRank: 0 | 1 | 2
  selfLoop: boolean
  /** Where an edge label sits, when the edge has one. */
  labelAt?: Vec
}

export interface GraphLayout {
  strategy: GraphStrategy
  orientation: 'vertical' | 'horizontal'
  nodes: GraphNodeBox[]
  edges: GraphEdgeShape[]
  viewBox: string
  minX: number
  minY: number
  width: number
  height: number
  directed: boolean
  /**
   * Reject-level invariant failures.
   *
   * When this is non-empty the layout is EMPTY. A cycle in a declared DAG, a
   * missing endpoint or a non-bipartite bipartite graph is a contradiction, and
   * a renderer that draws it anyway has published something false with a
   * confident-looking picture around it.
   */
  refusals: ShapeIssue[]
  /** One sentence saying what position means here, for the caption. */
  note: string
}

/* -------------------------------------------------------------------------- */
/* Variant → layout                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which layout each of the 33 named types gets, and why.
 *
 * `layered`  — direction is the content. Longest-path layers make every edge
 *              point down the page, so "A before B" is readable without
 *              tracing a single arrow.
 * `ring`     — the loop is the content. A cycle drawn as a closed ring is the
 *              only layout in which "and back to the start" is visible.
 * `radial`   — one thing in the middle and everything else around it. A C4
 *              context view is exactly that claim.
 * `bipartite`— two disjoint sets, so two columns. Any other layout makes the
 *              reader work out which side a node is on.
 * `arc`      — node ORDER along a line is the content; edges arc over it.
 * `force`    — no structural claim to make. Position is arrangement only, and
 *              the caption says so.
 */
export const GRAPH_STRATEGY: Record<string, GraphStrategy> = {
  /* Direction carries meaning: layer it. */
  directedGraph: 'layered',
  dag: 'layered',
  dependencyGraph: 'layered',
  callGraph: 'layered',
  stateDiagram: 'layered',
  argumentMap: 'layered',
  classDiagram: 'layered',
  moduleGraph: 'layered',
  controlFlowGraph: 'layered',
  dataFlowGraph: 'layered',
  gitBranchGraph: 'layered',
  containerDiagram: 'layered',
  componentDiagram: 'layered',
  deploymentDiagram: 'layered',
  infrastructureTopology: 'layered',
  threatModel: 'layered',
  bayesianNetwork: 'layered',
  influenceDiagram: 'layered',
  foodWeb: 'layered',
  bowTie: 'layered',

  /* Two disjoint sets. */
  bipartiteGraph: 'bipartite',

  /* Order along a line. */
  arcDiagram: 'arc',

  /* Closed loops. */
  causalLoop: 'ring',
  feedbackLoop: 'ring',
  biologicalCycle: 'ring',

  /* One centre. */
  systemContext: 'radial',

  /* No structural claim — arrangement only. */
  nodeLink: 'force',
  weightedGraph: 'force',
  socialGraph: 'force',
  conceptMap: 'force',
  ontology: 'force',
  erDiagram: 'force',
  molecularStructure: 'force',
}

/**
 * A bow tie reads causes → hazard → consequences, left to right.
 *
 * Same layering algorithm, axes swapped. Making it a separate strategy would
 * duplicate the whole cycle-breaking and ordering pass to change one letter.
 */
const HORIZONTAL_VARIANTS = new Set(['bowTie'])

/** Names where an arrowhead would assert a direction the data does not have. */
const UNDIRECTED_VARIANTS = new Set([
  'nodeLink',
  'socialGraph',
  'weightedGraph',
  'molecularStructure',
  'erDiagram',
  'arcDiagram',
])

export function graphStrategyFor(variant: string): GraphStrategy {
  return GRAPH_STRATEGY[variant] ?? 'force'
}

/* -------------------------------------------------------------------------- */
/* The layout                                                                 */
/* -------------------------------------------------------------------------- */

interface Edge {
  from: string
  to: string
}

export function layoutGraph(data: GraphData, variant: string = data.variant): GraphLayout {
  const refusals = checkGraph(data, 'graph').filter((issue) => issue.level === 'reject')
  const strategy = graphStrategyFor(variant)
  const orientation: 'vertical' | 'horizontal' = HORIZONTAL_VARIANTS.has(variant)
    ? 'horizontal'
    : 'vertical'
  const directed = data.directed ?? !UNDIRECTED_VARIANTS.has(variant)

  const empty: GraphLayout = {
    strategy,
    orientation,
    nodes: [],
    edges: [],
    viewBox: `0 0 ${PAD * 2} ${PAD * 2}`,
    minX: 0,
    minY: 0,
    width: PAD * 2,
    height: PAD * 2,
    directed,
    refusals,
    note: '',
  }

  /* REFUSE, DO NOT REPAIR. Nothing below runs on contradictory data. */
  if (refusals.length > 0 || data.nodes.length === 0) return empty

  const ids = data.nodes.map((n) => n.id)
  const edges: Edge[] = data.edges.map((e) => ({ from: e.from, to: e.to }))

  const placed =
    strategy === 'layered'
      ? placeLayered(ids, edges, orientation)
      : strategy === 'bipartite'
        ? placeBipartite(data, edges)
        : strategy === 'arc'
          ? placeArc(ids)
          : strategy === 'ring'
            ? placeRing(ids, edges)
            : strategy === 'radial'
              ? placeRadial(ids, edges)
              : placeForce(ids, edges)

  const nodes: GraphNodeBox[] = data.nodes.map((node) => {
    const at = placed.at.get(node.id) ?? { x: 0, y: 0 }
    return {
      id: node.id,
      label: node.label,
      lines: wrapLabel(node.label),
      x: round(at.x),
      y: round(at.y),
      w: NODE_W,
      h: NODE_H,
      layer: placed.layer.get(node.id) ?? -1,
      ...(node.group === undefined ? {} : { group: node.group }),
      anchor: placed.anchors.has(node.id),
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const shaped = shapeEdges(data, byId, strategy)
  const bounds = boundsOf(
    nodes,
    shaped.map((e) => e.segments),
  )

  return {
    strategy,
    orientation,
    nodes,
    edges: shaped,
    viewBox: `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`,
    minX: bounds.minX,
    minY: bounds.minY,
    width: bounds.width,
    height: bounds.height,
    directed,
    refusals,
    note: placed.note,
  }
}

interface Placement {
  at: Map<string, Vec>
  layer: Map<string, number>
  anchors: Set<string>
  note: string
}

/* -------------------------------------------------------------------------- */
/* Layered — longest path from the sources                                    */
/* -------------------------------------------------------------------------- */

/**
 * Break every cycle, layer by longest path, then order each layer to reduce
 * crossings.
 *
 * LONGEST PATH, NOT SHORTEST. Shortest-path layering puts a node one level
 * below its earliest predecessor, which lets an edge skip backwards over a
 * layer. Longest path guarantees `layer(from) < layer(to)` for every remaining
 * edge, which is the entire reason to layer a dependency graph at all.
 */
function placeLayered(ids: string[], edges: Edge[], orientation: 'vertical' | 'horizontal'): Placement {
  const forward = breakCycles(ids, edges)
  const layerOf = longestPathLayers(ids, forward)

  const depth = Math.max(...ids.map((id) => layerOf.get(id) ?? 0)) + 1
  const rows: string[][] = Array.from({ length: depth }, () => [])
  for (const id of ids) rows[layerOf.get(id) ?? 0]?.push(id)

  const ordered = reduceCrossings(rows, forward)

  const across = orientation === 'vertical' ? CELL_W : CELL_H
  const along = orientation === 'vertical' ? CELL_H : CELL_W
  const widest = Math.max(...ordered.map((row) => row.length))

  const at = new Map<string, Vec>()
  ordered.forEach((row, layer) => {
    const offset = ((widest - row.length) * across) / 2
    row.forEach((id, index) => {
      const a = offset + index * across + across / 2
      const b = layer * along + along / 2
      at.set(id, orientation === 'vertical' ? { x: a, y: b } : { x: b, y: a })
    })
  })

  const anchors = new Set(ids.filter((id) => (layerOf.get(id) ?? 0) === 0))
  const dropped = edges.length - forward.length
  const note =
    dropped > 0
      ? `Layered top to bottom, except for ${dropped} edge${dropped === 1 ? '' : 's'} that point back up the page: those are the ones closing a loop.`
      : orientation === 'vertical'
        ? 'Layered: every edge points down the page, so anything above comes first.'
        : 'Layered left to right: causes on the left, consequences on the right.'

  return { at, layer: layerOf, anchors, note }
}

/**
 * Remove one edge per cycle until none is left.
 *
 * `findCycle` is the project's cycle finder and stays the project's cycle
 * finder — it is the same function `checkGraph` uses to REFUSE a declared DAG,
 * so a graph that is allowed to cycle (a state diagram, a control-flow graph)
 * is measured by exactly the same rule that would have rejected it. The last
 * hop of the returned path is the back edge; dropping it and asking again
 * terminates because the edge count strictly falls.
 */
export function breakCycles(ids: string[], edges: Edge[]): Edge[] {
  let kept = edges.filter((e) => e.from !== e.to)

  for (let guard = 0; guard <= edges.length; guard += 1) {
    const cycle = findCycle(ids, kept)
    if (!cycle || cycle.length < 2) break

    const from = cycle[cycle.length - 2]
    const to = cycle[cycle.length - 1]
    const index = kept.findIndex((e) => e.from === from && e.to === to)
    if (index < 0) break
    kept = kept.filter((_, i) => i !== index)
  }

  return kept
}

/** layer(n) = 0 for a source, else 1 + the deepest predecessor. */
export function longestPathLayers(ids: string[], edges: Edge[]): Map<string, number> {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const id of ids) {
    incoming.set(id, [])
    outgoing.set(id, [])
  }
  for (const e of edges) {
    incoming.get(e.to)?.push(e.from)
    outgoing.get(e.from)?.push(e.to)
  }

  const remaining = new Map(ids.map((id) => [id, incoming.get(id)?.length ?? 0]))
  const layer = new Map(ids.map((id) => [id, 0]))

  /* Kahn's order, taken in declaration order so the result never depends on
     Map or Set iteration accidents. */
  let ready = ids.filter((id) => (remaining.get(id) ?? 0) === 0)
  const seen = new Set<string>(ready)

  while (ready.length > 0) {
    const next: string[] = []
    for (const id of ready) {
      const here = layer.get(id) ?? 0
      for (const child of outgoing.get(id) ?? []) {
        layer.set(child, Math.max(layer.get(child) ?? 0, here + 1))
        const left = (remaining.get(child) ?? 0) - 1
        remaining.set(child, left)
        if (left === 0 && !seen.has(child)) {
          seen.add(child)
          next.push(child)
        }
      }
    }
    ready = next
  }

  return layer
}

/**
 * Barycentre ordering, four passes, stable.
 *
 * Fixed iteration count on purpose: "iterate until it stops improving" is a
 * loop whose stopping point depends on floating-point ties, and that is
 * nondeterminism dressed up as quality.
 */
export function reduceCrossings(rows: string[][], edges: Edge[], passes = 4): string[][] {
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const e of edges) {
    if (!up.has(e.to)) up.set(e.to, [])
    up.get(e.to)?.push(e.from)
    if (!down.has(e.from)) down.set(e.from, [])
    down.get(e.from)?.push(e.to)
  }

  const ordered = rows.map((row) => [...row])

  const sweep = (indexOf: Map<string, number>, row: string[], neighbours: Map<string, string[]>) => {
    const key = new Map<string, number>()
    row.forEach((id, i) => {
      const ns = (neighbours.get(id) ?? []).map((n) => indexOf.get(n)).filter((n): n is number => n !== undefined)
      key.set(id, ns.length === 0 ? i : ns.reduce((a, b) => a + b, 0) / ns.length)
    })
    /* Array#sort is stable, so equal barycentres keep their previous order. */
    return [...row].sort((a, b) => (key.get(a) ?? 0) - (key.get(b) ?? 0))
  }

  for (let pass = 0; pass < passes; pass += 1) {
    const downward = pass % 2 === 0
    if (downward) {
      for (let r = 1; r < ordered.length; r += 1) {
        const above = ordered[r - 1] ?? []
        const row = ordered[r] ?? []
        const indexOf = new Map(above.map((id, i) => [id, i]))
        ordered[r] = sweep(indexOf, row, up)
      }
    } else {
      for (let r = ordered.length - 2; r >= 0; r -= 1) {
        const below = ordered[r + 1] ?? []
        const row = ordered[r] ?? []
        const indexOf = new Map(below.map((id, i) => [id, i]))
        ordered[r] = sweep(indexOf, row, down)
      }
    }
  }

  return ordered
}

/* -------------------------------------------------------------------------- */
/* Bipartite — two columns                                                    */
/* -------------------------------------------------------------------------- */

/** Wide enough that a connector's control points stay between the columns. */
const COLUMN_GAP = CELL_W * 2.4

function placeBipartite(data: GraphData, edges: Edge[]): Placement {
  const ids = data.nodes.map((n) => n.id)
  const sides = twoColour(data, edges)

  const left = ids.filter((id) => sides.get(id) === 0)
  const right = ids.filter((id) => sides.get(id) === 1)

  const at = new Map<string, Vec>()
  const tallest = Math.max(left.length, right.length)

  const column = (column: string[], x: number) => {
    const offset = ((tallest - column.length) * CELL_H) / 2
    column.forEach((id, i) => at.set(id, { x, y: offset + i * CELL_H + NODE_H / 2 }))
  }
  column(left, NODE_W / 2)
  column(right, NODE_W / 2 + COLUMN_GAP)

  const layer = new Map(ids.map((id) => [id, sides.get(id) ?? 0]))
  return {
    at,
    layer,
    anchors: new Set(left),
    note: 'Two disjoint sets, one column each; every edge crosses between them.',
  }
}

/**
 * Which column each node belongs in.
 *
 * `findBipartiteConflict` is the authority on WHETHER the split exists — it is
 * what `checkGraph` uses to refuse a declared-bipartite graph that is not one —
 * and this only assigns sides once it has said yes. An author-declared `group`
 * wins when there are exactly two of them, because the author's names for the
 * two sets are better than a colouring's 0 and 1.
 */
function twoColour(data: GraphData, edges: Edge[]): Map<string, 0 | 1> {
  const ids = data.nodes.map((n) => n.id)
  const groups = [...new Set(data.nodes.map((n) => n.group).filter((g): g is string => g !== undefined))]

  if (groups.length === 2 && data.nodes.every((n) => n.group !== undefined))
    return new Map(data.nodes.map((n) => [n.id, n.group === groups[0] ? 0 : 1] as const))

  const side = new Map<string, 0 | 1>()
  /* Not two-colourable? Then there is no honest two-column split; fall back to
     alternating declaration order rather than inventing one. */
  if (findBipartiteConflict(ids, edges) !== null) {
    ids.forEach((id, i) => side.set(id, i % 2 === 0 ? 0 : 1))
    return side
  }

  const adjacent = new Map<string, string[]>()
  for (const id of ids) adjacent.set(id, [])
  for (const e of edges) {
    adjacent.get(e.from)?.push(e.to)
    adjacent.get(e.to)?.push(e.from)
  }

  for (const start of ids) {
    if (side.has(start)) continue
    side.set(start, 0)
    const queue = [start]
    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined) break
      const mine = side.get(id) ?? 0
      for (const next of adjacent.get(id) ?? []) {
        if (side.has(next)) continue
        side.set(next, mine === 0 ? 1 : 0)
        queue.push(next)
      }
    }
  }
  return side
}

/* -------------------------------------------------------------------------- */
/* Arc — nodes on a line                                                      */
/* -------------------------------------------------------------------------- */

function placeArc(ids: string[]): Placement {
  const at = new Map<string, Vec>()
  ids.forEach((id, i) => at.set(id, { x: i * CELL_W + NODE_W / 2, y: 0 }))
  return {
    at,
    layer: new Map(ids.map((id, i) => [id, i])),
    anchors: new Set(ids.slice(0, 1)),
    note: 'Nodes keep their given order along the line; each edge arcs over the span it crosses.',
  }
}

/* -------------------------------------------------------------------------- */
/* Ring — the loop, drawn as a loop                                           */
/* -------------------------------------------------------------------------- */

/**
 * Put the nodes on a circle, following the actual cycle where there is one.
 *
 * Reusing `findCycle` for the ORDER is the point: a causal loop laid out in
 * declaration order is a circle of nodes with edges chording across it, which
 * hides the loop the diagram exists to show. Following the cycle makes the
 * loop's edges the ring itself.
 */
function placeRing(ids: string[], edges: Edge[]): Placement {
  const cycle = findCycle(ids, edges)
  const order: string[] = []
  if (cycle) for (const id of cycle.slice(0, -1)) if (!order.includes(id)) order.push(id)
  for (const id of ids) if (!order.includes(id)) order.push(id)

  const n = order.length
  const at = new Map<string, Vec>()

  if (n === 1) {
    const only = order[0]
    if (only !== undefined) at.set(only, { x: 0, y: 0 })
  } else {
    /* Chosen so neighbouring nodes are at least one cell apart on the chord. */
    const radius = Math.max(CELL_W, CELL_W / 2 / Math.sin(Math.PI / n))
    order.forEach((id, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
      at.set(id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
    })
  }

  return {
    at,
    layer: new Map(order.map((id, i) => [id, i])),
    anchors: new Set(order.slice(0, 1)),
    note: cycle
      ? `The ring follows the loop itself: ${cycle.join(' → ')}.`
      : 'Laid out as a ring; no closed loop was found in the edges.',
  }
}

/* -------------------------------------------------------------------------- */
/* Radial — one centre, everything else around it                             */
/* -------------------------------------------------------------------------- */

function placeRadial(ids: string[], edges: Edge[]): Placement {
  const degree = new Map(ids.map((id) => [id, 0]))
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
  }

  /* First id wins a tie, so the hub never depends on iteration order. */
  let hub = ids[0] ?? ''
  for (const id of ids) if ((degree.get(id) ?? 0) > (degree.get(hub) ?? 0)) hub = id

  const ring = ids.filter((id) => id !== hub)
  const at = new Map<string, Vec>([[hub, { x: 0, y: 0 }]])

  if (ring.length > 0) {
    const radius = Math.max(CELL_W * 1.5, CELL_W / 2 / Math.sin(Math.PI / Math.max(ring.length, 2)))
    ring.forEach((id, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length
      at.set(id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
    })
  }

  const layer = new Map(ids.map((id) => [id, id === hub ? 0 : 1]))
  return {
    at,
    layer,
    anchors: new Set([hub]),
    note: 'One system in the middle, everything it touches around it; the ring is not a ranking.',
  }
}

/* -------------------------------------------------------------------------- */
/* Force — deterministic, fixed iterations, seeded from the ids               */
/* -------------------------------------------------------------------------- */

const FORCE_ITERATIONS = 260

/**
 * Fruchterman–Reingold with every source of chance removed.
 *
 * WHAT MAKES IT DETERMINISTIC
 * ---------------------------
 *  - Starting positions come from a golden-angle spiral by declaration index,
 *    nudged by a hash of the node's OWN ID. Same graph, same start, always.
 *  - A fixed iteration count with a fixed cooling schedule. "Run until it
 *    converges" ends on a floating-point tie and is not reproducible.
 *  - Every loop walks arrays in declaration order, never a Map or Set.
 *
 * WHY IT ENDS ON A LATTICE
 * ------------------------
 * A spring layout has no notion of a node's size, so it will happily leave two
 * boxes on top of each other. The final pass snaps each node to the nearest
 * free cell of a `CELL_W × CELL_H` grid, taking nodes in a fixed order. That
 * keeps the arrangement the forces found and makes non-overlap a property of
 * the layout rather than a hope.
 */
function placeForce(ids: string[], edges: Edge[]): Placement {
  const n = ids.length
  const index = new Map(ids.map((id, i) => [id, i]))
  const px: number[] = []
  const py: number[] = []

  const golden = Math.PI * (3 - Math.sqrt(5))
  ids.forEach((id, i) => {
    const jitterAngle = (hash01(`${id}:a`) - 0.5) * 0.5
    const jitterRadius = (hash01(`${id}:r`) - 0.5) * 0.3
    const radius = CELL_W * Math.sqrt(i + 0.5) * (1 + jitterRadius)
    const angle = i * golden + jitterAngle
    px.push(radius * Math.cos(angle))
    py.push(radius * Math.sin(angle))
  })

  const k = CELL_W
  const start = CELL_W * 2

  for (let iter = 0; iter < FORCE_ITERATIONS; iter += 1) {
    const dx = new Array<number>(n).fill(0)
    const dy = new Array<number>(n).fill(0)

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let ux = (px[i] ?? 0) - (px[j] ?? 0)
        let uy = (py[i] ?? 0) - (py[j] ?? 0)
        /* Two nodes at the identical point have no direction to separate along.
           The offset is derived from the index, not from a random number. */
        if (ux === 0 && uy === 0) {
          ux = (i + 1) * 0.001
          uy = (j + 1) * 0.001
        }
        const dist = Math.hypot(ux, uy)
        const force = (k * k) / dist
        dx[i] = (dx[i] ?? 0) + (ux / dist) * force
        dy[i] = (dy[i] ?? 0) + (uy / dist) * force
        dx[j] = (dx[j] ?? 0) - (ux / dist) * force
        dy[j] = (dy[j] ?? 0) - (uy / dist) * force
      }
    }

    for (const e of edges) {
      const a = index.get(e.from)
      const b = index.get(e.to)
      if (a === undefined || b === undefined || a === b) continue
      const ux = (px[a] ?? 0) - (px[b] ?? 0)
      const uy = (py[a] ?? 0) - (py[b] ?? 0)
      const dist = Math.max(Math.hypot(ux, uy), 0.01)
      const force = (dist * dist) / k
      dx[a] = (dx[a] ?? 0) - (ux / dist) * force
      dy[a] = (dy[a] ?? 0) - (uy / dist) * force
      dx[b] = (dx[b] ?? 0) + (ux / dist) * force
      dy[b] = (dy[b] ?? 0) + (uy / dist) * force
    }

    const temp = start * (1 - iter / FORCE_ITERATIONS)
    for (let i = 0; i < n; i += 1) {
      const move = Math.max(Math.hypot(dx[i] ?? 0, dy[i] ?? 0), 0.0001)
      const step = Math.min(move, temp)
      px[i] = (px[i] ?? 0) + ((dx[i] ?? 0) / move) * step
      py[i] = (py[i] ?? 0) + ((dy[i] ?? 0) / move) * step
    }
  }

  const at = snapToLattice(ids, px, py)
  return {
    at,
    layer: new Map(ids.map((id) => [id, -1])),
    anchors: new Set<string>(),
    note: 'Arranged for readability only — position here is not a ranking and carries no meaning.',
  }
}

/**
 * Put every node on its own cell of a `CELL_W × CELL_H` grid.
 *
 * Nodes are taken in a fixed order (top-to-bottom, then left-to-right, then by
 * id) and each claims the nearest free cell, searching outward ring by ring.
 * No ties are broken by anything that could vary between runs.
 */
export function snapToLattice(ids: string[], px: number[], py: number[]): Map<string, Vec> {
  const order = ids
    .map((id, i) => ({ id, x: px[i] ?? 0, y: py[i] ?? 0 }))
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const taken = new Set<string>()
  const at = new Map<string, Vec>()

  for (const node of order) {
    const col0 = Math.round(node.x / CELL_W)
    const row0 = Math.round(node.y / CELL_H)

    let col = col0
    let row = row0
    for (let ring = 0; ring < 256; ring += 1) {
      const found = freeCellInRing(taken, col0, row0, ring)
      if (found) {
        col = found.col
        row = found.row
        break
      }
    }

    taken.add(`${col},${row}`)
    at.set(node.id, { x: col * CELL_W, y: row * CELL_H })
  }

  return at
}

function freeCellInRing(
  taken: Set<string>,
  col0: number,
  row0: number,
  ring: number,
): { col: number; row: number } | null {
  for (let dr = -ring; dr <= ring; dr += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
      const key = `${col0 + dc},${row0 + dr}`
      if (!taken.has(key)) return { col: col0 + dc, row: row0 + dr }
    }
  }
  return null
}

/** FNV-1a, so "jitter" is a function of the id and of nothing else. */
export function hash01(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h / 0x100000000
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                      */
/* -------------------------------------------------------------------------- */

function shapeEdges(
  data: GraphData,
  byId: Map<string, GraphNodeBox>,
  strategy: GraphStrategy,
): GraphEdgeShape[] {
  const ranks = weightRanks(data)
  const seen = new Map<string, number>()
  const obstacles = [...byId.values()]

  return data.edges.flatMap((edge, i): GraphEdgeShape[] => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    /* `checkGraph` already refused a missing endpoint; this keeps the renderer
       total so one bad edge cannot take the diagram down. */
    if (!from || !to) return []

    const pair = edge.from < edge.to ? `${edge.from}|${edge.to}` : `${edge.to}|${edge.from}`
    const nth = seen.get(pair) ?? 0
    seen.set(pair, nth + 1)

    const skip = new Set([from.id, to.id])

    const segments =
      from.id === to.id
        ? selfLoop(from, obstacles, skip)
        : strategy === 'arc'
          ? arcOver(from, to)
          : strategy === 'bipartite'
            ? [horizontalCurve(anchorOn(from, to), anchorOn(to, from))]
            : routeAround(anchorOn(from, to), anchorOn(to, from), obstacles, skip, nth)

    const d =
      strategy === 'bipartite' && from.id !== to.id
        ? /* The design system's own connector, used where its horizontal reach
             is exactly right: two columns, edges crossing between them. */
          curvePath(anchorOn(from, to), anchorOn(to, from))
        : pathFromSegments(segments)

    const rank = ranks.get(i) ?? 1
    const mid = pointOnSegments(segments, 0.5)

    return [
      {
        from: edge.from,
        to: edge.to,
        ...(edge.label === undefined ? {} : { label: edge.label, labelAt: mid }),
        d,
        segments,
        weightRank: rank,
        selfLoop: from.id === to.id,
      },
    ]
  })
}

/**
 * Weight → one of three token strokes, by rank rather than by value.
 *
 * `weightedGraph.avoidWhen` says a linear width scale lies when weights span
 * orders of magnitude, and it is right: 1 and 1000 on a linear scale is a
 * hairline beside a bar. Three buckets by rank says "these are the heavy ones"
 * and claims nothing more precise than that.
 */
function weightRanks(data: GraphData): Map<number, 0 | 1 | 2> {
  const out = new Map<number, 0 | 1 | 2>()
  const weighted = data.edges.filter((e) => e.weight !== undefined && Number.isFinite(e.weight))
  if (weighted.length === 0) {
    data.edges.forEach((_, i) => out.set(i, 1))
    return out
  }

  const sorted = [...weighted].map((e) => e.weight ?? 0).sort((a, b) => a - b)
  const low = sorted[Math.floor((sorted.length - 1) / 3)] ?? 0
  const high = sorted[Math.floor((2 * (sorted.length - 1)) / 3)] ?? 0

  data.edges.forEach((e, i) => {
    if (e.weight === undefined || !Number.isFinite(e.weight)) out.set(i, 1)
    else if (e.weight <= low) out.set(i, 0)
    else if (e.weight >= high) out.set(i, 2)
    else out.set(i, 1)
  })
  return out
}

/** Where a connector leaves a box, heading towards another one. */
export function anchorOn(box: Box, toward: Box): Vec {
  const dx = toward.x - box.x
  const dy = toward.y - box.y
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y }

  const hw = box.w / 2 + ANCHOR_PAD
  const hh = box.h / 2 + ANCHOR_PAD
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(dx)
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: box.x + dx * s, y: box.y + dy * s }
}

/**
 * The design system's horizontal connector, expressed as geometry.
 *
 * Byte-for-byte the same curve `curvePath` draws — `GraphShape.test.ts` pins
 * the two together, so if the primitive's reach ever changes, this fails loudly
 * instead of drifting.
 */
export function horizontalCurve(from: Vec, to: Vec): CubicSegment {
  const dx = to.x - from.x
  const reach = Math.min(120, Math.max(24, Math.abs(dx) * 0.5))
  return {
    p0: { ...from },
    c1: { x: from.x + reach, y: from.y },
    c2: { x: to.x - reach, y: to.y },
    p1: { ...to },
  }
}

/**
 * The bow offsets a connector is allowed to try, in the order it tries them.
 *
 * A gentle bow first, because the design system's connectors curve. Then
 * FLATTER ones, then much larger ones — in that order, because the corridor
 * between two nodes on the layer a long edge crosses is often exactly where
 * the straight line already goes, and curving away from it is what puts the
 * edge through a box. A layered graph of eight nodes found that within a
 * minute of the router being written: the only clean route from `b` to `h` was
 * almost the straight one, through a 40-unit gap the gentlest bow overshot.
 *
 * Straightening is the last resort rather than the first because a flat
 * connector is also the shape that the bloom filter erases; nothing here
 * filters, but the shape stays worth avoiding where a curve will do.
 */
const BOWS = [0.18, -0.18, 0.09, -0.09, 0.04, -0.04, 0, 0.35, -0.35, 0.6, -0.6, 1, -1, 1.7, -1.7, 2.6, -2.6, 3.8, -3.8].map(
  (f) => f * CELL_W,
)

/**
 * A connector from `from` to `to` that does not cross an unrelated node.
 *
 * AN EDGE THROUGH A NODE IS A CLAIM ABOUT THAT NODE.
 * A line that passes over a box reads as touching it — in a dependency graph
 * that is a dependency which is not in the data, and the reader has no way to
 * tell it from one that is.
 *
 * THREE KINDS OF CANDIDATE, TRIED IN A FIXED ORDER
 * ------------------------------------------------
 *  1. A gentle bow. This is the design system's connector and it is what
 *     almost every edge gets.
 *  2. A CORRIDOR ROUTE, which is the one that actually solves long edges.
 *     Bowing a connector that crosses a whole layer only ever moves it from
 *     one node onto another, because the clear route through a layer is a
 *     narrow vertical gap and a bow is exactly the shape that misses it. The
 *     corridor route drops into that gap, runs straight down it, and comes out
 *     the far side.
 *  3. Larger and flatter bows, as a last resort.
 *
 * The first candidate that hits nothing wins. If the layout is so tight that
 * none is clean, the fewest-hits one is drawn — a visible problem rather than
 * a hidden false edge — and `edgeCollisions` reports it.
 *
 * The list is fixed and scanned in order, so the choice is a function of the
 * input alone. `nth` rotates the bows for parallel edges between one pair, so
 * they separate instead of stacking.
 */
export function routeAround(
  from: Vec,
  to: Vec,
  obstacles: Box[],
  skip: Set<string>,
  nth = 0,
): CubicSegment[] {
  const others = obstacles.filter((o) => !skip.has(o.id))
  const bow = (i: number) => [bowedCurve(from, to, BOWS[(i + nth) % BOWS.length] ?? 0)]

  const candidates: CubicSegment[][] = [
    bow(0),
    bow(1),
    ...corridorRoutes(from, to, others),
    ...BOWS.slice(2).map((_, i) => bow(i + 2)),
  ]

  let best: CubicSegment[] | null = null
  let bestHits = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const hits = countHits(candidate, others)
    if (hits === 0) return candidate
    if (hits < bestHits) {
      bestHits = hits
      best = candidate
    }
  }

  return best ?? bow(0)
}

/** How far a corridor keeps off the boxes it runs between. */
const CLEARANCE = 12

/**
 * Routes that dive into a clear channel between nodes, run down it, and leave.
 *
 * The channel is picked from the actual gaps between the boxes that lie across
 * the edge's path — plus the two positions just outside the whole obstacle
 * band, so there is always somewhere to go — and the nearest one to the direct
 * line is offered first.
 *
 * Every joint is a curve with its tangent along the corridor, which is what
 * keeps the middle stretch inside the channel: a cubic whose control points
 * share the endpoints' across-coordinate cannot leave the range between them.
 */
function corridorRoutes(from: Vec, to: Vec, others: Box[]): CubicSegment[][] {
  const vertical = Math.abs(to.y - from.y) >= Math.abs(to.x - from.x)

  const along = (p: Vec) => (vertical ? p.y : p.x)
  const across = (p: Vec) => (vertical ? p.x : p.y)
  const spanLo = (b: Box) => (vertical ? b.y - b.h / 2 : b.x - b.w / 2)
  const spanHi = (b: Box) => (vertical ? b.y + b.h / 2 : b.x + b.w / 2)
  const sideLo = (b: Box) => (vertical ? b.x - b.w / 2 : b.y - b.h / 2)
  const sideHi = (b: Box) => (vertical ? b.x + b.w / 2 : b.y + b.h / 2)
  const point = (acrossAt: number, alongAt: number): Vec =>
    vertical ? { x: acrossAt, y: alongAt } : { x: alongAt, y: acrossAt }

  const lo = Math.min(along(from), along(to))
  const hi = Math.max(along(from), along(to))
  const blocking = others.filter((o) => spanLo(o) < hi && spanHi(o) > lo)
  if (blocking.length === 0) return []

  const bandLo = Math.max(lo, Math.min(...blocking.map(spanLo)) - CLEARANCE)
  const bandHi = Math.min(hi, Math.max(...blocking.map(spanHi)) + CLEARANCE)
  if (bandHi <= bandLo) return []

  /* Merge the blockers' across-intervals; whatever is left between them is a
     channel, and the outsides are always channels. */
  const intervals = blocking
    .map((b) => [sideLo(b) - CLEARANCE, sideHi(b) + CLEARANCE] as const)
    .sort((a, b) => a[0] - b[0])

  const merged: [number, number][] = []
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }

  const channels: number[] = []
  for (let i = 1; i < merged.length; i += 1) {
    const before = merged[i - 1]
    const here = merged[i]
    if (before && here) channels.push((before[1] + here[0]) / 2)
  }
  const first = merged[0]
  const last = merged[merged.length - 1]
  if (first) channels.push(first[0] - CELL_W / 2)
  if (last) channels.push(last[1] + CELL_W / 2)

  const direct = (across(from) + across(to)) / 2
  channels.sort((a, b) => Math.abs(a - direct) - Math.abs(b - direct))

  return channels.map((channel) => [
    sCurve(from, point(channel, bandLo), vertical),
    sCurve(point(channel, bandLo), point(channel, bandHi), vertical),
    sCurve(point(channel, bandHi), to, vertical),
  ])
}

/**
 * A cubic whose tangents run along the corridor axis.
 *
 * The control points share their endpoint's ACROSS coordinate, so the curve's
 * across-value stays between the two endpoints' — which is the property that
 * makes a corridor route provably stay in its corridor.
 */
function sCurve(p0: Vec, p1: Vec, vertical: boolean): CubicSegment {
  const half = vertical ? (p1.y - p0.y) / 2 : (p1.x - p0.x) / 2
  return {
    p0: { ...p0 },
    c1: vertical ? { x: p0.x, y: p0.y + half } : { x: p0.x + half, y: p0.y },
    c2: vertical ? { x: p1.x, y: p1.y - half } : { x: p1.x - half, y: p1.y },
    p1: { ...p1 },
  }
}

function bowedCurve(from: Vec, to: Vec, bow: number): CubicSegment {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.max(Math.hypot(dx, dy), 0.0001)
  const nx = -dy / len
  const ny = dx / len

  return {
    p0: { ...from },
    c1: { x: from.x + dx / 3 + nx * bow, y: from.y + dy / 3 + ny * bow },
    c2: { x: from.x + (dx * 2) / 3 + nx * bow, y: from.y + (dy * 2) / 3 + ny * bow },
    p1: { ...to },
  }
}

/** A semicircle over the line, as two cubics. Forward edges above, back below. */
function arcOver(from: GraphNodeBox, to: GraphNodeBox): CubicSegment[] {
  const above = to.x >= from.x
  const sign = above ? -1 : 1
  const y = from.y + sign * (NODE_H / 2 + ANCHOR_PAD)
  const x0 = from.x
  const x1 = to.x
  const r = Math.abs(x1 - x0) / 2
  const mx = (x0 + x1) / 2
  const kappa = 0.5522847498307936 * r
  const peak = { x: mx, y: y + sign * r }

  return [
    { p0: { x: x0, y }, c1: { x: x0, y: y + sign * kappa }, c2: { x: mx - kappa, y: peak.y }, p1: peak },
    { p0: peak, c1: { x: mx + kappa, y: peak.y }, c2: { x: x1, y: y + sign * kappa }, p1: { x: x1, y } },
  ]
}

/** A small loop off one side of a node, on the first side that is clear. */
function selfLoop(node: GraphNodeBox, obstacles: GraphNodeBox[], skip: Set<string>): CubicSegment[] {
  const others = obstacles.filter((o) => !skip.has(o.id))
  const r = NODE_H * 0.8

  const sides: Vec[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ]

  let best: CubicSegment[] | null = null
  let bestHits = Number.POSITIVE_INFINITY

  for (const side of sides) {
    const hw = node.w / 2 + ANCHOR_PAD
    const hh = node.h / 2 + ANCHOR_PAD
    const base = { x: node.x + side.x * hw, y: node.y + side.y * hh }
    const tip = { x: base.x + side.x * r * 1.6, y: base.y + side.y * r * 1.6 }
    /* Perpendicular, so the loop leaves and returns on two different points. */
    const px = -side.y
    const py = side.x

    const candidate: CubicSegment[] = [
      {
        p0: { x: base.x + px * (r * 0.35), y: base.y + py * (r * 0.35) },
        c1: { x: base.x + px * r + side.x * r, y: base.y + py * r + side.y * r },
        c2: { x: tip.x + px * (r * 0.4), y: tip.y + py * (r * 0.4) },
        p1: tip,
      },
      {
        p0: tip,
        c1: { x: tip.x - px * (r * 0.4), y: tip.y - py * (r * 0.4) },
        c2: { x: base.x - px * r + side.x * r, y: base.y - py * r + side.y * r },
        p1: { x: base.x - px * (r * 0.35), y: base.y - py * (r * 0.35) },
      },
    ]

    const hits = countHits(candidate, others)
    if (hits === 0) return candidate
    if (hits < bestHits) {
      bestHits = hits
      best = candidate
    }
  }

  return best ?? []
}

/* -------------------------------------------------------------------------- */
/* Curve arithmetic — exported so the tests can check the drawn shape          */
/* -------------------------------------------------------------------------- */

export function pathFromSegments(segments: CubicSegment[]): string {
  const first = segments[0]
  if (!first) return ''
  let d = `M ${round(first.p0.x)} ${round(first.p0.y)}`
  for (const s of segments)
    d += ` C ${round(s.c1.x)} ${round(s.c1.y)}, ${round(s.c2.x)} ${round(s.c2.y)}, ${round(s.p1.x)} ${round(s.p1.y)}`
  return d
}

export function pointOnCubic(s: CubicSegment, t: number): Vec {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * s.p0.x + b * s.c1.x + c * s.c2.x + d * s.p1.x,
    y: a * s.p0.y + b * s.c1.y + c * s.c2.y + d * s.p1.y,
  }
}

/** A point at fraction `t` along the whole connector, segments included. */
export function pointOnSegments(segments: CubicSegment[], t: number): Vec {
  if (segments.length === 0) return { x: 0, y: 0 }
  const scaled = Math.min(Math.max(t, 0), 0.999999) * segments.length
  const index = Math.floor(scaled)
  const segment = segments[index] ?? segments[segments.length - 1]
  if (!segment) return { x: 0, y: 0 }
  return pointOnCubic(segment, scaled - index)
}

/** Points along the curve as actually drawn — what a collision test needs. */
export function sampleSegments(segments: CubicSegment[], per = 24): Vec[] {
  const out: Vec[] = []
  for (const s of segments) for (let i = 0; i <= per; i += 1) out.push(pointOnCubic(s, i / per))
  return out
}

/**
 * How many unrelated node boxes this connector passes through.
 *
 * DELIBERATELY STRICTER THAN `edgeCollisions`.
 * The router uses this and the tests use that one, so if the router were the
 * looser of the two it could declare a route clean that the check then found
 * crossing a node — which is how the first version of this file shipped an
 * edge straight through a box it had just decided to avoid. A fatter margin
 * and four times the samples make the router's "clean" strictly the stronger
 * claim.
 */
export function countHits(segments: CubicSegment[], others: Box[], margin = 8): number {
  if (others.length === 0) return 0
  const points = sampleSegments(segments, 128)
  let hits = 0
  for (const node of others) {
    const hw = node.w / 2 + margin
    const hh = node.h / 2 + margin
    if (points.some((p) => Math.abs(p.x - node.x) < hw && Math.abs(p.y - node.y) < hh)) hits += 1
  }
  return hits
}

/**
 * Every (edge, node) pair where a connector crosses a node it does not touch.
 *
 * Deliberately measured on the DRAWN curve — the same cubics the `d` attribute
 * is built from, sampled — rather than on the straight line between centres.
 * A router that bows around an obstacle would otherwise be reported as a
 * failure, and a router that only pretends to would be reported as a success.
 */
export function edgeCollisions(
  layout: { nodes: Box[]; edges: { from: string; to: string; segments: CubicSegment[] }[] },
  margin = 3,
): { edge: number; node: string }[] {
  const out: { edge: number; node: string }[] = []
  layout.edges.forEach((edge, i) => {
    const points = sampleSegments(edge.segments, 32)
    for (const node of layout.nodes) {
      if (node.id === edge.from || node.id === edge.to) continue
      const hw = node.w / 2 + margin
      const hh = node.h / 2 + margin
      if (points.some((p) => Math.abs(p.x - node.x) < hw && Math.abs(p.y - node.y) < hh))
        out.push({ edge: i, node: node.id })
    }
  })
  return out
}

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

export function boundsOf(boxes: Box[], curves: CubicSegment[][], pad = PAD) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const see = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  for (const n of boxes) {
    see(n.x - n.w / 2, n.y - n.h / 2)
    see(n.x + n.w / 2, n.y + n.h / 2)
  }
  /* A bowed connector can swing well outside the node boxes; clipping it would
     be the same bug as the invisible flow links, just with a different cause. */
  for (const c of curves) for (const p of sampleSegments(c, 12)) see(p.x, p.y)

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: pad * 2, height: pad * 2 }

  return {
    minX: round(minX - pad),
    minY: round(minY - pad),
    width: round(maxX - minX + pad * 2),
    height: round(maxY - minY + pad * 2),
  }
}

/** Two decimals is below one device pixel at every scale this canvas allows. */
export function round(value: number): number {
  return Math.round(value * 100) / 100
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

/** The graph as a sentence, for anyone who cannot see the diagram. */
export function describeGraph(data: GraphData): string {
  const label = new Map(data.nodes.map((n) => [n.id, n.label]))
  const joint = data.directed === false ? 'is linked to' : 'points to'
  const lines = data.edges
    .slice(0, 24)
    .map((e) => `${label.get(e.from) ?? e.from} ${e.label ? e.label : joint} ${label.get(e.to) ?? e.to}`)
  const more = data.edges.length > 24 ? `, and ${data.edges.length - 24} more` : ''
  return `${data.variant}: ${data.nodes.length} nodes. ${lines.join('; ')}${more}.`
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

export function GraphShape({
  data,
  variant = data.variant,
}: {
  data: GraphData
  variant?: string
}) {
  /* One scope per mounted diagram: two of these on a page would otherwise
     share an SVG id, and every arrowhead would resolve to the first. */
  const arrowScope = useArrowScope()
  const layout = useMemo(() => layoutGraph(data, variant), [data, variant])

  if (layout.refusals.length > 0)
    return <Refusal title="This graph contradicts itself, so it is not drawn" issues={layout.refusals} />

  const groups = [...new Set(layout.nodes.map((n) => n.group).filter((g): g is string => g !== undefined))]

  return (
    <>
      <svg className="lc-flow" viewBox={layout.viewBox} role="img" aria-label={describeGraph(data)}>
        <ArrowDefs scope={arrowScope} />

        {/*
          GLOW BY DOUBLE-STROKE, NEVER BY FILTER.
          --------------------------------------
          `lc-bloom`'s region is given in percentages, which SVG resolves
          against the object BOUNDING BOX. A connector between two nodes on the
          same row has a zero-height bbox, so 500% of zero is zero: the filter
          output has no area and the path — plus its arrowhead — paints nothing
          at all, with the stroke and opacity still perfectly correct. That
          shipped here once already. A wide faint stroke underneath reads as
          bloom and does not care what shape the path is.
        */}
        {layout.edges.map((edge, i) => (
          <path key={`glow-${i}`} className="lc-flow__link-glow" d={edge.d} />
        ))}
        {layout.edges.map((edge, i) => (
          <path
            key={i}
            className="lc-flow__link"
            d={edge.d}
            markerEnd={layout.directed ? arrowRef(arrowScope) : undefined}
            style={edge.weightRank === 1 ? undefined : { strokeWidth: strokeFor(edge.weightRank) }}
          />
        ))}

        {layout.edges.map((edge, i) =>
          edge.label && edge.labelAt ? (
            <text
              key={`label-${i}`}
              className="lc-flow__node"
              x={edge.labelAt.x}
              y={edge.labelAt.y}
              textAnchor="middle"
            >
              {edge.label}
            </text>
          ) : null,
        )}

        {layout.nodes.map((node) => (
          <g key={node.id}>
            {/* Outline only, never filled — a filled node reads as a button and
                invites a click that does nothing. */}
            <rect
              x={node.x - node.w / 2}
              y={node.y - node.h / 2}
              width={node.w}
              height={node.h}
              rx={node.h / 2}
              fill="none"
              stroke={node.anchor ? tokens.color.accentDeep : tokens.color.lineStrong}
              strokeWidth={tokens.stroke.hair}
            />
            <text
              className={node.anchor ? 'lc-flow__node lc-flow__node--emph' : 'lc-flow__node'}
              x={node.x}
              y={node.y - ((node.lines.length - 1) * LINE_H) / 2 + 4}
              textAnchor="middle"
            >
              {node.lines.map((line, i) => (
                <tspan key={i} x={node.x} dy={i === 0 ? 0 : LINE_H}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>

      {/*
        POSITION IS READ AS MEANING WHETHER OR NOT IT HAS ANY.
        `socialGraph.avoidWhen` names that exact failure, so every layout says
        in one line what its arrangement does and does not claim.
      */}
      <p className="lc-caption">
        <GlowDot size="sm" /> {layout.note}
        {groups.length > 0 && ' '}
        {groups.map((group) => (
          <Pill key={group}>{group}</Pill>
        ))}
      </p>
    </>
  )
}

function strokeFor(rank: 0 | 1 | 2): string {
  if (rank === 0) return tokens.stroke.hair
  if (rank === 2) return tokens.stroke.thick
  return tokens.stroke.thin
}

export function Refusal({ title, issues }: { title: string; issues: ShapeIssue[] }) {
  return (
    <div className="lc-refusal" role="alert">
      <h2>{title}</h2>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.path}</code> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
