import { describe, expect, it } from 'vitest'

import { curvePath } from '../../design/primitives'
import {
  backPath,
  buildProcess,
  layerSteps,
  layoutProcess,
  shapeForKind,
  wrapLabel,
} from './ProcessShape'
import type { ProcessData } from '../../spec/shapeInvariants'

/**
 * A process diagram is tested through its layout, because a process diagram's
 * failures are all positional: a step in the wrong column, a loop drawn like a
 * step, a handoff drawn like anything else.
 */

const VARIANTS = [
  'flowchart',
  'decisionFlow',
  'swimlane',
  'bpmn',
  'pipeline',
  'valueStream',
  'serviceBlueprint',
  'sequenceDiagram',
  'reactionDiagram',
  'blockDiagram',
]

/** One entry, one end, a labelled two-way decision, and a loop back. */
function process(variant: string, lanes = false): ProcessData {
  const lane = (name: string) => (lanes ? { lane: name } : {})
  return {
    variant,
    steps: [
      { id: 'in', label: 'Request arrives', kind: 'start', ...lane('Customer') },
      { id: 'check', label: 'Check stock', kind: 'decision', ...lane('Warehouse') },
      { id: 'pack', label: 'Pack order', kind: 'action', ...lane('Warehouse') },
      { id: 'order', label: 'Order more', kind: 'action', ...lane('Buyer') },
      { id: 'done', label: 'Delivered', kind: 'end', ...lane('Customer') },
    ],
    transitions: [
      { from: 'in', to: 'check' },
      { from: 'check', to: 'pack', label: 'in stock' },
      { from: 'check', to: 'order', label: 'out of stock' },
      { from: 'order', to: 'check', label: 'restocked' },
      { from: 'pack', to: 'done' },
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Every listed variant builds                                             */
/* -------------------------------------------------------------------------- */

describe('every process variant builds', () => {
  it.each(VARIANTS)('%s builds without throwing', (variant) => {
    const built = buildProcess(process(variant))
    expect(built.ok).toBe(true)
  })

  it.each(VARIANTS)('%s builds with lanes too', (variant) => {
    const built = buildProcess(process(variant, true))
    expect(built.ok).toBe(true)
  })

  it('emits only finite coordinates', () => {
    for (const variant of VARIANTS) {
      const layout = layoutProcess(process(variant, true))
      for (const node of layout.nodes)
        for (const n of [node.x, node.y, node.cx, node.cy, node.width, node.height])
          expect(Number.isFinite(n)).toBe(true)
      for (const edge of layout.edges) {
        const numbers = [...edge.d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
        expect(numbers.length).toBeGreaterThan(0)
        for (const n of numbers) expect(Number.isFinite(n)).toBe(true)
        expect(Number.isFinite(edge.labelX)).toBe(true)
        expect(Number.isFinite(edge.labelY)).toBe(true)
      }
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
    }
  })

  it('is deterministic: the same process lays out identically', () => {
    for (const variant of VARIANTS) {
      expect(JSON.stringify(layoutProcess(process(variant, true)))).toBe(
        JSON.stringify(layoutProcess(process(variant, true))),
      )
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Columns: longest path, so no arrow runs backwards by accident           */
/* -------------------------------------------------------------------------- */

describe('a step lands in its latest honest column', () => {
  it('puts a step after everything that can reach it', () => {
    const layers = layerSteps(
      [
        { id: 'a', label: 'A', kind: 'start' },
        { id: 'b', label: 'B', kind: 'action' },
        { id: 'z', label: 'Z', kind: 'end' },
      ],
      [
        { from: 'a', to: 'z' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'z' },
      ],
    ).layers
    /* `z` is reachable in one hop and in two. Drawn in column 1 its arrow from
       `b` would run backwards. */
    expect(layers.get('a')).toBe(0)
    expect(layers.get('b')).toBe(1)
    expect(layers.get('z')).toBe(2)
  })

  it('gives the entry column zero', () => {
    const layout = layoutProcess(process('flowchart'))
    expect(layout.nodes.find((n) => n.id === 'in')?.layer).toBe(0)
  })

  it('does not spin forever on a loop', () => {
    const result = layerSteps(
      [
        { id: 'a', label: 'A', kind: 'start' },
        { id: 'b', label: 'B', kind: 'action' },
        { id: 'e', label: 'E', kind: 'end' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'b', to: 'e' },
      ],
    )
    expect(result.layers.get('b')).toBe(1)
    expect(result.backEdges.has('b>a')).toBe(true)
  })

  it('parks an unreachable step past the end and says so', () => {
    const orphaned: ProcessData = {
      variant: 'flowchart',
      steps: [
        { id: 'a', label: 'A', kind: 'start' },
        { id: 'e', label: 'E', kind: 'end' },
        { id: 'lost', label: 'Lost', kind: 'action' },
      ],
      transitions: [
        { from: 'a', to: 'e' },
        { from: 'lost', to: 'e' },
      ],
    }
    const built = buildProcess(orphaned)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.layout.unreachable).toEqual(['lost'])
    expect(built.layout.nodes.find((n) => n.id === 'lost')?.reachable).toBe(false)
    expect(built.warnings.some((w) => w.includes('cannot be reached'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. THE TRAP: a loop drawn like a step says the opposite                     */
/* -------------------------------------------------------------------------- */

describe('a transition back to an earlier step is drawn as a loop', () => {
  it('detects the back edge and no others', () => {
    const layout = layoutProcess(process('flowchart'))
    const back = layout.edges.filter((e) => e.back).map((e) => `${e.from}>${e.to}`)
    expect(back).toEqual(['order>check'])
  })

  it('bows a back edge below the row, so it has real height', () => {
    const d = backPath({ x: 300, y: 40 }, { x: 100, y: 40 })
    const ys = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(new Set(ys).size).toBeGreaterThan(1)

    /* Drawn with the ordinary connector it would be flat — visually identical
       to a forward step, and saying the opposite of what it means. */
    const flatVersion = curvePath({ x: 300, y: 40 }, { x: 100, y: 40 })
    const flatYs = [...flatVersion.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(new Set(flatYs).size).toBe(1)
  })

  it('reports it in the caption', () => {
    const built = buildProcess(process('flowchart'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.caption).toContain('loop back')
  })
})

/* -------------------------------------------------------------------------- */
/* 4. THE TRAP: an edge that crosses a lane in silence                        */
/* -------------------------------------------------------------------------- */

describe('an edge that crosses a lane is marked', () => {
  it('flags every crossing and no within-lane step', () => {
    const layout = layoutProcess(process('swimlane', true))
    const crossings = layout.edges
      .filter((e) => e.crossesLane)
      .map((e) => `${e.fromLane}>${e.toLane}`)
    expect(crossings).toEqual([
      'Customer>Warehouse',
      'Warehouse>Buyer',
      'Buyer>Warehouse',
      'Warehouse>Customer',
    ])
    expect(layout.edges.filter((e) => !e.crossesLane).map((e) => `${e.from}>${e.to}`)).toEqual([
      'check>pack',
    ])
  })

  it('names each handoff in words, so it is in the description too', () => {
    const built = buildProcess(process('swimlane', true))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.layout.handoffs).toHaveLength(4)
    expect(built.caption).toContain('hands off to')
  })

  it('bands the lanes in the author’s order, never sorted', () => {
    const layout = layoutProcess(process('swimlane', true))
    expect(layout.lanes.map((l) => l.name)).toEqual(['Customer', 'Warehouse', 'Buyer'])
  })

  it('puts every step inside the band of its own lane', () => {
    const layout = layoutProcess(process('swimlane', true))
    const bands = new Map(layout.lanes.map((l) => [l.name, l]))
    for (const node of layout.nodes) {
      const band = bands.get(node.lane)
      expect(node.y).toBeGreaterThanOrEqual(band?.y ?? 0)
      expect(node.y + node.height).toBeLessThanOrEqual((band?.y ?? 0) + (band?.height ?? 0))
    }
  })

  it('reports no crossings at all when there are no lanes', () => {
    const layout = layoutProcess(process('flowchart'))
    expect(layout.edges.every((e) => !e.crossesLane)).toBe(true)
    expect(layout.handoffs).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Flat connectors: the hazard, pinned                                     */
/* -------------------------------------------------------------------------- */

describe('flat connectors must never be filtered', () => {
  /*
   * REGRESSION GUARD. A forward transition between two steps on the same row is
   * horizontal, so its bounding box is zero-height. `lc-bloom`'s region is in
   * PERCENTAGES of that box, so 500% of zero is zero and the path — with its
   * arrowhead — paints nothing while every attribute reads correct. The
   * renderer glows with a second wide stroke; this pins the precondition.
   */
  it('produces a flat path for a same-row step, and says so', () => {
    const layout = layoutProcess(process('flowchart'))
    const flat = layout.edges.filter((e) => e.flat)
    expect(flat.length).toBeGreaterThan(0)

    for (const edge of flat) {
      const ys = [...edge.d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))
      expect(new Set(ys).size).toBe(1)
    }
  })

  it('never marks a back edge as flat, because it is bowed', () => {
    const layout = layoutProcess(process('flowchart'))
    expect(layout.edges.filter((e) => e.back).every((e) => !e.flat)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Refusals — checkProcess does the structural work                        */
/* -------------------------------------------------------------------------- */

describe('a reject-level violation produces a refusal, not a diagram', () => {
  it('refuses a process with no entry', () => {
    const built = buildProcess({
      variant: 'flowchart',
      steps: [
        { id: 'a', label: 'A', kind: 'action' },
        { id: 'e', label: 'E', kind: 'end' },
      ],
      transitions: [{ from: 'a', to: 'e' }],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('exactly one entry'))).toBe(true)
  })

  it('refuses a process with two entries', () => {
    const built = buildProcess({
      variant: 'flowchart',
      steps: [
        { id: 'a', label: 'A', kind: 'start' },
        { id: 'b', label: 'B', kind: 'start' },
        { id: 'e', label: 'E', kind: 'end' },
      ],
      transitions: [
        { from: 'a', to: 'e' },
        { from: 'b', to: 'e' },
      ],
    })
    expect(built.ok).toBe(false)
  })

  it('refuses a dead end', () => {
    const built = buildProcess({
      variant: 'flowchart',
      steps: [
        { id: 'a', label: 'A', kind: 'start' },
        { id: 'stuck', label: 'Stuck', kind: 'action' },
        { id: 'e', label: 'E', kind: 'end' },
      ],
      transitions: [
        { from: 'a', to: 'stuck' },
        { from: 'a', to: 'e' },
      ],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('no way out'))).toBe(true)
  })

  it('refuses a decision with only one outcome', () => {
    const built = buildProcess({
      variant: 'decisionFlow',
      steps: [
        { id: 'a', label: 'A', kind: 'start' },
        { id: 'd', label: 'D?', kind: 'decision' },
        { id: 'e', label: 'E', kind: 'end' },
      ],
      transitions: [
        { from: 'a', to: 'd' },
        { from: 'd', to: 'e', label: 'yes' },
      ],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('at least two'))).toBe(true)
  })

  it('refuses an unlabelled branch out of a decision', () => {
    const unlabelled = process('decisionFlow')
    unlabelled.transitions = unlabelled.transitions.map((t) =>
      t.from === 'check' && t.to === 'pack' ? { from: t.from, to: t.to } : t,
    )
    const built = buildProcess(unlabelled)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('which case it is'))).toBe(true)
  })

  it('refuses a transition to a step that does not exist', () => {
    const broken = process('flowchart')
    broken.transitions = [...broken.transitions, { from: 'pack', to: 'ghost' }]
    expect(buildProcess(broken).ok).toBe(false)
  })

  it('names the path of every problem', () => {
    const built = buildProcess(
      {
        variant: 'flowchart',
        steps: [{ id: 'a', label: 'A', kind: 'action' }],
        transitions: [],
      },
      'block[3].data',
    )
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.every((p) => p.path.startsWith('block[3].data'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Each variant says what it cannot show                                   */
/* -------------------------------------------------------------------------- */

describe('the variants admit what this shape does not carry', () => {
  function warningsFor(variant: string, lanes = false): string[] {
    const built = buildProcess(process(variant, lanes))
    return built.ok ? built.warnings : []
  }

  it('says a swimlane without lanes has no actors', () => {
    expect(warningsFor('swimlane').some((w) => w.includes('needs actors'))).toBe(true)
    expect(warningsFor('swimlane', true).some((w) => w.includes('needs actors'))).toBe(false)
  })

  it('says a sequence diagram without lanes has no lifelines', () => {
    expect(warningsFor('sequenceDiagram').some((w) => w.includes('lifelines'))).toBe(true)
  })

  it('says a service blueprint cannot place the line of visibility', () => {
    expect(warningsFor('serviceBlueprint', true).some((w) => w.includes('line of visibility'))).toBe(
      true,
    )
  })

  it('says a value stream has no wait times to show', () => {
    expect(warningsFor('valueStream').some((w) => w.includes('wait time'))).toBe(true)
  })

  it('says a BPMN diagram is drawn as the core subset', () => {
    expect(warningsFor('bpmn').some((w) => w.includes('BPMN core'))).toBe(true)
  })

  it('says a reaction diagram’s balance is the author’s claim', () => {
    expect(warningsFor('reactionDiagram').some((w) => w.includes('balances'))).toBe(true)
  })

  it('says nothing extra about a plain flowchart', () => {
    expect(warningsFor('flowchart')).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* 8. Glyphs and labels                                                       */
/* -------------------------------------------------------------------------- */

describe('glyphs follow the convention both traditions share', () => {
  it('gives a decision a diamond and an action a rectangle', () => {
    expect(shapeForKind('decision')).toBe('diamond')
    expect(shapeForKind('action')).toBe('rect')
    expect(shapeForKind('start')).toBe('stadium')
    expect(shapeForKind('end')).toBe('stadium')
  })

  it('keeps every branch label on the edge that carries it', () => {
    const layout = layoutProcess(process('decisionFlow'))
    const labelled = layout.edges.filter((e) => e.label !== null)
    expect(labelled.map((e) => e.label)).toEqual(['in stock', 'out of stock', 'restocked'])
  })

  it('wraps a long label onto exactly two lines, never three', () => {
    expect(wrapLabel('Pack')).toEqual(['Pack'])
    expect(wrapLabel('Check the stock level now')).toHaveLength(2)
  })
})
