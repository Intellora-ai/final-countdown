import { describe, expect, it } from 'vitest'

import { tokens } from '../../design/tokens'
import {
  buildChord,
  buildFlowWeighted,
  nodeDepths,
  nodeOrder,
  type FlowWeightedResult,
} from './FlowWeightedShape'
import type { FlowWeightedData } from '../../spec/shapeInvariants'

/**
 * A weighted flow has no axis. Width IS the number, so the tests below are all
 * versions of one question: is the thing drawn still proportional to the thing
 * measured, and does it draw the same way twice?
 */

const VARIANTS: FlowWeightedData['variant'][] = ['sankey', 'alluvial', 'chord']

/** Conserved on purpose: 100 in, 100 out at every intermediate node. */
function flow(variant: FlowWeightedData['variant']): FlowWeightedData {
  return {
    nodes: [
      { id: 'source', label: 'Source' },
      { id: 'middle', label: 'Middle' },
      { id: 'other', label: 'Other' },
      { id: 'sinkA', label: 'Sink A' },
      { id: 'sinkB', label: 'Sink B' },
    ],
    links: [
      { from: 'source', to: 'middle', value: 60 },
      { from: 'source', to: 'other', value: 40 },
      { from: 'middle', to: 'sinkA', value: 45 },
      { from: 'middle', to: 'sinkB', value: 15 },
      { from: 'other', to: 'sinkB', value: 40 },
    ],
    conserved: true,
    variant,
  }
}

type Loose = Record<string, any>

function optionOf(result: FlowWeightedResult): Loose {
  if (!result.ok) throw new Error('expected a chart, got a refusal')
  if (result.option === null) throw new Error('this variant builds no ECharts option')
  return result.option as unknown as Loose
}

/* -------------------------------------------------------------------------- */
/* 1. Every listed variant builds                                             */
/* -------------------------------------------------------------------------- */

describe('every flow variant builds', () => {
  it.each(VARIANTS)('%s builds without throwing', (variant) => {
    const built = buildFlowWeighted(flow(variant))
    expect(built.ok).toBe(true)
  })

  it('emits only finite numbers', () => {
    for (const variant of VARIANTS) {
      const built = buildFlowWeighted(flow(variant))
      expect(built.ok).toBe(true)
      if (!built.ok) continue
      const numbers = [...JSON.stringify(built).matchAll(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g)].map((m) =>
        Number(m[0]),
      )
      for (const n of numbers) expect(Number.isFinite(n)).toBe(true)
    }
  })

  it('is deterministic: the same flow builds the identical result', () => {
    for (const variant of VARIANTS) {
      const first = buildFlowWeighted(flow(variant))
      const second = buildFlowWeighted(flow(variant))
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. THE TRAP: ribbon width must be the value, untransformed                 */
/* -------------------------------------------------------------------------- */

describe('ribbon width is proportional to value', () => {
  it('passes the author’s value straight to the link, with no scaling', () => {
    const option = optionOf(buildFlowWeighted(flow('sankey')))
    expect((option.series[0].links as { value: number }[]).map((l) => l.value)).toEqual([
      60, 40, 45, 15, 40,
    ])
  })

  it('reports each link as a share of the largest, linearly', () => {
    const built = buildFlowWeighted(flow('sankey'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const byPair = new Map(built.ribbons.map((r) => [`${r.from}>${r.to}`, r]))
    /* 15 is a quarter of 60, and the picture must say a quarter — not the
       square root of a quarter, and not "a bit thinner". */
    expect(byPair.get('middle>sinkB')?.fraction).toBeCloseTo(0.25, 6)
    expect(byPair.get('source>middle')?.fraction).toBe(1)
  })

  it('gives a chord ribbon an angular width in the same ratio as its value', () => {
    const chord = buildChord(flow('chord'))
    const big = chord.ribbons.find((r) => r.value === 60)
    const small = chord.ribbons.find((r) => r.value === 15)
    expect(big).toBeDefined()
    expect(small).toBeDefined()
    expect((big?.width ?? 0) / (small?.width ?? 1)).toBeCloseTo(60 / 15, 4)
  })

  it('keeps that ratio between ribbons on different arcs, not just within one', () => {
    const chord = buildChord(flow('chord'))
    /* One constant for the whole circle. The only slack allowed is the sixth
       decimal place of a radian, which is where the angles are rounded — far
       below one device pixel at any size this canvas draws at. */
    const perValue = chord.ribbons.map((r) => r.width / r.value)
    const first = perValue[0] ?? 0
    for (const rate of perValue) expect(rate).toBeCloseTo(first, 6)
  })

  it('sizes each arc by the traffic through it', () => {
    const chord = buildChord(flow('chord'))
    const byId = new Map(chord.arcs.map((a) => [a.id, a]))
    /* source sends 100 and receives nothing; sinkB receives 55. */
    expect(byId.get('source')?.total).toBe(100)
    expect(byId.get('sinkB')?.total).toBe(55)
    const source = byId.get('source')
    const sink = byId.get('sinkB')
    expect(((source?.a1 ?? 0) - (source?.a0 ?? 0)) / ((sink?.a1 ?? 0) - (sink?.a0 ?? 1))).toBeCloseTo(
      100 / 55,
      4,
    )
  })

  it('lays chord arcs out without overlapping', () => {
    const chord = buildChord(flow('chord'))
    chord.arcs.forEach((arc, i) => {
      expect(arc.a1).toBeGreaterThanOrEqual(arc.a0)
      if (i === 0) return
      expect(arc.a0).toBeGreaterThanOrEqual(chord.arcs[i - 1]?.a1 ?? 0)
    })
    expect(chord.arcs[chord.arcs.length - 1]?.a1).toBeLessThanOrEqual(Math.PI * 2)
  })

  it('keeps every ribbon inside the arc it was allocated from', () => {
    const chord = buildChord(flow('chord'))
    const byId = new Map(chord.arcs.map((a) => [a.id, a]))
    for (const ribbon of chord.ribbons) {
      const source = byId.get(ribbon.from)
      const target = byId.get(ribbon.to)
      expect(ribbon.source.a0).toBeGreaterThanOrEqual((source?.a0 ?? 0) - 1e-9)
      expect(ribbon.source.a1).toBeLessThanOrEqual((source?.a1 ?? 0) + 1e-9)
      expect(ribbon.target.a0).toBeGreaterThanOrEqual((target?.a0 ?? 0) - 1e-9)
      expect(ribbon.target.a1).toBeLessThanOrEqual((target?.a1 ?? 0) + 1e-9)
    }
  })

  it('emits a chord path made only of finite coordinates', () => {
    const chord = buildChord(flow('chord'))
    for (const ribbon of chord.ribbons) {
      const numbers = [...ribbon.path.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
      expect(numbers.length).toBeGreaterThan(0)
      for (const n of numbers) expect(Number.isFinite(n)).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 3. THE TRAP: layout that moves between renders                             */
/* -------------------------------------------------------------------------- */

describe('node order is computed, never relaxed', () => {
  it('turns ECharts’ iterative relaxation off', () => {
    const option = optionOf(buildFlowWeighted(flow('sankey')))
    expect(option.series[0].layoutIterations).toBe(0)
  })

  it('gives every node an explicit depth, longest path from a source', () => {
    const data = flow('sankey')
    const depths = nodeDepths(data.nodes, data.links)
    expect(depths.get('source')).toBe(0)
    expect(depths.get('middle')).toBe(1)
    expect(depths.get('other')).toBe(1)
    expect(depths.get('sinkA')).toBe(2)
    expect(depths.get('sinkB')).toBe(2)
  })

  it('puts a node in its LATEST column when it can be reached two ways', () => {
    /* `end` is reachable directly from `start` and also through `via`. Drawn in
       column 1 its incoming ribbon would have to run backwards. */
    const depths = nodeDepths(
      [{ id: 'start' }, { id: 'via' }, { id: 'end' }],
      [
        { from: 'start', to: 'end' },
        { from: 'start', to: 'via' },
        { from: 'via', to: 'end' },
      ],
    )
    expect(depths.get('end')).toBe(2)
  })

  it('breaks ties by the author’s order, so the order is reproducible', () => {
    const data = flow('sankey')
    const order = nodeOrder(data.nodes, data.links).map((n) => n.id)
    expect(order).toEqual(['source', 'middle', 'other', 'sinkA', 'sinkB'])
    expect(nodeOrder(data.nodes, data.links).map((n) => n.id)).toEqual(order)
  })

  it('writes the computed depth onto every node in the option', () => {
    const option = optionOf(buildFlowWeighted(flow('sankey')))
    const nodes = option.series[0].data as { name: string; depth: number }[]
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 1, 2, 2])
  })

  it('keeps chord arcs in the author’s node order', () => {
    const built = buildFlowWeighted(flow('chord'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.order).toEqual(['source', 'middle', 'other', 'sinkA', 'sinkB'])
  })
})

/* -------------------------------------------------------------------------- */
/* 4. Refusals — conservation, cycles and unknown ends                        */
/* -------------------------------------------------------------------------- */

describe('a reject-level violation produces a refusal, not a chart', () => {
  it('refuses a node that passes on less than it takes, unless declared lossy', () => {
    const leaky: FlowWeightedData = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      links: [
        { from: 'a', to: 'b', value: 100 },
        { from: 'b', to: 'c', value: 60 },
      ],
      conserved: true,
      variant: 'sankey',
    }
    const built = buildFlowWeighted(leaky)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems[0]?.message).toContain('takes 100 and passes on 60')

    /* Declared lossy, the same numbers are a legitimate drop-off diagram. */
    expect(buildFlowWeighted({ ...leaky, conserved: false }).ok).toBe(true)
  })

  it('refuses a sankey that cycles', () => {
    const built = buildFlowWeighted({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      links: [
        { from: 'a', to: 'b', value: 1 },
        { from: 'b', to: 'a', value: 1 },
      ],
      variant: 'sankey',
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('cycles'))).toBe(true)
  })

  it('refuses an alluvial that cycles, which has no left-to-right drawing either', () => {
    const built = buildFlowWeighted({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      links: [
        { from: 'a', to: 'b', value: 1 },
        { from: 'b', to: 'a', value: 1 },
      ],
      variant: 'alluvial',
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('one direction'))).toBe(true)
  })

  it('refuses a negative flow', () => {
    const built = buildFlowWeighted({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      links: [{ from: 'a', to: 'b', value: -5 }],
      variant: 'sankey',
    })
    expect(built.ok).toBe(false)
  })

  it('refuses a link to a node that does not exist', () => {
    const built = buildFlowWeighted({
      nodes: [{ id: 'a', label: 'A' }],
      links: [{ from: 'a', to: 'ghost', value: 1 }],
      variant: 'sankey',
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('ghost'))).toBe(true)
  })

  it('warns rather than refuses when a chord has too many groups to follow', () => {
    const many: FlowWeightedData = {
      nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })),
      links: Array.from({ length: 11 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, value: 1 })),
      variant: 'chord',
    }
    const built = buildFlowWeighted(many)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('ten groups'))).toBe(true)
  })

  it('names the path of every problem', () => {
    const built = buildFlowWeighted(
      {
        nodes: [{ id: 'a', label: 'A' }],
        links: [{ from: 'a', to: 'ghost', value: 1 }],
        variant: 'sankey',
      },
      'block[1].data',
    )
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.every((p) => p.path.startsWith('block[1].data'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 5. What the caption promises                                               */
/* -------------------------------------------------------------------------- */

describe('the caption says which claim the diagram is making', () => {
  it('says so when flow is conserved', () => {
    const built = buildFlowWeighted(flow('sankey'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.caption).toContain('conserved')
    expect(built.caption).toContain('untransformed')
  })

  it('says so when it is not', () => {
    const built = buildFlowWeighted({ ...flow('sankey'), conserved: false })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.caption).toContain('not declared conserved')
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Law 4                                                                   */
/* -------------------------------------------------------------------------- */

describe('every colour traces back to the design tokens', () => {
  const allowed = new Set<string>([...Object.values(tokens.color), ...tokens.series])

  it('uses no colour the token file does not publish', () => {
    const option = optionOf(buildFlowWeighted(flow('sankey')))
    const found = [...JSON.stringify(option).matchAll(/"(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1])
    expect(found.length).toBeGreaterThan(0)
    for (const colour of found) expect(allowed.has(colour ?? '')).toBe(true)
  })
})
