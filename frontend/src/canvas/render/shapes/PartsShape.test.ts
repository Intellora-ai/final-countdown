import { describe, expect, it } from 'vitest'

import { tokens } from '../../design/tokens'
import {
  WAFFLE_CELLS,
  allocateWaffle,
  buildMosaic,
  buildParts,
  buildWaffle,
  runWaterfall,
  type PartsResult,
} from './PartsShape'
import type { PartsData } from '../../spec/shapeInvariants'

/**
 * Parts are tested through the builder, because every failure mode of a
 * parts-of-a-whole chart is arithmetic: cells that do not add up, a running
 * total that does not arrive, a width scale that does not start at zero.
 */

const VARIANTS: PartsData['variant'][] = [
  'pie',
  'donut',
  'waffle',
  'waterfall',
  'funnel',
  'marimekko',
  'stackedBar',
]

function parts(
  variant: PartsData['variant'],
  values: [string, number][],
  whole?: number,
): PartsData {
  return { parts: values.map(([label, value]) => ({ label, value })), variant, ...(whole === undefined ? {} : { whole }) }
}

/** Values every variant accepts: descending, so a funnel is happy too. */
function acceptable(variant: PartsData['variant']): PartsData {
  return parts(variant, [
    ['visited', 500],
    ['signed up', 300],
    ['paid', 120],
  ])
}

type Loose = Record<string, any>

function optionOf(result: PartsResult): Loose {
  if (!result.ok) throw new Error('expected a chart, got a refusal')
  if (result.option === null) throw new Error('this variant does not build an ECharts option')
  return result.option as unknown as Loose
}

/* -------------------------------------------------------------------------- */
/* 1. Every listed variant builds                                             */
/* -------------------------------------------------------------------------- */

describe('every parts variant builds', () => {
  it.each(VARIANTS)('%s builds without throwing', (variant) => {
    const built = buildParts(acceptable(variant))
    expect(built.ok).toBe(true)
  })

  it('emits only finite numbers', () => {
    for (const variant of VARIANTS) {
      const built = buildParts(acceptable(variant))
      expect(built.ok).toBe(true)
      if (!built.ok) continue
      const numbers = [...JSON.stringify(built).matchAll(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g)].map((m) =>
        Number(m[0]),
      )
      for (const n of numbers) expect(Number.isFinite(n)).toBe(true)
    }
  })

  it('is deterministic: the same parts build the identical result', () => {
    for (const variant of VARIANTS) {
      const first = buildParts(acceptable(variant))
      const second = buildParts(acceptable(variant))
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. THE TRAP: a waffle cell is a unit, so cells must be whole               */
/* -------------------------------------------------------------------------- */

describe('a waffle draws whole cells and says what it rounded', () => {
  /* 37.4% of 100 cells cannot be drawn. What must not happen is 37 cells drawn
     under a caption that still says 37.4%. */
  const uneven = parts('waffle', [
    ['a', 37.4],
    ['b', 33.3],
    ['c', 29.3],
  ])

  it('gives every part a whole number of cells', () => {
    for (const slot of allocateWaffle(uneven.parts, 100)) {
      expect(Number.isInteger(slot.cells)).toBe(true)
      expect(slot.cells).toBeGreaterThanOrEqual(0)
    }
  })

  it('allocates exactly the cell count, never one more or fewer', () => {
    const total = allocateWaffle(uneven.parts, 100).reduce((n, s) => n + s.cells, 0)
    expect(total).toBe(WAFFLE_CELLS)
  })

  it('rounds by largest remainder, so three equal thirds still fill the grid', () => {
    const thirds = allocateWaffle(
      [
        { label: 'a', value: 1 },
        { label: 'b', value: 1 },
        { label: 'c', value: 1 },
      ],
      3,
    )
    expect(thirds.map((s) => s.cells)).toEqual([34, 33, 33])
    expect(thirds.reduce((n, s) => n + s.cells, 0)).toBe(100)
  })

  it('states the rounding rather than hiding it', () => {
    const built = buildParts(uneven)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.waffle?.note).toContain('rounded')
    expect(built.caption).toContain('37.4')
    /* 37.4 cells is not drawable. It becomes 38 — the largest remainder takes
       the one spare cell — and the note says 37.4 → 38 so the reader can see
       which way it went. */
    const drawn = built.waffle?.rounding.find((slot) => slot.label === 'a')
    expect(drawn?.exact).toBeCloseTo(37.4, 6)
    expect(drawn?.cells).toBe(38)
    expect(drawn?.delta).toBeCloseTo(0.6, 6)
    expect(built.waffle?.note).toContain('37.4 → 38')
  })

  it('says nothing was rounded when nothing was', () => {
    const clean = buildParts(parts('waffle', [['a', 25], ['b', 75]]))
    expect(clean.ok).toBe(true)
    if (!clean.ok) return
    expect(clean.waffle?.note).toContain('nothing was rounded')
  })

  it('places every cell inside the grid, in a fixed order', () => {
    const grid = buildWaffle(uneven.parts, 100)
    expect(grid.cells).toHaveLength(100)
    for (const cell of grid.cells) {
      expect(cell.row).toBeGreaterThanOrEqual(0)
      expect(cell.row).toBeLessThan(grid.rows)
      expect(cell.column).toBeGreaterThanOrEqual(0)
      expect(cell.column).toBeLessThan(grid.columns)
    }
    expect(grid.cells.map((c) => c.index)).toEqual(grid.cells.map((_, i) => i))
    expect(JSON.stringify(buildWaffle(uneven.parts, 100))).toBe(JSON.stringify(grid))
  })

  it('draws nothing rather than dividing by zero when the whole is zero', () => {
    const empty = buildWaffle([{ label: 'a', value: 0 }], 0)
    expect(empty.cells).toHaveLength(0)
    for (const slot of empty.rounding) expect(Number.isFinite(slot.exact)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. THE TRAP: a waterfall's running total must land on the stated end       */
/* -------------------------------------------------------------------------- */

describe('a waterfall arrives where it says it arrives', () => {
  const run = parts(
    'waterfall',
    [
      ['opening', 100],
      ['new business', 40],
      ['churn', -25],
      ['price rise', 12],
    ],
    127,
  )

  it('accumulates to the stated end', () => {
    const built = buildParts(run)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.waterfall?.reached).toBe(127)
    expect(built.waterfall?.stated).toBe(127)
    expect(built.waterfall?.ok).toBe(true)
  })

  it('puts every bar between the running total before it and after it', () => {
    const accumulated = runWaterfall(run.parts, 127)
    let previous = 0
    for (const step of accumulated.steps) {
      expect(step.base).toBe(Math.min(previous, step.running))
      expect(step.base + step.height).toBe(Math.max(previous, step.running))
      expect(step.running).toBe(previous + step.value)
      previous = step.running
    }
    expect(previous).toBe(127)
  })

  it('draws the bars where the running total says, and a total bar from zero', () => {
    const option = optionOf(buildParts(run))
    const bases = option.series[0].data as number[]
    const heights = (option.series[1].data as { value: number }[]).map((d) => d.value)
    const accumulated = runWaterfall(run.parts, 127)

    let previous = 0
    accumulated.steps.forEach((step, i) => {
      expect(bases[i]).toBe(step.base)
      expect(heights[i]).toBe(step.height)
      /* The bar spans exactly from the running total before it to the running
         total after it. Nothing is nudged to make the last one fit. */
      expect(bases[i]).toBe(Math.min(previous, step.running))
      expect((bases[i] ?? 0) + (heights[i] ?? 0)).toBe(Math.max(previous, step.running))
      previous = step.running
    })

    expect(bases[bases.length - 1]).toBe(0)
    expect(heights[heights.length - 1]).toBe(127)
  })

  it('refuses steps that do not sum to the stated end rather than drawing them', () => {
    const wrong = parts(
      'waterfall',
      [
        ['opening', 100],
        ['churn', -25],
      ],
      127,
    )
    const built = buildParts(wrong)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('127'))).toBe(true)
  })

  it('lets a waterfall carry negatives, because a decrease is the point', () => {
    const built = buildParts(parts('waterfall', [['up', 10], ['down', -4]]))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.waterfall?.steps[1]?.rises).toBe(false)
  })

  it('gives the invisible base no colour at all', () => {
    const option = optionOf(buildParts(run))
    expect(option.series[0].itemStyle.opacity).toBe(0)
    expect(option.series[0].itemStyle.color).toBeUndefined()
    expect(option.series[0].silent).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. THE TRAP: a funnel stage is a subset, and width means value             */
/* -------------------------------------------------------------------------- */

describe('a funnel', () => {
  it('refuses a stage that grows', () => {
    const built = buildParts(parts('funnel', [['visited', 100], ['signed up', 140]]))
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('larger than the stage before'))).toBe(true)
  })

  it('starts the width scale at zero, so width is proportional to value', () => {
    /* ECharts' default maps the SMALLEST value to zero width, which would draw
       a stage holding a fifth of the top as a hairline. */
    const option = optionOf(buildParts(parts('funnel', [['a', 500], ['b', 100]])))
    expect(option.series[0].min).toBe(0)
    expect(option.series[0].max).toBe(500)
    expect(option.series[0].minSize).toBe('0%')
    expect(option.series[0].maxSize).toBe('100%')
  })

  it('keeps the author’s order, because the order is the sequence', () => {
    const option = optionOf(buildParts(acceptable('funnel')))
    expect(option.series[0].sort).toBe('none')
    expect((option.series[0].data as { name: string }[]).map((d) => d.name)).toEqual([
      'visited',
      'signed up',
      'paid',
    ])
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Refusals                                                                */
/* -------------------------------------------------------------------------- */

describe('a reject-level violation produces a refusal, not a chart', () => {
  it('refuses a negative slice everywhere except a waterfall', () => {
    for (const variant of VARIANTS) {
      const built = buildParts(parts(variant, [['a', 10], ['b', -2]]))
      expect(built.ok).toBe(variant === 'waterfall')
    }
  })

  it('refuses parts that do not sum to the stated whole', () => {
    const built = buildParts(parts('pie', [['a', 40], ['b', 47]], 100))
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems[0]?.message).toContain('not the stated whole')
  })

  it('refuses two parts that share a label', () => {
    expect(buildParts(parts('pie', [['a', 1], ['a', 2]])).ok).toBe(false)
  })

  it('refuses a non-finite value', () => {
    expect(buildParts(parts('donut', [['a', Number.NaN]])).ok).toBe(false)
  })

  it('warns about too many slices instead of refusing them', () => {
    const many = parts(
      'pie',
      Array.from({ length: 9 }, (_, i) => [`p${i}`, 1] as [string, number]),
    )
    const built = buildParts(many)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('compared by angle'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Marimekko is honest about the dimension it does not have                */
/* -------------------------------------------------------------------------- */

describe('marimekko', () => {
  it('gives each band a width proportional to its share', () => {
    const bands = buildMosaic([{ label: 'a', value: 1 }, { label: 'b', value: 3 }], 4)
    expect(bands[0]?.fraction).toBeCloseTo(0.25, 6)
    expect(bands[1]?.fraction).toBeCloseTo(0.75, 6)
    expect(bands[0]?.x0).toBe(0)
    expect(bands[1]?.x1).toBeCloseTo(1, 6)
  })

  it('lays bands end to end with no gap and no overlap', () => {
    const bands = buildMosaic(
      [
        { label: 'a', value: 2 },
        { label: 'b', value: 3 },
        { label: 'c', value: 5 },
      ],
      10,
    )
    bands.forEach((band, i) => {
      if (i === 0) return
      expect(band.x0).toBeCloseTo(bands[i - 1]?.x1 ?? 0, 6)
    })
  })

  it('says out loud that only one dimension is drawn', () => {
    const built = buildParts(acceptable('marimekko'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('two dimensions'))).toBe(true)
    expect(built.caption).toContain('no height is claimed')
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Pie, donut, stacked bar                                                 */
/* -------------------------------------------------------------------------- */

describe('pie, donut and stacked bar', () => {
  it('gives a donut a hole and a pie none', () => {
    expect(optionOf(buildParts(acceptable('donut'))).series[0].radius[0]).toBe('42%')
    expect(optionOf(buildParts(acceptable('pie'))).series[0].radius[0]).toBe('0%')
  })

  it('stacks every part into one bar', () => {
    const option = optionOf(buildParts(acceptable('stackedBar')))
    expect(option.series).toHaveLength(3)
    for (const series of option.series as { stack: string; data: number[] }[]) {
      expect(series.stack).toBe('whole')
      expect(series.data).toHaveLength(1)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 8. Law 4                                                                   */
/* -------------------------------------------------------------------------- */

describe('every colour traces back to the design tokens', () => {
  const allowed = new Set<string>([...Object.values(tokens.color), ...tokens.series])

  it('uses no colour the token file does not publish', () => {
    for (const variant of VARIANTS) {
      const built = buildParts(acceptable(variant))
      const found = [...JSON.stringify(built).matchAll(/"(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1])
      for (const colour of found) expect(allowed.has(colour ?? '')).toBe(true)
    }
  })

  it('resolves a part’s colour from its position in the fixed palette', () => {
    const option = optionOf(buildParts(acceptable('pie')))
    expect(option.color).toEqual([tokens.series[0], tokens.series[1], tokens.series[2]])
  })
})
