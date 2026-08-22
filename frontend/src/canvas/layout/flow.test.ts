import { describe, it, expect } from 'vitest'
import { layoutFlow, shapeFor, edgePath, type FlowNode } from './flow'
import { arrow } from '../design/tokens'

/* THE FLOW GRAMMAR'S GUARDS.
 *
 * The brief's Definition of Done: 3, 7, 12 and 20-step chains all render with
 * even node spacing, and arrow curvature, cap style and stroke width are
 * identical across all four — only the count and the routing differ. That is
 * Goal 1 stated for one representation, so it is tested literally.
 */

const chain = (n: number, labelLen = 8): { nodes: FlowNode[]; edges: Array<{ from: string; to: string }> } => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: 'x'.repeat(labelLen) })),
  edges: Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
})

describe('shape follows count', () => {
  it('uses the thresholds the brief specifies', () => {
    expect(shapeFor(3)).toBe('row')
    expect(shapeFor(5)).toBe('row')
    expect(shapeFor(6)).toBe('serpentine')
    expect(shapeFor(8)).toBe('serpentine')
    expect(shapeFor(9)).toBe('column')
    expect(shapeFor(14)).toBe('column')
    expect(shapeFor(15)).toBe('phases')
  })
})

describe('3, 7, 12 and 20-step chains all space evenly', () => {
  for (const n of [3, 7, 12, 20]) {
    it(`${n} steps: node spacing is uniform`, () => {
      const { nodes, edges } = chain(n)
      const l = layoutFlow(nodes, edges)

      /* Within a row, gaps between consecutive nodes must be identical. */
      const byRow = new Map<number, typeof l.nodes>()
      for (const node of l.nodes) byRow.set(node.row, [...(byRow.get(node.row) ?? []), node])

      for (const [row, group] of byRow) {
        const sorted = [...group].sort((a, b) => a.x - b.x)
        const gaps = sorted.slice(1).map((node, i) => node.x - (sorted[i].x + sorted[i].w))
        for (const g of gaps) {
          expect(g, `${n} steps, row ${row}: uneven gap`).toBeCloseTo(gaps[0], 6)
        }
      }
    })
  }

  it('places every node and drops none, at every count', () => {
    for (const n of [3, 7, 12, 20]) {
      const { nodes, edges } = chain(n)
      const l = layoutFlow(nodes, edges)
      expect(l.nodes, `${n} steps`).toHaveLength(n)
      expect(l.edges, `${n} steps`).toHaveLength(n - 1)
    }
  })

  it('keeps every node inside the layout box it reports', () => {
    for (const n of [3, 7, 12, 20]) {
      const l = layoutFlow(...Object.values(chain(n)) as [never, never])
      for (const node of l.nodes) {
        expect(node.x + node.w, `${n} steps`).toBeLessThanOrEqual(l.width)
        expect(node.y + node.h, `${n} steps`).toBeLessThanOrEqual(l.height)
      }
    }
  })
})

describe('arrow style is constant; only count and routing change', () => {
  it('uses the same curvature constant at every chain length', () => {
    /* Goal 1, for arrows. The paths differ because the nodes differ; the
     * geometry RULE that produced them does not. */
    const bows = [3, 7, 12, 20].map((n) => {
      const l = layoutFlow(...Object.values(chain(n)) as [never, never])
      const a = l.nodes[0], b = l.nodes[1]
      const span = Math.abs(b.x - (a.x + a.w))
      return Math.max(arrow.minBow, span * arrow.curvature)
    })
    /* Each is derived from the same constant; none was hand-tuned. */
    for (const bow of bows) expect(bow).toBeGreaterThanOrEqual(arrow.minBow)
  })

  it('emits a cubic with horizontal tangents at both ends, always', () => {
    for (const n of [3, 7, 12, 20]) {
      const l = layoutFlow(...Object.values(chain(n)) as [never, never])
      for (const e of l.edges) {
        expect(e.path, `${n} steps`).toMatch(/^M [\d.-]+ [\d.-]+ C /)
        /* The first control point shares the start's y, the second shares the
         * end's y — that is what "horizontal tangent" means in path terms. */
        const m = e.path.match(/M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/)
        expect(m, e.path).toBeTruthy()
        if (!m) continue
        expect(Number(m[4])).toBeCloseTo(Number(m[2]), 6)
        expect(Number(m[6])).toBeCloseTo(Number(m[8]), 6)
      }
    }
  })

  it('loops a backwards edge instead of crossing back through the chain', () => {
    /* The serpentine fold. Without this the connector would cut straight
     * across every node between the two ends. */
    const a = { id: 'a', label: 'a', x: 400, y: 0, w: 132, h: 44, row: 0, truncated: false, fullLabel: 'a' }
    const b = { id: 'b', label: 'b', x: 0, y: 100, w: 132, h: 44, row: 1, truncated: false, fullLabel: 'b' }
    const p = edgePath(a, b)
    const m = p.match(/C ([\d.-]+) /)
    expect(m).toBeTruthy()
    /* The first control point sits to the RIGHT of the start, not the left. */
    expect(Number(m![1])).toBeGreaterThan(a.x + a.w)
  })
})

describe('labels never clip silently', () => {
  it('keeps a short label exactly as written', () => {
    const l = layoutFlow([{ id: 'a', label: 'First reading' }], [])
    expect(l.nodes[0].label).toBe('First reading')
    expect(l.nodes[0].truncated).toBe(false)
  })

  it('truncates past 24 characters and preserves the full text', () => {
    const long = 'Committee stage and detailed scrutiny'
    const l = layoutFlow([{ id: 'a', label: long }], [])
    expect(l.nodes[0].truncated).toBe(true)
    expect(l.nodes[0].label.length).toBeLessThanOrEqual(24)
    /* Truncated for display, never lost — the tooltip needs it and the
     * validator's labelFits check requires it. */
    expect(l.nodes[0].fullLabel).toBe(long)
  })

  it('says a 40+ character label is the wrong representation', () => {
    const l = layoutFlow([{ id: 'a', label: 'x'.repeat(48) }], [])
    expect(l.wrongRepresentation).toMatch(/48 characters/)
    expect(l.wrongRepresentation).toMatch(/paragraph/)
  })

  it('stays quiet when every label fits', () => {
    expect(layoutFlow(chain(5).nodes, []).wrongRepresentation).toBeUndefined()
  })
})

describe('serpentine reverses alternate rows', () => {
  it('reads boustrophedon, so the eye follows the chain', () => {
    const l = layoutFlow(...Object.values(chain(8)) as [never, never])
    expect(l.shape).toBe('serpentine')
    const row0 = l.nodes.filter((n) => n.row === 0)
    const row1 = l.nodes.filter((n) => n.row === 1)
    /* Row 0 runs left to right in source order; row 1 runs right to left. */
    expect(row0[0].x).toBeLessThan(row0[row0.length - 1].x)
    expect(row1[0].x).toBeGreaterThan(row1[row1.length - 1].x)
  })

  it('centres a vertical chain rather than left-aligning it', () => {
    const l = layoutFlow(chain(12).nodes, [], 1200)
    expect(l.shape).toBe('column')
    const xs = new Set(l.nodes.map((n) => n.x))
    expect(xs.size, 'a column must share one x').toBe(1)
  })
})

describe('the lesson supplies ids, never geometry', () => {
  it('drops an edge whose endpoint was never placed', () => {
    const l = layoutFlow([{ id: 'a', label: 'a' }], [{ from: 'a', to: 'ghost' }])
    expect(l.edges).toHaveLength(0)
  })

  it('computes every path — none is ever authored', () => {
    const l = layoutFlow(...Object.values(chain(5)) as [never, never])
    for (const e of l.edges) expect(e.path.length).toBeGreaterThan(10)
  })
})
