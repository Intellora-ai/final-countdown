import * as echarts from 'echarts'
import { describe, expect, it } from 'vitest'

import { tokens } from '../../design/tokens'
import { namesForShape, type RepresentationName } from '../../spec/representations'
import type { SeriesData } from '../../spec/shapeInvariants'
import { seriesColor } from '../ChartView'
import {
  PLANS,
  bubbleSize,
  buildSeriesOption,
  categoryLabels,
  seriesRefusals,
  xValues,
} from './SeriesShape'

/**
 * The series shape is tested through its OPTION, not through its pixels.
 *
 * `buildSeriesOption` is pure, which is the whole reason chart correctness is
 * checkable here at all: a screenshot test tells you something moved, but an
 * option test tells you the third series took palette entry three, that the
 * stacked variants share one stack group, and that a bubble four times another's
 * value is drawn twice as wide rather than four times.
 *
 * Two groups are different in kind, and both render for real. Ticks cannot be
 * judged by reading the option, because the option deliberately does NOT contain
 * them — ECharts computes them, and the only way to check them is to render
 * headlessly and read back what came out. Axis NAMES cannot be judged by reading
 * the option either: whether one is clipped depends on the margin, the font and
 * the container, so those are measured out of the rendered SVG.
 */

const SERIES_NAMES = namesForShape('series')

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A deterministic generator. "Random" ranges that differ between runs would make
 * a tick failure impossible to reproduce, which is the opposite of what a
 * property test is for.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

interface Band {
  low: number
  high: number
  seed: number
}

const PLAIN: Band = { low: 0, high: 100, seed: 1 }

/** Twenty ranges spanning ten orders of magnitude, negatives included. */
function bands(seed: number): Band[] {
  const rng = lcg(seed)
  return Array.from({ length: 20 }, (_, i) => {
    const magnitude = 10 ** (rng() * 10 - 4)
    const low = (rng() * 2 - 1) * magnitude
    return { low, high: low + magnitude * (0.5 + rng() * 20), seed: seed + i * 31 + 1 }
  })
}

/** The named series that carry an extra channel, per variant. */
const EXTRA: Partial<Record<RepresentationName, string[]>> = {
  bullet: ['target'],
  controlChart: ['ucl', 'lcl', 'mean'],
  burndown: ['ideal'],
  burnup: ['ideal'],
  regression: ['fit'],
  precisionRecall: ['baseline'],
  bubble: ['size'],
}

/** Variants that stack, and so may not be handed a negative value. */
const STACKS = new Set<RepresentationName>(['stackedBar', 'stackedArea', 'streamgraph'])

/** Variants that read better with more than one measured run. */
const PAIRED = new Set<RepresentationName>([
  'groupedBar',
  'stackedBar',
  'stackedArea',
  'streamgraph',
  'learningCurve',
  'lossCurve',
  'radar',
  'parallelCoordinates',
  'embeddingProjection',
  'clusterPlot',
  'slope',
])

/**
 * Valid data for any of the thirty-three, inside a named range.
 *
 * The extra channels a variant needs arrive the way the renderer expects them —
 * as additional named series — so the fixture exercises the real contract rather
 * than a shortcut only the test knows about.
 */
function fixtureFor(variant: RepresentationName, band: Band = PLAIN): SeriesData {
  const rng = lcg(band.seed)
  const span = band.high - band.low
  const count = variant === 'slope' ? 2 : 6
  const xs = Array.from({ length: count }, (_, i) => i + 1)

  const draw = (): number => {
    const value = band.low + rng() * span
    return STACKS.has(variant) ? Math.abs(value) : value
  }
  const named = (name: string): SeriesData['series'][number] => ({
    name,
    points: xs.map((x) => ({ x, y: draw() })),
  })

  if (variant === 'candlestick') return candlestickFixture(xs, rng, band)

  const measured = PAIRED.has(variant) ? ['first', 'second'] : ['measured']
  const series = [...measured, ...(EXTRA[variant] ?? [])].map(named)

  /* A regression's fit must be a straight line, or it is not a fit. */
  if (variant === 'regression') {
    const fit = series.find((s) => s.name === 'fit')
    if (fit !== undefined)
      fit.points = xs.map((x) => ({ x, y: band.low + (span * x) / (count + 1) }))
  }

  return { series }
}

function candlestickFixture(xs: number[], rng: () => number, band: Band): SeriesData {
  const span = Math.abs(band.high - band.low) || 1
  const rows = xs.map(() => {
    const open = band.low + rng() * span
    const close = band.low + rng() * span
    const wick = span * 0.1 * rng()
    return {
      open,
      close,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
    }
  })

  const channel = (pick: (r: (typeof rows)[number]) => number, name: string) => ({
    name,
    points: xs.map((x, i) => ({ x, y: pick(rows[i] as (typeof rows)[number]) })),
  })

  /* Deliberately in open, high, low, close order, so `close` is index 3 and the
     colour the candle takes is a fact the test can name. */
  return {
    series: [
      channel((r) => r.open, 'open'),
      channel((r) => r.high, 'high'),
      channel((r) => r.low, 'low'),
      channel((r) => r.close, 'close'),
    ],
  }
}

/** The option is a plain data structure; reading it needs no ceremony. */
type Loose = Record<string, any>

function optionOf(variant: RepresentationName, band: Band = PLAIN): Loose {
  return buildSeriesOption(fixtureFor(variant, band), variant) as unknown as Loose
}

/* -------------------------------------------------------------------------- */
/* 1. All thirty-three                                                        */
/* -------------------------------------------------------------------------- */

describe('every named type that maps to the series shape', () => {
  it('covers all thirty-three, with nothing left to a fallback', () => {
    expect(SERIES_NAMES).toHaveLength(33)
    for (const name of SERIES_NAMES) expect(PLANS[name], name).toBeDefined()
  })

  it('builds an option for each one without throwing', () => {
    for (const name of SERIES_NAMES) {
      expect(() => buildSeriesOption(fixtureFor(name), name), name).not.toThrow()
      const option = optionOf(name)
      expect(option.series.length, name).toBeGreaterThan(0)
    }
  })

  it('accepts the fixture for each one — no variant is refused by mistake', () => {
    for (const name of SERIES_NAMES) {
      const refusals = seriesRefusals(fixtureFor(name), name)
      expect(refusals, `${name}: ${refusals.join(' | ')}`).toEqual([])
    }
  })

  it('draws something real for each one when rendered headlessly', () => {
    for (const name of SERIES_NAMES) {
      const svg = renderToSvg(optionOf(name), 600, 380)
      expect(svg, name).toContain('<path')
    }
  })

  it('holds no function values, which is what makes it clonable and testable', () => {
    for (const name of SERIES_NAMES)
      expect(() => structuredClone(buildSeriesOption(fixtureFor(name), name)), name).not.toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Colour comes from the INDEX                                             */
/* -------------------------------------------------------------------------- */

describe('series colour is resolved from the author’s index', () => {
  it('gives the nth series the nth palette entry', () => {
    const data: SeriesData = {
      series: [
        { name: 'a', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
        { name: 'b', points: [{ x: 1, y: 5 }, { x: 2, y: 7 }] },
        { name: 'c', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      ],
    }
    const option = buildSeriesOption(data, 'line') as unknown as Loose

    expect(option.series[0].lineStyle.color).toBe(tokens.series[0])
    expect(option.series[1].lineStyle.color).toBe(tokens.series[1])
    expect(option.series[2].itemStyle.color).toBe(tokens.series[2])
  })

  it('wraps past the end of the fixed palette rather than inventing a colour', () => {
    const resolved = [0, 1, 2, 3, 4, 5].map((i) => seriesColor(i))
    expect(resolved).toEqual([...tokens.series])
    expect(seriesColor(6)).toBe(tokens.series[0])
    expect(seriesColor(7)).toBe(tokens.series[1])
  })

  it('lets no colour reach any of the thirty-three options from outside the tokens', () => {
    const allowed = new Set<string>([...tokens.series, ...Object.values(tokens.color)])

    for (const name of SERIES_NAMES) {
      const used: string[] = []
      JSON.stringify(optionOf(name), (_key, value) => {
        if (typeof value === 'string' && /^#|^rgba?\(|^hsla?\(/.test(value)) used.push(value)
        return value
      })

      for (const colour of used) expect(allowed.has(colour), `${name}: ${colour}`).toBe(true)
      expect(used.length, name).toBeGreaterThan(0)
    }
  })

  it('takes a candlestick’s one colour from the index of its close', () => {
    const option = optionOf('candlestick')
    /* open, high, low, close — so `close` is index 3. Direction is shown by
       fill, not by a second hue: hollow rising, solid falling. */
    expect(option.series[0].itemStyle.borderColor).toBe(tokens.series[3])
    expect(option.series[0].itemStyle.color0).toBe(tokens.series[3])
    expect(option.series[0].itemStyle.color).toBe(tokens.color.void)
  })

  it('colours a streamgraph’s bands by index too', () => {
    const option = optionOf('streamgraph')
    expect(option.color).toEqual([tokens.series[0], tokens.series[1]])
  })
})

/* -------------------------------------------------------------------------- */
/* 3. Stacking                                                                */
/* -------------------------------------------------------------------------- */

describe('stacking', () => {
  it('puts every series of a stacked variant in ONE stack group', () => {
    for (const name of ['stackedBar', 'stackedArea'] as const) {
      const option = optionOf(name)
      const groups = option.series.map((s: Loose) => s.stack)
      expect(groups.length, name).toBeGreaterThan(1)
      for (const group of groups) expect(group, name).toBeDefined()
      expect(new Set(groups).size, name).toBe(1)
    }
  })

  it('leaves a non-stacked variant unstacked', () => {
    for (const name of ['bar', 'groupedBar', 'line', 'area', 'scatter'] as const)
      for (const s of optionOf(name).series) expect(s.stack, name).toBeUndefined()
  })

  it('stacks a variant that stacks by definition even if the author forgot to say so', () => {
    const data: SeriesData = {
      series: [
        { name: 'a', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
        { name: 'b', points: [{ x: 1, y: 3 }, { x: 2, y: 4 }] },
      ],
    }
    const option = buildSeriesOption(data, 'stackedArea') as unknown as Loose
    expect(option.series.every((s: Loose) => s.stack === option.series[0].stack)).toBe(true)
    expect(option.series[0].stack).toBeDefined()
  })

  it('applies the stack invariants to a stacked variant the author did not declare', () => {
    /* A negative in a stack puts a segment below the baseline while the ones
       above it still claim to sum to the total. */
    const data: SeriesData = {
      series: [
        { name: 'a', points: [{ x: 1, y: -1 }, { x: 2, y: 2 }] },
        { name: 'b', points: [{ x: 1, y: 3 }, { x: 2, y: 4 }] },
      ],
    }
    expect(seriesRefusals(data, 'stackedBar').join(' ')).toContain('negative')
    expect(seriesRefusals(data, 'groupedBar')).toEqual([])
  })

  it('keeps a stacked area’s baseline at zero', () => {
    expect(optionOf('stackedArea').yAxis.scale).toBe(false)
    expect(optionOf('bar').yAxis.scale).toBe(false)
    /* A dot plot compares POSITIONS, so it is allowed to leave zero out. */
    expect(optionOf('dotPlot').yAxis.scale).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. Ticks — the correctness surface                                         */
/* -------------------------------------------------------------------------- */

/** Harness geometry for the headless renders. Not a design value. */
const SSR_WIDTH = 800
const SSR_HEIGHT = 480

function renderToSvg(option: Loose, width: number, height: number): string {
  const instance = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  try {
    instance.setOption(option)
    return (instance as unknown as { renderToSVGString: () => string }).renderToSVGString()
  } finally {
    instance.dispose()
  }
}

/**
 * Render with no DOM at all and report the values ECharts actually put on an
 * axis. The spy formatter goes into a CLONE, so the production option stays free
 * of function values — which is also why the clone is possible.
 */
function renderedTicks(option: Loose, axis: 'xAxis' | 'yAxis' | 'singleAxis'): number[] {
  const clone = structuredClone(option) as Loose
  const seen: number[] = []

  /* ECharts calls the formatter more than once — it measures, then draws — so
     values are recorded BY TICK INDEX rather than appended, or a second pass
     would look like the axis doubling back on itself. */
  clone[axis].axisLabel = {
    ...clone[axis].axisLabel,
    formatter: (value: string | number, index: number) => {
      seen[index] = Number(value)
      return String(value)
    },
  }

  renderToSvg(clone, SSR_WIDTH, SSR_HEIGHT)
  return seen
}

function assertHonestTicks(ticks: number[], label: string): void {
  expect(ticks.length, `${label}: too few ticks`).toBeGreaterThanOrEqual(3)

  const steps = ticks.slice(1).map((tick, i) => tick - (ticks[i] as number))

  // Monotonic: every step points the same way and none is zero.
  for (const step of steps) expect(step, `${label}: ${ticks.join(', ')}`).toBeGreaterThan(0)

  /* Evenly spaced: every step equals the first. The tolerance is scaled to the
     axis, not to the step, because that is where the floating-point noise comes
     from — ticks of 99.998, 99.9985, 99.999 are genuinely even and must pass,
     while 200, 150, 100, 110 is off by a whole step and must not. */
  const first = steps[0] as number
  const last = ticks[ticks.length - 1] as number
  const tolerance = Math.max(Math.abs(first), Math.abs(last)) * 1e-9
  for (const step of steps)
    expect(Math.abs(step - first), `${label}: ${ticks.join(', ')}`).toBeLessThanOrEqual(tolerance)
}

/** Cartesian variants only: a radar and a parallel plot have no grid to tick. */
const CARTESIAN = SERIES_NAMES.filter(
  (name) => !['radar', 'parallelCoordinates', 'streamgraph'].includes(name),
)

/** Where the QUANTITY lives. A horizontal bar puts it on x, everything else on y. */
function valueAxisOf(name: RepresentationName): 'xAxis' | 'yAxis' {
  return PLANS[name]?.horizontal === true ? 'xAxis' : 'yAxis'
}

describe('axis ticks are monotonic and evenly spaced', () => {
  it('pins no tick anywhere in any of the thirty-three options', () => {
    for (const name of SERIES_NAMES) {
      const found: string[] = []
      findPinnedTicks(optionOf(name), name, found)
      expect(found, `${name} pins ${found.join(', ')}`).toEqual([])
    }
  })

  /*
   * AN EXPLICIT TIMEOUT, BECAUSE THIS TEST IS GENUINELY SLOW.
   *
   * Twenty ranges across every cartesian chart type builds a full ECharts
   * option per combination and reads the ticks back off it. Measured: ~2.6s
   * running alone, ~10.9s inside the full suite, reproduced 2 for 2. The inputs
   * are a seeded LCG, so the work is identical every run — the only variable is
   * how much else is executing in parallel, and under load it crosses vitest's
   * 5s default.
   *
   * The tempting fix is to cut the twenty ranges or the chart types. That would
   * make it fast and would delete the exact coverage this file exists for: a
   * build once shipped a y-axis reading 200, 150, 100, 110. A slow test that
   * checks the right thing is not a problem to be optimised away; claiming it is
   * fast is the only thing actually wrong here, so the number is stated instead.
   */
  it('stays honest over twenty random ranges, for every cartesian chart type', { timeout: 30_000 }, () => {
    for (const name of CARTESIAN) {
      for (const band of bands(name.length * 977 + 13)) {
        const ticks = renderedTicks(optionOf(name, band), valueAxisOf(name))
        assertHonestTicks(ticks, `${name} over [${band.low}, ${band.high}]`)
      }
    }
  })

  it('applies the same rule to a numeric x axis', () => {
    for (const name of ['line', 'scatter', 'regression', 'functionGraph'] as const)
      for (const band of bands(7)) {
        const ticks = renderedTicks(optionOf(name, band), 'xAxis')
        assertHonestTicks(ticks, `${name} x axis`)
      }
  })

  it('stays honest on the streamgraph’s single axis', () => {
    for (const band of bands(101))
      assertHonestTicks(
        renderedTicks(optionOf('streamgraph', band), 'singleAxis'),
        'streamgraph single axis',
      )
  })

  it('produces an honest y-axis for the data that once shipped 200, 150, 100, 110', () => {
    const data: SeriesData = {
      series: [
        {
          name: 'p',
          points: [
            { x: 1, y: 200 },
            { x: 2, y: 150 },
            { x: 3, y: 100 },
            { x: 4, y: 110 },
          ],
        },
      ],
    }
    const ticks = renderedTicks(buildSeriesOption(data, 'line') as unknown as Loose, 'yAxis')

    assertHonestTicks(ticks, 'the shipped lie')
    // Whatever ECharts chose, it must cover the data it was given.
    expect(Math.min(...ticks)).toBeLessThanOrEqual(100)
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(200)
  })

  it('sorts numeric CATEGORIES, so an axis never reads 1, 10, 2', () => {
    const data: SeriesData = {
      series: [{ name: 'a', points: [{ x: 10, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 3 }] }],
    }
    expect(categoryLabels(data, 'bar')).toEqual(['1', '2', '10'])
  })

  it('keeps the author’s order for categories that are not numbers', () => {
    const data: SeriesData = {
      series: [{ name: 'a', points: [{ x: 'solid', y: 1 }, { x: 'liquid', y: 2 }] }],
    }
    expect(categoryLabels(data, 'bar')).toEqual(['solid', 'liquid'])
  })
})

/**
 * A tick array the renderer computed itself would be allowed only with a test
 * that proves it. Not computing one, and testing what ECharts produced, is both
 * cheaper and harder to get wrong — so the option is checked for the fields that
 * would let a hand-rolled tick in.
 */
function findPinnedTicks(node: unknown, path: string, found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => findPinnedTicks(child, `${path}[${i}]`, found))
    return
  }
  if (node === null || typeof node !== 'object') return

  const object = node as Record<string, unknown>
  if ('interval' in object) found.push(`${path}.interval`)
  if ('customValues' in object) found.push(`${path}.customValues`)

  const isAxis =
    object.type === 'value' || object.type === 'category' || 'indicator' in object
  if (isAxis) {
    if ('min' in object) found.push(`${path}.min`)
    if ('max' in object) found.push(`${path}.max`)
  }

  for (const [k, value] of Object.entries(object)) findPinnedTicks(value, `${path}.${k}`, found)
}

/* -------------------------------------------------------------------------- */
/* 5. Axis names must fit inside the chart                                    */
/* -------------------------------------------------------------------------- */

/**
 * `grid.containLabel` reserves room for TICK labels only. The axis NAME lives
 * outside the grid box and is not counted, so a margin that looks generous can
 * still cut a name in half — which is what a browser measurement once caught:
 * "Pressure (kPa)" at y = -7.9 and "Temperature (K)" at y = 469.6 in a container
 * 462 tall.
 *
 * These read the position ECharts actually gave the name out of the rendered
 * SVG, so the margins are checked by measurement and at the small sizes where
 * clipping bites first.
 */

interface RenderedText {
  text: string
  x: number
  y: number
  fontSize: number
  anchor: string
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

/** 0.6em each way covers ascender and descender for any sane sans-serif. */
function assertInsideCanvas(label: RenderedText, width: number, height: number, at: string): void {
  const half = label.fontSize * 0.6
  expect(label.y - half, `${at}: "${label.text}" off the top`).toBeGreaterThanOrEqual(0)
  expect(label.y + half, `${at}: "${label.text}" off the bottom`).toBeLessThanOrEqual(height)
  expect(label.x, `${at}: "${label.text}" off the left`).toBeGreaterThanOrEqual(0)
  expect(label.x, `${at}: "${label.text}" off the right`).toBeLessThanOrEqual(width)
}

describe('axis names are drawn inside the chart, not over its edge', () => {
  const sizes: [number, number][] = [
    [739, 462], // the size the clipping was first measured at
    [453, 283], // the second chart on the page
    [320, 200], // narrow, where margins bite first
  ]

  const named = SERIES_NAMES.filter((name) => PLANS[name]?.axes !== undefined)

  it('names an axis for every type whose axes the type itself defines', () => {
    expect(named).toEqual([
      'burndown',
      'burnup',
      'residual',
      'learningCurve',
      'lossCurve',
      'rocCurve',
      'precisionRecall',
      'calibration',
      'featureImportance',
      'impactEffort',
    ])
  })

  it('keeps every axis name inside the canvas at every size', () => {
    for (const name of named) {
      const option = optionOf(name)
      const axes = PLANS[name]?.axes ?? {}
      for (const [width, height] of sizes) {
        const svg = renderToSvg(option, width, height)
        for (const wanted of [axes.x, axes.y]) {
          if (wanted === undefined) continue
          const hit = textsIn(svg).find((t) => t.text === wanted)
          expect(hit, `${name} at ${width}x${height}: no rendered "${wanted}"`).toBeDefined()
          assertInsideCanvas(hit as RenderedText, width, height, `${name} at ${width}x${height}`)
        }
      }
    }
  })

  it('anchors a y name at its left edge, so a long one cannot hang off', () => {
    const svg = renderToSvg(optionOf('residual'), 453, 283)
    const name = textsIn(svg).find((t) => t.text === 'Residual') as RenderedText

    /* Centred on the axis end — the default — half of a long name would sit
       left of x = 0. Anchored at the start it grows inwards instead. */
    expect(name.anchor).toBe('start')
    expect(name.x).toBeGreaterThanOrEqual(0)
  })

  it('gives back the margin when the type names no axis', () => {
    const withName = optionOf('lossCurve')
    const without = optionOf('line')
    expect(withName.grid.bottom).toBeGreaterThan(without.grid.bottom)
    expect(withName.grid.top).toBeGreaterThan(without.grid.top)
  })

  it('reserves MORE room at the top when a legend competes with the y name', () => {
    const alone = buildSeriesOption(
      { series: [{ name: 'only', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] },
      'lossCurve',
    ) as unknown as Loose
    const crowded = optionOf('lossCurve') // the fixture is paired, so it has a legend

    expect(crowded.legend.show).toBe(true)
    expect(alone.legend.show).toBe(false)
    expect(crowded.grid.top).toBeGreaterThan(alone.grid.top)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Bubbles encode AREA                                                     */
/* -------------------------------------------------------------------------- */

describe('a bubble’s size is its area, not its radius', () => {
  it('scales the drawn size by the square root of the value', () => {
    /* Four times the value is TWICE the width. Mapping value to radius would
       make it four times the width and sixteen times the ink. */
    expect(bubbleSize(4, 16) / bubbleSize(1, 16)).toBeCloseTo(2, 12)
    expect(bubbleSize(9, 16) / bubbleSize(1, 16)).toBeCloseTo(3, 12)
    expect(bubbleSize(16, 16) / bubbleSize(4, 16)).toBeCloseTo(2, 12)
  })

  it('keeps area exactly proportional to value, at every magnitude', () => {
    for (const [a, b] of [[1, 2], [3, 7], [0.001, 0.05], [12, 1_000_000]] as [number, number][]) {
      const ratio = bubbleSize(a, 1_000_000) / bubbleSize(b, 1_000_000)
      expect(ratio * ratio).toBeCloseTo(a / b, 9)
    }
  })

  it('puts that size on each datum in the option, not in a callback', () => {
    const data: SeriesData = {
      series: [
        {
          name: 'measured',
          points: [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }],
        },
        {
          name: 'size',
          points: [{ x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }, { x: 4, y: 16 }],
        },
      ],
    }
    const option = buildSeriesOption(data, 'bubble') as unknown as Loose
    const sizes = option.series[0].data.map((d: Loose) => d.symbolSize)

    // 1, 4, 9, 16 in value are 1, 2, 3, 4 in width — the square roots.
    expect(sizes[1] / sizes[0]).toBeCloseTo(2, 12)
    expect(sizes[2] / sizes[0]).toBeCloseTo(3, 12)
    expect(sizes[3] / sizes[0]).toBeCloseTo(4, 12)
    for (const size of sizes) expect(typeof size).toBe('number')
  })

  it('draws plain dots when nothing was given to size them by', () => {
    const data: SeriesData = {
      series: [{ name: 'measured', points: [{ x: 1, y: 5 }, { x: 2, y: 9 }] }],
    }
    const option = buildSeriesOption(data, 'bubble') as unknown as Loose
    expect(option.series[0].data[0]).toEqual([1, 5])
  })

  it('gives a zero magnitude no ink at all', () => {
    expect(bubbleSize(0, 10)).toBe(0)
    expect(bubbleSize(5, 0)).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Refusals                                                                */
/* -------------------------------------------------------------------------- */

describe('what the renderer refuses to draw', () => {
  it('refuses a slope with more than two x values', () => {
    const three: SeriesData = {
      series: [
        {
          name: 'a',
          points: [{ x: 'before', y: 1 }, { x: 'during', y: 2 }, { x: 'after', y: 3 }],
        },
      ],
    }
    expect(seriesRefusals(three, 'slope').join(' ')).toContain('exactly two')

    const two: SeriesData = {
      series: [{ name: 'a', points: [{ x: 'before', y: 1 }, { x: 'after', y: 3 }] }],
    }
    expect(seriesRefusals(two, 'slope')).toEqual([])
  })

  it('refuses a slope with only one x value', () => {
    const one: SeriesData = { series: [{ name: 'a', points: [{ x: 'now', y: 1 }] }] }
    expect(seriesRefusals(one, 'slope').join(' ')).toContain('exactly two')
  })

  it('refuses a candlestick that is missing any of open, high, low or close', () => {
    const full = fixtureFor('candlestick')
    for (const missing of ['open', 'high', 'low', 'close']) {
      const partial: SeriesData = { series: full.series.filter((s) => s.name !== missing) }
      const said = seriesRefusals(partial, 'candlestick').join(' ')
      expect(said, missing).toContain(missing)
    }
    expect(seriesRefusals(full, 'candlestick')).toEqual([])
  })

  it('refuses a candle whose high does not contain its open and close', () => {
    const data: SeriesData = {
      series: [
        { name: 'open', points: [{ x: 1, y: 10 }] },
        { name: 'high', points: [{ x: 1, y: 11 }] }, // below the close
        { name: 'low', points: [{ x: 1, y: 9 }] },
        { name: 'close', points: [{ x: 1, y: 14 }] },
      ],
    }
    expect(seriesRefusals(data, 'candlestick').join(' ')).toContain('high 11')
  })

  it('refuses a candle whose low does not contain its open and close', () => {
    const data: SeriesData = {
      series: [
        { name: 'open', points: [{ x: 1, y: 10 }] },
        { name: 'high', points: [{ x: 1, y: 15 }] },
        { name: 'low', points: [{ x: 1, y: 12 }] }, // above the open
        { name: 'close', points: [{ x: 1, y: 14 }] },
      ],
    }
    expect(seriesRefusals(data, 'candlestick').join(' ')).toContain('low 12')
  })

  it('refuses out-of-order x on a continuous axis, and does NOT quietly sort it', () => {
    /* Connecting (3, ·) to (1, ·) to (2, ·) draws a zig-zag the reader takes for
       real structure. Sorting it here would hide the author's error. */
    const data: SeriesData = {
      series: [{ name: 'a', points: [{ x: 3, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }] }],
    }

    expect(seriesRefusals(data, 'line').join(' ')).toContain('not in order')

    const option = buildSeriesOption(data, 'line') as unknown as Loose
    expect(option.series).toEqual([])
    expect(option.title.subtext).toContain('not in order')
    expect(option.xAxis).toBeUndefined()
  })

  it('says so out loud rather than drawing an empty plot', () => {
    const data: SeriesData = {
      series: [{ name: 'a', points: [{ x: 3, y: 1 }, { x: 1, y: 2 }] }],
    }
    const option = buildSeriesOption(data, 'area') as unknown as Loose
    expect(option.title.text).toContain('area')
    expect(String(option.title.subtext).length).toBeGreaterThan(0)
  })

  it('leaves a deliberate path through unordered x alone, on a connected scatter', () => {
    /* A connected scatter's order IS the content — it walks through time, not
       through x. Refusing it would be refusing the chart. */
    const data: SeriesData = {
      series: [{ name: 'a', points: [{ x: 3, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }] }],
    }
    expect(seriesRefusals(data, 'connectedScatter')).toEqual([])

    const option = buildSeriesOption(data, 'connectedScatter') as unknown as Loose
    expect(option.series[0].data).toEqual([[3, 1], [1, 2], [2, 3]])
  })

  it('still refuses an unordered path when the author declared x continuous', () => {
    const data: SeriesData = {
      series: [{ name: 'a', points: [{ x: 3, y: 1 }, { x: 1, y: 2 }] }],
      continuousX: true,
    }
    expect(seriesRefusals(data, 'connectedScatter').join(' ')).toContain('not in order')
  })

  it('refuses the shape’s own violations: duplicate names, empty runs, non-finite y', () => {
    const duplicate: SeriesData = {
      series: [
        { name: 'a', points: [{ x: 1, y: 1 }] },
        { name: 'a', points: [{ x: 1, y: 2 }] },
      ],
    }
    expect(seriesRefusals(duplicate, 'bar').join(' ')).toContain('share a name')

    expect(seriesRefusals({ series: [{ name: 'a', points: [] }] }, 'bar').join(' ')).toContain(
      'no points',
    )

    const notFinite: SeriesData = {
      series: [{ name: 'a', points: [{ x: 1, y: Number.NaN }] }],
    }
    expect(seriesRefusals(notFinite, 'bar').join(' ')).toContain('finite')
  })

  it('refuses a name that is not a series chart at all', () => {
    expect(seriesRefusals(fixtureFor('line'), 'pie' as RepresentationName).join(' ')).toContain(
      'not drawn from the series shape',
    )
  })

  it('refuses data with no series', () => {
    expect(seriesRefusals({ series: [] }, 'line').join(' ')).toContain('nothing to draw')
  })
})

/* -------------------------------------------------------------------------- */
/* 8. The derived marks each say what they claim                              */
/* -------------------------------------------------------------------------- */

describe('the derived marks', () => {
  it('draws a lollipop as a thin stem and an end dot under one legend entry', () => {
    const option = optionOf('lollipop')
    const types = option.series.map((s: Loose) => s.type)
    expect(types).toContain('bar')
    expect(types).toContain('scatter')
    expect(new Set(option.series.map((s: Loose) => s.name)).size).toBe(1)
    expect(option.series[0].barWidth).toBeLessThan(Number.parseFloat(tokens.space.sm))
  })

  it('draws a dot plot with dots and NO baseline', () => {
    const option = optionOf('dotPlot')
    expect(option.series[0].type).toBe('scatter')
    expect(option.yAxis.scale).toBe(true)
  })

  it('draws a bullet as a horizontal bar with the target as a tick, not a bar', () => {
    const option = optionOf('bullet')
    expect(option.yAxis.type).toBe('category')
    expect(option.xAxis.type).toBe('value')
    const target = option.series.find((s: Loose) => s.name === 'target')
    expect(target.type).toBe('scatter')
    expect(target.symbol).toBe('rect')
  })

  it('draws a slope with a label at each end and exactly two readings', () => {
    const option = optionOf('slope')
    expect(option.xAxis.data).toHaveLength(2)
    expect(option.series[0].label.show).toBe(true)
    expect(option.series[0].endLabel.show).toBe(true)
  })

  it('draws a radar with one indicator per x and no cartesian axes', () => {
    const option = optionOf('radar')
    expect(option.radar.indicator).toHaveLength(xValues(fixtureFor('radar')).length)
    expect(option.xAxis).toBeUndefined()
    expect(option.yAxis).toBeUndefined()
    /* No `max` on an indicator, for the same reason no axis gets an interval. */
    for (const indicator of option.radar.indicator) expect(indicator.max).toBeUndefined()
  })

  it('draws parallel coordinates with one axis per x, in the author’s order', () => {
    const data = fixtureFor('parallelCoordinates')
    const option = buildSeriesOption(data, 'parallelCoordinates') as unknown as Loose
    expect(option.parallelAxis.map((a: Loose) => a.name)).toEqual(xValues(data).map(String))
    expect(option.series[0].data[0]).toHaveLength(xValues(data).length)
  })

  it('draws a streamgraph on a wiggle baseline, which is what themeRiver is', () => {
    const option = optionOf('streamgraph')
    expect(option.series[0].type).toBe('themeRiver')
    expect(option.xAxis).toBeUndefined()
    expect(option.singleAxis).toBeDefined()
    /* Every (x, y) of every band reaches the river. */
    const data = fixtureFor('streamgraph')
    expect(option.series[0].data).toHaveLength(
      data.series.reduce((n, s) => n + s.points.length, 0),
    )
  })

  it('draws a step that holds its value until the next reading', () => {
    expect(optionOf('step').series[0].step).toBe('end')
    expect(optionOf('line').series[0].step).toBeUndefined()
  })

  it('assembles a candlestick from four series into one mark', () => {
    const option = optionOf('candlestick')
    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('candlestick')
    /* ECharts reads [open, close, low, high]; the low must be the smallest. */
    for (const row of option.series[0].data) {
      const [open, close, low, high] = row as number[]
      expect(low).toBeLessThanOrEqual(Math.min(open as number, close as number))
      expect(high).toBeGreaterThanOrEqual(Math.max(open as number, close as number))
    }
  })

  it('draws a control chart’s limits dashed, and its measurements solid', () => {
    const option = optionOf('controlChart')
    const measured = option.series.find((s: Loose) => s.name === 'measured')
    const upper = option.series.find((s: Loose) => s.name === 'ucl')
    expect(measured.lineStyle.type).toBeUndefined()
    expect(upper.lineStyle.type).toBe('dashed')
    expect(upper.symbol).toBe('none')
  })

  it('draws a burn-down’s ideal line as a reference, not as a measurement', () => {
    for (const name of ['burndown', 'burnup'] as const) {
      const ideal = optionOf(name).series.find((s: Loose) => s.name === 'ideal')
      expect(ideal.lineStyle.type, name).toBe('dashed')
    }
  })

  it('draws a regression as the scatter it was fitted to PLUS the fit', () => {
    const option = optionOf('regression')
    const measured = option.series.find((s: Loose) => s.name === 'measured')
    const fit = option.series.find((s: Loose) => s.name === 'fit')
    expect(measured.type).toBe('scatter')
    expect(fit.type).toBe('line')
    expect(fit.symbol).toBe('none')
  })

  it('draws a residual plot against the zero line the residuals are FROM', () => {
    const option = optionOf('residual')
    expect(option.series[0].markLine.data).toEqual([{ yAxis: 0 }])
  })

  it('draws the diagonal a ROC and a calibration plot are defined against', () => {
    for (const name of ['rocCurve', 'calibration'] as const) {
      const diagonal = optionOf(name).series.find((s: Loose) => s.silent === true)
      expect(diagonal, name).toBeDefined()
      expect(diagonal.data).toEqual([[0, 0], [1, 1]])
      /* Chrome, not a fifth series somebody measured: off the palette and out of
         the legend. */
      expect(diagonal.lineStyle.color).toBe(tokens.color.inkFaint)
      expect(optionOf(name).legend.data).not.toContain('')
    }
  })

  it('leaves a precision-recall baseline to the author, because prevalence is data', () => {
    const option = optionOf('precisionRecall')
    expect(option.series.some((s: Loose) => s.silent === true)).toBe(false)
    const baseline = option.series.find((s: Loose) => s.name === 'baseline')
    expect(baseline.lineStyle.type).toBe('dashed')
  })

  it('splits an impact/effort plot at the midpoint of the observed range', () => {
    const data: SeriesData = {
      series: [
        {
          name: 'measured',
          points: [{ x: 0, y: 0 }, { x: 10, y: 100 }],
        },
      ],
    }
    const option = buildSeriesOption(data, 'impactEffort') as unknown as Loose
    expect(option.series[0].markLine.data).toEqual([{ yAxis: 50 }, { xAxis: 5 }])
  })

  it('sorts a feature importance chart by magnitude, largest at the top', () => {
    const data: SeriesData = {
      series: [
        {
          name: 'importance',
          points: [
            { x: 'age', y: 0.1 },
            { x: 'income', y: 0.7 },
            { x: 'tenure', y: 0.4 },
          ],
        },
      ],
    }
    const option = buildSeriesOption(data, 'featureImportance') as unknown as Loose
    /* The y axis grows upward, so ascending here puts the largest at the top. */
    expect(option.yAxis.data).toEqual(['age', 'tenure', 'income'])
    expect(option.yAxis.type).toBe('category')
    expect(option.xAxis.name).toBe('Importance')
  })

  it('drops the symbols on a dense line, where they would be a smear', () => {
    expect(optionOf('functionGraph').series[0].symbol).toBe('none')
    expect(optionOf('lossCurve').series[0].symbol).toBe('none')
    expect(optionOf('line').series[0].symbol).toBe('circle')
  })

  it('gives a cluster plot and an embedding one colour per group', () => {
    for (const name of ['clusterPlot', 'embeddingProjection'] as const) {
      const option = optionOf(name)
      expect(option.series[0].itemStyle.color, name).toBe(tokens.series[0])
      expect(option.series[1].itemStyle.color, name).toBe(tokens.series[1])
      expect(option.series[0].type, name).toBe('scatter')
    }
  })

  it('never smooths a line — a curve between two points invents readings', () => {
    for (const name of SERIES_NAMES) {
      for (const s of optionOf(name).series as Loose[])
        if (s.type === 'line') expect(s.smooth, name).toBe(false)
    }
  })

  it('leaves a gap where a series has no point, rather than inventing one', () => {
    const data: SeriesData = {
      series: [
        { name: 'a', points: [{ x: 'x', y: 1 }, { x: 'y', y: 2 }] },
        { name: 'b', points: [{ x: 'y', y: 5 }] },
      ],
    }
    const option = buildSeriesOption(data, 'groupedBar') as unknown as Loose
    expect(option.series[1].data).toEqual([null, 5])
  })
})
