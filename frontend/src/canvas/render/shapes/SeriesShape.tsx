import { useEffect, useRef } from 'react'
import ReactECharts, { echarts } from '../echarts'
import type { EChartsOption } from 'echarts'

import { tokens } from '../../design/tokens'
import { REPRESENTATIONS, type RepresentationName } from '../../spec/representations'
import { checkSeries, type SeriesData } from '../../spec/shapeInvariants'
import { seriesColor } from '../ChartView'

/**
 * The `series` shape: named runs of (x, y) over a shared axis.
 *
 * Thirty-three named representations in the registry are this one shape. They
 * are not thirty-three renderers — they are one data structure and a table of
 * rendering decisions, which is the point of the shape taxonomy. A new named
 * type is usually a row in `PLANS` rather than new code, and it inherits
 * `checkSeries`'s correctness rules for free.
 *
 * WHERE THE EXTRA CHANNELS COME FROM
 * ----------------------------------
 * `SeriesData` carries names and (x, y) and nothing else. A candlestick needs
 * four numbers per x, a control chart needs limits, a bullet needs a target and
 * a bubble needs a magnitude. Rather than widen the shape — which would make
 * every other variant carry fields it has no use for — those arrive as ADDITIONAL
 * NAMED SERIES: `open`, `high`, `low`, `close`, `ucl`, `lcl`, `mean`, `target`,
 * `ideal`, `baseline`, `fit`, `size`. One mechanism, recognised by name, and the
 * author writes them in the same structure as everything else.
 *
 * WHAT THE RENDERER MAY INVENT, AND WHAT IT MAY NOT
 * -------------------------------------------------
 * It draws a reference only when that reference is DEFINITIONAL — the ROC and
 * calibration diagonals are y = x by definition, and a residual plot's zero line
 * is zero. Anything that depends on the data (a target, a control limit, a
 * sprint's ideal line, a prevalence baseline) must come from the author, because
 * the renderer inventing one would be making up a number and drawing it as fact.
 *
 * TICKS ARE A CORRECTNESS SURFACE, NOT STYLING
 * --------------------------------------------
 * A y-axis reading 200, 150, 100, 110 is not an ugly chart, it is a FALSE one.
 * So nothing below hands ECharts a tick array it computed itself: no `interval`,
 * no `min`/`max`, no `axisLabel.customValues`, no `indicator.max`. ECharts'
 * interval scale picks nice, evenly spaced ticks, and `SeriesShape.test.ts`
 * renders each option headlessly across twenty random ranges per chart type and
 * asserts the ticks that actually came out are monotonic and evenly spaced.
 *
 * SORTING IS NOT THIS FILE'S JOB
 * ------------------------------
 * `checkSeries` rejects out-of-order x on a continuous axis, because a line
 * through (3, ·), (1, ·), (2, ·) draws a zig-zag the reader takes for structure.
 * If such data reaches here anyway it is REFUSED, not quietly sorted — sorting
 * would hide the author's error instead of reporting it. The one reordering that
 * does happen is over CATEGORIES, which have no inherent order: numeric category
 * labels are sorted ascending (an axis reading 1, 10, 2 is the same lie in a
 * different costume) and `featureImportance` is sorted by magnitude, which is
 * what that chart is for.
 *
 * Law 4: no colour, and no px or rem, is written in this file. Every one traces
 * to `tokens`. Only the OPAQUE tokens reach the option — zrender's colour parser
 * predates the space-and-slash channel syntax that `line`, `panel` and
 * `accentGlow` are written in, and a failed parse is an undefined fill.
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
const THIN = scalar(tokens.stroke.thin)
const THICK = scalar(tokens.stroke.thick)
const DOT = tokens.arrow.head
/** A dot that has to carry a reading on its own — a lollipop head, a dot plot. */
const DOT_LARGE = scalar(tokens.space.md)

/** The widest a bubble may be drawn. Its AREA carries the value; see `bubbleSize`. */
const BUBBLE_SPAN = scalar(tokens.space.xxl)

/** A lollipop's stem, and a bullet's target tick: the thinnest mark that reads. */
const STEM_WIDTH = THICK
const TARGET_TICK: [number, number] = [THIN, scalar(tokens.space.xl)]

/** An area fill dark enough to read as one series and light enough to see through. */
const FILL_OPACITY = 0.16
/** Overlapping strokes and marks: near-solid, but they must not hide each other. */
const MARK_OPACITY = 0.84

/* -------------------------------------------------------------------------- */
/* The plan for each of the 33 named types                                    */
/* -------------------------------------------------------------------------- */

type Mark =
  | 'line'
  | 'area'
  | 'step'
  | 'bar'
  | 'scatter'
  | 'dot'
  | 'bubble'
  | 'lollipop'
  | 'bullet'
  | 'candlestick'
  | 'radar'
  | 'parallel'
  | 'stream'

interface Plan {
  mark: Mark
  /** Bars grow left to right, and the categories move to the y axis. */
  horizontal?: boolean
  /** This type stacks BY DEFINITION, whatever the author remembered to declare. */
  stacked?: boolean
  /** The value axis must include zero — a truncated bar is a crooked tick. */
  zeroBaseline?: boolean
  /** Discrete things, whatever the x values happen to look like. */
  categoryX?: boolean
  /** So many points that symbols become a smear. */
  dense?: boolean
  /** A reference this TYPE defines, so the renderer may draw it. */
  reference?: 'diagonal' | 'zero' | 'quadrants'
  /**
   * True when a mark is read left to right, so an out-of-order x is a lie.
   * Deliberately FALSE for `connectedScatter`, whose path order is the content.
   */
  xOrdered?: boolean
  /** Categories reordered by magnitude: legal, because categories have no order. */
  sortByValue?: boolean
  /** Two points and a label at each end. */
  endLabels?: boolean
  /**
   * Axis names the TYPE defines. A ROC curve's x axis is the false positive rate
   * by definition of "ROC curve"; naming it is reading the registry, not
   * inventing a fact. Where the axes depend on the data — a scatter of two
   * unknown variables — nothing is named.
   */
  axes?: { x?: string; y?: string }
}

export const PLANS: Record<string, Plan> = {
  /* -- Comparison ------------------------------------------------------- */
  bar: { mark: 'bar', categoryX: true, zeroBaseline: true },
  groupedBar: { mark: 'bar', categoryX: true, zeroBaseline: true },
  stackedBar: { mark: 'bar', categoryX: true, zeroBaseline: true, stacked: true },
  lollipop: { mark: 'lollipop', categoryX: true, zeroBaseline: true },
  /* A dot plot has no baseline ON PURPOSE — it compares positions, not lengths. */
  dotPlot: { mark: 'dot', categoryX: true },
  bullet: { mark: 'bullet', categoryX: true, horizontal: true, zeroBaseline: true },
  radar: { mark: 'radar' },
  slope: { mark: 'line', categoryX: true, endLabels: true },
  parallelCoordinates: { mark: 'parallel' },

  /* -- Change over time -------------------------------------------------- */
  line: { mark: 'line', xOrdered: true },
  area: { mark: 'area', xOrdered: true, zeroBaseline: true },
  stackedArea: { mark: 'area', xOrdered: true, zeroBaseline: true, stacked: true },
  streamgraph: { mark: 'stream', stacked: true, xOrdered: true },
  step: { mark: 'step', xOrdered: true },
  candlestick: { mark: 'candlestick', categoryX: true },
  controlChart: { mark: 'line', xOrdered: true },
  burndown: { mark: 'line', xOrdered: true, zeroBaseline: true, axes: { y: 'Work remaining' } },
  burnup: { mark: 'line', xOrdered: true, zeroBaseline: true, axes: { y: 'Work' } },
  regression: { mark: 'scatter' },
  residual: { mark: 'scatter', reference: 'zero', axes: { x: 'Fitted value', y: 'Residual' } },
  learningCurve: { mark: 'line', xOrdered: true, axes: { x: 'Training examples', y: 'Score' } },
  lossCurve: { mark: 'line', xOrdered: true, dense: true, axes: { x: 'Epoch', y: 'Loss' } },
  rocCurve: {
    mark: 'line',
    xOrdered: true,
    reference: 'diagonal',
    axes: { x: 'False positive rate', y: 'True positive rate' },
  },
  /* No diagonal here: a precision-recall baseline is the positive class's
     prevalence, which is DATA. It must arrive as a series named `baseline`. */
  precisionRecall: { mark: 'line', xOrdered: true, axes: { x: 'Recall', y: 'Precision' } },
  calibration: {
    mark: 'line',
    xOrdered: true,
    reference: 'diagonal',
    axes: { x: 'Predicted probability', y: 'Observed frequency' },
  },

  /* -- Relationship ------------------------------------------------------ */
  scatter: { mark: 'scatter' },
  bubble: { mark: 'bubble' },
  connectedScatter: { mark: 'line' },
  featureImportance: {
    mark: 'bar',
    horizontal: true,
    categoryX: true,
    zeroBaseline: true,
    sortByValue: true,
    axes: { x: 'Importance' },
  },
  embeddingProjection: { mark: 'scatter' },
  clusterPlot: { mark: 'scatter' },
  impactEffort: { mark: 'scatter', reference: 'quadrants', axes: { x: 'Effort', y: 'Impact' } },
  functionGraph: { mark: 'line', dense: true, xOrdered: true },
}

function planFor(variant: RepresentationName): Plan {
  return PLANS[variant] ?? { mark: 'line' }
}

/* -------------------------------------------------------------------------- */
/* The named series that carry an extra channel                               */
/* -------------------------------------------------------------------------- */

type Role = 'data' | 'reference' | 'fit' | 'size' | 'target'

/** Author-supplied references: drawn dashed, because they are not measurements. */
const REFERENCE_NAMES = new Set([
  'ideal',
  'target',
  'baseline',
  'scope',
  'mean',
  'centre',
  'center',
  'ucl',
  'lcl',
  'upper control limit',
  'lower control limit',
  'chance',
  'expected',
])

const FIT_NAMES = new Set(['fit', 'fitted', 'model', 'trend', 'regression', 'line of best fit'])
const SIZE_NAMES = new Set(['size', 'weight', 'magnitude', 'area'])
const OPEN = 'open'
const HIGH = 'high'
const LOW = 'low'
const CLOSE = 'close'
const OHLC = [OPEN, HIGH, LOW, CLOSE]

function key(name: string): string {
  return name.trim().toLowerCase()
}

function roleOf(name: string, variant: RepresentationName): Role {
  const k = key(name)
  if (variant === 'bubble' && SIZE_NAMES.has(k)) return 'size'
  if (variant === 'bullet' && k === 'target') return 'target'
  if (variant === 'regression' && FIT_NAMES.has(k)) return 'fit'
  if (REFERENCE_NAMES.has(k)) return 'reference'
  return 'data'
}

function seriesNamed(data: SeriesData, wanted: string): SeriesData['series'][number] | undefined {
  return data.series.find((s) => key(s.name) === wanted)
}

/* -------------------------------------------------------------------------- */
/* Reading the data's shape                                                   */
/* -------------------------------------------------------------------------- */

/** Every x across every series, once, in the order the author wrote them. */
export function xValues(data: SeriesData): (number | string)[] {
  const seen = new Set<string>()
  const order: (number | string)[] = []
  for (const s of data.series)
    for (const p of s.points) {
      const k = String(p.x)
      if (!seen.has(k)) {
        seen.add(k)
        order.push(p.x)
      }
    }
  return order
}

export function allNumericX(data: SeriesData): boolean {
  return data.series.every((s) => s.points.every((p) => Number.isFinite(Number(p.x))))
}

/** True when the x axis is a real number line rather than a list of labels. */
export function isValueAxis(data: SeriesData, variant: RepresentationName): boolean {
  return planFor(variant).categoryX !== true && allNumericX(data)
}

/**
 * The category labels, in an order a reader can trust.
 *
 * Numeric labels are sorted ascending — an axis reading 1, 10, 2 is a false
 * axis. `featureImportance` is sorted by magnitude instead, which is what that
 * chart exists to show. Neither is the sort `checkSeries` forbids: that one is
 * about a CONTINUOUS axis, where order carries meaning the author chose.
 */
export function categoryLabels(data: SeriesData, variant: RepresentationName): string[] {
  const labels = xValues(data).map(String)
  const plan = planFor(variant)

  if (plan.sortByValue === true) {
    const magnitude = new Map<string, number>()
    for (const s of data.series)
      for (const p of s.points)
        magnitude.set(String(p.x), Math.max(magnitude.get(String(p.x)) ?? 0, Math.abs(p.y)))
    /* Largest first. On a horizontal bar the y axis grows upward, so the axis is
       reversed below and the biggest importance ends up at the top. */
    return [...labels].sort((a, b) => (magnitude.get(a) ?? 0) - (magnitude.get(b) ?? 0))
  }

  const allNumeric = labels.every((l) => l.trim() !== '' && Number.isFinite(Number(l)))
  return allNumeric ? [...labels].sort((a, b) => Number(a) - Number(b)) : labels
}

/**
 * Does an out-of-order x lie here?
 *
 * Only where a mark is read left to right AND x is a number. Forcing the check
 * on string x would compare `NaN >= NaN` and reject every honest chart; leaving
 * it off where a line IS drawn would let the zig-zag through.
 */
function ordersMatter(data: SeriesData, variant: RepresentationName): boolean {
  if (data.continuousX === true) return true
  return planFor(variant).xOrdered === true && allNumericX(data)
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Why this chart cannot honestly be drawn, in the reader's words. Empty means
 * draw it.
 *
 * The shape's own invariants run first, with `stacked` and `continuousX` forced
 * to whatever the NAMED TYPE implies — a stacked bar stacks whether or not the
 * author wrote `stacked: true`, and its negative values are just as meaningless
 * either way.
 */
export function seriesRefusals(data: SeriesData, variant: RepresentationName): string[] {
  const out: string[] = []

  const representation = REPRESENTATIONS[variant]
  if (representation === undefined || representation.shape !== 'series') {
    out.push(`"${variant}" is not drawn from the series shape`)
    return out
  }

  if (data.series.length === 0) {
    out.push('no series: there is nothing to draw')
    return out
  }

  const plan = planFor(variant)
  const checked: SeriesData = {
    ...data,
    stacked: data.stacked === true || plan.stacked === true,
    continuousX: ordersMatter(data, variant),
  }
  for (const issue of checkSeries(checked, variant))
    if (issue.level === 'reject') out.push(`${issue.path}: ${issue.message}`)

  /* A slope chart's whole claim is "this went from here to there". Three points
     make a line chart with two of its readings hidden by the label style. */
  if (variant === 'slope') {
    const count = xValues(data).length
    if (count !== 2)
      out.push(`a slope chart compares exactly two x values; this has ${count}`)
  }

  if (variant === 'candlestick') out.push(...candlestickRefusals(data))

  return out
}

/**
 * A candle without all four prices is not a smaller candle; it is a different
 * claim. And a high below the open or the close is arithmetically impossible —
 * ECharts would still draw it, upside down and quite cheerfully.
 */
function candlestickRefusals(data: SeriesData): string[] {
  const out: string[] = []

  const missing = OHLC.filter((n) => seriesNamed(data, n) === undefined)
  if (missing.length > 0) {
    out.push(`a candlestick needs open, high, low and close; missing ${missing.join(', ')}`)
    return out
  }

  const at = (name: string, x: string): number | undefined =>
    seriesNamed(data, name)?.points.find((p) => String(p.x) === x)?.y

  for (const x of xValues(data).map(String)) {
    const open = at(OPEN, x)
    const high = at(HIGH, x)
    const low = at(LOW, x)
    const close = at(CLOSE, x)
    if (open === undefined || high === undefined || low === undefined || close === undefined) {
      out.push(`"${x}" does not have all four of open, high, low and close`)
      continue
    }
    if (high < Math.max(open, close))
      out.push(`at "${x}" the high ${high} is below the open or close it must contain`)
    if (low > Math.min(open, close))
      out.push(`at "${x}" the low ${low} is above the open or close it must contain`)
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* Shared chrome                                                              */
/* -------------------------------------------------------------------------- */

function axisChrome() {
  return {
    axisLine: { show: true, lineStyle: { color: tokens.color.inkFaint, width: HAIR } },
    axisTick: { show: false },
    axisLabel: { color: tokens.color.inkMuted, fontSize: TICK_FONT, hideOverlap: true },
    nameTextStyle: { color: tokens.color.inkFaint, fontSize: NAME_FONT },
  }
}

function splitLine() {
  return { show: true, lineStyle: { color: tokens.color.surfaceLift, width: HAIR } }
}

function tooltipChrome(perItem: boolean) {
  return {
    trigger: perItem ? ('item' as const) : ('axis' as const),
    backgroundColor: tokens.color.surfaceLift,
    borderColor: tokens.color.inkFaint,
    borderWidth: HAIR,
    padding: scalar(tokens.space.sm),
    textStyle: { color: tokens.color.ink, fontSize: TICK_FONT },
  }
}

function legendChrome(names: string[]) {
  return {
    show: names.length > 1,
    data: names,
    top: 0,
    right: 0,
    icon: 'roundRect',
    itemWidth: scalar(tokens.space.md),
    itemHeight: scalar(tokens.space.xs),
    itemGap: scalar(tokens.space.md),
    textStyle: { color: tokens.color.inkMuted, fontSize: TICK_FONT },
  }
}

/**
 * Room for the axis NAMES, reserved explicitly.
 *
 * `grid.containLabel` reserves room for TICK labels only — the axis name sits
 * outside the grid box and is not counted, which is exactly how a chart ships
 * with "Pressure (kPa)" half above its own top edge. Each margin is the axis's
 * `nameGap` plus one line of `type.label`, rounded up to the next step on the
 * space scale. Nothing here is measured by eye, and with no name on a side the
 * margin drops back so a chart that asked for no labels does not pay for them.
 */
function gridFor(xName: string | undefined, yName: string | undefined, hasLegend: boolean) {
  const top =
    yName !== undefined && hasLegend
      ? tokens.space.xxxl
      : yName !== undefined || hasLegend
        ? tokens.space.xxl
        : tokens.space.lg

  return {
    left: scalar(tokens.space.sm),
    right: scalar(tokens.space.lg),
    top: scalar(top),
    bottom: scalar(xName === undefined ? tokens.space.sm : tokens.space.xxl),
    containLabel: true,
  }
}

/** The x name, centred under the axis. */
function xNamed(name: string | undefined) {
  return name === undefined
    ? {}
    : { name, nameLocation: 'middle' as const, nameGap: scalar(tokens.space.xl) }
}

/**
 * The y name, anchored at its LEFT edge.
 *
 * ECharts centres an `end`-located name on the axis's end point, which for the
 * y axis is the grid's left edge — so half of a long name hangs off the
 * container. Anchored left it grows inwards, over the plot, where there is room.
 */
function yNamed(name: string | undefined) {
  return name === undefined
    ? {}
    : {
        name,
        nameLocation: 'end' as const,
        nameGap: scalar(tokens.space.md),
        nameTextStyle: { ...axisChrome().nameTextStyle, align: 'left' as const },
      }
}

/* -------------------------------------------------------------------------- */
/* Bubble size                                                                */
/* -------------------------------------------------------------------------- */

/**
 * AREA carries the value, not radius.
 *
 * A reader compares bubbles by how much ink each one is. Mapping the value to
 * the radius makes a bubble worth four times another look SIXTEEN times bigger,
 * which is a real and common lie rather than a rounding error. The square root
 * is what makes area proportional to value, and there is no floor on it — a
 * floor would make small values look larger than they are, which is the same
 * defect in miniature.
 */
export function bubbleSize(value: number, largest: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(largest)) return 0
  if (largest <= 0 || value <= 0) return 0
  return BUBBLE_SPAN * Math.sqrt(value / largest)
}

/* -------------------------------------------------------------------------- */
/* The option                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The whole chart, as data.
 *
 * Pure — no DOM, no clock, no randomness — and free of function values, so it
 * can be cloned, serialised and rendered headlessly. That is what makes chart
 * correctness checkable at all: the thing under test is this object, not a
 * screenshot.
 */
export function buildSeriesOption(data: SeriesData, variant: RepresentationName): EChartsOption {
  const reasons = seriesRefusals(data, variant)
  if (reasons.length > 0) return refusalOption(variant, reasons)

  switch (planFor(variant).mark) {
    case 'radar':
      return radarOption(data)
    case 'parallel':
      return parallelOption(data)
    case 'stream':
      return streamOption(data)
    case 'candlestick':
      return candlestickOption(data, variant)
    default:
      return cartesianOption(data, variant)
  }
}

/**
 * Nothing drawn, and the reason said out loud.
 *
 * An empty plot with a sentence on it is the only honest output for data whose
 * invariants failed. Drawing it anyway — sorted, patched or truncated into
 * shape — would hide an author's error behind a picture that looks fine.
 */
function refusalOption(variant: RepresentationName, reasons: string[]): EChartsOption {
  return {
    aria: { enabled: true },
    title: {
      text: `No ${variant} was drawn`,
      subtext: reasons.join('\n'),
      left: 'center',
      top: 'middle',
      textAlign: 'center',
      textStyle: {
        color: tokens.color.ink,
        fontSize: scalar(tokens.type.blockTitle.size),
        fontWeight: 'normal' as const,
      },
      subtextStyle: { color: tokens.color.inkMuted, fontSize: TICK_FONT, align: 'center' as const },
    },
    series: [],
  }
}

/* -------------------------------------------------------------------------- */
/* Cartesian                                                                  */
/* -------------------------------------------------------------------------- */

type Datum = number | null | [number, number] | { value: number | [number, number]; symbolSize: number }

/**
 * One value per category, in category order.
 *
 * A category a series has no point for becomes `null`, which ECharts draws as a
 * GAP. Carrying the previous value forward, or dropping the category, would
 * invent a reading the data never made.
 */
function alignToCategories(
  points: readonly { x: number | string; y: number }[],
  cats: readonly string[],
): (number | null)[] {
  const byX = new Map<string, number>()
  for (const p of points) byX.set(String(p.x), p.y)
  return cats.map((c) => byX.get(c) ?? null)
}

/** The author's points, in the author's order. Never sorted; see the header. */
function asPairs(points: readonly { x: number | string; y: number }[]): [number, number][] {
  return points.map((p) => [Number(p.x), p.y])
}

function cartesianOption(data: SeriesData, variant: RepresentationName): EChartsOption {
  const plan = planFor(variant)
  const onValueAxis = isValueAxis(data, variant)
  const cats = onValueAxis ? null : categoryLabels(data, variant)
  const stacked = data.stacked === true || plan.stacked === true

  const largestSize = plan.mark === 'bubble' ? largestMagnitude(data) : 0

  const drawn: Record<string, unknown>[] = []
  const legendNames: string[] = []

  data.series.forEach((authored, index) => {
    const role = roleOf(authored.name, variant)
    if (role === 'size') return // it feeds the bubbles; it is not a mark of its own

    const color = seriesColor(index)
    const values: Datum[] =
      cats === null ? asPairs(authored.points) : alignToCategories(authored.points, cats)

    legendNames.push(authored.name)

    if (role === 'reference') {
      drawn.push(referenceSeries(authored.name, values, color))
      return
    }
    if (role === 'target') {
      drawn.push({
        name: authored.name,
        type: 'scatter',
        data: values,
        symbol: 'rect',
        symbolSize: TARGET_TICK,
        itemStyle: { color },
        z: 3,
      })
      return
    }
    if (role === 'fit') {
      drawn.push({
        name: authored.name,
        type: 'line',
        data: values,
        color,
        lineStyle: { color, width: THICK },
        itemStyle: { color },
        symbol: 'none',
        smooth: false,
        z: 3,
      })
      return
    }

    drawn.push(...markFor(plan, authored.name, values, color, stacked, data, largestSize, cats))
  })

  /* The definitional reference, drawn onto the first mark so it shares its
     coordinate system. There is no marks-only series to hang it on. */
  const first = drawn[0]
  if (first !== undefined) Object.assign(first, referenceMarks(plan, data, onValueAxis))
  if (plan.reference === 'diagonal' && onValueAxis) drawn.push(diagonalSeries())

  const axes = plan.axes ?? {}
  const horizontal = plan.horizontal === true
  /* On a horizontal chart the VALUE axis is x and the categories move to y, so
     the type's x name still belongs to the axis that carries the quantity. */
  const xName = axes.x
  const yName = horizontal ? undefined : axes.y

  const categoryAxis = {
    ...axisChrome(),
    type: 'category' as const,
    data: cats ?? [],
    boundaryGap: plan.mark === 'bar' || plan.mark === 'lollipop' || plan.mark === 'bullet',
    splitLine: { show: false },
  }

  const valueAxis = {
    ...axisChrome(),
    type: 'value' as const,
    /* Deliberately no `interval`, `min`, `max` or `customValues`: ECharts'
       interval scale is what keeps the ticks evenly spaced. `scale` is false
       wherever a length carries the value, so the baseline stays at zero. */
    scale: plan.zeroBaseline !== true,
    splitLine: splitLine(),
  }

  const xAxis = horizontal
    ? { ...valueAxis, ...xNamed(xName) }
    : cats === null
      ? { ...axisChrome(), type: 'value' as const, splitLine: { show: false }, scale: true, ...xNamed(xName) }
      : { ...categoryAxis, ...xNamed(xName) }

  const yAxis = horizontal
    ? { ...categoryAxis, splitLine: { show: false } }
    : { ...valueAxis, ...yNamed(yName) }

  const legend = legendChrome(legendNames)

  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: tooltipChrome(plan.mark === 'scatter' || plan.mark === 'bubble'),
    legend,
    grid: gridFor(xName, yName, legend.show),
    xAxis,
    yAxis,
    series: drawn,
  } as EChartsOption
}

/** The biggest magnitude the bubble's size series carries. */
function largestMagnitude(data: SeriesData): number {
  const sizes = data.series.filter((s) => SIZE_NAMES.has(key(s.name)))
  let largest = 0
  for (const s of sizes) for (const p of s.points) largest = Math.max(largest, Math.abs(p.y))
  return largest
}

function markFor(
  plan: Plan,
  name: string,
  values: Datum[],
  color: string,
  stacked: boolean,
  data: SeriesData,
  largestSize: number,
  cats: string[] | null,
): Record<string, unknown>[] {
  /* One stack group for the whole chart: series stack ONTO EACH OTHER, and two
     groups would be two charts sharing an axis. */
  const stack = stacked ? { stack: 'total' } : {}

  const line = {
    name,
    type: 'line' as const,
    data: values,
    color,
    itemStyle: { color },
    lineStyle: { color, width: THICK },
    symbol: plan.dense === true ? 'none' : 'circle',
    symbolSize: DOT,
    /* Never smoothed: a curve between two points asserts values nobody measured. */
    smooth: false,
    connectNulls: false,
    ...stack,
  }

  switch (plan.mark) {
    case 'line':
      return [plan.endLabels === true ? { ...line, ...endLabelling(color) } : line]

    case 'step':
      /* `end` and not `middle`: the value holds until the next reading, which is
         the claim a step chart is making. */
      return [{ ...line, step: 'end' as const }]

    case 'area':
      return [{ ...line, areaStyle: { color, opacity: FILL_OPACITY } }]

    case 'bar':
      return [
        {
          name,
          type: 'bar' as const,
          data: values,
          color,
          itemStyle: { color, borderRadius: barRadius(plan) },
          ...stack,
        },
      ]

    case 'lollipop':
      /* Two ECharts series under ONE name, so the legend shows a single entry
         and toggling it takes the stem and the dot together. */
      return [
        {
          name,
          type: 'bar' as const,
          data: values,
          color,
          barWidth: STEM_WIDTH,
          itemStyle: { color },
          silent: true,
        },
        {
          name,
          type: 'scatter' as const,
          data: values,
          symbolSize: DOT_LARGE,
          itemStyle: { color },
          z: 3,
        },
      ]

    case 'bullet':
      return [
        {
          name,
          type: 'bar' as const,
          data: values,
          color,
          barWidth: scalar(tokens.space.md),
          itemStyle: { color, borderRadius: scalar(tokens.radius.sm) },
        },
      ]

    case 'dot':
      return [{ name, type: 'scatter' as const, data: values, symbolSize: DOT_LARGE, itemStyle: { color } }]

    case 'scatter':
      return [{ name, type: 'scatter' as const, data: values, symbolSize: DOT, itemStyle: { color } }]

    case 'bubble':
      return [
        {
          name,
          type: 'scatter' as const,
          data: sizedBubbles(name, values, data, largestSize, cats),
          itemStyle: { color, opacity: MARK_OPACITY },
        },
      ]

    default:
      return [line]
  }
}

function barRadius(plan: Plan): number[] {
  const r = scalar(tokens.radius.sm)
  return plan.horizontal === true ? [0, r, r, 0] : [r, r, 0, 0]
}

/**
 * Each point carries its own size, so the option stays plain data — a
 * `symbolSize` callback would be a function value and the option would stop
 * being clonable, serialisable and testable.
 */
function sizedBubbles(
  name: string,
  values: Datum[],
  data: SeriesData,
  largestSize: number,
  cats: string[] | null,
): Datum[] {
  const magnitudes = data.series.filter((s) => SIZE_NAMES.has(key(s.name)))
  const byX = new Map<string, number>()
  for (const s of magnitudes) for (const p of s.points) byX.set(String(p.x), Math.abs(p.y))

  /* No size series: a bubble chart with nothing to size by is a scatter, and
     drawing every dot the same size says exactly that. */
  if (byX.size === 0) return values

  const source = data.series.find((s) => s.name === name)?.points ?? []
  const xAt = (i: number): string =>
    cats === null ? String(source[i]?.x ?? '') : (cats[i] ?? '')

  return values.map((value, i) => {
    if (value === null) return null
    const magnitude = byX.get(xAt(i)) ?? 0
    const plain = value as number | [number, number]
    return { value: plain, symbolSize: bubbleSize(magnitude, largestSize) }
  })
}

/** Both ends of a slope labelled, because a slope has exactly two readings. */
function endLabelling(color: string) {
  return {
    label: {
      show: true,
      position: 'top' as const,
      distance: scalar(tokens.space.xs),
      color: tokens.color.inkMuted,
      fontSize: TICK_FONT,
      /* `{c}` is the datum's own value; a template rather than pasted text keeps
         a label containing a brace from being read as markup. */
      formatter: '{c}',
    },
    endLabel: {
      show: true,
      distance: scalar(tokens.space.sm),
      color,
      fontSize: TICK_FONT,
      formatter: '{a}',
    },
  }
}

/**
 * An author-supplied reference: a target, a control limit, an ideal burn-down.
 *
 * Dashed and symbol-free so it cannot be mistaken for a measurement, but still
 * in ITS OWN palette colour — it is a series the author wrote, and recolouring
 * it would be the renderer overruling them.
 */
function referenceSeries(name: string, values: Datum[], color: string): Record<string, unknown> {
  return {
    name,
    type: 'line',
    data: values,
    color,
    itemStyle: { color },
    lineStyle: { color, width: THIN, type: 'dashed' },
    symbol: 'none',
    smooth: false,
    connectNulls: true,
    z: 2,
  }
}

/**
 * The one reference the renderer is allowed to invent: y = x on [0, 1].
 *
 * A ROC curve's diagonal is "no better than chance" and a calibration plot's is
 * "perfectly calibrated". Neither depends on the data; both are the definition
 * of the chart, and omitting the calibration one leaves the plot meaningless.
 * Drawn in `inkFaint`, off the palette and out of the legend, so it reads as
 * chrome rather than as a fifth series someone measured.
 */
function diagonalSeries(): Record<string, unknown> {
  return {
    name: '',
    type: 'line',
    data: [
      [0, 0],
      [1, 1],
    ],
    lineStyle: { color: tokens.color.inkFaint, width: HAIR, type: 'dashed' },
    symbol: 'none',
    smooth: false,
    silent: true,
    z: 1,
    tooltip: { show: false },
  }
}

/**
 * Marks the TYPE defines, hung on the first drawn series so they share its axes.
 *
 * `zero` is a residual plot's zero line — the line the residuals are residuals
 * FROM. `quadrants` splits an impact/effort plot at the MIDPOINT OF THE OBSERVED
 * RANGE and says so here, because any other split would be a threshold nobody
 * set being drawn as if somebody had.
 */
function referenceMarks(plan: Plan, data: SeriesData, onValueAxis: boolean) {
  const chrome = {
    symbol: 'none',
    silent: true,
    lineStyle: { color: tokens.color.inkFaint, width: HAIR, type: 'dashed' as const },
    label: { show: false },
  }

  if (plan.reference === 'zero') return { markLine: { ...chrome, data: [{ yAxis: 0 }] } }

  if (plan.reference === 'quadrants') {
    const ys = data.series.flatMap((s) => s.points.map((p) => p.y))
    const marks: Record<string, number>[] = [{ yAxis: midpoint(ys) }]
    if (onValueAxis) {
      const xs = data.series.flatMap((s) => s.points.map((p) => Number(p.x)))
      marks.push({ xAxis: midpoint(xs) })
    }
    return { markLine: { ...chrome, data: marks } }
  }

  return {}
}

function midpoint(values: number[]): number {
  if (values.length === 0) return 0
  return (Math.min(...values) + Math.max(...values)) / 2
}

/* -------------------------------------------------------------------------- */
/* Candlestick                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Four authored series collapse into ONE mark, because a candle is one claim
 * about one instrument at one time. `seriesRefusals` has already established
 * that all four exist and that each high contains its open and close.
 *
 * Direction is shown by FILL, not by a second hue: a rising candle is hollow and
 * a falling one is solid, both outlined in the same palette colour. That costs
 * one palette entry instead of two and does not ask the reader to remember which
 * colour meant "up".
 */
function candlestickOption(data: SeriesData, variant: RepresentationName): EChartsOption {
  const cats = categoryLabels(data, variant)
  const at = (name: string, x: string): number =>
    seriesNamed(data, name)?.points.find((p) => String(p.x) === x)?.y ?? 0

  /* The close is the price a candle is about, so its index picks the colour. */
  const closeIndex = data.series.findIndex((s) => key(s.name) === CLOSE)
  const color = seriesColor(closeIndex < 0 ? 0 : closeIndex)

  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: tooltipChrome(false),
    legend: legendChrome([]),
    grid: gridFor(undefined, undefined, false),
    xAxis: {
      ...axisChrome(),
      type: 'category',
      data: cats,
      boundaryGap: true,
      splitLine: { show: false },
    },
    yAxis: { ...axisChrome(), type: 'value', scale: true, splitLine: splitLine() },
    series: [
      {
        type: 'candlestick',
        /* ECharts reads [open, close, low, high], in that order. */
        data: cats.map((x) => [at(OPEN, x), at(CLOSE, x), at(LOW, x), at(HIGH, x)]),
        itemStyle: {
          color: tokens.color.void,
          color0: color,
          borderColor: color,
          borderColor0: color,
          borderWidth: THIN,
        },
      },
    ],
  } as EChartsOption
}

/* -------------------------------------------------------------------------- */
/* Radar                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * No `indicator.max` is supplied, for the same reason no axis gets an
 * `interval`: a max typed here is a tick decision made by hand, and ECharts'
 * scale already picks evenly spaced rings.
 */
function radarOption(data: SeriesData): EChartsOption {
  const axes = xValues(data).map(String)
  const names = data.series.map((s) => s.name)

  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: tooltipChrome(true),
    legend: legendChrome(names),
    radar: {
      indicator: axes.map((name) => ({ name })),
      center: ['50%', '58%'],
      radius: '62%',
      axisName: { color: tokens.color.inkMuted, fontSize: TICK_FONT },
      axisLine: { lineStyle: { color: tokens.color.inkFaint, width: HAIR } },
      splitLine: { lineStyle: { color: tokens.color.surfaceLift, width: HAIR } },
      splitArea: { show: false },
    },
    series: [
      {
        type: 'radar',
        symbolSize: DOT,
        data: data.series.map((s, index) => {
          const color = seriesColor(index)
          return {
            name: s.name,
            value: axes.map((a) => s.points.find((p) => String(p.x) === a)?.y ?? null),
            itemStyle: { color },
            lineStyle: { color, width: THICK },
            areaStyle: { color, opacity: FILL_OPACITY },
          }
        }),
      },
    ],
  } as EChartsOption
}

/* -------------------------------------------------------------------------- */
/* Parallel coordinates                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Each x becomes an AXIS and each series becomes a line across all of them.
 *
 * The axis order is the author's order and is never rearranged: which
 * relationships are visible in a parallel-coordinates plot depends entirely on
 * which axes end up adjacent, so reordering them would change the finding.
 */
function parallelOption(data: SeriesData): EChartsOption {
  const dims = xValues(data).map(String)
  const names = data.series.map((s) => s.name)
  const chrome = axisChrome()

  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: tooltipChrome(true),
    legend: legendChrome(names),
    parallelAxis: dims.map((name, dim) => ({ dim, name, ...chrome })),
    parallel: {
      left: scalar(tokens.space.xxl),
      right: scalar(tokens.space.xxl),
      top: scalar(tokens.space.xxxl),
      bottom: scalar(tokens.space.xl),
      parallelAxisDefault: chrome,
    },
    series: data.series.map((s, index) => ({
      name: s.name,
      type: 'parallel' as const,
      lineStyle: { color: seriesColor(index), width: THIN, opacity: MARK_OPACITY },
      data: [dims.map((d) => s.points.find((p) => String(p.x) === d)?.y ?? null)],
    })),
  } as EChartsOption
}

/* -------------------------------------------------------------------------- */
/* Streamgraph                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A streamgraph is a stack on a WIGGLE baseline, and the wiggle is the whole
 * difference: it is what lets the middle bands keep their shape instead of being
 * bent by everything under them.
 *
 * ECharts has no wiggle option on a stacked line, so this uses `themeRiver`,
 * which is that chart. It brings its own `singleAxis` rather than a grid — and
 * that axis gets the same treatment as every other: no interval, no min, no max.
 */
function streamOption(data: SeriesData): EChartsOption {
  const numeric = allNumericX(data)
  const names = data.series.map((s) => s.name)
  const cats = xValues(data).map(String)

  const rows = data.series.flatMap((s) =>
    s.points.map((p) => [numeric ? Number(p.x) : String(p.x), p.y, s.name]),
  )

  return {
    color: data.series.map((_, index) => seriesColor(index)),
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: tooltipChrome(true),
    legend: legendChrome(names),
    singleAxis: {
      type: numeric ? ('value' as const) : ('category' as const),
      ...(numeric ? {} : { data: cats }),
      top: scalar(tokens.space.xxl),
      bottom: scalar(tokens.space.xxl),
      left: scalar(tokens.space.xxl),
      right: scalar(tokens.space.xl),
      ...axisChrome(),
      splitLine: { show: false },
    },
    series: [
      {
        type: 'themeRiver',
        data: rows,
        /* Band labels are suppressed: a name written along a band that changes
           thickness is the part that gets clipped first. The legend carries them. */
        label: { show: false },
        emphasis: { itemStyle: { borderColor: tokens.color.void, borderWidth: HAIR } },
      },
    ],
  } as EChartsOption
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `.lc-chart` gives the plot its width and its `aspect-ratio`, so the box has a
 * real height on the very first paint. `echarts-for-react` otherwise falls back
 * to its own default height, which is a pixel number this file is not allowed to
 * write and would not want to.
 *
 * When the data fails its invariants nothing is drawn at all — the reasons are
 * written out as text instead, where a screen reader can reach them and where
 * they cannot be mistaken for a chart that merely looks empty.
 */
export function SeriesShape({ data, variant }: { data: SeriesData; variant: RepresentationName }) {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReactECharts | null>(null)

  /**
   * The classic failure is a chart measured while its container is still 0 wide,
   * which then never recovers. Two things prevent it: the aspect-ratio box
   * above, so the height is never zero, and this observer, which fires once the
   * moment it starts observing and again on every later change.
   */
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
  }, [])

  const reasons = seriesRefusals(data, variant)
  if (reasons.length > 0)
    return (
      <p className="lc-caption" role="note">
        {`No ${variant} was drawn. ${reasons.join('. ')}.`}
      </p>
    )

  return (
    <div className="lc-chart" ref={plotRef}>
      <ReactECharts
        echarts={echarts}
        ref={chartRef}
        option={buildSeriesOption(data, variant)}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'svg' }}
        /* The option's SHAPE changes with the variant; merging would leave a
           radar's indicators behind when a bar replaced it. */
        notMerge
        /* `lazyUpdate` is deliberately OFF: it defers the first draw to a
           `requestAnimationFrame`, and a chart whose container is hidden then
           holds an empty SVG until frames resume. */
        autoResize
      />
    </div>
  )
}
