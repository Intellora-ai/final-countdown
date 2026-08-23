import { FigureSvg } from '../../design/primitives'
import { useEffect, useRef } from 'react'
import ReactECharts, { echarts } from '../echarts'
import type { EChartsOption } from 'echarts'

import { tokens } from '../../design/tokens'
import { checkParts, type PartsData, type ShapeIssue } from '../../spec/shapeInvariants'

/**
 * The parts shape: labelled parts that make one whole.
 *
 * pie · donut · waffle · waterfall · funnel · marimekko · stackedBar
 *
 * WHAT GOES WRONG WITH A PART OF A WHOLE
 * --------------------------------------
 * `checkParts` already refuses the arithmetic lies — a negative slice, parts
 * that sum to 87% of a stated whole, a funnel stage that grows. What is left
 * for the renderer is the set of lies that live in the DRAWING:
 *
 *   waffle     A cell is a unit. 37.4% of 100 cells is not drawable, so the
 *              cells are allocated by largest remainder — every cell whole,
 *              the count exact — and the rounding is STATED, part by part.
 *              Silently drawing 37 and saying 37.4% is a rounding the reader
 *              cannot see.
 *   waterfall  The bars are a running total, so the last one has to land on the
 *              stated end. `buildParts` computes the running total and refuses
 *              rather than draw steps that do not arrive where they claim.
 *   funnel     Width must be proportional to VALUE, which means the width scale
 *              starts at zero. ECharts' default maps the smallest stage to zero
 *              width, so a stage holding 10% of the top would render as a line.
 *   marimekko  A mosaic encodes TWO dimensions. This shape carries one, so only
 *              the width dimension is drawn and the caption says so — the
 *              alternative is a picture that implies a second measurement
 *              nobody made.
 *
 * Everything computed here — the waffle grid, the mosaic bands, the running
 * total — is a pure function of the data. No clock, no randomness: the same
 * parts produce the same cells in the same order, every time.
 */

/* -------------------------------------------------------------------------- */
/* Tokens -> geometry                                                         */
/* -------------------------------------------------------------------------- */

function scalar(length: string): number {
  return Number.parseFloat(length)
}

const TICK_FONT = scalar(tokens.type.caption.size)
const HAIR = scalar(tokens.stroke.hair)

/** A hundred cells: the count a reader can convert to a percentage by eye. */
export const WAFFLE_CELLS = 100

/** The author names a part; the palette is the design system's, by position. */
export function partColor(index: number): string {
  const palette: readonly string[] = tokens.series
  const wrapped = ((Math.trunc(index) % palette.length) + palette.length) % palette.length
  return palette[wrapped] ?? tokens.color.accent
}

/* -------------------------------------------------------------------------- */
/* Waffle — whole cells, and the rounding said out loud                       */
/* -------------------------------------------------------------------------- */

export interface WaffleRounding {
  label: string
  /** The exact number of cells the value is worth, before rounding. */
  exact: number
  /** The whole cells actually drawn. */
  cells: number
  /** Drawn minus exact. Positive means this part was rounded up. */
  delta: number
}

export interface WaffleCell {
  index: number
  row: number
  column: number
  label: string
  colorIndex: number
}

export interface WaffleGrid {
  cellCount: number
  columns: number
  rows: number
  cells: WaffleCell[]
  rounding: WaffleRounding[]
  /** The rounding as one sentence, for the caption. */
  note: string
}

/**
 * Allocate whole cells by LARGEST REMAINDER.
 *
 * Rounding each part on its own gives a grid that does not add up: three parts
 * at 33.4% each round to 33 and leave a cell nobody owns. Largest remainder
 * hands the spare cells to the parts that lost the most to rounding, so the
 * cells always total exactly `cellCount` and the error is as small as it can be.
 *
 * Ties break by input order, which is what makes the grid deterministic.
 */
export function allocateWaffle(
  parts: readonly { label: string; value: number }[],
  whole: number,
  cellCount: number = WAFFLE_CELLS,
): WaffleRounding[] {
  if (!(whole > 0))
    return parts.map((p) => ({ label: p.label, exact: 0, cells: 0, delta: 0 }))

  const exact = parts.map((p) => (p.value / whole) * cellCount)
  const floors = exact.map((e) => Math.floor(e))
  const spare = cellCount - floors.reduce((sum, f) => sum + f, 0)

  /* Sorted by remainder, descending; ties keep the author's order, so two parts
     with the same remainder always resolve the same way. */
  const order = exact
    .map((e, i) => ({ i, remainder: e - Math.floor(e) }))
    .sort((a, b) => (b.remainder - a.remainder) || (a.i - b.i))

  const cells = [...floors]
  for (let k = 0; k < spare; k += 1) {
    const winner = order[k % order.length]
    if (winner === undefined) break
    cells[winner.i] = (cells[winner.i] ?? 0) + 1
  }

  return parts.map((p, i) => ({
    label: p.label,
    exact: round(exact[i] ?? 0, 3),
    cells: cells[i] ?? 0,
    delta: round((cells[i] ?? 0) - (exact[i] ?? 0), 3),
  }))
}

/** The grid, row-major from the top left. Fixed order, so it never reshuffles. */
export function buildWaffle(
  parts: readonly { label: string; value: number }[],
  whole: number,
  cellCount: number = WAFFLE_CELLS,
): WaffleGrid {
  const rounding = allocateWaffle(parts, whole, cellCount)
  const columns = Math.ceil(Math.sqrt(cellCount))
  const rows = Math.ceil(cellCount / columns)

  const cells: WaffleCell[] = []
  let index = 0
  rounding.forEach((slot, partIndex) => {
    for (let n = 0; n < slot.cells; n += 1) {
      cells.push({
        index,
        row: Math.floor(index / columns),
        column: index % columns,
        label: slot.label,
        colorIndex: partIndex,
      })
      index += 1
    }
  })

  const moved = rounding.filter((slot) => Math.abs(slot.delta) >= 0.05)
  const note =
    moved.length === 0
      ? `Every part is a whole number of ${cellCount} cells; nothing was rounded.`
      : `Cells are whole, so the shares were rounded to fit ${cellCount}: ${moved
          .map((slot) => `${slot.label} ${slot.exact} → ${slot.cells}`)
          .join(', ')}.`

  return { cellCount, columns, rows, cells, rounding, note }
}

/* -------------------------------------------------------------------------- */
/* Waterfall — the running total, checked against the stated end              */
/* -------------------------------------------------------------------------- */

export interface WaterfallStep {
  label: string
  value: number
  /** The lower edge of the bar: where it starts on the value axis. */
  base: number
  /** The bar's height, always positive; direction is carried by `rises`. */
  height: number
  /** The running total AFTER this step. The bar's far edge sits here. */
  running: number
  rises: boolean
}

export interface WaterfallRun {
  steps: WaterfallStep[]
  /** Where the author says the run ends. */
  stated: number
  /** Where the bars actually arrive. */
  reached: number
  ok: boolean
}

/** Accumulate the steps. Nothing is nudged to make the last one land. */
export function runWaterfall(
  parts: readonly { label: string; value: number }[],
  stated: number,
): WaterfallRun {
  const steps: WaterfallStep[] = []
  let running = 0
  for (const part of parts) {
    const previous = running
    running += part.value
    steps.push({
      label: part.label,
      value: part.value,
      base: Math.min(previous, running),
      height: Math.abs(part.value),
      running,
      rises: part.value >= 0,
    })
  }
  const tolerance = Math.max(Math.abs(stated), 1) * 0.005
  return { steps, stated, reached: running, ok: Math.abs(running - stated) <= tolerance }
}

/* -------------------------------------------------------------------------- */
/* Marimekko — one dimension, and the caption says so                         */
/* -------------------------------------------------------------------------- */

export interface MosaicBand {
  label: string
  /** Fractions of the whole, so the renderer scales without re-deriving them. */
  x0: number
  x1: number
  fraction: number
  colorIndex: number
}

export function buildMosaic(
  parts: readonly { label: string; value: number }[],
  whole: number,
): MosaicBand[] {
  const bands: MosaicBand[] = []
  let cursor = 0
  parts.forEach((part, i) => {
    const fraction = whole > 0 ? part.value / whole : 0
    bands.push({
      label: part.label,
      x0: round(cursor, 6),
      x1: round(cursor + fraction, 6),
      fraction: round(fraction, 6),
      colorIndex: i,
    })
    cursor += fraction
  })
  return bands
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface PartsChart {
  ok: true
  variant: PartsData['variant']
  render: 'echarts' | 'waffle' | 'mosaic'
  option: EChartsOption | null
  waffle: WaffleGrid | null
  mosaic: MosaicBand[] | null
  waterfall: WaterfallRun | null
  whole: number
  caption: string
  warnings: string[]
}

export interface PartsRefusal {
  ok: false
  variant: PartsData['variant']
  problems: ShapeIssue[]
  warnings: string[]
}

export type PartsResult = PartsChart | PartsRefusal

export function buildParts(data: PartsData, at = 'parts'): PartsResult {
  const issues = checkParts(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  const sum = data.parts.reduce((n, p) => n + p.value, 0)
  const whole = data.whole ?? sum

  if (data.variant === 'waffle') {
    const waffle = buildWaffle(data.parts, whole)
    if (whole <= 0) warnings.push(`${at}.whole — the whole is not positive, so no cells are drawn`)
    return {
      ok: true,
      variant: data.variant,
      render: 'waffle',
      option: null,
      waffle,
      mosaic: null,
      waterfall: null,
      whole,
      caption: `${waffle.note} ${describeParts(data, whole)}`,
      warnings,
    }
  }

  if (data.variant === 'marimekko') {
    const mosaic = buildMosaic(data.parts, whole)
    warnings.push(
      `${at} — a marimekko encodes two dimensions; this shape carries one, so only the width dimension is drawn`,
    )
    return {
      ok: true,
      variant: data.variant,
      render: 'mosaic',
      option: null,
      waffle: null,
      mosaic,
      waterfall: null,
      whole,
      caption: `Band width is each part's share of the whole. A marimekko normally encodes a second dimension as height; this data carries only one, so no height is claimed. ${describeParts(data, whole)}`,
      warnings,
    }
  }

  if (data.variant === 'waterfall') {
    const run = runWaterfall(data.parts, whole)
    /*
     * THE ASSERTION, NOT A NUDGE.
     * A waterfall's whole claim is "these steps get you from nothing to the end
     * value". If the bars do not arrive there, adjusting the last one so they
     * appear to is the exact failure this refuses.
     */
    if (!run.ok)
      return {
        ok: false,
        variant: data.variant,
        problems: [
          {
            path: `${at}.parts`,
            message: `the steps run to ${num(run.reached)}, not to the stated end ${num(run.stated)}`,
            level: 'reject',
          },
        ],
        warnings,
      }

    return {
      ok: true,
      variant: data.variant,
      render: 'echarts',
      option: waterfallOption(run),
      waffle: null,
      mosaic: null,
      waterfall: run,
      whole,
      caption: `Each bar starts where the last one ended; the running total arrives at ${num(run.reached)}. ${describeParts(data, whole)}`,
      warnings,
    }
  }

  const option =
    data.variant === 'funnel'
      ? funnelOption(data)
      : data.variant === 'stackedBar'
        ? stackedBarOption(data)
        : pieOption(data)

  return {
    ok: true,
    variant: data.variant,
    render: 'echarts',
    option,
    waffle: null,
    mosaic: null,
    waterfall: null,
    whole,
    caption: describeParts(data, whole),
    warnings,
  }
}

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

function chrome() {
  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: {
      backgroundColor: tokens.color.surfaceLift,
      borderColor: tokens.color.inkFaint,
      borderWidth: HAIR,
      padding: scalar(tokens.space.sm),
      textStyle: { color: tokens.color.ink, fontSize: TICK_FONT },
    },
    legend: {
      icon: 'roundRect',
      itemWidth: scalar(tokens.space.md),
      itemHeight: scalar(tokens.space.xs),
      itemGap: scalar(tokens.space.md),
      textStyle: { color: tokens.color.inkMuted, fontSize: TICK_FONT },
    },
  }
}

function axisChrome() {
  return {
    axisLine: { show: true, lineStyle: { color: tokens.color.inkFaint, width: HAIR } },
    axisTick: { show: false },
    axisLabel: { color: tokens.color.inkMuted, fontSize: TICK_FONT, hideOverlap: true },
    splitLine: { show: false },
  }
}

/** Pie and donut differ by one number: whether the ring has a hole. */
function pieOption(data: PartsData): EChartsOption {
  const base = chrome()
  return {
    ...base,
    color: data.parts.map((_, i) => partColor(i)),
    tooltip: { ...base.tooltip, trigger: 'item', formatter: '{b}: {c}  ({d}%)' },
    legend: { ...base.legend, show: true, top: 0, left: 0, orient: 'vertical' },
    series: [
      {
        type: 'pie',
        name: data.variant,
        radius: data.variant === 'donut' ? ['42%', '70%'] : ['0%', '70%'],
        center: ['62%', '54%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: tokens.color.void, borderWidth: scalar(tokens.stroke.thick) },
        /* The share is the number a pie exists to show, and it goes INSIDE the
           ring where the container's leftover margin cannot ellipsise it. */
        label: { position: 'inside', color: tokens.color.void, fontSize: TICK_FONT, formatter: '{d}%' },
        labelLine: { show: false },
        data: data.parts.map((part) => ({ name: part.label, value: part.value })),
      },
    ],
  }
}

/**
 * A funnel whose width scale does not start at zero is a bar chart with a lie
 * in it: ECharts maps the smallest value to `minSize`, which defaults to zero
 * width, so a stage holding a tenth of the top would render as a hairline. With
 * `min: 0` the width is the value's share of the largest stage, which is what a
 * funnel claims to show.
 */
function funnelOption(data: PartsData): EChartsOption {
  const base = chrome()
  const top = data.parts.reduce((n, p) => Math.max(n, p.value), 0)
  return {
    ...base,
    color: data.parts.map((_, i) => partColor(i)),
    tooltip: { ...base.tooltip, trigger: 'item', formatter: '{b}: {c}' },
    legend: { ...base.legend, show: true, top: 0, left: 0, orient: 'vertical' },
    series: [
      {
        type: 'funnel',
        name: data.variant,
        /* Author order, always: a funnel's order is its sequence, and sorting it
           by size would silently reorder the stages of a process. */
        sort: 'none',
        min: 0,
        max: top,
        minSize: '0%',
        maxSize: '100%',
        left: '32%',
        gap: scalar(tokens.space.xs),
        itemStyle: { borderColor: tokens.color.void, borderWidth: scalar(tokens.stroke.thick) },
        label: { position: 'inside', color: tokens.color.void, fontSize: TICK_FONT, formatter: '{c}' },
        data: data.parts.map((part) => ({ name: part.label, value: part.value })),
      },
    ],
  }
}

/** One bar, one segment per part, in the author's order. */
function stackedBarOption(data: PartsData): EChartsOption {
  const base = chrome()
  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { ...base.legend, show: true, top: 0, left: 0 },
    grid: {
      left: scalar(tokens.space.sm),
      right: scalar(tokens.space.lg),
      top: scalar(tokens.space.xxl),
      bottom: scalar(tokens.space.sm),
      containLabel: true,
    },
    xAxis: { ...axisChrome(), type: 'value' },
    yAxis: { ...axisChrome(), type: 'category', data: [''] },
    series: data.parts.map((part, i) => ({
      type: 'bar' as const,
      name: part.label,
      stack: 'whole',
      barWidth: '46%',
      itemStyle: { color: partColor(i) },
      label: { show: false },
      data: [part.value],
    })),
  }
}

/**
 * The waterfall, as an invisible base plus a visible step.
 *
 * The base carries no colour at all — `opacity: 0` rather than a colour keyword,
 * because a colour that is not in the tokens has no legal home here — and it is
 * silent, so hovering never reports a quantity that does not exist.
 */
function waterfallOption(run: WaterfallRun): EChartsOption {
  const base = chrome()
  const labels = [...run.steps.map((s) => s.label), 'Total']
  const bases = [...run.steps.map((s) => s.base), 0]
  const heights = [...run.steps.map((s) => s.height), Math.abs(run.stated)]
  const colours = [
    ...run.steps.map((s) => (s.rises ? tokens.color.insight : tokens.color.warning)),
    tokens.color.result,
  ]

  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { ...base.legend, show: false },
    grid: {
      left: scalar(tokens.space.sm),
      right: scalar(tokens.space.lg),
      top: scalar(tokens.space.lg),
      bottom: scalar(tokens.space.sm),
      containLabel: true,
    },
    xAxis: { ...axisChrome(), type: 'category', data: labels },
    yAxis: {
      ...axisChrome(),
      type: 'value',
      splitLine: { show: true, lineStyle: { color: tokens.color.surfaceLift, width: HAIR } },
    },
    series: [
      {
        type: 'bar',
        name: 'base',
        stack: 'run',
        silent: true,
        itemStyle: { opacity: 0 },
        emphasis: { itemStyle: { opacity: 0 } },
        tooltip: { show: false },
        data: bases,
      },
      {
        type: 'bar',
        name: 'step',
        stack: 'run',
        data: heights.map((height, i) => ({
          value: height,
          itemStyle: {
            color: colours[i] ?? tokens.color.insight,
            borderRadius: [scalar(tokens.radius.sm), scalar(tokens.radius.sm), 0, 0],
          },
        })),
      },
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

export function describeParts(data: PartsData, whole: number): string {
  const named = data.parts.map((p) => `${p.label} ${num(p.value)}`).join(', ')
  return `${data.variant} of ${num(whole)}: ${named}.`
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value, 3))
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

const CELL = scalar(tokens.space.md)
const CELL_GAP = scalar(tokens.space.xs)
const BAND_H = scalar(tokens.space.xxl)

export function PartsShape({ data, at }: { data: PartsData; at?: string }) {
  const built = buildParts(data, at)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReactECharts | null>(null)

  useEffect(() => {
    const plot = plotRef.current
    if (plot === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      try {
        chartRef.current?.getEchartsInstance().resize()
      } catch {
        /* Not mounted yet — the next observation will catch it. */
      }
    })
    observer.observe(plot)
    return () => observer.disconnect()
  }, [built.ok])

  if (!built.ok) {
    return (
      <div className="lc-refusal" role="alert">
        <h2>This {data.variant} was not drawn</h2>
        <ul>
          {built.problems.map((problem, i) => (
            <li key={i}>
              <code>{problem.path}</code> — {problem.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (built.render === 'waffle' && built.waffle !== null) {
    const grid = built.waffle
    const step = CELL + CELL_GAP
    return (
      <div>
        <FigureSvg
          viewBox={`0 0 ${grid.columns * step - CELL_GAP} ${grid.rows * step - CELL_GAP}`}
          role="img"
          aria-label={describeParts(data, built.whole)}
        >
          {/* Every cell in the grid, drawn faint, so the DENOMINATOR is visible:
              a waffle whose empty cells are invisible is just a bar. */}
          {Array.from({ length: grid.cellCount }, (_, i) => (
            <rect
              key={`slot-${i}`}
              x={(i % grid.columns) * step}
              y={Math.floor(i / grid.columns) * step}
              width={CELL}
              height={CELL}
              rx={scalar(tokens.radius.sm)}
              fill="none"
              stroke={tokens.color.inkFaint}
              strokeWidth={scalar(tokens.stroke.hair)}
            />
          ))}
          {grid.cells.map((cell) => (
            <rect
              key={cell.index}
              x={cell.column * step}
              y={cell.row * step}
              width={CELL}
              height={CELL}
              rx={scalar(tokens.radius.sm)}
              fill={partColor(cell.colorIndex)}
            >
              <title>{cell.label}</title>
            </rect>
          ))}
        </FigureSvg>
        <p className="lc-caption">{built.caption}</p>
      </div>
    )
  }

  if (built.render === 'mosaic' && built.mosaic !== null) {
    const bands = built.mosaic
    const width = 100
    return (
      <div>
        <FigureSvg
          viewBox={`0 0 ${width} ${BAND_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={describeParts(data, built.whole)}
        >
          {bands.map((band) => (
            <rect
              key={band.label}
              x={band.x0 * width}
              y={0}
              width={Math.max(0, (band.x1 - band.x0) * width)}
              height={BAND_H}
              fill={partColor(band.colorIndex)}
              stroke={tokens.color.void}
              strokeWidth={scalar(tokens.stroke.hair)}
            >
              <title>{band.label}</title>
            </rect>
          ))}
        </FigureSvg>
        <p className="lc-caption">{built.caption}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="lc-chart" ref={plotRef}>
        {built.option !== null && (
          <ReactECharts
            echarts={echarts}
            ref={chartRef}
            option={built.option}
            style={{ width: '100%', height: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge
            autoResize
            aria-label={describeParts(data, built.whole)}
          />
        )}
      </div>
      <p className="lc-caption">{built.caption}</p>
    </div>
  )
}
