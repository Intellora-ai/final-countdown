import { describe, expect, it } from 'vitest'

import { tokens } from '../../design/tokens'
import {
  buildMatrix,
  buildMatrixScale,
  positionOn,
  rowRates,
  type MatrixResult,
} from './MatrixShape'
import type { MatrixData } from '../../spec/shapeInvariants'

/**
 * The matrix is tested through its BUILDER, not its pixels.
 *
 * The thing that can be wrong about a heat map is almost never the geometry —
 * it is the scale, and the scale is a handful of numbers that a test can read
 * directly. `positionOn` exists precisely so "does this value render on the
 * negative side?" is answerable without a screenshot.
 */

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const VARIANTS: MatrixData['variant'][] = [
  'heatMap',
  'correlationMatrix',
  'confusionMatrix',
  'adjacencyMatrix',
  'missingDataMap',
  'hexbin',
  'contour',
  'pairPlot',
  'riskHeatMap',
  'decisionBoundary',
]

function grid(values: (number | null)[][], variant: MatrixData['variant']): MatrixData {
  return {
    rows: values.map((_, r) => `r${r}`),
    columns: (values[0] ?? []).map((_, c) => `c${c}`),
    values,
    variant,
  }
}

/** A matrix each variant can accept: square, non-negative, whole numbers. */
function acceptable(variant: MatrixData['variant']): MatrixData {
  const values = [
    [8, 2, 1],
    [1, 9, 3],
    [0, 2, 7],
  ]
  if (variant === 'correlationMatrix')
    return grid([
      [1, 0.3, -0.2],
      [0.3, 1, 0.5],
      [-0.2, 0.5, 1],
    ], variant)
  if (variant === 'confusionMatrix') {
    const data = grid(values, variant)
    return { ...data, columns: [...data.rows] }
  }
  return grid(values, variant)
}

type Loose = Record<string, any>

function optionOf(result: MatrixResult): Loose {
  if (!result.ok) throw new Error('expected a chart, got a refusal')
  return result.option as unknown as Loose
}

/* -------------------------------------------------------------------------- */
/* 1. Every listed variant builds                                             */
/* -------------------------------------------------------------------------- */

describe('every matrix variant builds', () => {
  it.each(VARIANTS)('%s builds a chart without throwing', (variant) => {
    const built = buildMatrix(acceptable(variant))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.option.series).toBeDefined()
  })

  it('emits only finite coordinates and values', () => {
    for (const variant of VARIANTS) {
      const option = optionOf(buildMatrix(acceptable(variant)))
      for (const cell of option.series[0].data as { value: number[] }[]) {
        for (const n of cell.value) expect(Number.isFinite(n)).toBe(true)
      }
      expect(Number.isFinite(option.visualMap.min)).toBe(true)
      expect(Number.isFinite(option.visualMap.max)).toBe(true)
    }
  })

  it('is deterministic: the same input builds the identical option', () => {
    for (const variant of VARIANTS) {
      const first = optionOf(buildMatrix(acceptable(variant)))
      const second = optionOf(buildMatrix(acceptable(variant)))
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. THE TRAP: an unanchored scale invents a midpoint                        */
/* -------------------------------------------------------------------------- */

describe('the colour scale is anchored, so an all-positive matrix is not half negative', () => {
  /*
   * THE BUG THIS PINS.
   * Hand [2 … 10] to a diverging ramp and let it pick its own ends and the
   * smallest cell lands at t = 0 — the far "negative" end — with the ramp's
   * neutral colour falling at 6. Every value below 6 then reads as below zero,
   * in a matrix where nothing is.
   */
  const positive = grid(
    [
      [2, 5, 10],
      [3, 6, 9],
    ],
    'heatMap',
  )

  it('picks a sequential scale when the data never crosses the midpoint', () => {
    const scale = buildMatrixScale(positive)
    expect(scale.kind).toBe('sequential')
  })

  it('anchors the floor at zero for a non-negative quantity', () => {
    const scale = buildMatrixScale(positive)
    expect(scale.min).toBe(0)
    expect(scale.max).toBe(10)
  })

  it('lands every value above the floor, and none at the ramp’s neutral end', () => {
    const scale = buildMatrixScale(positive)
    for (const v of positive.values.flat() as number[]) {
      const t = positionOn(scale, v)
      expect(t).toBeGreaterThan(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })

  it('shows what the unanchored version would have done', () => {
    /* The counterfactual, stated so the regression is unmistakable: with the
       data setting both ends, 2 sits at 0 and 6 at the midpoint. */
    const naive = { kind: 'diverging' as const, min: 2, max: 10, midpoint: 6, colors: [], anchor: '' }
    expect(positionOn(naive, 2)).toBe(0)
    expect(positionOn(naive, 5)).toBeLessThan(0.5)

    const anchored = buildMatrixScale(positive)
    expect(positionOn(anchored, 5)).toBeGreaterThan(0)
    expect(anchored.min).toBeLessThanOrEqual(2)
  })

  it('anchors a genuinely diverging matrix at zero and keeps it symmetric', () => {
    const crossing = grid(
      [
        [-8, 0, 2],
        [-1, 3, 1],
      ],
      'heatMap',
    )
    const scale = buildMatrixScale(crossing)
    expect(scale.kind).toBe('diverging')
    expect(scale.midpoint).toBe(0)
    expect(scale.min).toBe(-8)
    expect(scale.max).toBe(8)

    /* Symmetry is what makes +3 and -3 equally intense. */
    expect(positionOn(scale, 0)).toBeCloseTo(0.5, 10)
    expect(positionOn(scale, 3) - 0.5).toBeCloseTo(0.5 - positionOn(scale, -3), 10)

    /* And the neutral colour is the MIDDLE of an odd-length ramp, so it lands
       on the midpoint rather than near it. */
    expect(scale.colors).toHaveLength(3)
    expect(scale.colors[1]).toBe(tokens.color.surfaceLift)
  })

  it('states the anchoring on the chart, not only in a caption', () => {
    const option = optionOf(buildMatrix(positive))
    expect(String(option.title.text)).toContain('anchored')
  })

  it('never clips a value off the end of the scale', () => {
    for (const variant of VARIANTS) {
      const data = acceptable(variant)
      const scale = buildMatrixScale(data)
      const values = data.values.flat().filter((v): v is number => v !== null)
      expect(scale.min).toBeLessThanOrEqual(Math.min(...values))
      expect(scale.max).toBeGreaterThanOrEqual(Math.max(...values))
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 3. THE TRAP: correlation must not set its own range                        */
/* -------------------------------------------------------------------------- */

describe('a correlation matrix is fixed to [-1, 1]', () => {
  const weak = grid(
    [
      [1, 0.3],
      [0.3, 1],
    ],
    'correlationMatrix',
  )

  it('uses correlation’s own range whatever the data spans', () => {
    const scale = buildMatrixScale(weak)
    expect(scale.min).toBe(-1)
    expect(scale.max).toBe(1)
    expect(scale.midpoint).toBe(0)
  })

  it('renders r = 0.3 as weak, not as the top of the ramp', () => {
    const scale = buildMatrixScale(weak)
    /* Data-driven ends would put 0.3 at t = 0 (the deep NEGATIVE end, because
       0.3 is this matrix's minimum). Fixed ends put it just past neutral. */
    expect(positionOn(scale, 0.3)).toBeCloseTo(0.65, 10)
    expect(positionOn(scale, 0.95)).toBeGreaterThan(0.9)
  })

  it('is the same scale in a strongly and a weakly correlated matrix', () => {
    const strong = grid(
      [
        [1, 0.95],
        [0.95, 1],
      ],
      'correlationMatrix',
    )
    expect(buildMatrixScale(weak)).toMatchObject({ min: -1, max: 1 })
    expect(buildMatrixScale(strong)).toMatchObject({ min: -1, max: 1 })
  })

  it('refuses a correlation outside [-1, 1] rather than clamping it', () => {
    const impossible = grid(
      [
        [1, 1.4],
        [1.4, 1],
      ],
      'correlationMatrix',
    )
    const built = buildMatrix(impossible)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('outside [-1, 1]'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. THE TRAP: a transposed confusion matrix swaps precision and recall      */
/* -------------------------------------------------------------------------- */

describe('a confusion matrix names both axes and shows rates as well as counts', () => {
  const classes = ['cat', 'dog']
  const confusion: MatrixData = {
    rows: classes,
    columns: classes,
    values: [
      [900, 0],
      [87, 3],
    ],
    variant: 'confusionMatrix',
  }

  it('labels rows TRUE and columns PREDICTED, in those words', () => {
    const option = optionOf(buildMatrix(confusion))
    expect(String(option.yAxis.name)).toContain('TRUE')
    expect(String(option.xAxis.name)).toContain('PREDICTED')
  })

  it('puts the first row at the top, so the data’s order is the screen’s order', () => {
    const option = optionOf(buildMatrix(confusion))
    expect(option.yAxis.data).toEqual(classes)
    expect(option.yAxis.inverse).toBe(true)
  })

  it('shows the row-normalised rate, because counts hide class imbalance', () => {
    const built = buildMatrix(confusion)
    expect(built.ok).toBe(true)
    if (!built.ok) return

    /* 900/900 correct in one class and 3/90 in the other is a useless model
       that a count-only matrix flatters. */
    expect(built.rates?.[0]).toEqual([1, 0])
    expect(built.rates?.[1]?.[1]).toBeCloseTo(3 / 90, 10)

    const labels = (optionOf(built).series[0].data as { label?: { formatter: string } }[]).map(
      (cell) => cell.label?.formatter ?? '',
    )
    expect(labels.some((text) => text.includes('900') && text.includes('100%'))).toBe(true)
    expect(labels.some((text) => text === '3\n3.3%')).toBe(true)
  })

  it('refuses class lists that differ, which is how a transposition arrives', () => {
    const swapped: MatrixData = { ...confusion, columns: ['dog', 'cat'] }
    const built = buildMatrix(swapped)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('identical class lists'))).toBe(true)
  })

  it('uses a sequential scale for counts, anchored at zero', () => {
    const scale = buildMatrixScale(confusion)
    expect(scale.kind).toBe('sequential')
    expect(scale.min).toBe(0)
  })

  it('leaves a rate undefined rather than calling it zero when a row is empty', () => {
    expect(rowRates([[0, 0]])).toEqual([[null, null]])
    expect(rowRates([[null, 4]])).toEqual([[null, 1]])
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Refusals — never a repaired chart                                       */
/* -------------------------------------------------------------------------- */

describe('a reject-level violation produces a refusal, not a chart', () => {
  it('refuses a ragged matrix rather than drawing the holes', () => {
    const ragged: MatrixData = {
      rows: ['a', 'b'],
      columns: ['x', 'y'],
      values: [[1, 2], [3]],
      variant: 'heatMap',
    }
    const built = buildMatrix(ragged)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems).not.toHaveLength(0)
    expect(built.problems.every((p) => p.level === 'reject')).toBe(true)
  })

  it('refuses a row count that disagrees with the row labels', () => {
    const built = buildMatrix({
      rows: ['a', 'b', 'c'],
      columns: ['x'],
      values: [[1], [2]],
      variant: 'heatMap',
    })
    expect(built.ok).toBe(false)
  })

  it('refuses a non-finite cell', () => {
    const built = buildMatrix(grid([[1, Number.NaN]], 'heatMap'))
    expect(built.ok).toBe(false)
  })

  it('refuses a matrix declared symmetric that is not', () => {
    const built = buildMatrix({
      rows: ['a', 'b'],
      columns: ['a', 'b'],
      values: [
        [1, 2],
        [3, 1],
      ],
      symmetric: true,
      variant: 'adjacencyMatrix',
    })
    expect(built.ok).toBe(false)
  })

  it('refuses fractional confusion "counts"', () => {
    const built = buildMatrix({
      rows: ['a'],
      columns: ['a'],
      values: [[1.5]],
      variant: 'confusionMatrix',
    })
    expect(built.ok).toBe(false)
  })

  it('names the path of every problem, so the author knows where to look', () => {
    const built = buildMatrix(grid([[1, Number.POSITIVE_INFINITY]], 'heatMap'), 'block[2].data')
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.every((p) => p.path.startsWith('block[2].data'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Absent is not zero                                                      */
/* -------------------------------------------------------------------------- */

describe('a null cell is a gap', () => {
  it('omits the cell instead of painting it at the floor', () => {
    const built = buildMatrix(grid([[1, null, 3]], 'missingDataMap'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.absentCells).toBe(1)
    expect(optionOf(built).series[0].data).toHaveLength(2)
    expect(built.caption).toContain('absent')
  })

  it('ignores absent cells when anchoring the scale', () => {
    const scale = buildMatrixScale(grid([[null, 4, 6]], 'heatMap'))
    expect(scale.min).toBe(0)
    expect(scale.max).toBe(6)
  })

  it('survives a matrix that is entirely absent', () => {
    const built = buildMatrix(grid([[null, null]], 'missingDataMap'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(Number.isFinite(built.scale.min)).toBe(true)
    expect(Number.isFinite(built.scale.max)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Law 4 — colour only ever comes from the tokens                          */
/* -------------------------------------------------------------------------- */

describe('every colour traces back to the design tokens', () => {
  const allowed = new Set<string>([
    ...Object.values(tokens.color),
    ...tokens.series,
  ])

  it('uses no colour the token file does not publish', () => {
    for (const variant of VARIANTS) {
      const option = optionOf(buildMatrix(acceptable(variant)))
      const found = [...JSON.stringify(option).matchAll(/"(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1])
      expect(found.length).toBeGreaterThan(0)
      for (const colour of found) expect(allowed.has(colour ?? '')).toBe(true)
    }
  })
})
