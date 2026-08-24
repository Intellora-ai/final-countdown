import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { namesForShape } from '../../spec/representations'
import type { HierarchyData } from '../../spec/shapeInvariants'
import { CELL_H, edgeCollisions, MIN_NODE_DISTANCE } from './GraphShape'
import {
  hierarchyStrategyFor,
  HierarchyShape,
  layoutHierarchy,
  sectorPath,
  squarify,
} from './HierarchyShape'
import type { HierarchyLayout, HierarchyNodeBox } from './HierarchyShape'

/* -------------------------------------------------------------------------- */
/* The names this renderer is responsible for                                 */
/* -------------------------------------------------------------------------- */

/** Read from the registry, so a name added there cannot go quietly untested. */
const VARIANTS = namesForShape('hierarchy')

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A three-level tree whose values are internally consistent.
 *
 * Consistent on purpose: `checkHierarchy` refuses a `sizedByValue` tree whose
 * parent disagrees with its children, and a fixture that could not pass that
 * check would only ever exercise the refusal path.
 */
function tree(variant: string, extra: Partial<HierarchyData> = {}): HierarchyData {
  return {
    nodes: [
      { id: 'root', label: 'Whole thing', parent: null, value: 30 },
      { id: 'a', label: 'First branch', parent: 'root', value: 8 },
      { id: 'b', label: 'Second branch', parent: 'root', value: 12 },
      { id: 'c', label: 'Third branch', parent: 'root', value: 10 },
      { id: 'a1', label: 'Alpha one', parent: 'a', value: 3 },
      { id: 'a2', label: 'Alpha two', parent: 'a', value: 5 },
      { id: 'b1', label: 'Beta one', parent: 'b', value: 2 },
      { id: 'b2', label: 'Beta two', parent: 'b', value: 4 },
      { id: 'b3', label: 'Beta three', parent: 'b', value: 6 },
      { id: 'c1', label: 'Gamma one', parent: 'c', value: 10 },
    ],
    variant,
    ...extra,
  }
}

function fixtureFor(variant: string): HierarchyData {
  if (variant === 'treemap' || variant === 'sunburst') return tree(variant, { sizedByValue: true })
  return tree(variant)
}

const parentsOf = (layout: HierarchyLayout) => new Map(layout.nodes.map((n) => [n.id, n.parent]))

function related(layout: HierarchyLayout, a: string, b: string): boolean {
  const parent = parentsOf(layout)
  const climbs = (from: string, to: string) => {
    let cursor: string | null = from
    while (cursor !== null) {
      if (cursor === to) return true
      cursor = parent.get(cursor) ?? null
    }
    return false
  }
  return climbs(a, b) || climbs(b, a)
}

function childrenOf(layout: HierarchyLayout): Map<string, HierarchyNodeBox[]> {
  const out = new Map<string, HierarchyNodeBox[]>()
  for (const node of layout.nodes) {
    if (node.parent === null) continue
    const list = out.get(node.parent)
    if (list) list.push(node)
    else out.set(node.parent, [node])
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

describe('every name the registry maps to `hierarchy`', () => {
  it('is a name this renderer knows about', () => {
    expect(VARIANTS).toHaveLength(14)
    for (const variant of VARIANTS) expect(hierarchyStrategyFor(variant)).toBeTruthy()
  })

  it('lays out without throwing, and places every node', () => {
    for (const variant of VARIANTS) {
      const data = fixtureFor(variant)
      expect(() => layoutHierarchy(data, variant), variant).not.toThrow()

      const layout = layoutHierarchy(data, variant)
      expect(layout.refusals, variant).toEqual([])
      expect(layout.nodes.length, variant).toBe(data.nodes.length)
      expect(layout.width, variant).toBeGreaterThan(0)
      expect(layout.height, variant).toBeGreaterThan(0)
    }
  })

  /*
   * A TREEMAP AND AN ISSUE TREE ARE OPPOSITE CLAIMS ABOUT THE SAME DATA.
   * One says "this much of the whole" and needs area; the other says "these
   * branches are exclusive and exhaustive" and needs separation. One layout
   * for both would silently discard whichever claim it could not express.
   */
  it('does not use one layout for everything', () => {
    const used = new Set(VARIANTS.map((v) => hierarchyStrategyFor(v)))
    expect(used.size).toBeGreaterThanOrEqual(6)
    expect(hierarchyStrategyFor('treemap')).toBe('treemap')
    expect(hierarchyStrategyFor('sunburst')).toBe('sunburst')
    expect(hierarchyStrategyFor('fishbone')).toBe('fishbone')
    expect(hierarchyStrategyFor('testPyramid')).toBe('pyramid')
    expect(hierarchyStrategyFor('taxonomy')).toBe('tidy')
    expect(hierarchyStrategyFor('mindMap')).toBe('mindMap')
    expect(hierarchyStrategyFor('affinityDiagram')).toBe('cluster')
  })

  it('hangs a fault tree downwards and reads an issue tree across', () => {
    expect(layoutHierarchy(tree('faultTree'), 'faultTree').orientation).toBe('vertical')
    expect(layoutHierarchy(tree('issueTree'), 'issueTree').orientation).toBe('horizontal')
  })
})

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe('the layout is a pure function of its input', () => {
  it('gives byte-identical output for the same data, every variant', () => {
    for (const variant of VARIANTS) {
      const once = layoutHierarchy(fixtureFor(variant), variant)
      const twice = layoutHierarchy(fixtureFor(variant), variant)
      expect(JSON.stringify(twice), variant).toBe(JSON.stringify(once))
    }
  })

  it('gives the same answer over repeated runs', () => {
    const first = JSON.stringify(layoutHierarchy(fixtureFor('treemap'), 'treemap'))
    for (let i = 0; i < 5; i += 1)
      expect(JSON.stringify(layoutHierarchy(fixtureFor('treemap'), 'treemap'))).toBe(first)
  })

  it('is decided by declaration order, so reordering siblings moves them', () => {
    const base = tree('taxonomy')
    const swapped: HierarchyData = {
      ...base,
      nodes: [base.nodes[0], base.nodes[2], base.nodes[1], ...base.nodes.slice(3)].filter(
        (n): n is HierarchyData['nodes'][number] => n !== undefined,
      ),
    }
    const a = layoutHierarchy(base, 'taxonomy').nodes.find((n) => n.id === 'a')
    const b = layoutHierarchy(swapped, 'taxonomy').nodes.find((n) => n.id === 'a')
    expect(a?.x).not.toBe(b?.x)
  })
})

/* -------------------------------------------------------------------------- */
/* Nothing collides, nothing is NaN                                           */
/* -------------------------------------------------------------------------- */

describe('the drawn geometry', () => {
  it('never emits a non-finite coordinate', () => {
    for (const variant of VARIANTS) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      for (const node of layout.nodes) {
        for (const value of [node.x, node.y, node.w, node.h, node.value])
          expect(Number.isFinite(value), `${variant}: ${node.id}`).toBe(true)
        if (node.sector) {
          for (const value of [node.sector.r0, node.sector.r1, node.sector.a0, node.sector.a1])
            expect(Number.isFinite(value), `${variant}: ${node.id}`).toBe(true)
          expect(node.sector.d, `${variant}: ${node.id}`).not.toMatch(/NaN|Infinity/)
        }
      }
      for (const edge of layout.edges) expect(edge.d, variant).not.toMatch(/NaN|Infinity/)
      expect(layout.viewBox, variant).not.toMatch(/NaN|Infinity/)
      if (layout.spine) expect(layout.spine, variant).not.toMatch(/NaN|Infinity/)
    }
  })

  /*
   * NESTING IS NOT OVERLAP. A treemap child sits INSIDE its parent by design,
   * so a blanket "no two boxes intersect" would be measuring the wrong thing.
   * Two boxes that are not on the same ancestor line must never intersect;
   * that is the rule the reader actually depends on.
   */
  it('never puts two unrelated boxes on top of each other', () => {
    for (const variant of VARIANTS) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      const boxes = layout.nodes.filter((n) => n.kind !== 'sector')

      for (let i = 0; i < boxes.length; i += 1)
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]
          const b = boxes[j]
          if (!a || !b || related(layout, a.id, b.id)) continue
          /* Coordinates are rounded to two decimals, so two rectangles that
             share an edge can read as overlapping by half a hundredth. The
             tolerance is that rounding and nothing more: a real overlap in
             any of these layouts is tens of units, not hundredths. */
          const hit =
            Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.02 &&
            Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.02
          expect(hit, `${variant}: ${a.id} overlaps ${b.id}`).toBe(false)
        }
    }
  })

  /*
   * The chip layouts space on the same lattice the graph layouts use, so the
   * floor is the same number and can be checked against the same constant. The
   * AREA layouts are excluded on purpose: in a treemap two adjacent centres
   * SHOULD be close when the rectangles are small, and demanding otherwise
   * would be demanding that the areas lie.
   */
  it('keeps chip layouts a full row apart, centre to centre', () => {
    const chips = VARIANTS.filter((v) => !['treemap', 'sunburst', 'pyramidStructure', 'testPyramid'].includes(v))

    for (const variant of chips) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
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

  it('resolves every edge endpoint to a placed node', () => {
    for (const variant of VARIANTS) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      const placed = new Set(layout.nodes.map((n) => n.id))
      for (const edge of layout.edges) {
        expect(placed.has(edge.from), `${variant}: ${edge.from}`).toBe(true)
        expect(placed.has(edge.to), `${variant}: ${edge.to}`).toBe(true)
      }
    }
  })

  it('draws one connector per non-root node, or none at all', () => {
    for (const variant of VARIANTS) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      const expected = layout.nodes.filter((n) => n.parent !== null).length
      /* A treemap, a sunburst and a pyramid state containment by CONTAINING;
         drawing arrows on top would say the same thing twice and crowd out
         the thing the layout exists to show. */
      expect(layout.edges.length, variant).toBe(layout.edges.length === 0 ? 0 : expected)
      if (['treemap', 'sunburst', 'pyramidStructure', 'testPyramid'].includes(variant))
        expect(layout.edges, variant).toEqual([])
      else expect(layout.edges.length, variant).toBe(expected)
    }
  })

  it('never routes a connector through an unrelated node', () => {
    for (const variant of VARIANTS) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      /* Sector nodes have no box to cross, and a parent's own box is where its
         child's connector is supposed to end. */
      const boxes = layout.nodes.filter((n) => n.kind === 'chip')
      const hits = edgeCollisions({ nodes: boxes, edges: layout.edges }).map(
        ({ edge, node }) => `${layout.edges[edge]?.from}→${layout.edges[edge]?.to} crosses ${node}`,
      )
      expect(hits, variant).toEqual([])
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The tidy tree really is tidy                                               */
/* -------------------------------------------------------------------------- */

describe('tidy trees', () => {
  const tidyNames = VARIANTS.filter((v) => hierarchyStrategyFor(v) === 'tidy')

  it('covers the names where the split is the content', () => {
    for (const name of ['taxonomy', 'faultTree', 'attackTree', 'issueTree', 'rootCauseTree'])
      expect(tidyNames).toContain(name)
  })

  /*
   * A PARENT OFF-CENTRE READS AS BELONGING TO ONE CHILD.
   * The whole grammar of a decomposition is "this splits into those", and the
   * only thing on the page saying so is the parent sitting over the middle of
   * its children.
   */
  it('centres every parent over its children', () => {
    for (const variant of tidyNames) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      const vertical = layout.orientation === 'vertical'
      const kids = childrenOf(layout)

      for (const node of layout.nodes) {
        const mine = kids.get(node.id)
        if (!mine || mine.length === 0) continue
        const first = mine[0]
        const last = mine[mine.length - 1]
        if (!first || !last) continue
        const middle = vertical ? (first.x + last.x) / 2 : (first.y + last.y) / 2
        expect(vertical ? node.x : node.y, `${variant}: ${node.id}`).toBeCloseTo(middle, 1)
      }
    }
  })

  it('never lets two siblings touch', () => {
    for (const variant of tidyNames) {
      const layout = layoutHierarchy(fixtureFor(variant), variant)
      const vertical = layout.orientation === 'vertical'
      for (const siblings of childrenOf(layout).values()) {
        const along = siblings.map((s) => (vertical ? s.x : s.y)).sort((a, b) => a - b)
        for (let i = 1; i < along.length; i += 1)
          expect((along[i] ?? 0) - (along[i - 1] ?? 0), variant).toBeGreaterThanOrEqual(
            vertical ? MIN_NODE_DISTANCE : CELL_H,
          )
      }
    }
  })

  it('puts every level on its own line, in depth order', () => {
    const layout = layoutHierarchy(tree('taxonomy'), 'taxonomy')
    const byDepth = new Map<number, number>()
    for (const node of layout.nodes) {
      const seen = byDepth.get(node.depth)
      if (seen !== undefined) expect(node.y).toBe(seen)
      byDepth.set(node.depth, node.y)
    }
    const ys = [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([, y]) => y)
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] ?? 0).toBeGreaterThan(ys[i - 1] ?? 0)
  })

  /*
   * THE CASE THAT BREAKS A NAIVE TIDY TREE.
   * A deep branch beside a shallow one: centring each parent over its own
   * children, without comparing contours at every depth, swings the deep
   * branch under its shallow neighbour and the two subtrees interleave.
   */
  it('keeps a deep branch clear of its shallow neighbour', () => {
    const lopsided: HierarchyData = {
      nodes: [
        { id: 'r', label: 'Root', parent: null },
        { id: 'deep', label: 'Deep', parent: 'r' },
        { id: 'shallow', label: 'Shallow', parent: 'r' },
        { id: 'd1', label: 'D1', parent: 'deep' },
        { id: 'd2', label: 'D2', parent: 'd1' },
        { id: 'd3', label: 'D3', parent: 'd2' },
        { id: 's1', label: 'S1', parent: 'shallow' },
        { id: 's2', label: 'S2', parent: 's1' },
        { id: 's3', label: 'S3', parent: 's2' },
      ],
      variant: 'taxonomy',
    }
    const layout = layoutHierarchy(lopsided, 'taxonomy')
    const byDepth = new Map<number, HierarchyNodeBox[]>()
    for (const node of layout.nodes) {
      const list = byDepth.get(node.depth)
      if (list) list.push(node)
      else byDepth.set(node.depth, [node])
    }
    for (const row of byDepth.values()) {
      const xs = row.map((n) => n.x).sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i += 1)
        expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThanOrEqual(MIN_NODE_DISTANCE)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Treemap arithmetic                                                         */
/* -------------------------------------------------------------------------- */

describe('the treemap', () => {
  /*
   * AREA IS THE TREEMAP'S ONE CLAIM, SO THE ARITHMETIC IS CHECKED.
   * If a parent's rectangle is not the sum of its children's, the picture
   * contradicts itself and no amount of pretty packing rescues it. This is
   * also why the layout leaves no gutter: a gutter is a small lie about area.
   */
  it('fills a parent exactly with its children', () => {
    const layout = layoutHierarchy(fixtureFor('treemap'), 'treemap')
    const kids = childrenOf(layout)

    for (const node of layout.nodes) {
      const mine = kids.get(node.id)
      if (!mine || mine.length === 0) continue
      const sum = mine.reduce((s, c) => s + c.w * c.h, 0)
      const area = node.w * node.h
      /* Relative, because the only error that can be here is the two-decimal
         rounding on each edge, and that scales with the rectangle. */
      expect(Math.abs(sum - area) / area, node.id).toBeLessThan(1e-4)
    }
  })

  it('sizes each child by its value, not by its position in the list', () => {
    const layout = layoutHierarchy(fixtureFor('treemap'), 'treemap')
    const by = new Map(layout.nodes.map((n) => [n.id, n]))
    const b = by.get('b')
    const a = by.get('a')
    /* b is 12 of 30 and a is 8 of 30, so b's rectangle must be the larger. */
    expect((b?.w ?? 0) * (b?.h ?? 0)).toBeGreaterThan((a?.w ?? 0) * (a?.h ?? 0))
  })

  it('keeps every child inside its parent', () => {
    const layout = layoutHierarchy(fixtureFor('treemap'), 'treemap')
    const by = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const node of layout.nodes) {
      if (node.parent === null) continue
      const up = by.get(node.parent)
      if (!up) continue
      expect(node.x - node.w / 2, node.id).toBeGreaterThanOrEqual(up.x - up.w / 2 - 0.01)
      expect(node.x + node.w / 2, node.id).toBeLessThanOrEqual(up.x + up.w / 2 + 0.01)
      expect(node.y - node.h / 2, node.id).toBeGreaterThanOrEqual(up.y - up.h / 2 - 0.01)
      expect(node.y + node.h / 2, node.id).toBeLessThanOrEqual(up.y + up.h / 2 + 0.01)
    }
  })

  it('tiles a rectangle exactly, whatever the values', () => {
    const rect = { x: 0, y: 0, w: 400, h: 260 }
    const items = [
      { id: 'p', value: 6 },
      { id: 'q', value: 6 },
      { id: 'r', value: 4 },
      { id: 's', value: 3 },
      { id: 't', value: 2 },
      { id: 'u', value: 1 },
    ]
    const out = squarify(items, rect)
    expect(out.size).toBe(items.length)
    const sum = [...out.values()].reduce((s, r) => s + r.w * r.h, 0)
    expect(sum).toBeCloseTo(rect.w * rect.h, 4)
    for (const r of out.values()) {
      expect(r.w).toBeGreaterThan(0)
      expect(r.h).toBeGreaterThan(0)
    }
  })

  it('survives a childless or valueless call rather than dividing by zero', () => {
    expect(squarify([], { x: 0, y: 0, w: 10, h: 10 }).size).toBe(0)
    expect(squarify([{ id: 'a', value: 0 }], { x: 0, y: 0, w: 10, h: 10 }).size).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* Sunburst arithmetic                                                        */
/* -------------------------------------------------------------------------- */

describe('the sunburst', () => {
  it('gives the root the whole circle', () => {
    const layout = layoutHierarchy(fixtureFor('sunburst'), 'sunburst')
    const root = layout.nodes.find((n) => n.parent === null)
    expect((root?.sector?.a1 ?? 0) - (root?.sector?.a0 ?? 0)).toBeCloseTo(Math.PI * 2, 9)
  })

  /* The angular equivalent of the treemap's area check: a ring that does not
     fill its parent is a picture claiming a total it does not have. */
  it('fills every parent’s arc exactly with its children', () => {
    const layout = layoutHierarchy(fixtureFor('sunburst'), 'sunburst')
    const kids = childrenOf(layout)

    for (const node of layout.nodes) {
      const mine = kids.get(node.id)
      if (!mine || mine.length === 0 || !node.sector) continue
      const sum = mine.reduce((s, c) => s + ((c.sector?.a1 ?? 0) - (c.sector?.a0 ?? 0)), 0)
      expect(sum, node.id).toBeCloseTo(node.sector.a1 - node.sector.a0, 9)
    }
  })

  it('lays siblings end to end without overlapping or leaving a gap', () => {
    const layout = layoutHierarchy(fixtureFor('sunburst'), 'sunburst')
    for (const siblings of childrenOf(layout).values()) {
      const spans = siblings
        .map((s) => [s.sector?.a0 ?? 0, s.sector?.a1 ?? 0] as const)
        .sort((a, b) => a[0] - b[0])
      for (let i = 1; i < spans.length; i += 1)
        expect(spans[i]?.[0]).toBeCloseTo(spans[i - 1]?.[1] ?? 0, 9)
    }
  })

  it('puts each depth on its own ring', () => {
    const layout = layoutHierarchy(fixtureFor('sunburst'), 'sunburst')
    for (const node of layout.nodes) {
      expect(node.sector, node.id).toBeDefined()
      const inner = node.sector?.r0 ?? -1
      expect(inner, node.id).toBeGreaterThanOrEqual(0)
      expect(node.sector?.r1 ?? 0, node.id).toBeGreaterThan(inner)
    }
  })

  it('draws a whole disc when the span is the whole circle', () => {
    const disc = sectorPath(0, 50, 0, Math.PI * 2)
    expect(disc).toContain('A')
    expect(disc).not.toMatch(/NaN/)
    const wedge = sectorPath(20, 50, 0, Math.PI / 3)
    expect(wedge.startsWith('M')).toBe(true)
    expect(wedge).not.toMatch(/NaN/)
  })
})

/* -------------------------------------------------------------------------- */
/* The other layouts make their own claim                                     */
/* -------------------------------------------------------------------------- */

describe('the layouts that are not trees on a grid', () => {
  it('gives a fishbone a spine, and nothing else one', () => {
    expect(layoutHierarchy(tree('fishbone'), 'fishbone').spine).toBeTruthy()
    expect(layoutHierarchy(tree('taxonomy'), 'taxonomy').spine).toBeUndefined()
  })

  it('alternates a fishbone’s categories above and below the spine', () => {
    const layout = layoutHierarchy(tree('fishbone'), 'fishbone')
    const by = new Map(layout.nodes.map((n) => [n.id, n]))
    const a = by.get('a')?.y ?? 0
    const b = by.get('b')?.y ?? 0
    const c = by.get('c')?.y ?? 0
    expect(Math.sign(a)).toBe(-Math.sign(b))
    expect(Math.sign(a)).toBe(Math.sign(c))
    /* The effect sits on the spine, at the head of it. */
    expect(by.get('root')?.y).toBe(0)
    expect(by.get('root')?.x ?? 0).toBeGreaterThan(Math.max(a, b, c))
  })

  it('splits a mind map either side of the middle', () => {
    const layout = layoutHierarchy(tree('mindMap'), 'mindMap')
    const by = new Map(layout.nodes.map((n) => [n.id, n]))
    expect(by.get('root')?.x).toBe(0)
    expect((by.get('a')?.x ?? 0) > 0).toBe(true)
    expect((by.get('b')?.x ?? 0) < 0).toBe(true)
    expect((by.get('c')?.x ?? 0) > 0).toBe(true)
  })

  it('gives an affinity diagram one column per cluster', () => {
    const layout = layoutHierarchy(tree('affinityDiagram'), 'affinityDiagram')
    const columns = new Set(layout.nodes.filter((n) => n.depth > 0).map((n) => n.x))
    expect(columns.size).toBe(3)
  })

  it('widens a pyramid as it goes down, and sizes each block by its share', () => {
    const layout = layoutHierarchy(tree('testPyramid'), 'testPyramid')
    const widthAt = (depth: number) =>
      layout.nodes.filter((n) => n.depth === depth).reduce((s, n) => s + n.w, 0)
    expect(widthAt(1)).toBeGreaterThan(widthAt(0))
    expect(widthAt(2)).toBeGreaterThan(widthAt(1))

    const by = new Map(layout.nodes.map((n) => [n.id, n]))
    /* b is 12 and a is 8 of the same band, so b is the wider block. */
    expect(by.get('b')?.w ?? 0).toBeGreaterThan(by.get('a')?.w ?? 0)
  })
})

/* -------------------------------------------------------------------------- */
/* Refusal                                                                    */
/* -------------------------------------------------------------------------- */

describe('a thing that is not a hierarchy is refused, not repaired', () => {
  it('refuses two roots', () => {
    const data: HierarchyData = {
      nodes: [
        { id: 'a', label: 'A', parent: null },
        { id: 'b', label: 'B', parent: null },
        { id: 'c', label: 'C', parent: 'a' },
      ],
      variant: 'taxonomy',
    }
    const layout = layoutHierarchy(data, 'taxonomy')
    expect(layout.refusals.some((i) => i.message.includes('roots'))).toBe(true)
    expect(layout.nodes).toEqual([])
  })

  it('refuses a parent chain that cycles, which has no root at all', () => {
    const data: HierarchyData = {
      nodes: [
        { id: 'a', label: 'A', parent: 'b' },
        { id: 'b', label: 'B', parent: 'a' },
      ],
      variant: 'taxonomy',
    }
    const layout = layoutHierarchy(data, 'taxonomy')
    expect(layout.refusals.length).toBeGreaterThan(0)
    expect(layout.nodes).toEqual([])
  })

  it('refuses a parent that does not exist', () => {
    const data: HierarchyData = {
      nodes: [
        { id: 'a', label: 'A', parent: null },
        { id: 'b', label: 'B', parent: 'ghost' },
      ],
      variant: 'taxonomy',
    }
    expect(layoutHierarchy(data, 'taxonomy').refusals.some((i) => i.message.includes('ghost'))).toBe(
      true,
    )
  })

  /*
   * THE ONE THAT MATTERS MOST FOR A TREEMAP.
   * A parent whose stated size disagrees with its children's is a rectangle
   * that cannot be drawn truthfully at any size, and drawing it anyway would
   * publish arithmetic the author did not intend.
   */
  it('refuses a sized tree whose parent disagrees with its children', () => {
    const data: HierarchyData = {
      nodes: [
        { id: 'root', label: 'Root', parent: null, value: 100 },
        { id: 'a', label: 'A', parent: 'root', value: 30 },
        { id: 'b', label: 'B', parent: 'root', value: 30 },
      ],
      sizedByValue: true,
      variant: 'treemap',
    }
    const layout = layoutHierarchy(data, 'treemap')
    expect(layout.refusals.length).toBeGreaterThan(0)
    expect(layout.nodes).toEqual([])
  })

  it('draws a lone root rather than falling over on it', () => {
    const data: HierarchyData = {
      nodes: [{ id: 'only', label: 'Only', parent: null, value: 1 }],
      variant: 'taxonomy',
    }
    const layout = layoutHierarchy(data, 'taxonomy')
    expect(layout.refusals).toEqual([])
    expect(layout.nodes).toHaveLength(1)
    expect(layout.edges).toEqual([])
    expect(layout.viewBox).not.toMatch(/NaN/)
  })

  it('survives an empty hierarchy rather than producing a NaN viewBox', () => {
    const layout = layoutHierarchy({ nodes: [], variant: 'taxonomy' }, 'taxonomy')
    expect(layout.nodes).toEqual([])
    expect(layout.viewBox).not.toMatch(/NaN/)
  })
})

/* -------------------------------------------------------------------------- */
/* One smoke render                                                           */
/* -------------------------------------------------------------------------- */

/*
 * The one failure a pure-function test cannot see: a component that throws, or
 * that writes a NaN into an attribute. A NaN in `d` or `x` makes the element
 * render as nothing at all, with a correct-looking DOM and an empty console.
 */
describe('the component', () => {
  it('renders every variant to markup, with no NaN in any attribute', () => {
    for (const variant of VARIANTS) {
      const data = { ...fixtureFor(variant), variant }
      const html = renderToStaticMarkup(createElement(HierarchyShape, { data, variant }))
      expect(html, variant).toContain('<svg')
      expect(html, variant).not.toContain('NaN')
    }
  })

  it('shows the refusal instead of the diagram, never both', () => {
    const twoRoots: HierarchyData = {
      nodes: [
        { id: 'a', label: 'A', parent: null },
        { id: 'b', label: 'B', parent: null },
      ],
      variant: 'taxonomy',
    }
    const html = renderToStaticMarkup(
      createElement(HierarchyShape, { data: twoRoots, variant: 'taxonomy' }),
    )
    expect(html).toContain('lc-refusal')
    expect(html).toContain('roots')
    expect(html).not.toContain('<svg')
  })
})
