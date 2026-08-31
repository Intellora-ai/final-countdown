import * as echarts from 'echarts'
import { describe, expect, it } from 'vitest'

import { tokens } from '../design/tokens'
import {
  annotationFor,
  buildChartOption,
  categories,
  seriesColor,
  xAxisKind,
  type ChartBlock,
} from './ChartView'

/**
 * Charts are tested through their OPTION, not through their pixels.
 *
 * `buildChartOption` is pure, which is the whole reason chart correctness is
 * checkable here at all: a screenshot test tells you something moved, but an
 * option test tells you the series took colour index 3, the annotation landed on
 * the x the author named, and the axis carries the label they wrote.
 *
 * The last group is different in kind. Ticks cannot be judged by reading the
 * option, because the option deliberately does NOT contain them — ECharts
 * computes them. So those tests render the option headlessly (ECharts' SSR mode
 * needs no DOM) and read back the values ECharts actually put on the axis. A
 * y-axis reading 200, 150, 100, 110 is a false chart, and this is the only place
 * that can catch one.
 */

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function chart(
  parts: Partial<ChartBlock> & Pick<ChartBlock, 'chartType' | 'series'>,
): ChartBlock {
  return {
    id: 'c',
    kind: 'chart',
    emphasis: 'supporting',
    tone: 'neutral',
    role: 'support',
    depth: 'core',
    ...parts,
  }
}

function points(pairs: [number | string, number][]) {
  return pairs.map(([x, y]) => ({ x, y }))
}

/** The option is a plain data structure; reading it needs no ceremony. */
type Loose = Record<string, any>

function optionOf(block: ChartBlock): Loose {
  return buildChartOption(block) as unknown as Loose
}

/* -------------------------------------------------------------------------- */
/* 1. Colour comes from the INDEX                                             */
/* -------------------------------------------------------------------------- */

describe('series colour is resolved from the author’s index', () => {
  it('gives each series the palette entry its colorIndex names', () => {
    const option = optionOf(
      chart({
        chartType: 'line',
        series: [
          { name: 'first', colorIndex: 3, points: points([[1, 10], [2, 20]]) },
          { name: 'second', colorIndex: 0, points: points([[1, 5], [2, 7]]) },
        ],
      }),
    )

    expect(option.series[0].itemStyle.color).toBe(tokens.series[3])
    expect(option.series[0].lineStyle.color).toBe(tokens.series[3])
    expect(option.series[1].itemStyle.color).toBe(tokens.series[0])
  })

  it('resolves every legal index to a distinct palette colour', () => {
    const resolved = [0, 1, 2, 3, 4, 5].map((index) => seriesColor(index))
    expect(resolved).toEqual([...tokens.series])
    expect(new Set(resolved).size).toBe(tokens.series.length)
  })

  it('never lets a colour reach the option from anywhere but the palette', () => {
    for (const chartType of ['line', 'bar', 'scatter', 'area', 'pie'] as const) {
      const option = optionOf(
        chart({
          chartType,
          series: [{ name: 's', colorIndex: 4, points: points([['a', 3], ['b', 4]]) }],
        }),
      )

      const used: string[] = []
      JSON.stringify(option, (_key, value) => {
        if (typeof value === 'string' && /^#|rgba?\(|hsla?\(/.test(value)) used.push(value)
        return value
      })

      const allowed = new Set<string>([...tokens.series, ...Object.values(tokens.color)])
      for (const colour of used) expect(allowed.has(colour)).toBe(true)
      expect(used.length).toBeGreaterThan(0)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Every chartType in the spec is supported                                */
/* -------------------------------------------------------------------------- */

describe('every chartType the spec allows', () => {
  const data = points([[1, 10], [2, 30], [3, 20]])

  it('maps line, bar, scatter and area onto the right ECharts series type', () => {
    const expected: Record<string, string> = {
      line: 'line',
      bar: 'bar',
      scatter: 'scatter',
      area: 'line',
    }

    for (const [chartType, seriesType] of Object.entries(expected)) {
      const option = optionOf(
        chart({
          chartType: chartType as ChartBlock['chartType'],
          series: [{ name: 's', colorIndex: 1, points: data }],
        }),
      )
      expect(option.series[0].type).toBe(seriesType)
    }
  })

  it('draws an area as a line WITH an areaStyle, and a plain line without one', () => {
    const area = optionOf(
      chart({ chartType: 'area', series: [{ name: 's', colorIndex: 2, points: data }] }),
    )
    const line = optionOf(
      chart({ chartType: 'line', series: [{ name: 's', colorIndex: 2, points: data }] }),
    )

    expect(area.series[0].areaStyle.color).toBe(tokens.series[2])
    expect(line.series[0].areaStyle).toBeUndefined()
  })

  it('never smooths a line — a curve between two points invents readings', () => {
    const option = optionOf(
      chart({ chartType: 'line', series: [{ name: 's', colorIndex: 0, points: data }] }),
    )
    expect(option.series[0].smooth).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. Pie                                                                     */
/* -------------------------------------------------------------------------- */

describe('pie', () => {
  const pie = chart({
    chartType: 'pie',
    series: [
      {
        name: 'share',
        colorIndex: 2,
        points: points([['nitrogen', 78], ['oxygen', 21], ['argon', 1]]),
      },
    ],
  })

  it('emits exactly one series', () => {
    const option = optionOf(pie)
    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('pie')
  })

  it('turns every point into one slice, and no axes are created', () => {
    const option = optionOf(pie)
    expect(option.series[0].data.map((d: Loose) => d.name)).toEqual([
      'nitrogen',
      'oxygen',
      'argon',
    ])
    expect(option.xAxis).toBeUndefined()
    expect(option.yAxis).toBeUndefined()
  })

  it('shows percentages, because a share of the whole is what a pie claims', () => {
    const option = optionOf(pie)
    expect(option.series[0].label.formatter).toContain('{d}%')
    expect(option.tooltip.formatter).toContain('{d}%')
  })

  it('starts the fixed palette at the index the author picked', () => {
    const option = optionOf(pie)
    expect(option.color[0]).toBe(tokens.series[2])
    expect(option.color[1]).toBe(tokens.series[3])
    expect(option.color).toHaveLength(tokens.series.length)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. The annotation lands on the DATA, not on a pixel                        */
/* -------------------------------------------------------------------------- */

describe('annotate', () => {
  it('puts the mark on the named x, at that point’s y, on the series that owns it', () => {
    const block = chart({
      chartType: 'line',
      series: [
        { name: 'a', colorIndex: 0, points: points([['jan', 1], ['feb', 2]]) },
        { name: 'b', colorIndex: 1, points: points([['jan', 9], ['mar', 42]]) },
      ],
      annotate: { atX: 'mar', label: 'peak' },
    })

    const option = optionOf(block)

    /* Series 0 has no point at 'mar', so it carries no mark. */
    expect(option.series[0].markPoint).toBeUndefined()
    expect(option.series[0].markLine).toBeUndefined()

    const mark = option.series[1].markPoint.data[0]
    expect(mark.coord).toEqual(['mar', 42])
    expect(mark.name).toBe('peak')
    expect(option.series[1].markLine.data[0].xAxis).toBe('mar')
  })

  it('uses the numeric x when the axis is a number line', () => {
    const block = chart({
      chartType: 'scatter',
      series: [{ name: 'a', colorIndex: 0, points: points([[1, 10], [3, 30], [5, 50]]) }],
      annotate: { atX: 3, label: 'the knee' },
    })

    const option = optionOf(block)
    expect(option.series[0].markPoint.data[0].coord).toEqual([3, 30])
    expect(option.series[0].markLine.data[0].xAxis).toBe(3)
  })

  it('resolves the annotation without touching pixels', () => {
    const block = chart({
      chartType: 'bar',
      series: [{ name: 'a', colorIndex: 0, points: points([['x', 4], ['y', 8]]) }],
      annotate: { atX: 'y', label: 'here' },
    })
    expect(annotationFor(block)).toEqual({ seriesIndex: 0, x: 'y', y: 8, label: 'here' })
  })

  it('pulls out the named slice and gives the note its own band, on a pie', () => {
    const option = optionOf(
      chart({
        chartType: 'pie',
        series: [{ name: 's', colorIndex: 0, points: points([['a', 1], ['b', 2]]) }],
        annotate: { atX: 'b', label: 'most of it' },
      }),
    )

    const slices: Loose[] = option.series[0].data
    expect(slices[0]?.selected).toBeUndefined()
    expect(slices[1]?.selected).toBe(true)

    /* A pie has no x to place a coordinate on, so the note goes where nothing
       can crop it rather than onto the slice, where a long one was truncated. */
    expect(option.title.text).toBe('most of it')
  })

  it('adds no title to a pie the author did not annotate', () => {
    const option = optionOf(
      chart({
        chartType: 'pie',
        series: [{ name: 's', colorIndex: 0, points: points([['a', 1], ['b', 2]]) }],
      }),
    )
    expect(option.title).toBeUndefined()
  })

  it('keeps every pie slice label short enough that it cannot be truncated', () => {
    const option = optionOf(
      chart({
        chartType: 'pie',
        series: [
          {
            name: 's',
            colorIndex: 0,
            points: points([['Translational kinetic energy', 60], ['Rotational', 25]]),
          },
        ],
      }),
    )

    /* Measured at 453px wide, an outside label reading "Translational kinetic
       energy  60%" was ellipsised to "6..." — the biggest slice on the chart
       lost the only number it was there to show. */
    expect(option.series[0].label.formatter).toBe('{d}%')
    expect(option.series[0].label.position).toBe('inside')
  })

  it('adds no marks at all when the author named nothing', () => {
    const option = optionOf(
      chart({
        chartType: 'line',
        series: [{ name: 'a', colorIndex: 0, points: points([[1, 1], [2, 2]]) }],
      }),
    )
    expect(option.series[0].markPoint).toBeUndefined()
    expect(option.series[0].markLine).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Axis labels                                                             */
/* -------------------------------------------------------------------------- */

describe('axis labels', () => {
  it('applies xLabel and yLabel when the author supplied them', () => {
    const option = optionOf(
      chart({
        chartType: 'line',
        xLabel: 'Temperature (K)',
        yLabel: 'Pressure (kPa)',
        series: [{ name: 'p', colorIndex: 0, points: points([[300, 100], [600, 200]]) }],
      }),
    )

    expect(option.xAxis.name).toBe('Temperature (K)')
    expect(option.yAxis.name).toBe('Pressure (kPa)')
  })

  it('names no axis the author did not name', () => {
    const option = optionOf(
      chart({
        chartType: 'line',
        series: [{ name: 'p', colorIndex: 0, points: points([[1, 1], [2, 2]]) }],
      }),
    )

    expect(option.xAxis.name).toBeUndefined()
    expect(option.yAxis.name).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Axis KIND, and the ordering of categories                               */
/* -------------------------------------------------------------------------- */

describe('the axis follows the data’s shape', () => {
  it('uses a value axis for numeric x and a category axis for labels', () => {
    expect(
      xAxisKind(
        chart({
          chartType: 'line',
          series: [{ name: 'a', colorIndex: 0, points: points([[1, 1]]) }],
        }),
      ),
    ).toBe('value')

    expect(
      xAxisKind(
        chart({
          chartType: 'line',
          series: [{ name: 'a', colorIndex: 0, points: points([['jan', 1]]) }],
        }),
      ),
    ).toBe('category')

    /* A bar compares discrete things, whatever its x values look like. */
    expect(
      xAxisKind(
        chart({
          chartType: 'bar',
          series: [{ name: 'a', colorIndex: 0, points: points([[1, 1]]) }],
        }),
      ),
    ).toBe('category')
  })

  it('sorts numeric categories, so an axis never reads 1, 10, 2', () => {
    const block = chart({
      chartType: 'bar',
      series: [{ name: 'a', colorIndex: 0, points: points([[10, 1], [2, 2], [1, 3]]) }],
    })
    expect(categories(block)).toEqual(['1', '2', '10'])
  })

  it('keeps the author’s order for categories that are not numbers', () => {
    const block = chart({
      chartType: 'bar',
      series: [{ name: 'a', colorIndex: 0, points: points([['solid', 1], ['liquid', 2]]) }],
    })
    expect(categories(block)).toEqual(['solid', 'liquid'])
  })

  it('leaves a gap where a series has no point, rather than inventing one', () => {
    const option = optionOf(
      chart({
        chartType: 'bar',
        series: [
          { name: 'a', colorIndex: 0, points: points([['x', 1], ['y', 2]]) },
          { name: 'b', colorIndex: 1, points: points([['y', 5]]) },
        ],
      }),
    )
    expect(option.series[1].data).toEqual([null, 5])
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Ticks — the correctness surface                                         */
/* -------------------------------------------------------------------------- */

/** Harness geometry for the headless render. Not a design value. */
const SSR_WIDTH = 800
const SSR_HEIGHT = 480

/**
 * Render the option with no DOM at all and report the values ECharts actually
 * put on an axis.
 *
 * The spy formatter is injected into a CLONE, so the production option stays
 * free of function values — which is also why the clone is possible.
 */
function renderedTicks(block: ChartBlock, axis: 'xAxis' | 'yAxis'): number[] {
  const option = structuredClone(buildChartOption(block)) as unknown as Loose
  const seen: number[] = []

  /* ECharts calls the label formatter more than once (it measures, then draws),
     so the values are recorded BY TICK INDEX rather than appended — otherwise a
     second pass would look like the axis doubling back on itself. */
  option[axis].axisLabel = {
    ...option[axis].axisLabel,
    formatter: (value: string | number, index: number) => {
      seen[index] = Number(value)
      return String(value)
    },
  }

  const instance = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: SSR_WIDTH,
    height: SSR_HEIGHT,
  })
  try {
    instance.setOption(option)
    ;(instance as unknown as { renderToSVGString: () => string }).renderToSVGString()
  } finally {
    instance.dispose()
  }

  return seen
}

function assertHonestTicks(ticks: number[]): void {
  expect(ticks.length).toBeGreaterThanOrEqual(3)

  const steps = ticks.slice(1).map((tick, i) => tick - (ticks[i] as number))

  // Monotonic: every step points the same way and none is zero.
  for (const step of steps) expect(step).toBeGreaterThan(0)

  /* Evenly spaced: every step equals the first. The tolerance is scaled to the
     axis, not to the step, because that is where the floating-point noise comes
     from — ticks of 99.998, 99.9985, 99.999 are genuinely even and must pass,
     while 200, 150, 100, 110 is off by a whole step and must not. */
  const first = steps[0] as number
  const last = ticks[ticks.length - 1] as number
  const tolerance = Math.max(Math.abs(first), Math.abs(last)) * 1e-9
  for (const step of steps) expect(Math.abs(step - first)).toBeLessThanOrEqual(tolerance)
}

describe('axis ticks are monotonic and evenly spaced', () => {
  it('does not pin ticks in the option — ECharts computes them', () => {
    const option = optionOf(
      chart({
        chartType: 'line',
        series: [{ name: 'a', colorIndex: 0, points: points([[1, 200], [2, 150]]) }],
      }),
    )

    for (const axis of [option.xAxis, option.yAxis]) {
      expect(axis.interval).toBeUndefined()
      expect(axis.min).toBeUndefined()
      expect(axis.max).toBeUndefined()
      expect(axis.axisLabel.customValues).toBeUndefined()
    }
  })

  it('produces an honest y-axis for the data that once shipped 200, 150, 100, 110', () => {
    const ticks = renderedTicks(
      chart({
        chartType: 'line',
        yLabel: 'kPa',
        series: [
          { name: 'p', colorIndex: 0, points: points([[1, 200], [2, 150], [3, 100], [4, 110]]) },
        ],
      }),
      'yAxis',
    )

    assertHonestTicks(ticks)
    // Whatever ECharts chose, it must cover the data it was given.
    expect(Math.min(...ticks)).toBeLessThanOrEqual(100)
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(200)
  })

  it('stays honest for awkward magnitudes, negatives and near-flat data', () => {
    const awkward: [string, [number, number][]][] = [
      ['tiny', [[1, 0.0001], [2, 0.00037], [3, 0.00012]]],
      ['huge', [[1, 1_234_567], [2, 987_654], [3, 2_400_000]]],
      ['negative', [[1, -40], [2, 15], [3, -3]]],
      ['near flat', [[1, 99.998], [2, 100.001], [3, 99.999]]],
      ['single point', [[1, 7]]],
    ]

    for (const [name, pairs] of awkward) {
      const ticks = renderedTicks(
        chart({
          chartType: 'line',
          series: [{ name, colorIndex: 0, points: points(pairs) }],
        }),
        'yAxis',
      )
      assertHonestTicks(ticks)
    }
  })

  it('keeps a bar chart’s baseline at zero, so no bar is silently truncated', () => {
    const ticks = renderedTicks(
      chart({
        chartType: 'bar',
        series: [{ name: 'b', colorIndex: 0, points: points([['a', 200], ['b', 150], ['c', 110]]) }],
      }),
      'yAxis',
    )

    assertHonestTicks(ticks)
    expect(Math.min(...ticks)).toBe(0)
  })

  it('applies the same rule to a numeric x axis', () => {
    const ticks = renderedTicks(
      chart({
        chartType: 'scatter',
        series: [
          { name: 's', colorIndex: 0, points: points([[3, 1], [17, 2], [42, 3], [99, 4]]) },
        ],
      }),
      'xAxis',
    )
    assertHonestTicks(ticks)
  })
})

/* -------------------------------------------------------------------------- */
/* 8. Axis names must fit inside the chart                                    */
/* -------------------------------------------------------------------------- */

/**
 * `grid.containLabel` reserves room for TICK labels only. The axis NAME lives
 * outside the grid box and is not counted, so a margin that looks generous can
 * still cut the name in half — which is what a browser measurement caught:
 * "Pressure (kPa)" at y = -7.9 and "Temperature (K)" at y = 469.6 in a container
 * 462 tall.
 *
 * These tests read the position ECharts actually gave the name out of the
 * rendered SVG, so the margins are checked by measurement rather than by eye,
 * and at the small sizes where clipping bites first.
 */

interface RenderedText {
  text: string
  x: number
  y: number
  fontSize: number
  anchor: string
}

function renderToSvg(block: ChartBlock, width: number, height: number): string {
  const instance = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  try {
    instance.setOption(buildChartOption(block))
    return (instance as unknown as { renderToSVGString: () => string }).renderToSVGString()
  } finally {
    instance.dispose()
  }
}

function textsIn(svg: string): RenderedText[] {
  const found: RenderedText[] = []
  for (const match of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = match[1] ?? ''
    const translate = /transform="translate\(([-\d.]+)\s+([-\d.]+)\)"/.exec(attrs)
    found.push({
      text: match[2] ?? '',
      x: Number(translate?.[1] ?? 0) + Number(/\sx="([-\d.]+)"/.exec(attrs)?.[1] ?? 0),
      y: Number(translate?.[2] ?? 0) + Number(/\sy="([-\d.]+)"/.exec(attrs)?.[1] ?? 0),
      fontSize: Number(/font-size:([\d.]+)px/.exec(attrs)?.[1] ?? 12),
      anchor: /text-anchor="([a-z]+)"/.exec(attrs)?.[1] ?? 'start',
    })
  }
  return found
}

function findText(svg: string, wanted: string): RenderedText {
  const hit = textsIn(svg).find((t) => t.text === wanted)
  expect(hit, `no rendered text "${wanted}"`).toBeDefined()
  return hit as RenderedText
}

/** 0.6em each way covers ascender and descender for any sane sans-serif. */
function assertInsideCanvas(label: RenderedText, width: number, height: number): void {
  const half = label.fontSize * 0.6
  expect(label.y - half).toBeGreaterThanOrEqual(0)
  expect(label.y + half).toBeLessThanOrEqual(height)
  expect(label.x).toBeGreaterThanOrEqual(0)
  expect(label.x).toBeLessThanOrEqual(width)
}

describe('axis names are drawn inside the chart, not over its edge', () => {
  const sizes: [number, number][] = [
    [739, 462], // the size the clipping was first measured at
    [453, 283], // the second chart on the page
    [320, 200], // narrow, where margins bite first
  ]

  const named = (seriesCount: number): ChartBlock =>
    chart({
      chartType: 'line',
      xLabel: 'Temperature (K)',
      yLabel: 'Pressure (kPa)',
      series: Array.from({ length: seriesCount }, (_, i) => ({
        name: `run ${i}`,
        colorIndex: i,
        points: points([[200, 69], [300, 104], [600, 208]]),
      })),
    })

  it('keeps both names inside the canvas at every size', () => {
    for (const [width, height] of sizes) {
      const svg = renderToSvg(named(1), width, height)
      assertInsideCanvas(findText(svg, 'Pressure (kPa)'), width, height)
      assertInsideCanvas(findText(svg, 'Temperature (K)'), width, height)
    }
  })

  it('keeps them inside when a legend is competing for the top margin', () => {
    for (const [width, height] of sizes) {
      const svg = renderToSvg(named(3), width, height)
      assertInsideCanvas(findText(svg, 'Pressure (kPa)'), width, height)
      assertInsideCanvas(findText(svg, 'Temperature (K)'), width, height)
    }
  })

  it('anchors the y name at its left edge, so a long one cannot hang off', () => {
    const long = chart({
      chartType: 'line',
      yLabel: 'Pressure measured at the vessel wall (kPa)',
      series: [{ name: 'p', colorIndex: 0, points: points([[1, 1], [2, 2]]) }],
    })

    const svg = renderToSvg(long, 453, 283)
    const name = findText(svg, 'Pressure measured at the vessel wall (kPa)')

    /* Centred on the axis end — the default — half of this name would sit left
       of x = 0. Anchored at the start it grows inwards instead. */
    expect(name.anchor).toBe('start')
    expect(name.x).toBeGreaterThanOrEqual(0)
  })

  it('gives back the margin when the author named no axis', () => {
    const bare = chart({
      chartType: 'line',
      series: [{ name: 'p', colorIndex: 0, points: points([[1, 1], [2, 2]]) }],
    })
    const withNames = renderToSvg(named(1), 739, 462)
    const withoutNames = renderToSvg(bare, 739, 462)

    const plotBottom = (svg: string) =>
      Math.max(...textsIn(svg).filter((t) => /^\d+$/.test(t.text)).map((t) => t.y))

    // Tick labels sit lower when nothing has to be reserved for an axis name.
    expect(plotBottom(withoutNames)).toBeGreaterThan(plotBottom(withNames))
  })
})

/* -------------------------------------------------------------------------- */
/* 9. The option stays inspectable                                            */
/* -------------------------------------------------------------------------- */

describe('the option is plain data', () => {
  it('holds no function values, which is what makes it clonable and testable', () => {
    for (const chartType of ['line', 'bar', 'scatter', 'area', 'pie'] as const) {
      const option = buildChartOption(
        chart({
          chartType,
          xLabel: 'x',
          yLabel: 'y',
          annotate: { atX: 'a', label: 'note' },
          series: [{ name: 's', colorIndex: 1, points: points([['a', 1], ['b', 2]]) }],
        }),
      )
      expect(() => structuredClone(option)).not.toThrow()
    }
  })
})
