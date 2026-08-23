import { ArrowDefs, curvePath } from '../../design/primitives'
import { tokens } from '../../design/tokens'
import { checkIntervals, type IntervalsData, type ShapeIssue } from '../../spec/shapeInvariants'

/**
 * The intervals shape: items with a start and an end on one axis.
 *
 * gantt · timeline
 *
 * A GANTT WITHOUT DEPENDENCIES IS A BAR CHART OF DATES
 * ---------------------------------------------------
 * The bars alone say when things happen. What a schedule is FOR is why they
 * happen then — which task cannot start until which other finishes. So the
 * dependencies are drawn as arrows, and when none are declared the build says
 * so rather than quietly producing a chart that looks like a plan.
 *
 * Where dependencies exist, the CRITICAL PATH is computed: the longest chain of
 * durations, which is the set of tasks where a day lost is a day lost from the
 * whole project. It is marked, because it is the only part of a schedule most
 * readers actually need.
 *
 * TICKS ARE A CORRECTNESS SURFACE
 * -------------------------------
 * This renderer draws its own axis, so unlike the ECharts shapes it cannot hand
 * the problem to a library. `niceTicks` therefore produces a step of 1, 2 or 5
 * times a power of ten, anchored on a multiple of that step, so the ticks are
 * evenly spaced by construction — and the test asserts exactly that, because an
 * axis reading 0, 10, 20, 25 makes every bar on the chart a lie.
 *
 * ARROWHEADS AND THE FILTER THAT ATE THEM
 * ---------------------------------------
 * A dependency between two tasks on the same row is a FLAT path: its bounding
 * box has zero height. `lc-bloom`'s region is in percentages of that box, so
 * 500% of nothing is nothing and the arrow renders invisible with a perfectly
 * correct stroke. That shipped once already. Every connector here glows with a
 * second wide stroke (`.lc-flow__link-glow`) and no filter is applied to any of
 * them; `flat` is carried on the arrow so the hazard stays visible in the data.
 */

/* -------------------------------------------------------------------------- */
/* Geometry — from tokens where the design system has an opinion              */
/* -------------------------------------------------------------------------- */

function scalar(length: string): number {
  return Number.parseFloat(length)
}

const BAR_H = scalar(tokens.space.lg)
const ROW_GAP = scalar(tokens.space.md)
const ROW_STEP = BAR_H + ROW_GAP
const LANE_GAP = scalar(tokens.space.lg)
/** The plot's own coordinate space. The viewBox scales it; ratios do not move. */
const PLOT_W = 640
const LABEL_W = 148
const AXIS_H = scalar(tokens.space.xxl)
const TICK_TARGET = 6

/* -------------------------------------------------------------------------- */
/* Ticks                                                                      */
/* -------------------------------------------------------------------------- */

/** 1, 2 or 5 times a power of ten — a step a reader can add up in their head. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const scaled = raw / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

export interface TickScale {
  /** The domain actually drawn: the data, widened to whole steps. */
  lo: number
  hi: number
  step: number
  values: number[]
}

/**
 * Ticks on a whole multiple of the step, covering the data at both ends.
 *
 * Anchoring on the data's minimum instead would put the first tick at 3.7 and
 * every one after it at 3.7 + k·step, which reads as a scale nobody chose.
 */
export function niceTicks(lo: number, hi: number, target = TICK_TARGET): TickScale {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, step: 1, values: [0, 1] }

  const span = hi - lo
  const step = niceStep(span > 0 ? span / Math.max(1, target) : 1)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const count = Math.max(1, Math.round((end - start) / step))

  return {
    lo: round(start, 6),
    hi: round(start + count * step, 6),
    step,
    values: Array.from({ length: count + 1 }, (_, i) => round(start + i * step, 6)),
  }
}

/* -------------------------------------------------------------------------- */
/* The critical path                                                          */
/* -------------------------------------------------------------------------- */

type Item = IntervalsData['items'][number]

/**
 * The longest chain of durations through the dependency graph.
 *
 * Longest by DURATION, not by hop count: five one-day tasks in a row do not
 * delay a project the way one ten-day task does. Ties resolve to the earliest
 * item in the author's order, so the marked path is the same on every render.
 */
export function criticalPath(items: readonly Item[]): string[] {
  if (!items.some((item) => (item.dependsOn ?? []).length > 0)) return []

  const byId = new Map(items.map((item) => [item.id, item]))
  const indexOf = new Map(items.map((item, i) => [item.id, i]))
  const longest = new Map<string, number>()

  const durationOf = (item: Item): number => Math.max(0, item.end - item.start)

  /* Depth-first with a memo. The shape's own check has already refused a cycle,
     and `seen` keeps this total if one ever slipped through. */
  const walk = (id: string, seen: Set<string>): number => {
    const cached = longest.get(id)
    if (cached !== undefined) return cached
    if (seen.has(id)) return 0

    const item = byId.get(id)
    if (item === undefined) return 0

    seen.add(id)
    const upstream = (item.dependsOn ?? []).reduce((n, dep) => Math.max(n, walk(dep, seen)), 0)
    seen.delete(id)

    const total = durationOf(item) + upstream
    longest.set(id, total)
    return total
  }

  for (const item of items) walk(item.id, new Set())

  let tail: string | null = null
  for (const item of items) {
    const here = longest.get(item.id) ?? 0
    const best = tail === null ? -1 : (longest.get(tail) ?? 0)
    if (here > best) tail = item.id
  }
  if (tail === null) return []

  const path: string[] = []
  let cursor: string | null = tail
  while (cursor !== null) {
    path.unshift(cursor)
    const item = byId.get(cursor)
    const deps = item?.dependsOn ?? []
    let next: string | null = null
    for (const dep of deps) {
      const here = longest.get(dep) ?? 0
      const best = next === null ? -1 : (longest.get(next) ?? 0)
      if (here > best || (here === best && (indexOf.get(dep) ?? 0) < (indexOf.get(next ?? '') ?? 0)))
        next = dep
    }
    cursor = next
  }

  return path
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export interface IntervalBar {
  id: string
  label: string
  lane: string
  row: number
  start: number
  end: number
  duration: number
  x0: number
  x1: number
  y: number
  height: number
  critical: boolean
  /** A zero-duration item: drawn as a point, because a zero-width bar is not. */
  milestone: boolean
}

export interface DependencyArrow {
  from: string
  to: string
  d: string
  critical: boolean
  /**
   * True when both ends sit on the same row, which makes the path's bounding
   * box zero-height. NO percentage-region filter may ever be applied to one.
   */
  flat: boolean
  /** True when the dependent starts before its source finishes. */
  impossible: boolean
}

export interface LaneBand {
  name: string
  y: number
  height: number
  rows: number
}

export interface IntervalsLayout {
  bars: IntervalBar[]
  arrows: DependencyArrow[]
  lanes: LaneBand[]
  scale: TickScale
  ticks: { value: number; x: number; label: string }[]
  width: number
  height: number
  criticalPath: string[]
}

/** Pure: no clock, no randomness. The same items lay out identically forever. */
export function layoutIntervals(data: IntervalsData): IntervalsLayout {
  const starts = data.items.map((i) => i.start)
  const ends = data.items.map((i) => i.end)
  const scale = niceTicks(
    starts.length === 0 ? 0 : Math.min(...starts),
    ends.length === 0 ? 1 : Math.max(...ends),
  )

  const span = scale.hi - scale.lo
  const toX = (value: number): number =>
    span === 0 ? LABEL_W : LABEL_W + round(((value - scale.lo) / span) * PLOT_W, 3)

  /* Lanes in order of first appearance. Sorting them alphabetically would
     reorder a swimlane whose order is the author's argument. */
  const laneNames: string[] = []
  for (const item of data.items) {
    const lane = item.lane ?? ''
    if (!laneNames.includes(lane)) laneNames.push(lane)
  }

  const critical = criticalPath(data.items)
  const onPath = new Set(critical)

  const bars: IntervalBar[] = []
  const lanes: LaneBand[] = []
  let row = 0
  let y = 0

  for (const lane of laneNames) {
    const members = data.items.filter((item) => (item.lane ?? '') === lane)
    const bandTop = y
    for (const item of members) {
      const duration = Math.max(0, item.end - item.start)
      bars.push({
        id: item.id,
        label: item.label,
        lane,
        row,
        start: item.start,
        end: item.end,
        duration,
        x0: toX(item.start),
        x1: toX(item.end),
        y,
        height: BAR_H,
        critical: onPath.has(item.id),
        milestone: duration === 0,
      })
      row += 1
      y += ROW_STEP
    }
    lanes.push({ name: lane, y: bandTop, height: Math.max(ROW_STEP, y - bandTop), rows: members.length })
    y += lane === '' ? 0 : LANE_GAP
  }

  const byId = new Map(bars.map((bar) => [bar.id, bar]))
  const consecutive = new Set(
    critical.slice(1).map((id, i) => `${critical[i] ?? ''}>${id}`),
  )

  const arrows: DependencyArrow[] = []
  for (const item of data.items) {
    const to = byId.get(item.id)
    if (to === undefined) continue
    for (const dep of item.dependsOn ?? []) {
      const from = byId.get(dep)
      if (from === undefined) continue

      const startPoint = { x: from.x1, y: from.y + from.height / 2 }
      const endPoint = { x: to.x0, y: to.y + to.height / 2 }
      arrows.push({
        from: dep,
        to: item.id,
        d: curvePath(startPoint, endPoint),
        critical: consecutive.has(`${dep}>${item.id}`),
        flat: startPoint.y === endPoint.y,
        impossible: to.start < from.end,
      })
    }
  }

  return {
    bars,
    arrows,
    lanes,
    scale,
    ticks: scale.values.map((value) => ({ value, x: toX(value), label: num(value) })),
    width: LABEL_W + PLOT_W,
    height: Math.max(ROW_STEP, y) + AXIS_H,
    criticalPath: critical,
  }
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface IntervalsChart {
  ok: true
  variant: IntervalsData['variant']
  layout: IntervalsLayout
  caption: string
  warnings: string[]
}

export interface IntervalsRefusal {
  ok: false
  variant: IntervalsData['variant']
  problems: ShapeIssue[]
  warnings: string[]
}

export type IntervalsResult = IntervalsChart | IntervalsRefusal

export function buildIntervals(data: IntervalsData, at = 'intervals'): IntervalsResult {
  const issues = checkIntervals(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  const layout = layoutIntervals(data)

  /* The avoidWhen, enforced rather than printed in a registry. */
  if (data.variant === 'gantt' && layout.arrows.length === 0)
    warnings.push(
      `${at}.items — no dependencies are declared, so this is a bar chart of dates rather than a schedule, and no critical path can be computed`,
    )

  const parts: string[] = []
  if (layout.arrows.length > 0)
    parts.push(`${layout.arrows.length} dependenc${layout.arrows.length === 1 ? 'y' : 'ies'} drawn`)
  if (layout.criticalPath.length > 0)
    parts.push(`critical path: ${layout.criticalPath.join(' → ')}`)
  else if (data.variant === 'gantt')
    parts.push('no dependencies were declared, so no critical path exists to mark')
  const milestones = layout.bars.filter((bar) => bar.milestone).length
  if (milestones > 0)
    parts.push(`${milestones} zero-length item${milestones === 1 ? '' : 's'} drawn as a point rather than a bar`)

  return {
    ok: true,
    variant: data.variant,
    layout,
    caption: `${parts.join('. ')}${parts.length > 0 ? '. ' : ''}${describeIntervals(data)}`,
    warnings,
  }
}

export function describeIntervals(data: IntervalsData): string {
  return `${data.variant}: ${data.items
    .map((item) => `${item.label} ${num(item.start)}–${num(item.end)}`)
    .join('; ')}.`
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

export function IntervalsShape({ data, at }: { data: IntervalsData; at?: string }) {
  const built = buildIntervals(data, at)

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

  const { layout } = built
  const named = layout.lanes.some((lane) => lane.name !== '')

  return (
    <div>
      <svg
        className="lc-flow"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={describeIntervals(data)}
      >
        <ArrowDefs />

        {/* Lane bands, drawn first and faint: a band is the ground a row sits
            on, not a box around it. */}
        {named &&
          layout.lanes.map((lane) => (
            <g key={`lane-${lane.name}`}>
              <rect
                x={0}
                y={lane.y - ROW_GAP / 2}
                width={layout.width}
                height={lane.height}
                fill={tokens.color.surfaceLift}
                fillOpacity={0.35}
                rx={scalar(tokens.radius.sm)}
              />
              <text
                className="lc-flow__node"
                x={0}
                y={lane.y - ROW_GAP / 2 - scalar(tokens.space.xs)}
                textAnchor="start"
              >
                {lane.name}
              </text>
            </g>
          ))}

        {/* The axis. Evenly spaced by construction — see `niceTicks`. */}
        {layout.ticks.map((tick) => (
          <g key={`tick-${tick.value}`}>
            <line
              x1={tick.x}
              x2={tick.x}
              y1={0}
              y2={layout.height - AXIS_H}
              stroke={tokens.color.surfaceLift}
              strokeWidth={scalar(tokens.stroke.hair)}
            />
            <text
              className="lc-flow__node"
              x={tick.x}
              y={layout.height - AXIS_H / 2}
              textAnchor="middle"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/*
          GLOW BY DOUBLE STROKE, NEVER BY FILTER.
          A dependency between two tasks on the same row is horizontal, so its
          bounding box is zero-height and `lc-bloom`'s percentage region
          collapses to no area at all — path, stroke and arrowhead correct, and
          nothing painted. Two strokes do not care what shape the path is.
        */}
        {layout.arrows.map((arrow, i) => (
          <path key={`glow-${i}`} className="lc-flow__link-glow" d={arrow.d} />
        ))}
        {layout.arrows.map((arrow, i) => (
          <path
            key={`arrow-${i}`}
            className="lc-flow__link"
            d={arrow.d}
            markerEnd="url(#lc-arrow)"
            strokeDasharray={arrow.impossible ? `${scalar(tokens.space.xs)} ${scalar(tokens.space.xs)}` : undefined}
          />
        ))}

        {layout.bars.map((bar) =>
          bar.milestone ? (
            /* Zero duration has no width to draw, so it becomes a point. A
               zero-width rect renders as nothing and deletes the milestone. */
            <g key={bar.id}>
              <circle
                cx={bar.x0}
                cy={bar.y + bar.height / 2}
                r={bar.height / 3}
                fill={bar.critical ? tokens.color.warning : tokens.color.accent}
              />
              <text className="lc-flow__node" x={LABEL_W - scalar(tokens.space.sm)} y={bar.y + bar.height / 2 + 4} textAnchor="end">
                {bar.label}
              </text>
            </g>
          ) : (
            <g key={bar.id}>
              <rect
                x={bar.x0}
                y={bar.y}
                width={Math.max(1, bar.x1 - bar.x0)}
                height={bar.height}
                rx={scalar(tokens.radius.sm)}
                fill={bar.critical ? tokens.color.warning : tokens.color.accent}
                fillOpacity={bar.critical ? 0.9 : 0.55}
              >
                <title>{`${bar.label}: ${num(bar.start)}–${num(bar.end)}`}</title>
              </rect>
              <text className="lc-flow__node" x={LABEL_W - scalar(tokens.space.sm)} y={bar.y + bar.height / 2 + 4} textAnchor="end">
                {bar.label}
              </text>
            </g>
          ),
        )}
      </svg>
      <p className="lc-caption">{built.caption}</p>
    </div>
  )
}
