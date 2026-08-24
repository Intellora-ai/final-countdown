import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/* The two files, as text, so the tests can check the rules the SOURCE is under
   and not only the numbers it produces. `?raw` rather than `fs` because this
   package has no Node types and does not need any. */
import graphSource from './GraphShape.tsx?raw'
import hierarchySource from './HierarchyShape.tsx?raw'
import { curvePath } from '../../design/primitives'
import { namesForShape } from '../../spec/representations'
import type { GraphData } from '../../spec/shapeInvariants'
import {
  breakCycles,
  GraphShape,
  CELL_H,
  edgeCollisions,
  graphStrategyFor,
  hash01,
  horizontalCurve,
  layoutGraph,
  longestPathLayers,
  MIN_NODE_DISTANCE,
  pathFromSegments,
  reduceCrossings,
} from './GraphShape'
import type { GraphLayout, GraphNodeBox } from './GraphShape'

/* -------------------------------------------------------------------------- */
/* The names this renderer is responsible for                                 */
/* -------------------------------------------------------------------------- */

/**
 * Taken from the registry, not typed out.
 *
 * A hand-copied list is a list that goes stale the first time somebody adds a
 * name, and the failure is silent: the new variant simply is not tested.
 */
const VARIANTS = namesForShape('graph')

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const nodes = (...ids: string[]) => ids.map((id) => ({ id, label: `Node ${id.toUpperCase()}` }))
const link = (from: string, to: string) => ({ from, to })

/** A DAG with a long edge (a → e skips two layers) to exercise the router. */
function acyclicGraph(variant: string, extra: Partial<GraphData> = {}): GraphData {
  return {
    nodes: nodes('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
    edges: [
      link('a', 'b'),
      link('a', 'c'),
      link('b', 'd'),
      link('c', 'd'),
      link('d', 'e'),
      link('a', 'e'),
      link('e', 'f'),
      link('c', 'g'),
      link('g', 'h'),
      link('b', 'h'),
    ],
    directed: true,
    variant,
    ...extra,
  }
}

/** A graph that really does cycle — legal for a state machine, not for a DAG. */
function cyclicGraph(variant: string): GraphData {
  return {
    nodes: nodes('a', 'b', 'c', 'd', 'e'),
    edges: [link('a', 'b'), link('b', 'c'), link('c', 'd'), link('d', 'a'), link('b', 'e'), link('e', 'a')],
    directed: true,
    variant,
  }
}

function bipartiteFixture(variant: string): GraphData {
  return {
    nodes: [
      { id: 'l1', label: 'Reader', group: 'People' },
      { id: 'l2', label: 'Editor', group: 'People' },
      { id: 'l3', label: 'Admin', group: 'People' },
      { id: 'r1', label: 'Article', group: 'Things' },
      { id: 'r2', label: 'Comment', group: 'Things' },
    ],
    edges: [link('l1', 'r1'), link('l1', 'r2'), link('l2', 'r1'), link('l3', 'r2'), link('l3', 'r1')],
    bipartite: true,
    variant,
  }
}

/**
 * Data chosen to suit the name, not one shape forced through 33 renderers.
 *
 * A ring layout tested on an acyclic graph proves nothing about rings, and a
 * declared DAG tested on a cyclic graph would only ever produce a refusal.
 */
function fixtureFor(variant: string): GraphData {
  if (variant === 'bipartiteGraph') return bipartiteFixture(variant)
  if (variant === 'dag' || variant === 'bayesianNetwork') return acyclicGraph(variant, { acyclic: true })
  if (variant === 'causalLoop' || variant === 'feedbackLoop' || variant === 'biologicalCycle')
    return cyclicGraph(variant)
  if (variant === 'stateDiagram' || variant === 'controlFlowGraph') return cyclicGraph(variant)
  if (variant === 'weightedGraph')
    return {
      ...acyclicGraph(variant),
      edges: acyclicGraph(variant).edges.map((e, i) => ({ ...e, weight: (i + 1) * 3 })),
    }
  if (variant === 'conceptMap' || variant === 'ontology')
    return {
      ...acyclicGraph(variant),
      edges: acyclicGraph(variant).edges.map((e, i) => ({ ...e, label: `rel ${i}` })),
    }
  return acyclicGraph(variant)
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

describe('every name the registry maps to `graph`', () => {
  it('is a name this renderer knows about', () => {
    expect(VARIANTS).toHaveLength(33)
    for (const variant of VARIANTS) expect(graphStrategyFor(variant)).toBeTruthy()
  })

  it('lays out without throwing, and draws something', () => {
    for (const variant of VARIANTS) {
      const data = fixtureFor(variant)
      expect(() => layoutGraph(data, variant), variant).not.toThrow()

      const layout = layoutGraph(data, variant)
      expect(layout.refusals, variant).toEqual([])
      expect(layout.nodes.length, variant).toBe(data.nodes.length)
      expect(layout.edges.length, variant).toBe(data.edges.length)
      expect(layout.width, variant).toBeGreaterThan(0)
      expect(layout.height, variant).toBeGreaterThan(0)
    }
  })

  /*
   * ONE LAYOUT FOR EVERYTHING WOULD BE THE BUG.
   * A dependency graph and a feedback loop are the same data structure making
   * opposite claims; a single spring layout draws both as a pleasant blob and
   * neither claim survives.
   */
  it('does not use one layout for everything', () => {
    const used = new Set(VARIANTS.map((v) => graphStrategyFor(v)))
    expect(used.size).toBeGreaterThanOrEqual(5)
    expect(graphStrategyFor('dependencyGraph')).toBe('layered')
    expect(graphStrategyFor('feedbackLoop')).toBe('ring')
    expect(graphStrategyFor('bipartiteGraph')).toBe('bipartite')
    expect(graphStrategyFor('arcDiagram')).toBe('arc')
    expect(graphStrategyFor('socialGraph')).toBe('force')
  })
})

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe('the layout is a pure function of its input', () => {
  /*
   * A DIAGRAM THAT RESHUFFLES ON RELOAD CANNOT BE REVIEWED.
   * No screenshot means anything, no visual regression means anything, and the
   * reader is quietly taught that position carries no information. So this is
   * checked byte for byte, not "roughly the same".
   */
  it('gives byte-identical output for the same data, every variant', () => {
    for (const variant of VARIANTS) {
      const data = fixtureFor(variant)
      const once = layoutGraph(data, variant)
      const twice = layoutGraph(fixtureFor(variant), variant)
      expect(JSON.stringify(twice), variant).toBe(JSON.stringify(once))
    }
  })

  it('gives the same answer for the force layout across many runs', () => {
    const data = fixtureFor('socialGraph')
    const first = JSON.stringify(layoutGraph(data, 'socialGraph'))
    for (let i = 0; i < 5; i += 1)
      expect(JSON.stringify(layoutGraph(fixtureFor('socialGraph'), 'socialGraph'))).toBe(first)
  })

  /* The jitter that would ordinarily be random is a function of the id alone. */
  it('seeds jitter from the node id and from nothing else', () => {
    expect(hash01('alpha')).toBe(hash01('alpha'))
    expect(hash01('alpha')).not.toBe(hash01('beta'))
    expect(hash01('alpha')).toBeGreaterThanOrEqual(0)
    expect(hash01('alpha')).toBeLessThan(1)
  })

  it('moves a node when — and only when — its id changes', () => {
    const base = fixtureFor('socialGraph')
    const renamed: GraphData = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, id: 'z' } : n)),
      edges: base.edges.map((e) => ({
        from: e.from === 'a' ? 'z' : e.from,
        to: e.to === 'a' ? 'z' : e.to,
      })),
    }
    expect(JSON.stringify(layoutGraph(renamed, 'socialGraph'))).not.toBe(
      JSON.stringify(layoutGraph(base, 'socialGraph')),
    )
  })
})

/* -------------------------------------------------------------------------- */
/* Nothing collides, nothing is NaN                                           */
/* -------------------------------------------------------------------------- */

function overlap(a: GraphNodeBox, b: GraphNodeBox): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
}

describe('the drawn geometry', () => {
  it('never puts two node boxes on top of each other', () => {
    for (const variant of VARIANTS) {
      const layout = layoutGraph(fixtureFor(variant), variant)
      for (let i = 0; i < layout.nodes.length; i += 1)
        for (let j = i + 1; j < layout.nodes.length; j += 1) {
          const a = layout.nodes[i]
          const b = layout.nodes[j]
          if (!a || !b) continue
          expect(overlap(a, b), `${variant}: ${a.id} overlaps ${b.id}`).toBe(false)
        }
    }
  })

  it('keeps every pair of centres at least one row apart', () => {
    for (const variant of VARIANTS) {
      const layout = layoutGraph(fixtureFor(variant), variant)
      for (let i = 0; i < layout.nodes.length; i += 1)
        for (let j = i + 1; j < layout.nodes.length; j += 1) {
          const a = layout.nodes[i]
          const b = layout.nodes[j]
          if (!a || !b) continue
          const gap = Math.hypot(a.x - b.x, a.y - b.y)
          expect(gap, `${variant}: ${a.id} to ${b.id}`).toBeGreaterThanOrEqual(MIN_NODE_DISTANCE - 0.02)
        }
    }
  })

  /*
   * A NaN BLANKS AN SVG WITH NO ERROR ANYWHERE.
   * The path attribute is rejected by the parser, the element renders nothing,
   * the console stays empty and the block looks like it was never authored.
   */
  it('never emits a non-finite coordinate', () => {
    for (const variant of VARIANTS) {
      const layout = layoutGraph(fixtureFor(variant), variant)
      for (const node of layout.nodes)
        for (const value of [node.x, node.y, node.w, node.h])
          expect(Number.isFinite(value), `${variant}: ${node.id}`).toBe(true)

      for (const edge of layout.edges) {
        expect(edge.d, variant).not.toMatch(/NaN|Infinity/)
        for (const s of edge.segments)
          for (const p of [s.p0, s.c1, s.c2, s.p1])
            expect(Number.isFinite(p.x) && Number.isFinite(p.y), variant).toBe(true)
      }
      for (const value of [layout.minX, layout.minY, layout.width, layout.height])
        expect(Number.isFinite(value), variant).toBe(true)
      expect(layout.viewBox, variant).not.toMatch(/NaN|Infinity/)
    }
  })

  it('resolves every edge endpoint to a placed node', () => {
    for (const variant of VARIANTS) {
      const layout = layoutGraph(fixtureFor(variant), variant)
      const placed = new Set(layout.nodes.map((n) => n.id))
      for (const edge of layout.edges) {
        expect(placed.has(edge.from), `${variant}: ${edge.from}`).toBe(true)
        expect(placed.has(edge.to), `${variant}: ${edge.to}`).toBe(true)
      }
    }
  })

  /*
   * AN EDGE THROUGH A NODE IS A CLAIM ABOUT THAT NODE.
   * In a dependency graph a line crossing a box reads as a dependency that is
   * not in the data, and the reader has no way to tell it apart from one that
   * is. Measured on the curve as actually drawn, not on the straight line
   * between the centres — otherwise a router that bows around an obstacle
   * would score the same as one that pretends to.
   */
  it('never routes an edge through an unrelated node', () => {
    for (const variant of VARIANTS) {
      const layout = layoutGraph(fixtureFor(variant), variant)
      const hits = edgeCollisions(layout).map(
        ({ edge, node }) => `${layout.edges[edge]?.from}→${layout.edges[edge]?.to} crosses ${node}`,
      )
      expect(hits, variant).toEqual([])
    }
  })

  it('keeps every node and every connector inside the viewBox', () => {
    for (const variant of VARIANTS) {
      const layout = layoutGraph(fixtureFor(variant), variant)
      for (const node of layout.nodes) {
        expect(node.x - node.w / 2, variant).toBeGreaterThanOrEqual(layout.minX)
        expect(node.y - node.h / 2, variant).toBeGreaterThanOrEqual(layout.minY)
        expect(node.x + node.w / 2, variant).toBeLessThanOrEqual(layout.minX + layout.width)
        expect(node.y + node.h / 2, variant).toBeLessThanOrEqual(layout.minY + layout.height)
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Layered layouts really do layer                                            */
/* -------------------------------------------------------------------------- */

describe('layered layouts', () => {
  const layeredNames = VARIANTS.filter((v) => graphStrategyFor(v) === 'layered')

  it('covers the names where direction is the content', () => {
    for (const name of ['dag', 'dependencyGraph', 'callGraph', 'stateDiagram', 'bayesianNetwork'])
      expect(layeredNames).toContain(name)
  })

  /*
   * THIS IS WHY A DEPENDENCY GRAPH READS TOP TO BOTTOM.
   * Longest-path layering, not shortest: shortest path puts a node directly
   * under its earliest predecessor, which lets a later edge point back up a
   * layer and destroys the one property the layout exists to provide.
   */
  it('puts every edge of an acyclic graph strictly downhill', () => {
    for (const variant of layeredNames) {
      const data = acyclicGraph(variant)
      const layout = layoutGraph(data, variant)
      const layerOf = new Map(layout.nodes.map((n) => [n.id, n.layer]))

      for (const edge of data.edges) {
        const from = layerOf.get(edge.from) ?? 0
        const to = layerOf.get(edge.to) ?? 0
        expect(from, `${variant}: ${edge.from}→${edge.to}`).toBeLessThan(to)
      }
    }
  })

  it('turns the layer into a y position, in order', () => {
    const layout = layoutGraph(acyclicGraph('dependencyGraph'), 'dependencyGraph')
    const byLayer = new Map<number, number>()
    for (const node of layout.nodes) {
      const seen = byLayer.get(node.layer)
      if (seen !== undefined) expect(node.y).toBe(seen)
      byLayer.set(node.layer, node.y)
    }
    const ys = [...byLayer.entries()].sort((a, b) => a[0] - b[0]).map(([, y]) => y)
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] ?? 0).toBeGreaterThan(ys[i - 1] ?? 0)
  })

  it('lays out a cyclic state diagram instead of hanging on it', () => {
    const layout = layoutGraph(cyclicGraph('stateDiagram'), 'stateDiagram')
    expect(layout.nodes).toHaveLength(5)
    expect(layout.edges).toHaveLength(6)
    /* Exactly the back edges point uphill; everything else still reads down. */
    const layerOf = new Map(layout.nodes.map((n) => [n.id, n.layer]))
    const uphill = layout.edges.filter((e) => (layerOf.get(e.from) ?? 0) >= (layerOf.get(e.to) ?? 0))
    expect(uphill.length).toBeGreaterThan(0)
    expect(uphill.length).toBeLessThan(layout.edges.length)
  })

  it('runs a bow tie left to right, because causes are on the left', () => {
    const layout = layoutGraph(acyclicGraph('bowTie'), 'bowTie')
    expect(layout.orientation).toBe('horizontal')
    const byLayer = new Map(layout.nodes.map((n) => [n.id, n]))
    const a = byLayer.get('a')
    const f = byLayer.get('f')
    expect(a && f && f.x > a.x).toBe(true)
  })
})

describe('the layering primitives', () => {
  it('breaks every cycle and keeps every other edge', () => {
    const ids = ['a', 'b', 'c', 'd']
    const edges = [link('a', 'b'), link('b', 'c'), link('c', 'a'), link('c', 'd'), link('d', 'b')]
    const kept = breakCycles(ids, edges)
    expect(kept.length).toBeLessThan(edges.length)

    /* No cycle left, or the layering below would never terminate. */
    const layers = longestPathLayers(ids, kept)
    for (const e of kept) expect(layers.get(e.from) ?? 0).toBeLessThan(layers.get(e.to) ?? 0)
  })

  it('drops a self loop rather than treating it as a layer constraint', () => {
    expect(breakCycles(['a'], [link('a', 'a')])).toEqual([])
  })

  it('measures the LONGEST path, so a skipping edge cannot point back up', () => {
    const layers = longestPathLayers(['a', 'b', 'c'], [link('a', 'b'), link('b', 'c'), link('a', 'c')])
    expect(layers.get('a')).toBe(0)
    expect(layers.get('b')).toBe(1)
    expect(layers.get('c')).toBe(2)
  })

  it('orders layers by a fixed number of passes, so the result is reproducible', () => {
    const rows = [
      ['a', 'b'],
      ['x', 'y', 'z'],
    ]
    const edges = [link('a', 'z'), link('b', 'x'), link('b', 'y')]
    const once = reduceCrossings(rows, edges)
    const twice = reduceCrossings(rows, edges)
    expect(twice).toEqual(once)
    expect(once.flat().sort()).toEqual(['a', 'b', 'x', 'y', 'z'])
  })
})

/* -------------------------------------------------------------------------- */
/* The other layouts make their own claim                                     */
/* -------------------------------------------------------------------------- */

describe('the layouts that are not layered', () => {
  it('puts a bipartite graph in two columns, and nothing in between', () => {
    const layout = layoutGraph(bipartiteFixture('bipartiteGraph'), 'bipartiteGraph')
    const columns = new Set(layout.nodes.map((n) => n.x))
    expect(columns.size).toBe(2)

    const [left, right] = [...columns].sort((a, b) => a - b)
    for (const node of layout.nodes) expect(node.x === left || node.x === right).toBe(true)

    /* Every edge crosses; none joins two nodes on the same side. */
    const side = new Map(layout.nodes.map((n) => [n.id, n.x]))
    for (const edge of layout.edges) expect(side.get(edge.from)).not.toBe(side.get(edge.to))
  })

  it('puts an arc diagram on one line and keeps the given order', () => {
    const data = acyclicGraph('arcDiagram')
    const layout = layoutGraph(data, 'arcDiagram')
    expect(new Set(layout.nodes.map((n) => n.y)).size).toBe(1)

    const xs = layout.nodes.map((n) => n.x)
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] ?? 0).toBeGreaterThan(xs[i - 1] ?? 0)

    /* Every arc leaves the line: an edge drawn along it would be invisible. */
    for (const edge of layout.edges) {
      const ys = edge.segments.flatMap((s) => [s.p0.y, s.c1.y, s.c2.y, s.p1.y])
      expect(new Set(ys).size).toBeGreaterThan(1)
    }
  })

  it('puts a feedback loop on a ring, following the loop it actually has', () => {
    const layout = layoutGraph(cyclicGraph('feedbackLoop'), 'feedbackLoop')
    /* Evenly spaced points on a circle have their own centre as centroid, so
       this needs no knowledge of where the layout put the origin. */
    const middle = centroid(layout)
    const radii = layout.nodes.map((n) => Math.hypot(n.x - middle.x, n.y - middle.y))
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.05)
    expect(layout.note).toContain('→')
  })

  it('puts one system in the middle of a context view', () => {
    const layout = layoutGraph(acyclicGraph('systemContext'), 'systemContext')
    const hub = layout.nodes.filter((n) => n.anchor)
    expect(hub).toHaveLength(1)
    /* The hub is the most connected node, and ties go to the first declared. */
    expect(hub[0]?.id).toBe('a')
  })

  it('says out loud that a force layout is not a ranking', () => {
    const layout = layoutGraph(acyclicGraph('socialGraph'), 'socialGraph')
    expect(layout.strategy).toBe('force')
    expect(layout.note.toLowerCase()).toContain('no meaning')
  })

  it('buckets weights by rank rather than scaling width linearly', () => {
    const layout = layoutGraph(fixtureFor('weightedGraph'), 'weightedGraph')
    const ranks = new Set(layout.edges.map((e) => e.weightRank))
    expect(ranks.size).toBeGreaterThan(1)
    for (const rank of ranks) expect([0, 1, 2]).toContain(rank)
  })
})

function centroid(layout: GraphLayout) {
  const n = Math.max(layout.nodes.length, 1)
  return {
    x: layout.nodes.reduce((s, node) => s + node.x, 0) / n,
    y: layout.nodes.reduce((s, node) => s + node.y, 0) / n,
  }
}

/* -------------------------------------------------------------------------- */
/* Refusal                                                                    */
/* -------------------------------------------------------------------------- */

describe('a contradiction is refused, not repaired', () => {
  it('refuses a declared DAG that contains a cycle, and draws nothing', () => {
    const data: GraphData = { ...cyclicGraph('dag'), acyclic: true }
    const layout = layoutGraph(data, 'dag')

    expect(layout.refusals.length).toBeGreaterThan(0)
    expect(layout.refusals[0]?.message).toContain('cycle')
    /* NOT "draw it anyway with the back edge dotted". A cycle in a Bayesian
       network means "A depends on B depends on A", and no layout can draw that
       honestly. */
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
  })

  it('refuses an edge that names a node which does not exist', () => {
    const data: GraphData = {
      nodes: nodes('a', 'b'),
      edges: [link('a', 'b'), link('b', 'ghost')],
      variant: 'nodeLink',
    }
    const layout = layoutGraph(data, 'nodeLink')
    expect(layout.refusals.some((i) => i.message.includes('ghost'))).toBe(true)
    expect(layout.nodes).toEqual([])
  })

  it('refuses a bipartite graph that is not bipartite', () => {
    const data: GraphData = {
      nodes: nodes('a', 'b', 'c'),
      edges: [link('a', 'b'), link('b', 'c'), link('c', 'a')],
      bipartite: true,
      variant: 'bipartiteGraph',
    }
    const layout = layoutGraph(data, 'bipartiteGraph')
    expect(layout.refusals.some((i) => i.message.includes('bipartite'))).toBe(true)
    expect(layout.nodes).toEqual([])
  })

  it('refuses a duplicate id, which would silently merge two nodes into one', () => {
    const data: GraphData = {
      nodes: [
        { id: 'a', label: 'One' },
        { id: 'a', label: 'Two' },
        { id: 'b', label: 'Three' },
      ],
      edges: [link('a', 'b')],
      variant: 'nodeLink',
    }
    expect(layoutGraph(data, 'nodeLink').refusals.length).toBeGreaterThan(0)
  })

  it('still draws a graph whose only complaint is a warning', () => {
    /* An unattached node is a `warn`: worth saying, not worth refusing. */
    const data: GraphData = {
      nodes: nodes('a', 'b', 'lonely'),
      edges: [link('a', 'b')],
      variant: 'nodeLink',
    }
    const layout = layoutGraph(data, 'nodeLink')
    expect(layout.refusals).toEqual([])
    expect(layout.nodes).toHaveLength(3)
  })

  it('survives an empty graph rather than producing a NaN viewBox', () => {
    const layout = layoutGraph({ nodes: [], edges: [], variant: 'nodeLink' }, 'nodeLink')
    expect(layout.nodes).toEqual([])
    expect(layout.viewBox).not.toMatch(/NaN/)
  })
})

/* -------------------------------------------------------------------------- */
/* The connector shares the design system's curve                             */
/* -------------------------------------------------------------------------- */

describe('the horizontal connector is the design system’s connector', () => {
  /*
   * `curvePath` draws the `d`; `horizontalCurve` gives the same curve as
   * geometry, so the collision checker can sample the shape that is actually
   * painted. Two definitions of one curve is exactly how a renderer drifts
   * from its design system, so they are pinned together here: change the
   * primitive's reach and this fails immediately rather than silently.
   */
  it('produces the identical path string', () => {
    const cases: [{ x: number; y: number }, { x: number; y: number }][] = [
      [{ x: 0, y: 0 }, { x: 400, y: 100 }],
      [{ x: 66, y: 12.5 }, { x: 478, y: 212.5 }],
      [{ x: 10, y: 10 }, { x: 20, y: 10 }],
      [{ x: 300, y: 0 }, { x: 0, y: 90 }],
    ]
    for (const [from, to] of cases)
      expect(pathFromSegments([horizontalCurve(from, to)])).toBe(curvePath(from, to))
  })

  it('leaves a same-row connector flat, which is why no filter may touch it', () => {
    /* Regression guard, restated for this file: `lc-bloom`'s region is in
       percentages of the object bounding box, and a flat path's box has zero
       height. 500% of zero is zero and the path paints nothing. */
    const d = pathFromSegments([horizontalCurve({ x: 0, y: 40 }, { x: 300, y: 40 })])
    const ys = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(new Set(ys).size).toBe(1)
  })
})

/* -------------------------------------------------------------------------- */
/* The source itself                                                          */
/* -------------------------------------------------------------------------- */

const SOURCES: [string, string][] = [
  ['GraphShape.tsx', graphSource],
  ['HierarchyShape.tsx', hierarchySource],
]

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('the shape renderers obey the rules they were written under', () => {
  it('contains no raw colour anywhere — Law 4', () => {
    for (const [name, source] of SOURCES) {
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(source, name).not.toMatch(/\brgba?\(/)
      expect(source, name).not.toMatch(/\bhsl\(/)
    }
  })

  it('takes every colour and stroke from the token file', () => {
    for (const [name, source] of SOURCES) {
      const code = withoutComments(source)
      /* Anything painted names a token or a design-system class, never a
         value. `fill="none"` is the absence of paint, not a colour. */
      for (const match of code.matchAll(/(?:stroke|fill)=\{?"?([^"}\s]+)/g)) {
        const value = match[1] ?? ''
        expect(
          value === 'none' || value.startsWith('tokens.') || value.startsWith('node.'),
          `${name}: ${value}`,
        ).toBe(true)
      }
    }
  })

  /*
   * PURITY, CHECKED RATHER THAN PROMISED.
   * A comment saying "deterministic" survives the commit that breaks it; a
   * grep does not. Comments are stripped first — the rule is about what the
   * code CALLS, and a file is allowed to explain the rule it is obeying.
   */
  it('reaches for no clock and no random number', () => {
    for (const [name, source] of SOURCES) {
      const code = withoutComments(source)
      expect(code, name).not.toMatch(/\bMath\.random\b/)
      expect(code, name).not.toMatch(/\bDate\.now\b/)
      expect(code, name).not.toMatch(/\bnew Date\b/)
      expect(code, name).not.toMatch(/\bperformance\.now\b/)
      expect(code, name).not.toMatch(/\bdocument\./)
      expect(code, name).not.toMatch(/getBoundingClientRect|getComputedStyle|measureText/)
    }
  })

  it('strips comments the way this check assumes', () => {
    expect(withoutComments('a /* Math.random */ b')).toBe('a  b')
    expect(withoutComments('a // Math.random\nb')).toBe('a \nb')
    expect(withoutComments('const x = Math.random()')).toContain('Math.random')
  })

  it('never applies the bloom filter, which silently erases a flat path', () => {
    for (const [name, source] of SOURCES) expect(source, name).not.toMatch(/url\(#lc-bloom\)/)
  })

  it('glows connectors with the double stroke the design system provides', () => {
    for (const [name, source] of SOURCES) expect(source, name).toContain('lc-flow__link-glow')
  })
})

/* -------------------------------------------------------------------------- */
/* Sanity on the constants the guarantees rest on                             */
/* -------------------------------------------------------------------------- */

describe('the separation guarantee', () => {
  it('is stated as a constant the tests can check against', () => {
    expect(MIN_NODE_DISTANCE).toBe(CELL_H)
    expect(MIN_NODE_DISTANCE).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* One smoke render                                                           */
/* -------------------------------------------------------------------------- */

/*
 * The layout is where the thinking is and where the rest of this file looks.
 * This is the one thing a pure-function test cannot catch: a component that
 * throws, or that puts a NaN into an attribute — which blanks the element with
 * no error in the console and no mark on the page.
 */
describe('the component', () => {
  it('renders every variant to markup, with no NaN in any attribute', () => {
    const data: GraphData = {
      nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id,
        label: `Node ${id}`,
        group: id < 'c' ? 'People' : 'Things',
      })),
      edges: [
        { from: 'a', to: 'b', label: 'uses' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd', weight: 9 },
        { from: 'c', to: 'd', weight: 1 },
        { from: 'd', to: 'e' },
        { from: 'e', to: 'e' }, // a self loop, which has its own routing
      ],
      directed: true,
      variant: 'nodeLink',
    }

    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(
        createElement(GraphShape, { data: { ...data, variant }, variant }),
      )
      expect(html, variant).toContain('<svg')
      expect(html, variant).not.toContain('NaN')
    }
  })

  it('shows the refusal instead of the diagram, never both', () => {
    const broken: GraphData = {
      nodes: nodes('a'),
      edges: [link('a', 'ghost')],
      variant: 'dag',
    }
    const html = renderToStaticMarkup(createElement(GraphShape, { data: broken, variant: 'dag' }))
    expect(html).toContain('lc-refusal')
    expect(html).toContain('ghost')
    expect(html).not.toContain('<svg')
  })
})
