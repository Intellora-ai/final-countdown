import { useEffect, useRef } from 'react'
import ReactECharts, { echarts } from '../echarts'
import type { EChartsOption } from 'echarts'

import { tokens } from '../../design/tokens'
import {
  checkDistribution,
  type DistributionData,
  type ShapeIssue,
} from '../../spec/shapeInvariants'

/**
 * The distribution shape: raw samples per group, summarised by the chart.
 *
 * histogram · boxPlot · violin · density · strip · beeswarm · ridgeline ·
 * quantile · qqPlot · populationPyramid · shapSummary
 *
 * THE AUTHOR GIVES SAMPLES. EVERY SUMMARY BELOW IS DERIVED HERE.
 * -------------------------------------------------------------
 * That is deliberate: a chart handed pre-computed quartiles cannot tell whether
 * they were computed the same way as the ones in the chart beside it, and an
 * author who supplies a median can supply the wrong one. Samples in, summary
 * out, one definition of a quantile for the whole canvas.
 *
 * A SMOOTH IS AN ESTIMATE, AND THE PARAMETER IS PART OF THE ANSWER
 * ----------------------------------------------------------------
 * Bin width decides how many modes a histogram appears to have; bandwidth
 * decides how many bumps a density has. Change either and the picture changes
 * while the data does not. So neither is ever silently chosen: when the author
 * states one it is used, when they do not one is derived (Freedman–Diaconis,
 * Silverman) and PRINTED ON THE CHART, not merely returned. A reader who cannot
 * see the parameter cannot tell the shape of the data from the shape of the
 * choice.
 *
 * A HIDDEN OUTLIER IS A DELETED DATA POINT
 * ----------------------------------------
 * The box's whiskers stop at the last sample inside Tukey's fences — they are
 * not the minimum and maximum. Everything beyond them is drawn as an individual
 * point. Clipping the whisker at the fence and drawing nothing past it is how a
 * chart quietly removes the observation that mattered most.
 */

/* -------------------------------------------------------------------------- */
/* Tokens -> ECharts                                                          */
/* -------------------------------------------------------------------------- */

function scalar(length: string): number {
  return Number.parseFloat(length)
}

const TICK_FONT = scalar(tokens.type.caption.size)
const NAME_FONT = scalar(tokens.type.label.size)
const HAIR = scalar(tokens.stroke.hair)

export function groupColor(index: number): string {
  const palette: readonly string[] = tokens.series
  const wrapped = ((Math.trunc(index) % palette.length) + palette.length) % palette.length
  return palette[wrapped] ?? tokens.color.accent
}

/** Points on the density grid. Enough for a smooth line, few enough to read. */
const GRID_POINTS = 96
/** How far past the data a kernel estimate is allowed to claim, in bandwidths. */
const TAIL_REACH = 3

/* -------------------------------------------------------------------------- */
/* Summary statistics — one definition, used everywhere                       */
/* -------------------------------------------------------------------------- */

export function sortedCopy(samples: readonly number[]): number[] {
  return [...samples].sort((a, b) => a - b)
}

export function mean(samples: readonly number[]): number {
  if (samples.length === 0) return 0
  return samples.reduce((n, s) => n + s, 0) / samples.length
}

export function stdDev(samples: readonly number[]): number {
  if (samples.length < 2) return 0
  const m = mean(samples)
  const variance = samples.reduce((n, s) => n + (s - m) ** 2, 0) / (samples.length - 1)
  return Math.sqrt(variance)
}

/**
 * The p-th quantile by linear interpolation between order statistics — R's
 * type 7, which is also numpy's and d3's default.
 *
 * Named and fixed on purpose: nine definitions are in common use and they
 * disagree, so two charts using different ones would disagree about the same
 * data while both claiming "the median".
 */
export function quantileAt(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  if (sorted.length === 1) return sorted[0] ?? Number.NaN

  const h = (sorted.length - 1) * clamp01(p)
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  const low = sorted[lo] ?? Number.NaN
  const high = sorted[hi] ?? low
  return low + (h - lo) * (high - low)
}

export interface FiveNumber {
  name: string
  q1: number
  median: number
  q3: number
  iqr: number
  lowerFence: number
  upperFence: number
  /** The last sample INSIDE the fence — not the minimum. */
  whiskerLow: number
  whiskerHigh: number
  /** Everything outside the fences, sorted. Drawn, never clipped. */
  outliers: number[]
  count: number
}

/**
 * Tukey's five numbers, with the whiskers stopping at real observations.
 *
 * A whisker drawn to the fence itself would claim a value nobody measured; a
 * whisker drawn to the extreme would hide that the extreme is unusual. Both are
 * wrong, and both are common.
 */
export function fiveNumber(name: string, samples: readonly number[]): FiveNumber {
  const sorted = sortedCopy(samples)
  const q1 = quantileAt(sorted, 0.25)
  const median = quantileAt(sorted, 0.5)
  const q3 = quantileAt(sorted, 0.75)
  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr

  const inside = sorted.filter((s) => s >= lowerFence && s <= upperFence)
  const outliers = sorted.filter((s) => s < lowerFence || s > upperFence)

  return {
    name,
    q1,
    median,
    q3,
    iqr,
    lowerFence,
    upperFence,
    whiskerLow: inside[0] ?? sorted[0] ?? Number.NaN,
    whiskerHigh: inside[inside.length - 1] ?? sorted[sorted.length - 1] ?? Number.NaN,
    outliers,
    count: sorted.length,
  }
}

/* -------------------------------------------------------------------------- */
/* Binning and smoothing — the parameters that change the answer              */
/* -------------------------------------------------------------------------- */

/** 1, 2 or 5 times a power of ten. A bin edge a reader can hold in their head. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const scaled = raw / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

/** Freedman–Diaconis: 2·IQR·n^(-1/3), rounded to a readable step. */
export function freedmanDiaconis(samples: readonly number[]): number {
  const sorted = sortedCopy(samples)
  const iqr = quantileAt(sorted, 0.75) - quantileAt(sorted, 0.25)
  const spread = (sorted[sorted.length - 1] ?? 0) - (sorted[0] ?? 0)
  const raw = iqr > 0 ? 2 * iqr * samples.length ** (-1 / 3) : spread / Math.max(1, Math.sqrt(samples.length))
  return niceStep(raw > 0 ? raw : 1)
}

/** Silverman's rule of thumb. Stated as the estimate it is, never hidden. */
export function silverman(samples: readonly number[]): number {
  const sorted = sortedCopy(samples)
  const iqr = quantileAt(sorted, 0.75) - quantileAt(sorted, 0.25)
  const sd = stdDev(samples)
  const spread = Math.min(sd > 0 ? sd : Number.POSITIVE_INFINITY, iqr > 0 ? iqr / 1.34 : Number.POSITIVE_INFINITY)
  if (!Number.isFinite(spread) || spread <= 0) return 1
  const h = 0.9 * spread * samples.length ** (-1 / 5)
  /* Rounded to the same three places the chart PRINTS it at. A returned value
     that differs from the printed one in the fourth decimal is a reader being
     told a number the curve was not drawn with. */
  return h > 0 ? round(h, 3) : 1
}

export interface Bin {
  lo: number
  hi: number
  label: string
}

/**
 * Bin edges anchored to a multiple of the width.
 *
 * Anchoring at the minimum instead would move every edge when one sample
 * changes, so two groups binned separately would not line up and the comparison
 * the chart exists for would be between differently-shaped bins.
 */
export function binEdges(samples: readonly number[], binWidth: number): Bin[] {
  const width = binWidth > 0 && Number.isFinite(binWidth) ? binWidth : 1
  const sorted = sortedCopy(samples)
  const lo = sorted[0] ?? 0
  const hi = sorted[sorted.length - 1] ?? lo
  const start = Math.floor(lo / width) * width
  const count = Math.max(1, Math.ceil((hi - start) / width) || 1)

  return Array.from({ length: count }, (_, i) => {
    const from = round(start + i * width, 6)
    const to = round(start + (i + 1) * width, 6)
    return { lo: from, hi: to, label: `${num(from)}–${num(to)}` }
  })
}

/** Counts per bin. The last bin is closed, so the maximum is never dropped. */
export function binCounts(samples: readonly number[], bins: readonly Bin[]): number[] {
  return bins.map((bin, i) => {
    const last = i === bins.length - 1
    return samples.filter((s) => s >= bin.lo && (last ? s <= bin.hi : s < bin.hi)).length
  })
}

export interface DensityPoint {
  x: number
  y: number
}

/**
 * A Gaussian kernel density estimate on a fixed grid.
 *
 * The grid reaches three bandwidths past the data and no further: a kernel has
 * infinite support, and a curve drawn out to where it is numerically zero
 * invites the reader to believe the sample said something about that region.
 */
export function densityCurve(
  samples: readonly number[],
  bandwidth: number,
  gridPoints: number = GRID_POINTS,
): DensityPoint[] {
  const h = bandwidth > 0 && Number.isFinite(bandwidth) ? bandwidth : 1
  const sorted = sortedCopy(samples)
  const lo = (sorted[0] ?? 0) - TAIL_REACH * h
  const hi = (sorted[sorted.length - 1] ?? 0) + TAIL_REACH * h
  const span = hi - lo
  const n = Math.max(2, Math.trunc(gridPoints))

  return Array.from({ length: n }, (_, i) => {
    const x = lo + (span * i) / (n - 1)
    const y =
      samples.length === 0
        ? 0
        : samples.reduce((sum, s) => sum + gaussian((x - s) / h), 0) / (samples.length * h)
    return { x: round(x, 6), y: round(y, 8) }
  })
}

function gaussian(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
}

/**
 * The inverse standard normal CDF (Acklam's rational approximation).
 *
 * A q-q plot needs theoretical quantiles, and a table lookup or a random draw
 * would make the same data plot differently on two runs. This is a closed form:
 * same p, same z, always.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0) || !(p < 1)) return p <= 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]

  const low = 0.02425
  const at = (list: number[], i: number): number => list[i] ?? 0

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (
      ((((((at(c, 0) * q + at(c, 1)) * q + at(c, 2)) * q + at(c, 3)) * q + at(c, 4)) * q + at(c, 5))) /
      ((((at(d, 0) * q + at(d, 1)) * q + at(d, 2)) * q + at(d, 3)) * q + 1)
    )
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return (
      -((((((at(c, 0) * q + at(c, 1)) * q + at(c, 2)) * q + at(c, 3)) * q + at(c, 4)) * q + at(c, 5))) /
      ((((at(d, 0) * q + at(d, 1)) * q + at(d, 2)) * q + at(d, 3)) * q + 1)
    )
  }

  const q = p - 0.5
  const r = q * q
  return (
    ((((((at(a, 0) * r + at(a, 1)) * r + at(a, 2)) * r + at(a, 3)) * r + at(a, 4)) * r + at(a, 5)) * q) /
    (((((at(b, 0) * r + at(b, 1)) * r + at(b, 2)) * r + at(b, 3)) * r + at(b, 4)) * r + 1)
  )
}

/**
 * Beeswarm offsets, computed rather than jittered.
 *
 * Random jitter moves every point on every render, so two screenshots of the
 * same data disagree and a reader cannot tell a dense region from a lucky
 * scatter. Here the samples are sorted, bucketed by position, and laid out
 * alternately either side of the centre — a fixed rule, so the swarm is the
 * same shape every time.
 */
export function beeswarmOffsets(samples: readonly number[], buckets = 40): DensityPoint[] {
  const sorted = sortedCopy(samples)
  const lo = sorted[0] ?? 0
  const hi = sorted[sorted.length - 1] ?? lo
  const span = hi - lo

  const seen = new Map<number, number>()
  return sorted.map((value) => {
    const bucket = span === 0 ? 0 : Math.min(buckets - 1, Math.floor(((value - lo) / span) * buckets))
    const rank = seen.get(bucket) ?? 0
    seen.set(bucket, rank + 1)
    /* 0, +1, -1, +2, -2 … — the centre first, then out in pairs. */
    const step = Math.ceil(rank / 2)
    const sign = rank % 2 === 1 ? 1 : -1
    return { x: value, y: rank === 0 ? 0 : sign * step }
  })
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface DistributionChart {
  ok: true
  variant: DistributionData['variant']
  option: EChartsOption
  /** The parameter actually used, whether the author stated it or not. */
  binWidth: number | null
  bandwidth: number | null
  /** How the parameter was arrived at. Printed on the chart. */
  estimateNote: string | null
  summaries: FiveNumber[] | null
  /** Every sample outside the fences, by group. Drawn, never clipped. */
  outliers: { group: string; value: number }[]
  /** Group order as drawn. Fixed, so the chart does not reshuffle. */
  order: string[]
  caption: string
  warnings: string[]
}

export interface DistributionRefusal {
  ok: false
  variant: DistributionData['variant']
  problems: ShapeIssue[]
  warnings: string[]
}

export type DistributionResult = DistributionChart | DistributionRefusal

export function buildDistribution(data: DistributionData, at = 'distribution'): DistributionResult {
  const issues = checkDistribution(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  /* SHAP orders features by how much they move the prediction. Ties keep the
     author's order, so the ranking is stable rather than merely sorted. */
  const groups =
    data.variant === 'shapSummary'
      ? data.groups
          .map((g, i) => ({ g, i, weight: mean(g.samples.map(Math.abs)) }))
          .sort((a, b) => b.weight - a.weight || a.i - b.i)
          .map((entry) => entry.g)
      : data.groups

  const allSamples = groups.flatMap((g) => g.samples)
  const summaries = groups.map((g) => fiveNumber(g.name, g.samples))
  const outliers = summaries.flatMap((s) => s.outliers.map((value) => ({ group: s.name, value })))

  const needsBins = data.variant === 'histogram' || data.variant === 'populationPyramid'
  const needsSmooth =
    data.variant === 'violin' || data.variant === 'density' || data.variant === 'ridgeline'

  const binWidth = needsBins ? (data.binWidth ?? freedmanDiaconis(allSamples)) : null
  const bandwidth = needsSmooth ? (data.bandwidth ?? silverman(allSamples)) : null

  const estimateNote =
    binWidth !== null
      ? `bin width ${num(binWidth)}${data.binWidth === undefined ? ' (Freedman–Diaconis)' : ' (stated)'}`
      : bandwidth !== null
        ? `bandwidth h = ${num(bandwidth)}${data.bandwidth === undefined ? ' (Silverman)' : ' (stated)'}; the curve is an estimate, not the data`
        : data.variant === 'qqPlot'
          ? 'reference distribution: standard normal'
          : null

  const option = optionFor(data.variant, groups, {
    binWidth,
    bandwidth,
    summaries,
    estimateNote,
  })

  return {
    ok: true,
    variant: data.variant,
    option,
    binWidth,
    bandwidth,
    estimateNote,
    summaries: data.variant === 'boxPlot' ? summaries : null,
    outliers,
    order: groups.map((g) => g.name),
    caption: caption(data.variant, groups.length, estimateNote, outliers.length),
    warnings,
  }
}

interface Derived {
  binWidth: number | null
  bandwidth: number | null
  summaries: FiveNumber[]
  estimateNote: string | null
}

type Group = DistributionData['groups'][number]

function optionFor(
  variant: DistributionData['variant'],
  groups: readonly Group[],
  derived: Derived,
): EChartsOption {
  switch (variant) {
    case 'histogram':
      return histogramOption(groups, derived)
    case 'populationPyramid':
      return pyramidOption(groups, derived)
    case 'boxPlot':
      return boxPlotOption(groups, derived)
    case 'density':
      return densityOption(groups, derived)
    case 'violin':
      return violinOption(groups, derived, true)
    case 'ridgeline':
      return violinOption(groups, derived, false)
    case 'quantile':
      return quantileOption(groups, derived)
    case 'qqPlot':
      return qqOption(groups, derived)
    default:
      /* strip, beeswarm and shapSummary are the same picture with different
         offsets: no offset, a computed swarm, and a swarm ranked by influence. */
      return swarmOption(groups, derived, variant === 'strip' ? 'none' : 'swarm')
  }
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
    splitLine: { show: false },
  }
}

/** The axis a group index sits on. Nameless on purpose — the legend names them. */
function groupAxis() {
  return {
    type: 'value' as const,
    axisLabel: { show: false },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
  }
}

function frame(derived: Derived) {
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
      top: 0,
      right: 0,
    },
    /*
     * THE ESTIMATE'S PARAMETER, ON THE CHART.
     * A density curve without its bandwidth is a shape the reader cannot argue
     * with. Returning it from the builder is not enough — it has to be visible
     * beside the curve it produced.
     */
    ...(derived.estimateNote === null
      ? {}
      : {
          title: {
            text: derived.estimateNote,
            left: 0,
            bottom: 0,
            textStyle: {
              color: tokens.color.inkFaint,
              fontSize: TICK_FONT,
              fontWeight: 'normal' as const,
            },
          },
        }),
    grid: {
      left: scalar(tokens.space.sm),
      right: scalar(tokens.space.lg),
      top: scalar(tokens.space.xxl),
      bottom: scalar(tokens.space.xxl),
      containLabel: true,
    },
  }
}

function valueAxis(name: string) {
  return {
    ...axisChrome(),
    type: 'value' as const,
    name,
    nameLocation: 'middle' as const,
    nameGap: scalar(tokens.space.xl),
    scale: true,
  }
}

/* -------------------------------------------------------------------------- */
/* One option per family                                                      */
/* -------------------------------------------------------------------------- */

function histogramOption(groups: readonly Group[], derived: Derived): EChartsOption {
  const width = derived.binWidth ?? 1
  const bins = binEdges(groups.flatMap((g) => g.samples), width)

  return {
    ...frame(derived),
    xAxis: {
      ...axisChrome(),
      type: 'category',
      data: bins.map((b) => b.label),
      name: 'value',
      nameLocation: 'middle',
      nameGap: scalar(tokens.space.xl),
      /* Bars touch. A histogram drawn with gaps looks like a bar chart of
         categories, and the reader stops reading the x axis as continuous. */
      boundaryGap: true,
    },
    yAxis: {
      ...axisChrome(),
      type: 'value',
      name: 'count',
      splitLine: { show: true, lineStyle: { color: tokens.color.surfaceLift, width: HAIR } },
    },
    series: groups.map((group, i) => ({
      type: 'bar' as const,
      name: group.name,
      barCategoryGap: '0%',
      itemStyle: { color: groupColor(i), borderColor: tokens.color.void, borderWidth: HAIR },
      data: binCounts(group.samples, bins),
    })),
  }
}

/**
 * A population pyramid as two grids back to back.
 *
 * The usual trick is to negate one side, which puts "-4,000 people" on the
 * axis. Two grids with the left one reversed shows the same comparison and
 * every count stays a count.
 */
function pyramidOption(groups: readonly Group[], derived: Derived): EChartsOption {
  const width = derived.binWidth ?? 1
  const bins = binEdges(groups.flatMap((g) => g.samples), width)
  const labels = bins.map((b) => b.label)
  const left = groups[0]
  const right = groups[1]

  return {
    ...frame(derived),
    grid: [
      { left: '2%', right: '54%', top: scalar(tokens.space.xxl), bottom: scalar(tokens.space.xxl), containLabel: true },
      { left: '54%', right: '2%', top: scalar(tokens.space.xxl), bottom: scalar(tokens.space.xxl), containLabel: true },
    ],
    xAxis: [
      { ...axisChrome(), type: 'value', gridIndex: 0, inverse: true, name: left?.name ?? '', nameLocation: 'middle', nameGap: scalar(tokens.space.xl) },
      { ...axisChrome(), type: 'value', gridIndex: 1, name: right?.name ?? '', nameLocation: 'middle', nameGap: scalar(tokens.space.xl) },
    ],
    yAxis: [
      { ...axisChrome(), type: 'category', gridIndex: 0, data: labels, position: 'right', axisLabel: { show: false } },
      { ...axisChrome(), type: 'category', gridIndex: 1, data: labels, axisLabel: { ...axisChrome().axisLabel, show: true } },
    ],
    series: [
      {
        type: 'bar' as const,
        name: left?.name ?? '',
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: { color: groupColor(0) },
        data: binCounts(left?.samples ?? [], bins),
      },
      {
        type: 'bar' as const,
        name: right?.name ?? '',
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: { color: groupColor(1) },
        data: binCounts(right?.samples ?? [], bins),
      },
    ],
  }
}

/**
 * The box, plus every point outside the fences.
 *
 * The boxplot series carries the WHISKERS, not the extremes, and the scatter
 * beside it carries the outliers. Drop the scatter and the chart has silently
 * deleted its most interesting observations.
 */
function boxPlotOption(groups: readonly Group[], derived: Derived): EChartsOption {
  const summaries = derived.summaries

  return {
    ...frame(derived),
    legend: { ...frame(derived).legend, show: false },
    xAxis: {
      ...axisChrome(),
      type: 'category',
      data: groups.map((g) => g.name),
    },
    yAxis: {
      ...axisChrome(),
      type: 'value',
      scale: true,
      splitLine: { show: true, lineStyle: { color: tokens.color.surfaceLift, width: HAIR } },
    },
    series: [
      {
        type: 'boxplot' as const,
        name: 'box',
        itemStyle: { color: tokens.color.surfaceLift, borderColor: tokens.color.accent, borderWidth: HAIR },
        data: summaries.map((s) => [s.whiskerLow, s.q1, s.median, s.q3, s.whiskerHigh]),
      },
      {
        type: 'scatter' as const,
        name: 'outliers',
        symbolSize: tokens.arrow.head,
        itemStyle: { color: tokens.color.warning },
        data: summaries.flatMap((s, i) => s.outliers.map((value) => [i, value])),
      },
    ],
  }
}

function densityOption(groups: readonly Group[], derived: Derived): EChartsOption {
  const h = derived.bandwidth ?? 1
  return {
    ...frame(derived),
    xAxis: valueAxis('value'),
    yAxis: { ...axisChrome(), type: 'value', name: 'density', scale: false },
    series: groups.map((group, i) => ({
      type: 'line' as const,
      name: group.name,
      smooth: false,
      symbol: 'none' as const,
      lineStyle: { color: groupColor(i), width: scalar(tokens.stroke.thin) },
      itemStyle: { color: groupColor(i) },
      areaStyle: { color: groupColor(i), opacity: 0.16 },
      data: densityCurve(group.samples, h).map((p) => [p.x, p.y]),
    })),
  }
}

/**
 * Violin and ridgeline: the same estimate, offset differently.
 *
 * Both are drawn as OUTLINES rather than fills, which is the canvas's grammar
 * (glow, never fill) and also the honest choice — a filled shape reads as a
 * measured area, and a kernel estimate is not one.
 */
function violinOption(groups: readonly Group[], derived: Derived, mirrored: boolean): EChartsOption {
  const h = derived.bandwidth ?? 1
  const curves = groups.map((g) => densityCurve(g.samples, h))
  const peak = curves.reduce((n, curve) => Math.max(n, ...curve.map((p) => p.y)), 0) || 1
  /* One unit per group, so the baselines are evenly spaced whatever the data. */
  const reach = mirrored ? 0.42 : 0.9

  const series = groups.flatMap((group, i) => {
    const curve = curves[i] ?? []
    const base = i
    const upper = curve.map((p) => [p.x, base + (p.y / peak) * reach])
    const shape = {
      type: 'line' as const,
      smooth: false,
      symbol: 'none' as const,
      lineStyle: { color: groupColor(i), width: scalar(tokens.stroke.thin) },
      itemStyle: { color: groupColor(i) },
    }
    const top = { ...shape, name: group.name, data: upper }
    if (!mirrored) return [top]
    return [
      top,
      {
        ...shape,
        name: `${group.name} (mirror)`,
        data: curve.map((p) => [p.x, base - (p.y / peak) * reach]),
      },
    ]
  })

  return {
    ...frame(derived),
    xAxis: valueAxis('value'),
    yAxis: { ...groupAxis(), min: -1, max: groups.length },
    series,
  }
}

function quantileOption(groups: readonly Group[], derived: Derived): EChartsOption {
  return {
    ...frame(derived),
    xAxis: { ...axisChrome(), type: 'value', name: 'quantile', nameLocation: 'middle', nameGap: scalar(tokens.space.xl), min: 0, max: 1 },
    yAxis: { ...axisChrome(), type: 'value', name: 'value', scale: true },
    series: groups.map((group, i) => {
      const sorted = sortedCopy(group.samples)
      return {
        type: 'line' as const,
        name: group.name,
        smooth: false,
        symbol: 'none' as const,
        lineStyle: { color: groupColor(i), width: scalar(tokens.stroke.thin) },
        itemStyle: { color: groupColor(i) },
        /* Hazen positions: (i + 0.5)/n, so neither end claims probability 0 or 1
           from a finite sample. */
        data: sorted.map((value, k) => [round((k + 0.5) / sorted.length, 6), value]),
      }
    }),
  }
}

/**
 * A q-q plot against the standard normal, with the reference line through the
 * quartiles — and the distribution NAMED, because a q-q plot against an unnamed
 * reference says nothing at all.
 */
function qqOption(groups: readonly Group[], derived: Derived): EChartsOption {
  const series = groups.flatMap((group, i) => {
    const sorted = sortedCopy(group.samples)
    const pairs = sorted.map((value, k) => [
      round(normalQuantile((k + 0.5) / sorted.length), 6),
      value,
    ])

    /* The reference is the line through the first and third quartiles of both
       the sample and the reference distribution — not y = x, which would only
       be right for an already-standardised sample. */
    const sq1 = quantileAt(sorted, 0.25)
    const sq3 = quantileAt(sorted, 0.75)
    const tq1 = normalQuantile(0.25)
    const tq3 = normalQuantile(0.75)
    const slope = tq3 - tq1 === 0 ? 0 : (sq3 - sq1) / (tq3 - tq1)
    const intercept = sq1 - slope * tq1
    const ends = [-3, 3].map((z) => [z, round(intercept + slope * z, 6)])

    return [
      {
        type: 'scatter' as const,
        name: group.name,
        symbolSize: tokens.arrow.head,
        itemStyle: { color: groupColor(i) },
        data: pairs,
      },
      {
        type: 'line' as const,
        name: `${group.name} · normal reference`,
        smooth: false,
        symbol: 'none' as const,
        lineStyle: { color: tokens.color.inkFaint, width: HAIR, type: 'dashed' as const },
        itemStyle: { color: tokens.color.inkFaint },
        data: ends,
      },
    ]
  })

  return {
    ...frame(derived),
    xAxis: valueAxis('theoretical quantile (standard normal)'),
    yAxis: { ...axisChrome(), type: 'value', name: 'sample quantile', scale: true },
    series,
  }
}

/** Strip, beeswarm and SHAP summary: points at their value, offsets computed. */
function swarmOption(
  groups: readonly Group[],
  derived: Derived,
  offsets: 'none' | 'swarm',
): EChartsOption {
  const spread = 0.06

  return {
    ...frame(derived),
    xAxis: valueAxis('value'),
    yAxis: { ...groupAxis(), min: -1, max: groups.length },
    series: groups.map((group, i) => ({
      type: 'scatter' as const,
      name: group.name,
      symbolSize: tokens.arrow.head,
      itemStyle: { color: groupColor(i), opacity: 0.85 },
      data:
        offsets === 'none'
          ? sortedCopy(group.samples).map((value) => [value, i])
          : beeswarmOffsets(group.samples).map((point) => [point.x, round(i + point.y * spread, 6)]),
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

function caption(
  variant: DistributionData['variant'],
  groupCount: number,
  estimateNote: string | null,
  outlierCount: number,
): string {
  const parts: string[] = [`${variant} of ${groupCount} group${groupCount === 1 ? '' : 's'}`]
  if (estimateNote !== null) parts.push(estimateNote)
  if (variant === 'boxPlot')
    parts.push(
      outlierCount === 0
        ? 'whiskers stop at the last sample inside Tukey’s fences; no sample lies beyond them'
        : `whiskers stop at the last sample inside Tukey’s fences, and the ${outlierCount} sample${outlierCount === 1 ? '' : 's'} beyond them ${outlierCount === 1 ? 'is' : 'are'} drawn individually`,
    )
  const note = variantNote(variant)
  if (note !== null) parts.push(note)
  return `${parts.join('. ')}.`
}

function variantNote(variant: DistributionData['variant']): string | null {
  switch (variant) {
    case 'violin':
    case 'density':
    case 'ridgeline':
      return 'The curve is a kernel estimate: change the bandwidth and the number of bumps changes while the data does not'
    case 'beeswarm':
      return 'Offsets are computed from the data, not jittered, so the swarm is the same shape on every render'
    case 'shapSummary':
      return 'Features are ranked by mean absolute SHAP value; this shape carries the SHAP values alone, so points are not coloured by feature value'
    case 'qqPlot':
      return 'Points are compared against the standard normal, with the reference line drawn through the quartiles'
    case 'populationPyramid':
      return 'Both sides are counts on their own axis; neither is negated'
    default:
      return null
  }
}

export function describeDistribution(data: DistributionData): string {
  return `${data.variant}: ${data.groups
    .map((g) => `${g.name} (${g.samples.length} samples)`)
    .join(', ')}.`
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

export function DistributionShape({ data, at }: { data: DistributionData; at?: string }) {
  const built = buildDistribution(data, at)
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
          aria-label={describeDistribution(data)}
        />
      </div>
      <p className="lc-caption">{built.caption}</p>
    </div>
  )
}
