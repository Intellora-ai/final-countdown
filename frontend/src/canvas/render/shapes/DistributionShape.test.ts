import { describe, expect, it } from 'vitest'

import { tokens } from '../../design/tokens'
import {
  beeswarmOffsets,
  binCounts,
  binEdges,
  buildDistribution,
  densityCurve,
  fiveNumber,
  freedmanDiaconis,
  normalQuantile,
  quantileAt,
  silverman,
  sortedCopy,
  type DistributionResult,
} from './DistributionShape'
import type { DistributionData } from '../../spec/shapeInvariants'

/**
 * Distributions are tested through the derived statistics, because that is
 * where a distribution chart lies: a whisker drawn to the extreme, a bandwidth
 * nobody stated, a jitter that moves between renders.
 */

const VARIANTS: DistributionData['variant'][] = [
  'histogram',
  'boxPlot',
  'violin',
  'density',
  'strip',
  'beeswarm',
  'ridgeline',
  'quantile',
  'qqPlot',
  'populationPyramid',
  'shapSummary',
]

/** A fixed, ordinary-looking sample. Written out so no generator is involved. */
const SAMPLE_A = [
  2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 9, 4, 5, 6, 3, 7, 5, 6, 4, 8, 5, 6, 7, 5,
]
const SAMPLE_B = [
  4, 5, 5, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 10, 11, 6, 7, 8, 5, 9, 7, 8, 6, 10, 7, 8, 9, 7,
]

function distribution(variant: DistributionData['variant'], groupCount = 2): DistributionData {
  const groups = [
    { name: 'control', samples: SAMPLE_A },
    { name: 'treatment', samples: SAMPLE_B },
  ].slice(0, variant === 'populationPyramid' ? 2 : groupCount)
  return { groups, variant }
}

type Loose = Record<string, any>

function optionOf(result: DistributionResult): Loose {
  if (!result.ok) throw new Error('expected a chart, got a refusal')
  return result.option as unknown as Loose
}

/* -------------------------------------------------------------------------- */
/* 1. Every listed variant builds                                             */
/* -------------------------------------------------------------------------- */

describe('every distribution variant builds', () => {
  it.each(VARIANTS)('%s builds without throwing', (variant) => {
    const built = buildDistribution(distribution(variant))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.option.series).toBeDefined()
  })

  it('emits only finite numbers', () => {
    for (const variant of VARIANTS) {
      const option = optionOf(buildDistribution(distribution(variant)))
      for (const series of option.series as { data: unknown[] }[]) {
        for (const datum of series.data) {
          const numbers = Array.isArray(datum) ? datum : [datum]
          for (const n of numbers) if (typeof n === 'number') expect(Number.isFinite(n)).toBe(true)
        }
      }
    }
  })

  it('is deterministic: the same samples build the identical option', () => {
    for (const variant of VARIANTS) {
      const first = optionOf(buildDistribution(distribution(variant)))
      const second = optionOf(buildDistribution(distribution(variant)))
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Quantiles: one definition, stated                                       */
/* -------------------------------------------------------------------------- */

describe('quantiles use one definition everywhere', () => {
  const sorted = sortedCopy([1, 2, 3, 4])

  it('interpolates between order statistics (R type 7)', () => {
    expect(quantileAt(sorted, 0)).toBe(1)
    expect(quantileAt(sorted, 0.5)).toBe(2.5)
    expect(quantileAt(sorted, 1)).toBe(4)
    expect(quantileAt(sorted, 0.25)).toBeCloseTo(1.75, 10)
  })

  it('survives a single sample and an empty one', () => {
    expect(quantileAt([7], 0.5)).toBe(7)
    expect(Number.isNaN(quantileAt([], 0.5))).toBe(true)
  })

  it('leaves the caller’s array untouched', () => {
    const original = [3, 1, 2]
    sortedCopy(original)
    expect(original).toEqual([3, 1, 2])
  })
})

/* -------------------------------------------------------------------------- */
/* 3. THE TRAP: a hidden outlier is a deleted data point                      */
/* -------------------------------------------------------------------------- */

describe('a box plot draws its outliers and never clips them', () => {
  /* One value far outside the fences. It must survive as a POINT. */
  const withOutlier = [1, 2, 2, 3, 3, 3, 4, 4, 5, 40]

  it('stops the whisker at the last sample inside the fence, not at the extreme', () => {
    const box = fiveNumber('g', withOutlier)
    expect(box.outliers).toContain(40)
    expect(box.whiskerHigh).toBeLessThan(40)
    expect(box.whiskerHigh).toBe(5)
  })

  it('does not stop the whisker at the fence itself, which nobody measured', () => {
    const box = fiveNumber('g', withOutlier)
    /* The fence is a computed boundary; the whisker must land on a real sample. */
    expect(box.whiskerHigh).not.toBe(box.upperFence)
    expect(withOutlier).toContain(box.whiskerHigh)
    expect(withOutlier).toContain(box.whiskerLow)
  })

  it('draws every outlier as its own point beside the box', () => {
    const built = buildDistribution({
      groups: [{ name: 'g', samples: withOutlier }],
      variant: 'boxPlot',
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return

    expect(built.outliers).toEqual([{ group: 'g', value: 40 }])

    const option = optionOf(built)
    const box = (option.series[0].data as number[][])[0] ?? []
    const points = option.series[1].data as number[][]

    /* The five numbers carry the whisker, not the extreme … */
    expect(box).toHaveLength(5)
    expect(Math.max(...box)).toBe(5)
    /* … and the extreme is still on the chart. */
    expect(points.map((p) => p[1])).toContain(40)
  })

  it('says in the caption that the whiskers are fences and the rest is drawn', () => {
    const built = buildDistribution({
      groups: [{ name: 'g', samples: withOutlier }],
      variant: 'boxPlot',
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.caption).toContain('fences')
    expect(built.caption).toContain('drawn individually')
  })

  it('refuses a box plot with too few samples to have five numbers', () => {
    const built = buildDistribution({
      groups: [{ name: 'g', samples: [1, 2, 3] }],
      variant: 'boxPlot',
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems[0]?.message).toContain('five statistics')
  })
})

/* -------------------------------------------------------------------------- */
/* 4. THE TRAP: an unstated bandwidth or bin width hides the choice           */
/* -------------------------------------------------------------------------- */

describe('the estimate’s parameter is stated on the chart', () => {
  it('prints the bandwidth on a density chart', () => {
    const built = buildDistribution({ ...distribution('density'), bandwidth: 1.25 })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.bandwidth).toBe(1.25)
    expect(String(optionOf(built).title.text)).toContain('1.25')
    expect(String(optionOf(built).title.text)).toContain('estimate')
  })

  it('prints the bandwidth on a violin too, and derives one when none is given', () => {
    const built = buildDistribution(distribution('violin'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.bandwidth).toBeGreaterThan(0)
    expect(String(optionOf(built).title.text)).toContain('Silverman')
    expect(String(optionOf(built).title.text)).toContain(String(built.bandwidth))
    /* And the shape's own check still warns that the author did not state it. */
    expect(built.warnings.some((w) => w.includes('bandwidth'))).toBe(true)
  })

  it('prints the bin width on a histogram', () => {
    const built = buildDistribution({ ...distribution('histogram'), binWidth: 2 })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.binWidth).toBe(2)
    expect(String(optionOf(built).title.text)).toContain('bin width 2')
    expect(String(optionOf(built).title.text)).toContain('stated')
  })

  it('names the reference distribution on a q-q plot', () => {
    const built = buildDistribution(distribution('qqPlot'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(String(optionOf(built).title.text)).toContain('standard normal')
  })

  it('picks a readable bin width when none is stated', () => {
    const width = freedmanDiaconis(SAMPLE_A)
    expect([0.1, 0.2, 0.5, 1, 2, 5, 10]).toContain(width)
  })

  it('never returns a bandwidth of zero, which would divide by nothing', () => {
    expect(silverman([5, 5, 5, 5])).toBeGreaterThan(0)
    expect(silverman([])).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Binning and smoothing arithmetic                                        */
/* -------------------------------------------------------------------------- */

describe('bins and curves', () => {
  it('anchors bin edges to a multiple of the width, so groups line up', () => {
    const bins = binEdges([3, 11], 5)
    expect(bins[0]?.lo).toBe(0)
    expect(bins.map((b) => b.lo)).toEqual([0, 5, 10])
  })

  it('counts every sample exactly once, including the maximum', () => {
    const bins = binEdges(SAMPLE_A, 2)
    const counts = binCounts(SAMPLE_A, bins)
    expect(counts.reduce((n, c) => n + c, 0)).toBe(SAMPLE_A.length)
  })

  it('keeps the density curve finite, non-negative and inside a stated reach', () => {
    const curve = densityCurve(SAMPLE_A, 1)
    expect(curve.length).toBeGreaterThan(2)
    for (const point of curve) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
      expect(point.y).toBeGreaterThanOrEqual(0)
    }
    /* Three bandwidths past the data and no further: a kernel has infinite
       support, and drawing all of it invites a claim the sample cannot make. */
    expect(curve[0]?.x).toBe(Math.min(...SAMPLE_A) - 3)
    expect(curve[curve.length - 1]?.x).toBe(Math.max(...SAMPLE_A) + 3)
  })

  it('gives the same curve for the same bandwidth, every time', () => {
    expect(densityCurve(SAMPLE_A, 1)).toEqual(densityCurve(SAMPLE_A, 1))
  })

  it('inverts the normal CDF to the values everyone knows', () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6)
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4)
    expect(normalQuantile(0.25)).toBeCloseTo(-0.674490, 4)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. THE TRAP: a jittered swarm moves between renders                        */
/* -------------------------------------------------------------------------- */

describe('a beeswarm is computed, not jittered', () => {
  it('gives identical offsets for identical samples', () => {
    expect(beeswarmOffsets(SAMPLE_A)).toEqual(beeswarmOffsets(SAMPLE_A))
  })

  it('puts the first point of a bucket on the centre line and the rest in pairs', () => {
    const offsets = beeswarmOffsets([5, 5, 5, 5, 5])
    expect(offsets.map((o) => o.y)).toEqual([0, 1, -1, 2, -2])
  })

  it('keeps every sample at its own value — the offset never moves the datum', () => {
    const offsets = beeswarmOffsets(SAMPLE_A)
    expect(offsets.map((o) => o.x)).toEqual(sortedCopy(SAMPLE_A))
  })

  it('builds the same chart twice', () => {
    const first = optionOf(buildDistribution(distribution('beeswarm')))
    const second = optionOf(buildDistribution(distribution('beeswarm')))
    expect(JSON.stringify(first.series)).toBe(JSON.stringify(second.series))
  })

  it('leaves a strip plot with no offset at all', () => {
    const option = optionOf(buildDistribution(distribution('strip', 1)))
    const ys = (option.series[0].data as number[][]).map((p) => p[1])
    expect(new Set(ys).size).toBe(1)
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Refusals                                                                */
/* -------------------------------------------------------------------------- */

describe('a reject-level violation produces a refusal, not a chart', () => {
  it('refuses a group with no samples', () => {
    const built = buildDistribution({ groups: [{ name: 'g', samples: [] }], variant: 'strip' })
    expect(built.ok).toBe(false)
  })

  it('refuses a non-finite sample rather than dropping it', () => {
    const built = buildDistribution({
      groups: [{ name: 'g', samples: [1, 2, Number.NaN] }],
      variant: 'strip',
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems[0]?.message).toContain('non-finite')
  })

  it('refuses a population pyramid that is not exactly two groups', () => {
    const built = buildDistribution({
      groups: [{ name: 'only', samples: SAMPLE_A }],
      variant: 'populationPyramid',
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems[0]?.message).toContain('exactly two groups')
  })

  it('warns rather than refuses when a smooth has few samples', () => {
    const built = buildDistribution({
      groups: [{ name: 'g', samples: [1, 2, 3, 4, 5] }],
      variant: 'density',
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('implies detail'))).toBe(true)
  })

  it('names the path of each problem', () => {
    const built = buildDistribution(
      { groups: [{ name: 'g', samples: [] }], variant: 'strip' },
      'block[4].data',
    )
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.every((p) => p.path.startsWith('block[4].data'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 8. Variant-specific promises                                               */
/* -------------------------------------------------------------------------- */

describe('the variants keep their own promises', () => {
  it('ranks a SHAP summary by mean absolute value, with ties in author order', () => {
    const built = buildDistribution({
      variant: 'shapSummary',
      groups: [
        { name: 'weak', samples: [0.1, -0.1, 0.05] },
        { name: 'strong', samples: [2, -3, 2.5] },
        { name: 'middle', samples: [1, -1, 1] },
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.order).toEqual(['strong', 'middle', 'weak'])
    expect(built.caption).toContain('not coloured by feature value')
  })

  it('gives a population pyramid two grids and no negative counts', () => {
    const option = optionOf(buildDistribution(distribution('populationPyramid')))
    expect(option.grid).toHaveLength(2)
    expect(option.xAxis[0].inverse).toBe(true)
    for (const series of option.series as { data: number[] }[])
      for (const count of series.data) expect(count).toBeGreaterThanOrEqual(0)
  })

  it('gives a violin a mirrored pair of outlines per group', () => {
    const option = optionOf(buildDistribution(distribution('violin')))
    expect(option.series).toHaveLength(4)
    const upper = (option.series[0].data as number[][]).map((p) => p[1] ?? 0)
    const lower = (option.series[1].data as number[][]).map((p) => p[1] ?? 0)
    upper.forEach((y, i) => expect(y + (lower[i] ?? 0)).toBeCloseTo(0, 6))
  })

  it('gives a ridgeline one outline per group, on evenly spaced baselines', () => {
    const option = optionOf(buildDistribution(distribution('ridgeline')))
    expect(option.series).toHaveLength(2)
    const floors = (option.series as { data: number[][] }[]).map((s) =>
      Math.min(...s.data.map((p) => p[1] ?? 0)),
    )
    expect((floors[1] ?? 0) - (floors[0] ?? 0)).toBeCloseTo(1, 6)
  })

  it('makes histogram bars touch, so the axis still reads as continuous', () => {
    const option = optionOf(buildDistribution(distribution('histogram')))
    expect(option.series[0].barCategoryGap).toBe('0%')
  })

  it('draws a q-q reference line as well as the points', () => {
    const option = optionOf(buildDistribution(distribution('qqPlot', 1)))
    expect(option.series[0].type).toBe('scatter')
    expect(option.series[1].type).toBe('line')
    expect(String(option.series[1].name)).toContain('normal reference')
  })

  it('keeps a quantile plot inside [0, 1] and away from certainty at the ends', () => {
    const option = optionOf(buildDistribution(distribution('quantile', 1)))
    const ps = (option.series[0].data as number[][]).map((p) => p[0] ?? 0)
    expect(Math.min(...ps)).toBeGreaterThan(0)
    expect(Math.max(...ps)).toBeLessThan(1)
  })
})

/* -------------------------------------------------------------------------- */
/* 9. Law 4                                                                   */
/* -------------------------------------------------------------------------- */

describe('every colour traces back to the design tokens', () => {
  const allowed = new Set<string>([...Object.values(tokens.color), ...tokens.series])

  it('uses no colour the token file does not publish', () => {
    for (const variant of VARIANTS) {
      const option = optionOf(buildDistribution(distribution(variant)))
      const found = [...JSON.stringify(option).matchAll(/"(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1])
      expect(found.length).toBeGreaterThan(0)
      for (const colour of found) expect(allowed.has(colour ?? '')).toBe(true)
    }
  })
})
