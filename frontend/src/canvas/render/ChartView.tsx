import '../design/canvas.css'

/*
 * THE STYLESHEET IS IMPORTED BY THE COMPONENT, NOT BY THE ROUTE.
 *
 * `canvas.css` used to be imported by `CanvasRoute.tsx` alone. That worked
 * while the canvas route was the only consumer, and broke silently the moment
 * the practice screen started rendering figures: every `lc-*` class emitted
 * below resolved to no rule at all on `/practice`.
 *
 * Nothing failed. A class with no rule is not an error in CSS, in TypeScript,
 * in the linter, or in any test -- so the markup was right, the styles were
 * absent, and only looking at the screen would have shown it. `lc-refusal` was
 * the worst of them: the box that says a figure contradicts its own data
 * rendered as ordinary body text and read like part of the lesson.
 *
 * Enforced by `styleOwnership.test.ts`.
 */
import { useEffect, useRef } from 'react'
import ReactECharts, { echarts } from './echarts'
import type { EChartsOption } from 'echarts'

import { tokens } from '../design/tokens'
import type { Block } from '../spec/spec'

export type ChartBlock = Extract<Block, { kind: 'chart' }>

/**
 * Charts.
 *
 * The author said what the data IS. Colour, axis treatment, tick strategy,
 * spacing and how an annotation is drawn are all decided here — Law 4 means a
 * value that is not a token has no legal home in this file.
 *
 * TICKS ARE A CORRECTNESS SURFACE, NOT STYLING
 * --------------------------------------------
 * A y-axis reading 200, 150, 100, 110 is not an ugly chart, it is a FALSE one:
 * the reader takes evenly spaced gridlines to mean evenly spaced values and
 * misreads every point on the plot. So nothing below ever hands ECharts a tick
 * array it computed itself — no `interval`, no `min`/`max`, no
 * `axisLabel.customValues`. ECharts' interval scale picks nice, evenly spaced
 * ticks, and `ChartView.test.ts` renders the option headlessly and asserts that
 * the ticks that actually came out are monotonic and evenly spaced. Hand-rolled
 * ticks would be allowed only with a test that proves them; not rolling them and
 * testing the result is both cheaper and harder to get wrong.
 *
 * The same rule is applied once by hand, to CATEGORIES: when every category
 * label is a number they are sorted ascending, because an axis reading 1, 10, 2
 * is the same lie in a different costume.
 *
 * WHY ONLY THE OPAQUE TOKENS APPEAR INSIDE THE OPTION
 * ---------------------------------------------------
 * ECharts colours are parsed by zrender, not by the browser's CSS engine, and
 * zrender's parser predates the modern space-and-slash channel syntax that
 * `tokens.color.line`, `panel`, `panelHover`, `lineStrong` and `accentGlow` are
 * written in. Those tokens are correct in CSS — `canvas.css` uses them — but
 * inside a chart option they can fail to parse, and a failed parse is what turns
 * an emphasis state into an undefined fill. So the chart draws only from the
 * opaque tokens: `inkFaint`, `surfaceLift`, `inkMuted`, `ink`, `void`, `series`.
 *
 * No background is declared, because ECharts already lets the page show through
 * by default and naming a colour keyword here would be a value that does not
 * trace back to `tokens`.
 *
 * Title and caption are NOT rendered here — `BlockView` owns both, and drawing
 * them twice is how two renderers end up with two heading languages.
 */

/* -------------------------------------------------------------------------- */
/* Tokens -> ECharts                                                          */
/* -------------------------------------------------------------------------- */

/** Tokens carry CSS lengths as strings; ECharts wants bare numbers. One door. */
function scalar(length: string): number {
  return Number.parseFloat(length)
}

/**
 * The author picked an INDEX into the fixed palette. Resolving it to a colour
 * happens here and nowhere else — a colour never arrives from the spec, and
 * none is typed into this file.
 */
export function seriesColor(colorIndex: number): string {
  const palette: readonly string[] = tokens.series
  const wrapped = ((Math.trunc(colorIndex) % palette.length) + palette.length) % palette.length
  return palette[wrapped] ?? palette[0] ?? tokens.color.accent
}

/** The fixed palette, rotated to start at the author's index. Used by `pie`. */
function paletteFrom(colorIndex: number): string[] {
  return tokens.series.map((_, offset) => seriesColor(colorIndex + offset))
}

const TICK_FONT = scalar(tokens.type.caption.size)
const NAME_FONT = scalar(tokens.type.label.size)
const HAIR = scalar(tokens.stroke.hair)

/* -------------------------------------------------------------------------- */
/* Reading the data's shape                                                   */
/* -------------------------------------------------------------------------- */

export type AxisKind = 'category' | 'value'

/**
 * A bar compares discrete things, so it always gets a category axis. Everything
 * else follows the data: all-numeric x is a real number line, anything else is
 * a list of labels.
 */
export function xAxisKind(block: ChartBlock): AxisKind {
  if (block.chartType === 'bar') return 'category'
  const numeric = block.series.every((series) =>
    series.points.every((point) => typeof point.x === 'number'),
  )
  return numeric ? 'value' : 'category'
}

/** Every x across every series, once, in an order a reader can trust. */
export function categories(block: ChartBlock): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const series of block.series) {
    for (const point of series.points) {
      const key = String(point.x)
      if (!seen.has(key)) {
        seen.add(key)
        order.push(key)
      }
    }
  }

  const allNumeric = order.every((label) => label.trim() !== '' && Number.isFinite(Number(label)))
  return allNumeric ? [...order].sort((a, b) => Number(a) - Number(b)) : order
}

export interface Annotation {
  /** Which series carries the annotated point, so the mark sits ON the line. */
  seriesIndex: number
  x: number | string
  y: number
  label: string
}

/**
 * Resolve `annotate` to a DATA coordinate — never a pixel.
 *
 * The validator has already refused an `atX` with no point behind it, so the
 * only work here is finding which series owns that x, and at what height.
 */
export function annotationFor(block: ChartBlock): Annotation | null {
  const annotate = block.annotate
  if (annotate === undefined) return null

  const wanted = String(annotate.atX)
  for (const [seriesIndex, series] of block.series.entries()) {
    const hit = series.points.find((point) => String(point.x) === wanted)
    if (hit !== undefined) return { seriesIndex, x: hit.x, y: hit.y, label: annotate.label }
  }
  return null
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

function tooltipChrome(block: ChartBlock) {
  const perItem = block.chartType === 'pie' || block.chartType === 'scatter'
  return {
    trigger: perItem ? ('item' as const) : ('axis' as const),
    backgroundColor: tokens.color.surfaceLift,
    borderColor: tokens.color.inkFaint,
    borderWidth: HAIR,
    padding: scalar(tokens.space.sm),
    textStyle: { color: tokens.color.ink, fontSize: TICK_FONT },
  }
}

function legendChrome() {
  return {
    icon: 'roundRect',
    itemWidth: scalar(tokens.space.md),
    itemHeight: scalar(tokens.space.xs),
    itemGap: scalar(tokens.space.md),
    textStyle: { color: tokens.color.inkMuted, fontSize: TICK_FONT },
  }
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
export function buildChartOption(block: ChartBlock): EChartsOption {
  return block.chartType === 'pie' ? pieOption(block) : cartesianOption(block)
}

function pieOption(block: ChartBlock): EChartsOption {
  /* The validator already refuses a pie with more than one series — a pie is a
     claim about ONE whole. Slices still have to be told apart, so the author's
     index chooses where the fixed palette STARTS rather than flattening every
     slice to a single colour. */
  const author = block.series[0]
  const points = author?.points ?? []
  const note = block.annotate

  const data = points.map((point) => {
    const name = String(point.x)
    const named = note !== undefined && String(note.atX) === name
    return {
      name,
      value: point.y,
      /* A pie has no axis to hang a markPoint on. The named slice is pulled out
         of the ring instead, and the note's TEXT goes to the chart title (see
         below) — not onto the slice, where a long note is what truncated the
         label in the first place. */
      ...(named ? { selected: true } : {}),
    }
  })

  return {
    color: paletteFrom(author?.colorIndex ?? 0),
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: { ...tooltipChrome(block), formatter: '{b}: {c}  ({d}%)' },
    legend: { ...legendChrome(), show: true, top: 0, left: 0, orient: 'vertical' },
    /* The author's note, given its own band at the top right where nothing can
       crop it. Braces are stripped so a label can never be read as a template. */
    ...(note === undefined
      ? {}
      : {
          title: {
            text: note.label.replace(/[{}]/g, ''),
            right: 0,
            top: 0,
            textStyle: {
              color: tokens.color.ink,
              fontSize: TICK_FONT,
              fontWeight: 'normal' as const,
            },
          },
        }),
    series: [
      {
        type: 'pie',
        name: author?.name ?? '',
        radius: ['42%', '70%'],
        center: ['62%', '54%'],
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: scalar(tokens.space.sm),
        itemStyle: {
          borderColor: tokens.color.void,
          borderWidth: scalar(tokens.stroke.thick),
        },
        /* `{d}` is the share of the whole — the number a pie exists to show —
           and it is the only thing on the slice, drawn INSIDE the ring.
           Outside labels were measured being ellipsised to "6..." in a narrow
           container:
           a slice label sitting beyond the ring has only the container's leftover
           margin to live in, and the biggest slice on the chart lost the one
           number it existed to show. Inside the ring that margin is irrelevant.
           Names live in the legend and the tooltip, where length costs nothing. */
        label: {
          position: 'inside' as const,
          color: tokens.color.void,
          fontSize: TICK_FONT,
          formatter: '{d}%',
        },
        labelLine: { show: false },
        data,
      },
    ],
  }
}

function cartesianOption(block: ChartBlock): EChartsOption {
  const kind = xAxisKind(block)
  const cats = kind === 'category' ? categories(block) : []
  const note = annotationFor(block)
  const noteX = note === null ? null : kind === 'category' ? String(note.x) : Number(note.x)

  const series = block.series.map((authored, index) => {
    const color = seriesColor(authored.colorIndex)

    const data =
      kind === 'category'
        ? alignToCategories(authored.points, cats)
        : authored.points
            .map((point) => [Number(point.x), point.y])
            .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))

    const marks =
      note !== null && noteX !== null && note.seriesIndex === index
        ? annotationMarks(note, noteX)
        : {}

    return { name: authored.name, data, ...seriesShape(block.chartType, color), ...marks }
  })

  const chrome = axisChrome()
  const xName = block.xLabel
  const yName = block.yLabel

  const hasLegend = block.series.length > 1

  /**
   * `containLabel` reserves room for TICK labels only — the axis NAME sits
   * outside the grid box and is not counted. Measured in a browser at 739x462,
   * "Pressure (kPa)" rendered at y = -7.9 and "Temperature (K)" at y = 469.6
   * against a 462-tall container: both names half outside the chart.
   *
   * So the outer margins are sized for the names explicitly. Each is the axis's
   * `nameGap` plus one line of `type.label`, rounded up to the next step on the
   * space scale — no in-between values, and nothing measured by eye:
   *
   *   bottom, with an x name : gap xl (24) + a line (~13) -> xxl (32)
   *   top,    with a y name  : gap md (12) + a line (~13) -> xxl (32)
   *   top,    with both a y name and a legend             -> xxxl (48)
   *
   * With no name on that side the margin drops back to `sm`, so a chart that
   * asked for no labels does not pay for them in plot height.
   */
  const xName_ =
    xName === undefined
      ? {}
      : { name: xName, nameLocation: 'middle' as const, nameGap: scalar(tokens.space.xl) }

  function topMargin(): string {
    if (yName !== undefined && hasLegend) return tokens.space.xxxl
    if (yName !== undefined || hasLegend) return tokens.space.xxl
    return tokens.space.lg
  }

  /* Written as two branches rather than one object with a conditional spread,
     because `type` is what discriminates a category axis from a value axis —
     collapsing them would hand ECharts an axis that is neither. */
  const xAxis =
    kind === 'category'
      ? {
          ...chrome,
          ...xName_,
          type: 'category' as const,
          data: cats,
          boundaryGap: block.chartType === 'bar',
          splitLine: { show: false },
        }
      : { ...chrome, ...xName_, type: 'value' as const, splitLine: { show: false } }

  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: tooltipChrome(block),
    legend: { ...legendChrome(), show: hasLegend, top: 0, right: 0 },
    grid: {
      left: scalar(tokens.space.sm),
      right: scalar(tokens.space.lg),
      top: scalar(topMargin()),
      bottom: scalar(xName === undefined ? tokens.space.sm : tokens.space.xxl),
      containLabel: true,
    },
    xAxis,
    yAxis: {
      ...chrome,
      type: 'value',
      /* Deliberately no `interval`, `min`, `max` or `customValues`. `scale` is
         false for bar and area so the baseline stays at zero — a truncated bar
         is the same lie as a crooked tick — and true for line and scatter,
         where the shape of the change is the point and zero is not implied. */
      scale: block.chartType === 'line' || block.chartType === 'scatter',
      splitLine: { show: true, lineStyle: { color: tokens.color.surfaceLift, width: HAIR } },
      /* `align: 'left'` matters as much as the margin above it. ECharts centres
         an `end`-located name on the axis's end point, which for the y axis is
         the grid's left edge — so half of a long name hangs off the container
         (measured at x = -0.7). Anchored left it grows inwards, over the plot,
         where there is always room. */
      ...(yName === undefined
        ? {}
        : {
            name: yName,
            nameLocation: 'end' as const,
            nameGap: scalar(tokens.space.md),
            nameTextStyle: { ...chrome.nameTextStyle, align: 'left' as const },
          }),
    },
    series,
  }
}

/**
 * One value per category, in category order.
 *
 * A category a series has no point for becomes `null`, which ECharts draws as a
 * GAP. Carrying the previous value forward, or silently dropping the category,
 * would invent a reading the data never made.
 */
function alignToCategories(
  points: readonly { x: number | string; y: number }[],
  cats: readonly string[],
): (number | null)[] {
  const byX = new Map<string, number>()
  for (const point of points) byX.set(String(point.x), point.y)
  return cats.map((category) => byX.get(category) ?? null)
}

function seriesShape(chartType: ChartBlock['chartType'], color: string) {
  const line = {
    type: 'line' as const,
    color,
    itemStyle: { color },
    lineStyle: { color, width: scalar(tokens.stroke.thick) },
    symbol: 'circle',
    symbolSize: tokens.arrow.head,
    /* Never smoothed: a curve between two points asserts values nobody measured. */
    smooth: false,
    connectNulls: false,
  }

  if (chartType === 'line') return line
  if (chartType === 'area') return { ...line, areaStyle: { color, opacity: 0.16 } }
  if (chartType === 'scatter') {
    return {
      type: 'scatter' as const,
      color,
      itemStyle: { color },
      symbolSize: tokens.arrow.head,
    }
  }

  return {
    type: 'bar' as const,
    color,
    itemStyle: {
      color,
      borderRadius: [scalar(tokens.radius.sm), scalar(tokens.radius.sm), 0, 0],
    },
  }
}

/**
 * The annotation, placed by DATA coordinate.
 *
 * `coord: [x, y]` and `markLine.data[].xAxis` are both values in the data's own
 * space; ECharts resolves them to pixels after layout. That is the only way an
 * annotation stays attached to its point through a resize — a pixel offset
 * computed here would drift the moment the container changed width.
 *
 * The mark colour is `ink`, not a tone and not the accent: the annotation is the
 * renderer pointing, and borrowing a tone colour would make it look like the
 * author had claimed "warning" or "result".
 */
function annotationMarks(note: Annotation, xCoord: number | string) {
  return {
    markLine: {
      symbol: 'none',
      silent: true,
      lineStyle: { color: tokens.color.ink, width: HAIR, type: 'dashed' as const },
      label: { show: false },
      data: [{ xAxis: xCoord }],
    },
    markPoint: {
      symbol: 'circle',
      symbolSize: tokens.arrow.head,
      itemStyle: { color: tokens.color.ink },
      label: {
        show: true,
        position: 'top' as const,
        distance: scalar(tokens.space.sm),
        color: tokens.color.ink,
        fontSize: TICK_FONT,
        /* `{b}` is the datum's name. Using the template rather than pasting the
           text keeps a label containing a brace from being read as markup. */
        formatter: '{b}',
      },
      data: [{ name: note.label, coord: [xCoord, note.y], value: note.y }],
    },
  }
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `.lc-chart` gives the plot its width and its `aspect-ratio`, so the box has a
 * real height on the very first paint. `echarts-for-react` otherwise falls back
 * to its own default height, which is a pixel number this file is not allowed to
 * write and would not want to.
 */
export function ChartView({ block }: { block: ChartBlock }) {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReactECharts | null>(null)

  /**
   * The classic failure is a chart measured while its container is still 0 wide,
   * which then never recovers. Two things prevent it here: the aspect-ratio box
   * above, which means the height is never zero, and this observer, which fires
   * once the moment it starts observing and again on every later change — so a
   * chart laid out before its column had width corrects itself as soon as the
   * width arrives. `autoResize` below covers window resizes; this covers the
   * container's own growth, which is the case that actually bites inside a grid.
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

  return (
    /*
      THE SCROLLER IS PART OF THE WIDTH FLOOR, NOT DECORATION.

      `.lc-chart` carries a minimum width so echarts always has room to place
      its axis labels, legends and series labels inside its own `<svg>` instead
      of painting them past its edge. That floor is only half a fix. Below the
      floor the chart is wider than its column, and a chart wider than its
      column with nothing to scroll is content a reader cannot reach — the same
      defect in a new place, not a smaller one.

      A figure-hosted chart already got this from `FigureView`. A `chart` BLOCK
      did not, because `BlockView` renders this component bare. Measured at
      320px before this wrapper existed: the physics lesson's two charts sat at
      480px inside a 320px column and took the whole document to
      `scrollWidth: 544` against `clientWidth: 320` — a page-wide sideways
      scroll, on every lesson containing a chart block.

      Nothing caught it. The clipping guard only counts elements inside an
      ancestor that CLIPS, and the keyboard guard only inspects elements that
      already scroll; an element that simply pushes the document wider is
      invisible to both. So this is the same treatment `FigureView` applies,
      applied at the other site that needed it.
    */
    <div
      className="lc-figure-scroll"
      /* The attribute the measurement layer reads to tell a deliberate scroll
         region from a layout fault. */
      data-overflow="scroll"
      /* `role` + `tabIndex` because a region only a mouse can move hides half
         the chart from anyone using a keyboard (WCAG 2.1.1). Named from the
         block's own title so a screen-reader region list does not read as
         several identical "scrollable" entries. */
      role="region"
      tabIndex={0}
      aria-label={`${block.title ?? block.chartType}, scrollable chart`}
    >
      <div className="lc-chart" ref={plotRef}>
        <ReactECharts
          echarts={echarts}
          ref={chartRef}
          option={buildChartOption(block)}
          style={{ width: '100%', height: '100%' }}
          opts={{ renderer: 'svg' }}
          /* The option's SHAPE changes with `chartType`; merging would leave a
             pie's slices behind when a line replaced it. */
          notMerge
          /* `lazyUpdate` is deliberately OFF. It defers the first draw to a
             `requestAnimationFrame`, and a chart whose container is hidden — a
             background tab, a collapsed panel, a `display: none` ancestor —
             then holds an empty SVG until frames resume. Verified here: with it
             on, the SVG was the right size and completely empty. Batching buys
             nothing when the option only changes as often as the block does. */
          autoResize
        />
      </div>
    </div>
  )
}
