import { useMemo } from 'react'

import { GlowDot, Pill } from '../../design/primitives'
import { tokens } from '../../design/tokens'
import { checkHierarchy } from '../../spec/shapeInvariants'
import type { HierarchyData, ShapeIssue } from '../../spec/shapeInvariants'
import { wrapLabel } from '../FlowView'
import {
  boundsOf,
  CELL_H,
  CELL_W,
  NODE_H,
  NODE_W,
  pathFromSegments,
  round,
  routeAround,
} from './GraphShape'
import type { Box, CubicSegment, Vec } from './GraphShape'

/**
 * The `hierarchy` shape: strict containment, drawn 14 different ways.
 *
 * WHY NOT ONE TREE LAYOUT
 * -----------------------
 * A treemap and an issue tree are the same data and opposite claims. A treemap
 * says "this much of the whole", and only AREA says that — draw it as a tidy
 * tree and the sizes vanish. An issue tree says "these branches are mutually
 * exclusive and together exhaust the problem", and only a tidy tree, with the
 * parent centred over children that do not touch, says THAT — draw it as a
 * treemap and the mutual exclusivity becomes a rectangle-packing accident.
 *
 * So a fishbone gets a spine, a pyramid gets bands, a sunburst gets rings, and
 * the mapping is one line per name in `HIERARCHY_STRATEGY`.
 *
 * PURE AND DETERMINISTIC, LIKE THE GRAPH LAYOUT
 * ---------------------------------------------
 * No DOM, no measurement, no clock, no `Math.random`. Node boxes are a fixed
 * size rather than measured, because measuring means a layout that depends on
 * which font happened to load, which is the same problem as randomness wearing
 * a respectable coat.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HierarchyStrategy =
  | 'tidy'
  | 'treemap'
  | 'sunburst'
  | 'mindMap'
  | 'fishbone'
  | 'pyramid'
  | 'cluster'

/**
 * What a node's `x`, `y`, `w`, `h` actually mean.
 *
 * `chip` is a label-sized box centred on a point. `rect` is a region whose AREA
 * is the claim. `sector` is a ring segment whose ANGLE is the claim, and whose
 * box is only a label anchor. Tests branch on this rather than guessing.
 */
export type NodeKind = 'chip' | 'rect' | 'sector'

export interface Sector {
  cx: number
  cy: number
  r0: number
  r1: number
  /** Radians, clockwise from twelve o'clock. */
  a0: number
  a1: number
  d: string
}

export interface HierarchyNodeBox extends Box {
  label: string
  lines: string[]
  parent: string | null
  depth: number
  /** Leaf value, or the sum of the children's — the number the size encodes. */
  value: number
  kind: NodeKind
  sector?: Sector
  /** The root: the effect, the goal, the conclusion. */
  anchor: boolean
}

export interface HierarchyEdgeShape {
  from: string
  to: string
  d: string
  segments: CubicSegment[]
}

export interface HierarchyLayout {
  strategy: HierarchyStrategy
  orientation: 'vertical' | 'horizontal'
  nodes: HierarchyNodeBox[]
  edges: HierarchyEdgeShape[]
  /** The fishbone's centre line. Nothing else uses it. */
  spine?: string
  viewBox: string
  minX: number
  minY: number
  width: number
  height: number
  refusals: ShapeIssue[]
  note: string
}

/* -------------------------------------------------------------------------- */
/* Geometry constants                                                         */
/* -------------------------------------------------------------------------- */

/* SVG user units inside a viewBox, on the same footing as `FlowView`'s. */
const PAD = 28
const LINE_H = 13
const AREA_W = CELL_W * 5
const AREA_H = CELL_H * 4
const PYRAMID_MIN_SLICE = 14
const PYRAMID_GAP = 6
const RING_DEPTH = CELL_H * 0.72
/** A 60° bone, which is what makes a fishbone read as a fishbone. */
const BONE_STEP = CELL_H * 1.25
/** How far off the bone a cause's label sits — far enough to clear the line. */
const CAUSE_OFFSET = CELL_W * 0.9

/* -------------------------------------------------------------------------- */
/* Variant → layout                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `tidy`    — Reingold-Tilford. Parent centred over children, subtrees that
 *             never touch. The layout that shows a split IS a split.
 * `treemap` — squarified. Area is the claim, so area is what is computed.
 * `sunburst`— rings. Angle is the claim; depth is distance from the centre.
 * `mindMap` — a two-sided tidy tree, because a mind map radiates from one idea
 *             rather than descending from it.
 * `fishbone`— a spine with angled bones. The only layout in which "category"
 *             and "cause within category" look different at a glance.
 * `pyramid` — stacked bands. The proportion between levels is the whole point.
 * `cluster` — one column per group. An affinity diagram is columns of notes,
 *             and drawing it as a tree implies a taxonomy nobody agreed to.
 */
export const HIERARCHY_STRATEGY: Record<string, HierarchyStrategy> = {
  treemap: 'treemap',
  sunburst: 'sunburst',
  mindMap: 'mindMap',
  fishbone: 'fishbone',
  affinityDiagram: 'cluster',
  pyramidStructure: 'pyramid',
  testPyramid: 'pyramid',

  taxonomy: 'tidy',
  faultTree: 'tidy',
  attackTree: 'tidy',
  issueTree: 'tidy',
  hypothesisTree: 'tidy',
  rootCauseTree: 'tidy',
  eventTree: 'tidy',
}

/**
 * Which way a tidy tree runs.
 *
 * A fault tree hangs its top event at the TOP and decomposes downwards — that
 * is the notation, and turning it sideways makes it unreadable to anyone who
 * knows it. An issue tree is read left to right, because each level is a
 * further split of the sentence to its left.
 */
const HORIZONTAL_VARIANTS = new Set(['issueTree', 'hypothesisTree', 'rootCauseTree', 'eventTree'])

export function hierarchyStrategyFor(variant: string): HierarchyStrategy {
  return HIERARCHY_STRATEGY[variant] ?? 'tidy'
}

/* -------------------------------------------------------------------------- */
/* The layout                                                                 */
/* -------------------------------------------------------------------------- */

interface Tree {
  root: string
  children: Map<string, string[]>
  parentOf: Map<string, string | null>
  label: Map<string, string>
  value: Map<string, number>
  depth: Map<string, number>
  /** Every id, in depth-first order from the root. Deterministic by build. */
  order: string[]
}

export function layoutHierarchy(
  data: HierarchyData,
  variant: string = data.variant,
): HierarchyLayout {
  const refusals = checkHierarchy(data, 'hierarchy').filter((issue) => issue.level === 'reject')
  const strategy = hierarchyStrategyFor(variant)
  const orientation: 'vertical' | 'horizontal' =
    strategy === 'tidy' && HORIZONTAL_VARIANTS.has(variant) ? 'horizontal' : 'vertical'

  const empty: HierarchyLayout = {
    strategy,
    orientation,
    nodes: [],
    edges: [],
    viewBox: `0 0 ${PAD * 2} ${PAD * 2}`,
    minX: 0,
    minY: 0,
    width: PAD * 2,
    height: PAD * 2,
    refusals,
    note: '',
  }

  /* REFUSE, DO NOT REPAIR. Two roots is not a hierarchy, and a parent chain
     that cycles is not one either; drawing something anyway would publish a
     shape the data does not have. */
  if (refusals.length > 0 || data.nodes.length === 0) return empty

  const tree = buildTree(data)
  const placed = place(tree, strategy, orientation)

  const nodes: HierarchyNodeBox[] = tree.order.map((id) => {
    const box = placed.boxes.get(id) ?? { x: 0, y: 0, w: NODE_W, h: NODE_H }
    const sector = placed.sectors.get(id)
    const label = tree.label.get(id) ?? id
    return {
      id,
      label,
      lines: wrapLabel(label),
      parent: tree.parentOf.get(id) ?? null,
      depth: tree.depth.get(id) ?? 0,
      value: tree.value.get(id) ?? 0,
      kind: placed.kind,
      x: round(box.x),
      y: round(box.y),
      w: round(box.w),
      h: round(box.h),
      ...(sector === undefined ? {} : { sector }),
      anchor: id === tree.root,
    }
  })

  const edges = placed.drawEdges ? treeEdges(tree, nodes, placed.attach) : []
  const bounds = boundsOf(
    nodes.filter((n) => n.kind !== 'sector'),
    edges.map((e) => e.segments),
    PAD,
  )

  /* A sunburst's discs live outside every node box, so its extent comes from
     the outer radius rather than from the label anchors. */
  const box =
    strategy === 'sunburst'
      ? {
          minX: round(-placed.radius - PAD),
          minY: round(-placed.radius - PAD),
          width: round(placed.radius * 2 + PAD * 2),
          height: round(placed.radius * 2 + PAD * 2),
        }
      : bounds

  return {
    strategy,
    orientation,
    nodes,
    edges,
    ...(placed.spine === undefined ? {} : { spine: placed.spine }),
    viewBox: `${box.minX} ${box.minY} ${box.width} ${box.height}`,
    minX: box.minX,
    minY: box.minY,
    width: box.width,
    height: box.height,
    refusals,
    note: placed.note,
  }
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Placed {
  boxes: Map<string, Rect>
  sectors: Map<string, Sector>
  kind: NodeKind
  drawEdges: boolean
  /** Fishbone only: where a child's connector meets the spine. */
  attach: Map<string, Vec>
  spine?: string
  radius: number
  note: string
}

function place(tree: Tree, strategy: HierarchyStrategy, orientation: 'vertical' | 'horizontal'): Placed {
  switch (strategy) {
    case 'treemap':
      return placeTreemap(tree)
    case 'sunburst':
      return placeSunburst(tree)
    case 'mindMap':
      return placeMindMap(tree)
    case 'fishbone':
      return placeFishbone(tree)
    case 'pyramid':
      return placePyramid(tree)
    case 'cluster':
      return placeCluster(tree)
    case 'tidy':
      return placeTidy(tree, orientation)
    default: {
      const exhaustive: never = strategy
      return exhaustive
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The tree                                                                   */
/* -------------------------------------------------------------------------- */

function buildTree(data: HierarchyData): Tree {
  const children = new Map<string, string[]>()
  const parentOf = new Map<string, string | null>()
  const label = new Map<string, string>()

  for (const node of data.nodes) {
    children.set(node.id, [])
    label.set(node.id, node.label)
    parentOf.set(node.id, node.parent)
  }
  /* Declaration order, so a sibling's position never depends on Map iteration
     order or on a sort that has to invent a tie-break. */
  for (const node of data.nodes) if (node.parent !== null) children.get(node.parent)?.push(node.id)

  const root = data.nodes.find((n) => n.parent === null)?.id ?? data.nodes[0]?.id ?? ''

  const depth = new Map<string, number>()
  const order: string[] = []
  const walk = (id: string, d: number) => {
    if (depth.has(id)) return // defensive: checkHierarchy already refused cycles
    depth.set(id, d)
    order.push(id)
    for (const kid of children.get(id) ?? []) walk(kid, d + 1)
  }
  walk(root, 0)

  /*
   * A PARENT'S SIZE IS ITS CHILDREN'S, ALWAYS.
   * `checkHierarchy` refuses a declared `sizedByValue` tree where a parent's
   * stated value disagrees with its children's sum, so by the time a layout
   * runs the two agree — and deriving the parent rather than trusting it means
   * a treemap's rectangles can never contradict their own arithmetic even for
   * a tree that never declared `sizedByValue`.
   */
  const value = new Map<string, number>()
  const stated = new Map(data.nodes.map((n) => [n.id, n.value]))
  const size = (id: string): number => {
    const kids = children.get(id) ?? []
    const own = kids.length === 0 ? Math.max(stated.get(id) ?? 1, 0) : kids.reduce((s, k) => s + size(k), 0)
    value.set(id, own)
    return own
  }
  size(root)

  return { root, children, parentOf, label, value, depth, order }
}

/* -------------------------------------------------------------------------- */
/* Tidy tree — Reingold-Tilford by contour                                    */
/* -------------------------------------------------------------------------- */

interface Contour {
  left: number[]
  right: number[]
}

/**
 * Lay out a tree so that no two subtrees touch and every parent sits over the
 * middle of its children.
 *
 * HOW SEPARATION IS GUARANTEED
 * ----------------------------
 * Each subtree is laid out on its own, then siblings are merged left to right.
 * Merging compares the accumulated RIGHT CONTOUR of everything placed so far
 * with the LEFT CONTOUR of the newcomer, depth by depth, and shifts the
 * newcomer by whatever the tightest of those depths demands. Because the
 * comparison runs over every shared depth rather than only the top one, a deep
 * branch cannot swing under a shallow neighbour — which is the failure that
 * makes naive "centre over children" layouts overlap.
 */
export function tidyPositions(tree: Tree, spacing: number): Map<string, number> {
  const across = new Map<string, number>()

  const shift = (id: string, by: number) => {
    across.set(id, (across.get(id) ?? 0) + by)
    for (const kid of tree.children.get(id) ?? []) shift(kid, by)
  }

  const build = (id: string): Contour => {
    const kids = tree.children.get(id) ?? []
    if (kids.length === 0) {
      across.set(id, 0)
      return { left: [0], right: [0] }
    }

    const accLeft: number[] = []
    const accRight: number[] = []

    kids.forEach((kid, i) => {
      const c = build(kid)

      let offset = 0
      if (i > 0) {
        let need = Number.NEGATIVE_INFINITY
        const shared = Math.min(accRight.length, c.left.length)
        for (let d = 0; d < shared; d += 1)
          need = Math.max(need, (accRight[d] ?? 0) + spacing - (c.left[d] ?? 0))
        offset = Number.isFinite(need) ? Math.max(need, 0) : 0
      }
      if (offset !== 0) shift(kid, offset)

      for (let d = 0; d < c.left.length; d += 1) {
        const l = (c.left[d] ?? 0) + offset
        const r = (c.right[d] ?? 0) + offset
        if (d < accLeft.length) {
          accLeft[d] = Math.min(accLeft[d] ?? l, l)
          accRight[d] = Math.max(accRight[d] ?? r, r)
        } else {
          accLeft[d] = l
          accRight[d] = r
        }
      }
    })

    const first = across.get(kids[0] ?? '') ?? 0
    const last = across.get(kids[kids.length - 1] ?? '') ?? 0
    const centre = (first + last) / 2
    across.set(id, centre)

    return { left: [centre, ...accLeft], right: [centre, ...accRight] }
  }

  build(tree.root)
  return across
}

function placeTidy(tree: Tree, orientation: 'vertical' | 'horizontal'): Placed {
  const vertical = orientation === 'vertical'
  const across = tidyPositions(tree, vertical ? CELL_W : CELL_H)

  const boxes = new Map<string, Rect>()
  for (const id of tree.order) {
    const a = across.get(id) ?? 0
    const b = (tree.depth.get(id) ?? 0) * (vertical ? CELL_H : CELL_W)
    boxes.set(id, { x: vertical ? a : b, y: vertical ? b : a, w: NODE_W, h: NODE_H })
  }

  return {
    boxes,
    sectors: new Map(),
    kind: 'chip',
    drawEdges: true,
    attach: new Map(),
    radius: 0,
    note: vertical
      ? 'Each level is a complete split of the level above it; siblings never overlap.'
      : 'Read left to right: each column splits the statement to its left.',
  }
}

/* -------------------------------------------------------------------------- */
/* Mind map — a tidy tree that radiates instead of descending                  */
/* -------------------------------------------------------------------------- */

function placeMindMap(tree: Tree): Placed {
  const top = tree.children.get(tree.root) ?? []
  const right = top.filter((_, i) => i % 2 === 0)
  const left = top.filter((_, i) => i % 2 === 1)

  const boxes = new Map<string, Rect>([[tree.root, { x: 0, y: 0, w: NODE_W, h: NODE_H }]])

  const side = (branch: string[], sign: 1 | -1) => {
    if (branch.length === 0) return
    /* One half of the map is a tree in its own right; the root is borrowed so
       the two halves each balance around it. */
    const half: Tree = { ...tree, children: new Map(tree.children).set(tree.root, branch) }
    const across = tidyPositions(half, CELL_H)
    const rootAt = across.get(tree.root) ?? 0

    for (const id of tree.order) {
      const a = across.get(id)
      if (a === undefined || id === tree.root) continue
      const depth = tree.depth.get(id) ?? 0
      if (!belongsTo(tree, id, branch)) continue
      boxes.set(id, { x: sign * depth * CELL_W, y: a - rootAt, w: NODE_W, h: NODE_H })
    }
  }
  side(right, 1)
  side(left, -1)

  return {
    boxes,
    sectors: new Map(),
    kind: 'chip',
    drawEdges: true,
    attach: new Map(),
    radius: 0,
    note: 'One idea in the middle; branches radiate from it and do not relate to each other.',
  }
}

function belongsTo(tree: Tree, id: string, branch: string[]): boolean {
  let cursor: string | null = id
  while (cursor !== null && cursor !== tree.root) {
    if (branch.includes(cursor)) return true
    cursor = tree.parentOf.get(cursor) ?? null
  }
  return false
}

/* -------------------------------------------------------------------------- */
/* Cluster — one column per group                                             */
/* -------------------------------------------------------------------------- */

function placeCluster(tree: Tree): Placed {
  const groups = tree.children.get(tree.root) ?? []
  const boxes = new Map<string, Rect>()

  groups.forEach((group, column) => {
    const stack: string[] = []
    const walk = (id: string) => {
      stack.push(id)
      for (const kid of tree.children.get(id) ?? []) walk(kid)
    }
    walk(group)
    stack.forEach((id, row) =>
      boxes.set(id, { x: column * CELL_W, y: (row + 1) * CELL_H, w: NODE_W, h: NODE_H }),
    )
  })

  boxes.set(tree.root, { x: ((groups.length - 1) * CELL_W) / 2, y: 0, w: NODE_W, h: NODE_H })

  return {
    boxes,
    sectors: new Map(),
    kind: 'chip',
    drawEdges: true,
    attach: new Map(),
    radius: 0,
    note: 'One column per cluster; the clusters were named after the items, not before.',
  }
}

/* -------------------------------------------------------------------------- */
/* Fishbone — a spine with angled bones                                       */
/* -------------------------------------------------------------------------- */

/**
 * The effect sits at the head of the spine; categories hang off it, alternating
 * above and below; causes tick off each bone.
 *
 * WHY A CAUSE JOINS THE BONE AND NOT THE CATEGORY'S BOX
 * ----------------------------------------------------
 * That is the notation, and the notation is right: the bone IS the category,
 * so a cause meeting the bone at the point nearest itself says "this belongs to
 * this category" without a line running the length of the diagram. The first
 * attempt here drew every cause back to the category's label at the bone's tip,
 * which meant each of those lines crossed every other cause on the same bone —
 * a diagram whose connectors all say something false about the boxes they pass
 * over.
 *
 * Alternating sides is not decoration either. It is what keeps two adjacent
 * categories' causes out of each other's space, and it is why a fishbone can
 * carry twenty causes where a tidy tree of the same data would be a wall.
 */
function placeFishbone(tree: Tree): Placed {
  const categories = tree.children.get(tree.root) ?? []
  const boxes = new Map<string, Rect>()
  const attach = new Map<string, Vec>()

  const spineEnd = (categories.length + 1) * CELL_W

  categories.forEach((category, i) => {
    const sign = i % 2 === 0 ? -1 : 1
    const attachX = (i + 1) * CELL_W
    /* The category's own connector, spine to tip, IS the bone. */
    attach.set(category, { x: attachX, y: 0 })

    /* A 60° bone: half a step back along the spine for every 0.87 out from it. */
    const u = { x: -0.5, y: (sign * Math.sqrt(3)) / 2 }
    /* Perpendicular, pointing away from the spine, so a cause's label never
       lands on the neighbouring bone. */
    const q = { x: Math.sqrt(3) / 2, y: sign * 0.5 }

    let boneRank = 0
    const walk = (id: string, depth: number) => {
      for (const kid of tree.children.get(id) ?? []) {
        boneRank += 1
        const along = BONE_STEP * boneRank
        const out = CAUSE_OFFSET * depth
        boxes.set(kid, {
          x: attachX + u.x * along + q.x * out,
          y: u.y * along + q.y * out,
          w: NODE_W,
          h: NODE_H,
        })
        /* A direct cause ticks onto the bone at its own foot. Anything deeper
           belongs to the cause above it and joins that box instead. */
        if (depth === 1) attach.set(kid, { x: attachX + u.x * along, y: u.y * along })
        walk(kid, depth + 1)
      }
    }
    walk(category, 1)

    const tip = BONE_STEP * (boneRank + 1)
    boxes.set(category, { x: attachX + u.x * tip, y: u.y * tip, w: NODE_W, h: NODE_H })
  })

  boxes.set(tree.root, { x: spineEnd + NODE_W / 2, y: 0, w: NODE_W, h: NODE_H })

  const spine = pathFromSegments([
    {
      p0: { x: 0, y: 0 },
      c1: { x: spineEnd / 3, y: 0 },
      c2: { x: (spineEnd * 2) / 3, y: 0 },
      p1: { x: spineEnd, y: 0 },
    },
  ])

  return {
    boxes,
    sectors: new Map(),
    kind: 'chip',
    drawEdges: true,
    attach,
    spine,
    radius: 0,
    note: 'Categories hang off the spine; causes run outward along each bone towards the effect.',
  }
}

/* -------------------------------------------------------------------------- */
/* Pyramid — stacked bands                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every depth is a band, and a node's WIDTH within its band is its share.
 *
 * `testPyramid.avoidWhen` warns that the proportions are usually aspirational
 * rather than measured — which is a reason to draw the proportions honestly,
 * not a reason to draw a decorative triangle. A node with a tiny share gets a
 * tiny slice, and a floor stops it disappearing entirely.
 */
function placePyramid(tree: Tree): Placed {
  const maxDepth = Math.max(...tree.order.map((id) => tree.depth.get(id) ?? 0))
  const rows: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const id of tree.order) rows[tree.depth.get(id) ?? 0]?.push(id)

  const boxes = new Map<string, Rect>()

  rows.forEach((row, depth) => {
    const total = row.reduce((s, id) => s + (tree.value.get(id) ?? 0), 0)
    const wanted = (AREA_W * (depth + 1)) / (maxDepth + 1)
    const floor = row.length * (PYRAMID_MIN_SLICE + PYRAMID_GAP)
    const band = Math.max(wanted, floor)
    const spare = band - floor

    let cursor = -band / 2
    for (const id of row) {
      const share = total > 0 ? (tree.value.get(id) ?? 0) / total : 1 / row.length
      const w = PYRAMID_MIN_SLICE + spare * share
      boxes.set(id, { x: cursor + w / 2, y: depth * CELL_H, w, h: NODE_H })
      cursor += w + PYRAMID_GAP
    }
  })

  return {
    boxes,
    sectors: new Map(),
    kind: 'rect',
    /* The stacking IS the containment. Arrows on top would say it twice. */
    drawEdges: false,
    attach: new Map(),
    radius: 0,
    note: 'Each band is one level; a block’s width is its share of that level.',
  }
}

/* -------------------------------------------------------------------------- */
/* Treemap — squarified                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Children tile their parent exactly, with no gutter.
 *
 * A GUTTER IS A SMALL LIE ABOUT AREA. Area is the treemap's entire claim, so
 * padding each rectangle to make room for a label means the children no longer
 * sum to the parent and the picture quietly contradicts its own arithmetic.
 * Depth is shown by stroke instead, which costs nothing.
 */
function placeTreemap(tree: Tree): Placed {
  const boxes = new Map<string, Rect>()
  boxes.set(tree.root, { x: AREA_W / 2, y: AREA_H / 2, w: AREA_W, h: AREA_H })

  const fill = (id: string, rect: Rect) => {
    const kids = tree.children.get(id) ?? []
    if (kids.length === 0) return

    const items = kids
      .map((kid) => ({ id: kid, value: tree.value.get(kid) ?? 0 }))
      /* Descending by value is what makes squarify square; the id tie-break is
         what makes it the same squares every time. */
      .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    for (const [kid, r] of squarify(items, rect))
      boxes.set(kid, { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h })

    for (const kid of kids) {
      const r = boxes.get(kid)
      if (r) fill(kid, { x: r.x - r.w / 2, y: r.y - r.h / 2, w: r.w, h: r.h })
    }
  }
  fill(tree.root, { x: 0, y: 0, w: AREA_W, h: AREA_H })

  return {
    boxes,
    sectors: new Map(),
    kind: 'rect',
    drawEdges: false,
    attach: new Map(),
    radius: 0,
    note: 'Area is the quantity: every rectangle is exactly the sum of the rectangles inside it.',
  }
}

/** The squarified treemap of Bruls, Huizing and van Wijk, laid row by row. */
export function squarify(
  items: { id: string; value: number }[],
  rect: Rect,
): Map<string, Rect> {
  const out = new Map<string, Rect>()
  const total = items.reduce((s, i) => s + i.value, 0)
  if (items.length === 0 || total <= 0 || rect.w <= 0 || rect.h <= 0) return out

  const area = rect.w * rect.h
  let queue = items.map((i) => ({ id: i.id, area: (i.value / total) * area }))
  let free: Rect = { ...rect }

  while (queue.length > 0) {
    const side = Math.min(free.w, free.h)
    if (side <= 0) break

    const row: { id: string; area: number }[] = []
    let rowArea = 0
    let bestRatio = Number.POSITIVE_INFINITY

    while (queue.length > 0) {
      const next = queue[0]
      if (!next) break
      const tryArea = rowArea + next.area
      const ratio = worstRatio([...row, next], tryArea, side)
      if (row.length > 0 && ratio > bestRatio) break
      row.push(next)
      rowArea = tryArea
      bestRatio = ratio
      queue = queue.slice(1)
    }

    const thickness = rowArea / side
    const horizontal = free.w <= free.h
    let cursor = 0
    for (const item of row) {
      const extent = rowArea > 0 ? (item.area / rowArea) * side : side / row.length
      out.set(
        item.id,
        horizontal
          ? { x: free.x + cursor, y: free.y, w: extent, h: thickness }
          : { x: free.x, y: free.y + cursor, w: thickness, h: extent },
      )
      cursor += extent
    }

    free = horizontal
      ? { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness }
      : { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h }
  }

  return out
}

function worstRatio(row: { area: number }[], rowArea: number, side: number): number {
  if (rowArea <= 0) return Number.POSITIVE_INFINITY
  const areas = row.map((r) => r.area)
  const min = Math.min(...areas)
  const max = Math.max(...areas)
  if (min <= 0) return Number.POSITIVE_INFINITY
  const s2 = side * side
  const a2 = rowArea * rowArea
  return Math.max((s2 * max) / a2, a2 / (s2 * min))
}

/* -------------------------------------------------------------------------- */
/* Sunburst — rings                                                           */
/* -------------------------------------------------------------------------- */

function placeSunburst(tree: Tree): Placed {
  const boxes = new Map<string, Rect>()
  const sectors = new Map<string, Sector>()
  const maxDepth = Math.max(...tree.order.map((id) => tree.depth.get(id) ?? 0))
  const radius = RING_DEPTH * (maxDepth + 1)

  const cut = (id: string, a0: number, a1: number) => {
    const depth = tree.depth.get(id) ?? 0
    const r0 = depth * RING_DEPTH
    const r1 = r0 + RING_DEPTH
    sectors.set(id, {
      cx: 0,
      cy: 0,
      r0: round(r0),
      r1: round(r1),
      a0,
      a1,
      d: sectorPath(r0, r1, a0, a1),
    })

    /* The label sits at the sector's own middle, so it never leaves its ring. */
    const mid = (a0 + a1) / 2
    const midR = (r0 + r1) / 2
    boxes.set(id, {
      x: depth === 0 ? 0 : midR * Math.cos(mid),
      y: depth === 0 ? 0 : midR * Math.sin(mid),
      w: NODE_W,
      h: NODE_H,
    })

    const kids = tree.children.get(id) ?? []
    const total = kids.reduce((s, k) => s + (tree.value.get(k) ?? 0), 0)
    if (total <= 0) return

    /* Angles are handed out from a running cursor rather than recomputed from
       each child's offset, so the children's spans sum to the parent's exactly
       and the last child always closes the arc. */
    let cursor = a0
    kids.forEach((kid, i) => {
      const span = ((tree.value.get(kid) ?? 0) / total) * (a1 - a0)
      const end = i === kids.length - 1 ? a1 : cursor + span
      cut(kid, cursor, end)
      cursor = end
    })
  }

  cut(tree.root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2)

  return {
    boxes,
    sectors,
    kind: 'sector',
    drawEdges: false,
    attach: new Map(),
    radius,
    note: 'Angle is the quantity and distance from the centre is depth; each ring fills its parent.',
  }
}

/** An annular sector, or a full disc when the span is the whole circle. */
export function sectorPath(r0: number, r1: number, a0: number, a1: number): string {
  const span = a1 - a0
  const at = (r: number, a: number) => `${round(r * Math.cos(a))} ${round(r * Math.sin(a))}`

  if (span >= Math.PI * 2 - 1e-9) {
    const disc = (r: number) =>
      `M ${round(-r)} 0 A ${round(r)} ${round(r)} 0 1 1 ${round(r)} 0 A ${round(r)} ${round(r)} 0 1 1 ${round(-r)} 0 Z`
    return r0 <= 0 ? disc(r1) : `${disc(r1)} ${disc(r0)}`
  }

  const large = span > Math.PI ? 1 : 0
  if (r0 <= 0)
    return `M 0 0 L ${at(r1, a0)} A ${round(r1)} ${round(r1)} 0 ${large} 1 ${at(r1, a1)} Z`

  return [
    `M ${at(r0, a0)}`,
    `L ${at(r1, a0)}`,
    `A ${round(r1)} ${round(r1)} 0 ${large} 1 ${at(r1, a1)}`,
    `L ${at(r0, a1)}`,
    `A ${round(r0)} ${round(r0)} 0 ${large} 0 ${at(r0, a0)}`,
    'Z',
  ].join(' ')
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                      */
/* -------------------------------------------------------------------------- */

function treeEdges(
  tree: Tree,
  nodes: HierarchyNodeBox[],
  attach: Map<string, Vec>,
): HierarchyEdgeShape[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  return tree.order.flatMap((id): HierarchyEdgeShape[] => {
    const parent = tree.parentOf.get(id) ?? null
    if (parent === null) return []
    const child = byId.get(id)
    const up = byId.get(parent)
    if (!child || !up) return []

    /* A fishbone's connector meets the SPINE, not the parent's box — the whole
       point of the notation is that a cause joins a bone where it joins it. */
    const onSpine = attach.get(id)
    const skip = new Set([child.id, up.id])

    /*
     * A bone and its ticks have to be STRAIGHT, because the ticks meet the bone
     * at computed feet. Bow the bone and the feet are no longer on it, and the
     * diagram develops a set of small visible lies about where a cause joins.
     * Everything else gets the routed curve.
     */
    const segments = onSpine
      ? [straightSegment(edgeAnchor(child, onSpine), onSpine)]
      : routeAround(
          edgeAnchor(child, { x: up.x, y: up.y }),
          edgeAnchor(up, { x: child.x, y: child.y }),
          nodes,
          skip,
        )

    return [{ from: id, to: parent, d: pathFromSegments(segments), segments }]
  })
}

/** The same cubic a straight line would be, so one path type covers both. */
function straightSegment(from: Vec, to: Vec): CubicSegment {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return {
    p0: { ...from },
    c1: { x: from.x + dx / 3, y: from.y + dy / 3 },
    c2: { x: from.x + (dx * 2) / 3, y: from.y + (dy * 2) / 3 },
    p1: { ...to },
  }
}

function edgeAnchor(box: Box, toward: Vec): Vec {
  const dx = toward.x - box.x
  const dy = toward.y - box.y
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y }
  const hw = box.w / 2 + 4
  const hh = box.h / 2 + 4
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(dx)
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: box.x + dx * s, y: box.y + dy * s }
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

/** The tree as a sentence, for anyone who cannot see the diagram. */
export function describeHierarchy(data: HierarchyData): string {
  const label = new Map(data.nodes.map((n) => [n.id, n.label]))
  const root = data.nodes.find((n) => n.parent === null)
  const lines = data.nodes
    .filter((n) => n.parent !== null)
    .slice(0, 24)
    .map((n) => `${label.get(n.parent as string) ?? n.parent} contains ${n.label}`)
  const more = data.nodes.length - 1 > 24 ? `, and ${data.nodes.length - 25} more` : ''
  return `${data.variant}: ${root ? `${root.label} at the root` : 'no root'}. ${lines.join('; ')}${more}.`
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

export function HierarchyShape({
  data,
  variant = data.variant,
}: {
  data: HierarchyData
  variant?: string
}) {
  const layout = useMemo(() => layoutHierarchy(data, variant), [data, variant])

  if (layout.refusals.length > 0)
    return (
      <Refusal title="This is not a hierarchy, so it is not drawn" issues={layout.refusals} />
    )

  const root = layout.nodes.find((n) => n.anchor)
  const branches = layout.nodes.filter((n) => n.depth === 1)

  return (
    <>
      <svg className="lc-flow" viewBox={layout.viewBox} role="img" aria-label={describeHierarchy(data)}>
        {/*
          NO `lc-bloom` ANYWHERE BELOW.
          Its region is in percentages, resolved against the object bounding
          box, and a spine — or any connector between two nodes on one row — has
          a zero-height box. 500% of zero is zero, so the filter output has no
          area and the path paints nothing while looking perfectly correct in
          the DOM. Glow is a second, wider, fainter stroke instead.
        */}
        {layout.spine && (
          <>
            <path className="lc-flow__link-glow" d={layout.spine} />
            <path className="lc-flow__link" d={layout.spine} />
          </>
        )}
        {layout.edges.map((edge, i) => (
          <path key={`glow-${i}`} className="lc-flow__link-glow" d={edge.d} />
        ))}
        {layout.edges.map((edge, i) => (
          <path key={i} className="lc-flow__link" d={edge.d} />
        ))}

        {layout.nodes.map((node) => (
          <g key={node.id}>
            {node.kind === 'sector' && node.sector && (
              <path
                d={node.sector.d}
                fill="none"
                stroke={node.anchor ? tokens.color.accent : tokens.color.lineStrong}
                strokeWidth={tokens.stroke.hair}
              />
            )}
            {node.kind !== 'sector' && (
              <rect
                x={node.x - node.w / 2}
                y={node.y - node.h / 2}
                width={node.w}
                height={node.h}
                rx={node.kind === 'chip' ? node.h / 2 : undefined}
                fill="none"
                stroke={node.anchor ? tokens.color.accentDeep : tokens.color.lineStrong}
                strokeWidth={tokens.stroke.hair}
              />
            )}
            {/* A slice too narrow for its own name gets no name; a clipped word
                reads as a different word. */}
            {node.w >= NODE_W / 2 && (
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
            )}
          </g>
        ))}
      </svg>

      <p className="lc-caption">
        <GlowDot size="sm" /> {root ? `${root.label}. ` : ''}
        {layout.note}{' '}
        {branches.slice(0, 6).map((branch) => (
          <Pill key={branch.id}>{branch.label}</Pill>
        ))}
      </p>
    </>
  )
}

function Refusal({ title, issues }: { title: string; issues: ShapeIssue[] }) {
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
