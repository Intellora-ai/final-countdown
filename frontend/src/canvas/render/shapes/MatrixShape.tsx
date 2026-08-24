import { useEffect, useRef } from 'react'
import ReactECharts, { echarts } from '../echarts'
import type { EChartsOption } from 'echarts'

import { tokens } from '../../design/tokens'
import { checkMatrix, type MatrixData, type ShapeIssue } from '../../spec/shapeInvariants'

/**
 * The matrix shape: a rectangular grid with row and column keys.
 *
 * heatMap · correlationMatrix · confusionMatrix · adjacencyMatrix ·
 * missingDataMap · hexbin · contour · pairPlot · riskHeatMap · decisionBoundary
 *
 * THE COLOUR SCALE IS THE CHART. AN UNANCHORED ONE IS A LIE.
 * ---------------------------------------------------------
 * A heat map's only encoding is colour, so where the ends and the middle of the
 * scale sit IS the claim. Hand the data to a diverging ramp and let it choose
 * its own endpoints and it invents a midpoint: a matrix whose values run 2 to
 * 10 — every one of them positive — renders with 2 at the far "negative" end,
 * and a reader who knows the ramp reads half the matrix as below zero. Nothing
 * in the picture says otherwise.
 *
 * So no scale here is ever derived from the data alone:
 *
 *   correlationMatrix  the domain is FIXED to [-1, 1], because that is
 *                      correlation's own range. Letting a weakly-correlated
 *                      matrix stretch [0.1, 0.35] across the whole ramp paints
 *                      r = 0.3 the same deep colour that r = 0.95 gets in the
 *                      matrix beside it.
 *   crosses zero       diverging, anchored at the midpoint and made SYMMETRIC
 *                      about it, so +3 and -3 are equally intense and the
 *                      neutral colour lands exactly on the midpoint.
 *   does not cross     sequential, anchored at the data floor — zero when the
 *                      quantity is non-negative, since that is a real floor and
 *                      not a coincidence of this sample.
 *
 * `buildMatrixScale` is pure and `positionOn` reports where a value lands in
 * [0, 1], which is what makes the anchoring testable rather than asserted.
 *
 * A CONFUSION MATRIX'S AXES ARE NOT INTERCHANGEABLE
 * ------------------------------------------------
 * Rows are TRUE, columns are PREDICTED, and both are named on the chart.
 * Transposed, the off-diagonal cells swap meaning and precision becomes recall
 * without a single number changing — the most quietly wrong chart in machine
 * learning. Counts alone hide class imbalance (900 correct out of 900 in one
 * class and 3 out of 90 in another looks like a good model), so every cell also
 * carries its share of its own TRUE row.
 *
 * `null` is not zero. An absent cell is drawn as a gap and counted in the
 * caption; painting it with the floor colour would invent a measurement.
 */

/* -------------------------------------------------------------------------- */
/* Tokens -> ECharts                                                          */
/* -------------------------------------------------------------------------- */

/** Tokens carry CSS lengths as strings; ECharts wants bare numbers. One door. */
function scalar(length: string): number {
  return Number.parseFloat(length)
}

const TICK_FONT = scalar(tokens.type.caption.size)
const NAME_FONT = scalar(tokens.type.label.size)
const HAIR = scalar(tokens.stroke.hair)

/**
 * Low to high, ending at the accent: "more" is always brighter, and the floor
 * sits just above the field so an empty-ish matrix does not glow.
 */
const SEQUENTIAL_RAMP: string[] = [
  tokens.color.surfaceLift,
  tokens.color.accentDeep,
  tokens.color.accent,
  tokens.color.accentSoft,
]

/**
 * THREE stops, deliberately. ECharts interpolates a continuous `visualMap`
 * evenly across the array, so with an odd count the MIDDLE colour lands exactly
 * at the middle of the domain — and because the domain is made symmetric about
 * the midpoint, that is exactly the midpoint value. A four-stop ramp would put
 * the neutral colour somewhere near the middle, which is not the same promise.
 */
const DIVERGING_RAMP: string[] = [tokens.color.result, tokens.color.surfaceLift, tokens.color.warning]

/** Cells past this and a printed number is smaller than the cell it labels. */
const MAX_LABELLED_CELLS = 144

/** Variants whose cells are counts: zero is a real floor, not a sample minimum. */
const COUNT_LIKE: readonly MatrixData['variant'][] = ['confusionMatrix', 'missingDataMap', 'hexbin']

/* -------------------------------------------------------------------------- */
/* The colour scale                                                           */
/* -------------------------------------------------------------------------- */

export interface MatrixScale {
  kind: 'sequential' | 'diverging'
  min: number
  max: number
  /** Where the neutral colour sits. For a sequential scale this is `min`. */
  midpoint: number
  colors: string[]
  /** Why the ends are where they are. Printed on the chart, not just meant. */
  anchor: string
}

/**
 * The scale, decided from the VARIANT and the data's sign — never from the
 * data's spread alone.
 */
export function buildMatrixScale(data: MatrixData): MatrixScale {
  const values = data.values.flat().filter((v): v is number => v !== null && Number.isFinite(v))

  /* Correlation is bounded by its own definition, so the data does not get a
     vote. This is the difference between "r = 0.3, weak" and a deep red cell. */
  if (data.variant === 'correlationMatrix') {
    return {
      kind: 'diverging',
      min: -1,
      max: 1,
      midpoint: 0,
      colors: DIVERGING_RAMP,
      anchor: 'scale fixed to [-1, 1] — correlation’s own range, not this matrix’s',
    }
  }

  if (values.length === 0) {
    return {
      kind: 'sequential',
      min: 0,
      max: 1,
      midpoint: 0,
      colors: SEQUENTIAL_RAMP,
      anchor: 'no values present; scale anchored at zero',
    }
  }

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const midpoint = 0
  const countLike = COUNT_LIKE.includes(data.variant)

  /* Diverging is earned by CROSSING the midpoint, not assumed. A matrix that
     never goes below zero has no "below" for a diverging ramp to show. */
  if (!countLike && lo < midpoint && hi > midpoint) {
    const reach = Math.max(Math.abs(lo - midpoint), Math.abs(hi - midpoint))
    return {
      kind: 'diverging',
      min: midpoint - reach,
      max: midpoint + reach,
      midpoint,
      colors: DIVERGING_RAMP,
      anchor: `diverging, anchored at ${num(midpoint)} and symmetric to ±${num(reach)}`,
    }
  }

  /* Sequential, anchored at the floor. Zero is the floor of a quantity that
     cannot be negative; otherwise the smallest value present is. */
  const floor = lo >= 0 ? 0 : lo
  const ceiling = hi > floor ? hi : floor + 1
  return {
    kind: 'sequential',
    min: floor,
    max: ceiling,
    midpoint: floor,
    colors: SEQUENTIAL_RAMP,
    anchor:
      lo >= 0
        ? 'sequential, anchored at zero — the floor of a non-negative quantity'
        : `sequential, anchored at the data floor ${num(floor)}`,
  }
}

/**
 * Where a value lands on the scale, in [0, 1].
 *
 * For a diverging scale 0.5 is the midpoint exactly, so "does any value in an
 * all-positive matrix render below the midpoint?" is a question a test can ask.
 */
export function positionOn(scale: MatrixScale, value: number): number {
  const span = scale.max - scale.min
  if (!Number.isFinite(span) || span === 0) return 0
  return clamp01((value - scale.min) / span)
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/* -------------------------------------------------------------------------- */
/* Row normalisation — the number counts alone cannot show                    */
/* -------------------------------------------------------------------------- */

/**
 * Each cell as a share of its own row.
 *
 * `null` where the cell is absent or the row is empty — a rate out of nothing
 * is not zero, it is undefined, and printing 0% would be a claim.
 */
export function rowRates(values: (number | null)[][]): (number | null)[][] {
  return values.map((row) => {
    const total = row.reduce<number>((sum, v) => sum + (v ?? 0), 0)
    return row.map((v) => (v === null || total === 0 ? null : v / total))
  })
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface MatrixChart {
  ok: true
  variant: MatrixData['variant']
  option: EChartsOption
  scale: MatrixScale
  /** Cells that are genuinely absent. Drawn as gaps, stated in the caption. */
  absentCells: number
  rates: (number | null)[][] | null
  caption: string
  warnings: string[]
}

export interface MatrixRefusal {
  ok: false
  variant: MatrixData['variant']
  problems: ShapeIssue[]
  warnings: string[]
}

export type MatrixResult = MatrixChart | MatrixRefusal

/**
 * The whole matrix, as data.
 *
 * Pure, free of function values, and free of any repair: a reject-level
 * invariant produces a refusal that names the problem. Drawing a ragged matrix
 * with the holes filled in, or a "correlation" of 1.4 clamped to 1, would teach
 * the author that their data was fine.
 */
export function buildMatrix(data: MatrixData, at = 'matrix'): MatrixResult {
  const issues = checkMatrix(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  const scale = buildMatrixScale(data)
  const rates = data.variant === 'confusionMatrix' ? rowRates(data.values) : null
  const labelled = data.rows.length * data.columns.length <= MAX_LABELLED_CELLS

  let absentCells = 0
  const cells: { value: [number, number, number]; label?: { formatter: string } }[] = []

  data.values.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v === null) {
        absentCells += 1
        return
      }
      const rate = rates?.[r]?.[c]
      const text =
        rate === null || rate === undefined ? num(v) : `${num(v)}\n${num(round(rate * 100, 1))}%`
      cells.push({ value: [c, r, v], ...(labelled ? { label: { formatter: text } } : {}) })
    })
  })

  const axes = axisNames(data.variant)
  const chrome = axisChrome()

  const option: EChartsOption = {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    /* The anchoring is STATED on the chart. A reader cannot check a scale they
       were never told the ends of, and a caption can be cropped away. */
    title: {
      text: scale.anchor,
      right: 0,
      top: 0,
      textStyle: { color: tokens.color.inkFaint, fontSize: TICK_FONT, fontWeight: 'normal' },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.color.surfaceLift,
      borderColor: tokens.color.inkFaint,
      borderWidth: HAIR,
      padding: scalar(tokens.space.sm),
      textStyle: { color: tokens.color.ink, fontSize: TICK_FONT },
    },
    grid: {
      left: scalar(tokens.space.sm),
      right: scalar(tokens.space.lg),
      top: scalar(tokens.space.xxl),
      bottom: scalar(tokens.space.xxxl),
      containLabel: true,
    },
    xAxis: {
      ...chrome,
      type: 'category',
      data: [...data.columns],
      splitArea: { show: false },
      ...(axes === null
        ? {}
        : { name: axes.x, nameLocation: 'middle', nameGap: scalar(tokens.space.xl) }),
    },
    /* `inverse` puts the FIRST row at the top. A matrix read top-to-bottom in
       the data and bottom-to-top on screen is a transposition waiting to be
       misread — and for a confusion matrix that is precision for recall. */
    yAxis: {
      ...chrome,
      type: 'category',
      data: [...data.rows],
      inverse: true,
      splitArea: { show: false },
      ...(axes === null
        ? {}
        : {
            name: axes.y,
            nameLocation: 'end',
            nameGap: scalar(tokens.space.md),
            nameTextStyle: { ...chrome.nameTextStyle, align: 'left' as const },
          }),
    },
    visualMap: {
      type: 'continuous',
      min: scale.min,
      max: scale.max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: scalar(tokens.space.md),
      inRange: { color: scale.colors },
      textStyle: { color: tokens.color.inkMuted, fontSize: TICK_FONT },
    },
    series: [
      {
        type: 'heatmap',
        name: data.variant,
        data: cells,
        itemStyle: { borderColor: tokens.color.void, borderWidth: scalar(tokens.stroke.thick) },
        label: { show: labelled, color: tokens.color.ink, fontSize: TICK_FONT },
        emphasis: { itemStyle: { borderColor: tokens.color.ink, borderWidth: HAIR } },
      },
    ],
  }

  return {
    ok: true,
    variant: data.variant,
    option,
    scale,
    absentCells,
    rates,
    caption: caption(data, scale, absentCells),
    warnings,
  }
}

/**
 * Only the confusion matrix has axes whose meaning is fixed by the variant
 * rather than by the author. Everywhere else the row and column keys are the
 * only names there are, and inventing an axis title would be the renderer
 * putting words in the author's mouth.
 */
function axisNames(variant: MatrixData['variant']): { x: string; y: string } | null {
  return variant === 'confusionMatrix' ? { x: 'PREDICTED class', y: 'TRUE class' } : null
}

function caption(data: MatrixData, scale: MatrixScale, absent: number): string {
  const parts = [scale.anchor]
  const note = variantNote(data.variant)
  if (note !== null) parts.push(note)
  if (absent > 0)
    parts.push(`${absent} cell${absent === 1 ? '' : 's'} absent, drawn as gaps rather than zero`)
  return `${parts.join('. ')}.`
}

/**
 * What this variant can and cannot honestly say when drawn from a value grid.
 * Where the shape carries less than the named chart needs, the caption says so
 * rather than the picture implying otherwise.
 */
function variantNote(variant: MatrixData['variant']): string | null {
  switch (variant) {
    case 'confusionMatrix':
      return 'Rows are the true class and columns the predicted class; each cell shows its count and its share of its own true-class row, because counts alone hide class imbalance'
    case 'correlationMatrix':
      return 'Correlation is not causation, and the fixed scale means a weak r cannot be coloured like a strong one'
    case 'hexbin':
      return 'Hex binning needs the raw points; this shape carries a rectangular grid, so the bins are drawn square'
    case 'contour':
      return 'Drawn as the sampled value grid: this shape carries cells, not iso-levels, so no contour lines are drawn'
    case 'pairPlot':
      return 'One summary value per variable pair; a full pair plot needs the underlying samples'
    case 'riskHeatMap':
      return 'Likelihood and impact are the row and column keys exactly as the author defined them'
    case 'decisionBoundary':
      return 'The grid is the model’s output over two inputs; any further inputs are fixed by the author and are not shown'
    case 'missingDataMap':
      return 'An absent cell is a gap, never a zero'
    default:
      return null
  }
}

function axisChrome() {
  return {
    axisLine: { show: true, lineStyle: { color: tokens.color.inkFaint, width: HAIR } },
    axisTick: { show: false },
    axisLabel: { color: tokens.color.inkMuted, fontSize: TICK_FONT, hideOverlap: true },
    nameTextStyle: { color: tokens.color.inkFaint, fontSize: NAME_FONT },
    splitLine: { show: false },
  }
}

/** The grid in one sentence, for a reader who cannot see it. */
export function describeMatrix(data: MatrixData): string {
  return `${data.variant}: ${data.rows.length} rows by ${data.columns.length} columns${
    data.variant === 'confusionMatrix' ? ', rows true and columns predicted' : ''
  }.`
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** Locale-free, so the same input prints the same string everywhere. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value, 3))
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

export function MatrixShape({ data, at }: { data: MatrixData; at?: string }) {
  const built = buildMatrix(data, at)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReactECharts | null>(null)

  /* Fires once on observe and again on every change, so a chart laid out before
     its column had width corrects itself the moment the width arrives. */
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

  return (
    <div>
      <div className="lc-chart" ref={plotRef}>
        <ReactECharts
          echarts={echarts}
          ref={chartRef}
          option={built.option}
          style={{ width: '100%', height: '100%' }}
          opts={{ renderer: 'svg' }}
          notMerge
          autoResize
          aria-label={describeMatrix(data)}
        />
      </div>
      <p className="lc-caption">{built.caption}</p>
    </div>
  )
}
