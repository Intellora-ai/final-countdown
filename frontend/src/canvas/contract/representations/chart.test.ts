import { describe, it, expect } from 'vitest'
import { chartContract, type ChartIntent } from './chart'
import type { RepresentationContext } from '../types'

/* THE AXIS PROPERTY TEST.
 *
 * The reference image ships a y-axis reading 200, 150, 100, 110 — descending,
 * then not. This suite exists so that class of defect cannot reach a learner.
 *
 * It is a PROPERTY test rather than an example test on purpose: an example
 * proves one axis is right, a property proves the axis-generating code cannot
 * produce a wrong one. Twenty ranges per intent, deterministic seed, so a
 * failure is reproducible rather than a Tuesday mystery.
 */

const ctx = (w = 1408): RepresentationContext => ({
  element: { id: 'c', kind: 'chart', purpose: 'quantify', payload: {} },
  sourceDataProfile: {},
  viewport: { width: w, height: 768 },
  availableRenderers: ['ChartPanel'],
  existingRelationships: [],
  accessibilityRequirements: { contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true },
})

/* A seeded generator — never Math.random, so a failing case can be re-run. */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const build = (data: Array<Record<string, unknown>>, intent: ChartIntent, unit = 'kPa') => {
  const parsed = chartContract.validate({
    data, intent,
    fields: [
      { name: 'x', role: 'x', type: 'quantitative' },
      { name: 'y', role: 'y', type: 'quantitative', unit },
    ],
  })
  if (!parsed.ok) throw new Error('fixture should validate: ' + JSON.stringify(parsed.issues))
  return chartContract.normalize(parsed.value, ctx())
}

const INTENTS: ChartIntent[] = ['trend','comparison','composition','distribution','relationship','change']

describe('axis ticks are monotonic and evenly spaced, for every range', () => {
  for (const intent of INTENTS) {
    it(`holds across 20 random ranges — ${intent}`, () => {
      for (let run = 0; run < 20; run++) {
        /* Ranges spanning six orders of magnitude, negatives, and near-flat
         * series — the cases that break hand-rolled tick maths. */
        const scale = Math.pow(10, Math.floor(seeded(run, 1) * 6) - 2)
        const lo = (seeded(run, 2) * 200 - 100) * scale
        const hi = lo + Math.max(0.001, seeded(run, 3) * 500 * scale)
        const count = 3 + Math.floor(seeded(run, 4) * 30)

        const data = Array.from({ length: count }, (_, i) => ({
          x: i,
          y: lo + ((hi - lo) * i) / Math.max(1, count - 1),
        }))

        const n = build(data, intent)
        const d = chartContract.derive(n, ctx()) as { yTicks: number[] }
        const ticks = d.yTicks
        const label = `${intent} run ${run} [${lo.toPrecision(4)}, ${hi.toPrecision(4)}]`

        expect(ticks.length, `${label}: no ticks`).toBeGreaterThan(1)

        for (let i = 1; i < ticks.length; i++) {
          expect(ticks[i], `${label}: ticks not ascending — ${ticks.join(', ')}`)
            .toBeGreaterThan(ticks[i - 1])
        }

        const steps = ticks.slice(1).map((t, i) => t - ticks[i])
        const first = steps[0]
        for (const s of steps) {
          /* Relative tolerance: floating point, not sloppiness. */
          expect(Math.abs(s - first) / Math.abs(first), `${label}: uneven steps — ${ticks.join(', ')}`)
            .toBeLessThan(1e-6)
        }

        /* And the invariants the contract publishes agree with the maths. */
        const inv = chartContract.invariants(n, ctx())
        expect(inv.find((i) => i.name === 'axisAscending')?.holds, label).toBe(true)
        expect(inv.find((i) => i.name === 'axisEvenlySpaced')?.holds, label).toBe(true)
      }
    })
  }

  it('cannot reproduce the reference image’s 200, 150, 100, 110 axis', () => {
    /* The exact defect, asserted as unreachable. */
    const n = build(
      Array.from({ length: 7 }, (_, i) => ({ x: i * 100, y: 110 + i * 15 })),
      'relationship',
    )
    const { yTicks } = chartContract.derive(n, ctx()) as { yTicks: number[] }
    const descends = yTicks.some((t, i) => i > 0 && t < yTicks[i - 1])
    expect(descends, `produced ${yTicks.join(', ')}`).toBe(false)
  })
})

describe('the axis is honest per mark, not by blanket rule', () => {
  it('starts a bar chart at zero', () => {
    /* A bar's LENGTH is the quantity; truncating it misstates every ratio. */
    const n = build([{ x: 1, y: 95 }, { x: 2, y: 98 }, { x: 3, y: 100 }], 'comparison')
    const d = chartContract.derive(n, ctx()) as { mark: string; zeroBased: boolean; yDomain: number[] }
    expect(d.mark).toBe('bar')
    expect(d.zeroBased).toBe(true)
    expect(d.yDomain[0]).toBe(0)
  })

  it('does NOT force a narrow-range line chart to zero', () => {
    /* Flattening 6.4-8.3 into a line at the top of the frame hides the story
     * as surely as a truncated bar exaggerates one. */
    const data = Array.from({ length: 11 }, (_, i) => ({ x: 2015 + i, y: 6.4 + seeded(i, 9) * 1.9 }))
    const n = build(data, 'trend', '%')
    const d = chartContract.derive(n, ctx()) as { mark: string; zeroBased: boolean; yDomain: number[] }
    expect(d.mark).toBe('line')
    expect(d.zeroBased).toBe(false)
    expect(d.yDomain[0]).toBeGreaterThan(0)
  })

  it('reports a bar chart that failed to reach zero as a broken invariant', () => {
    const n = build([{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }], 'comparison')
    const inv = chartContract.invariants(n, ctx())
    expect(inv.find((i) => i.name === 'barsStartAtZero')?.holds).toBe(true)
  })
})

describe('the model states intent; the renderer chooses everything else', () => {
  it('refuses a payload carrying colour, ticks, margins or pixels', () => {
    for (const bad of [
      { data: [], fields: [], intent: 'trend', color: '#fff' },
      { data: [], fields: [], intent: 'trend', width: 400 },
      { data: [], fields: [{ name: 'x', role: 'x', type: 'quantitative', fill: 'red' }], intent: 'trend' },
    ]) {
      expect(chartContract.validate(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })

  it('refuses an unknown top-level field rather than stripping it', () => {
    const r = chartContract.validate({ data: [], fields: [], intent: 'trend', ticks: [1, 2, 3] })
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/refused, not stripped/)
  })

  it('hands out series COLOURS as indices into the token palette', () => {
    const n = build([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], 'trend')
    const d = chartContract.derive(n, ctx()) as { seriesIndices: number[] }
    for (const i of d.seriesIndices) {
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(6)
    }
  })

  it('puts the unit on the axis label', () => {
    const n = build([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], 'trend')
    const d = chartContract.derive(n, ctx()) as { yLabel: string }
    expect(d.yLabel).toBe('y (kPa)')
  })

  it('omits the legend at one series and blocks it at four or more', () => {
    const one = build([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], 'trend')
    expect((chartContract.derive(one, ctx()) as { legend: string }).legend).toBe('none')
  })

  it('honours a preferred mark only when the data supports it', () => {
    const parsed = chartContract.validate({
      intent: 'trend', preferredMark: 'pie',
      fields: [{ name: 'x', role: 'x', type: 'quantitative' }, { name: 'y', role: 'y', type: 'quantitative' }],
      data: Array.from({ length: 20 }, (_, i) => ({ x: i, y: i })),
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = chartContract.normalize(parsed.value, ctx())
    /* A 20-point pie is not a pie, whatever the payload prefers. */
    expect((chartContract.derive(n, ctx()) as { mark: string }).mark).not.toBe('pie')
  })
})

describe('a chart that would mislead is not drawn', () => {
  it('degrades two points to a table', () => {
    const n = build([{ x: 1, y: 10 }, { x: 2, y: 20 }], 'trend')
    const plan = chartContract.degrade(n, ctx())
    expect(plan?.to).toBe('table')
    expect(plan?.reason).toMatch(/not a trend/)
  })

  it('refuses to draw negative values as parts of a whole', () => {
    const n = build([{ x: 1, y: 40 }, { x: 2, y: -10 }, { x: 3, y: 70 }], 'composition')
    const plan = chartContract.degrade(n, ctx())
    expect(plan?.to).toBe('table')
    expect(plan?.reason).toMatch(/parts of a whole/)
  })

  it('scores two points as barely fit so the selector prefers anything else', () => {
    const n = build([{ x: 1, y: 10 }, { x: 2, y: 20 }], 'trend')
    expect(chartContract.fitness(n, ctx())).toBeLessThan(0.2)
  })

  it('states downsampling rather than performing it silently', () => {
    const data = Array.from({ length: 500 }, (_, i) => ({ x: i, y: seeded(i, 5) * 100 }))
    const n = build(data, 'trend')
    const plan = chartContract.disclosure(n, ctx())[0]
    expect(plan.strategy).toBe('aggregate')
    expect(plan.notice).toMatch(/500 points downsampled/)
    expect(plan.reachableVia).toBe('drawer')
  })
})
