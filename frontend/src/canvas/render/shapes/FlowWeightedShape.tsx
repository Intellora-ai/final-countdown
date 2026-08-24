import { FigureSvg } from '../../design/primitives'
import { useEffect, useRef } from 'react'
import ReactECharts, { echarts } from '../echarts'
import type { EChartsOption } from 'echarts'

import { tokens } from '../../design/tokens'
import {
  checkFlowWeighted,
  findCycle,
  type FlowWeightedData,
  type ShapeIssue,
} from '../../spec/shapeInvariants'

/**
 * The flow-weighted shape: weighted movement between stages.
 *
 * sankey · alluvial · chord
 *
 * THE RIBBON IS THE NUMBER
 * ------------------------
 * A sankey has no axis. Its only encoding is width, so width must be strictly
 * proportional to value — no square roots to "make the small ones visible", no
 * minimum width to keep a hairline from disappearing. Both are common, both
 * turn a 1% flow into something that looks like 8%, and both are refused here
 * by simply never transforming the value: what the author wrote is what the
 * link carries, and the chord's angular widths are computed from one constant
 * so a flow twice as large is twice as wide anywhere in the circle.
 *
 * LAYOUT MUST NOT MOVE BETWEEN RENDERS
 * ------------------------------------
 * ECharts' sankey relaxes node positions iteratively, and the relaxation
 * reorders nodes. Two screenshots of the same data would then disagree about
 * which band is on top, and a reader comparing them would see structure that is
 * not there. So the depth of every node is computed here — longest path from a
 * source, ties resolved by the author's order — and the relaxation is turned
 * OFF. Same input, same picture.
 *
 * Conservation is already `checkFlowWeighted`'s job: a node that takes 100 and
 * passes on 60 is refused unless the author declared the diagram lossy.
 */

/* -------------------------------------------------------------------------- */
/* Tokens -> geometry                                                         */
/* -------------------------------------------------------------------------- */

function scalar(length: string): number {
  return Number.parseFloat(length)
}

const TICK_FONT = scalar(tokens.type.caption.size)
const HAIR = scalar(tokens.stroke.hair)

export function flowColor(index: number): string {
  const palette: readonly string[] = tokens.series
  const wrapped = ((Math.trunc(index) % palette.length) + palette.length) % palette.length
  return palette[wrapped] ?? tokens.color.accent
}

/* -------------------------------------------------------------------------- */
/* Depth — computed, not relaxed                                              */
/* -------------------------------------------------------------------------- */

/**
 * The longest path from any source to each node.
 *
 * Longest rather than shortest, because a stage that can be reached both
 * directly and through two intermediates belongs in the LATER column: drawn
 * early, its incoming ribbon would have to run backwards past the stages it
 * came through.
 */
export function nodeDepths(
  nodes: readonly { id: string }[],
  links: readonly { from: string; to: string }[],
): Map<string, number> {
  const depth = new Map<string, number>()
  for (const node of nodes) depth.set(node.id, 0)

  const incoming = new Map<string, string[]>()
  for (const node of nodes) incoming.set(node.id, [])
  for (const link of links) incoming.get(link.to)?.push(link.from)

  /* One pass per node is enough for a DAG: each pass settles at least one more
     node's final depth. Bounded so a cycle cannot spin forever — a cycle is
     refused before this runs, and this stays total regardless. */
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false
    for (const node of nodes) {
      const sources = incoming.get(node.id) ?? []
      if (sources.length === 0) continue
      const deepest = sources.reduce((n, from) => Math.max(n, (depth.get(from) ?? 0) + 1), 0)
      if (deepest > (depth.get(node.id) ?? 0)) {
        depth.set(node.id, deepest)
        moved = true
      }
    }
    if (!moved) break
  }

  return depth
}

/** Nodes sorted by depth, then by the author's order. Never by anything else. */
export function nodeOrder(
  nodes: readonly { id: string; label: string }[],
  links: readonly { from: string; to: string }[],
): { id: string; label: string; depth: number; index: number }[] {
  const depth = nodeDepths(nodes, links)
  return nodes
    .map((node, index) => ({ ...node, depth: depth.get(node.id) ?? 0, index }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
}

/* -------------------------------------------------------------------------- */
/* Chord — computed geometry, because ECharts has no chord                    */
/* -------------------------------------------------------------------------- */

/** The circle's radius in viewBox units. The viewBox scales; the ratios do not. */
const CHORD_RADIUS = 100
const CHORD_BAND = scalar(tokens.space.md)
/** A wedge of blank between arcs, so two neighbours do not read as one. */
const CHORD_GAP = 0.03

export interface ChordArc {
  id: string
  label: string
  /** Radians, clockwise from the top. */
  a0: number
  a1: number
  total: number
  colorIndex: number
  /** Where the label sits, already resolved to a point and an anchor. */
  labelX: number
  labelY: number
  labelAnchor: 'start' | 'end'
}

export interface ChordRibbon {
  from: string
  to: string
  value: number
  source: { a0: number; a1: number }
  target: { a0: number; a1: number }
  /** The angular width the ribbon occupies. Proportional to `value`, always. */
  width: number
  path: string
  colorIndex: number
}

export interface ChordLayout {
  radius: number
  band: number
  arcs: ChordArc[]
  ribbons: ChordRibbon[]
  totalValue: number
}

/**
 * Arcs sized by each node's traffic, ribbons sized by their own value.
 *
 * Every ribbon's angular width is `value × (available angle / total traffic)` —
 * one constant for the whole circle, so widths are comparable between any two
 * ribbons rather than only within a node.
 */
export function buildChord(data: FlowWeightedData): ChordLayout {
  const totals = new Map<string, number>()
  for (const node of data.nodes) totals.set(node.id, 0)
  for (const link of data.links) {
    totals.set(link.from, (totals.get(link.from) ?? 0) + link.value)
    totals.set(link.to, (totals.get(link.to) ?? 0) + link.value)
  }

  const totalValue = [...totals.values()].reduce((n, v) => n + v, 0)
  const available = Math.PI * 2 - data.nodes.length * CHORD_GAP
  const perUnit = totalValue > 0 ? available / totalValue : 0

  const arcs: ChordArc[] = []
  let cursor = 0
  data.nodes.forEach((node, i) => {
    const total = totals.get(node.id) ?? 0
    const span = total * perUnit
    const mid = cursor + span / 2
    const labelRadius = CHORD_RADIUS + scalar(tokens.space.md)
    arcs.push({
      id: node.id,
      label: node.label,
      a0: round(cursor, 6),
      a1: round(cursor + span, 6),
      total,
      colorIndex: i,
      labelX: round(Math.sin(mid) * labelRadius, 3),
      labelY: round(-Math.cos(mid) * labelRadius, 3),
      labelAnchor: Math.sin(mid) < 0 ? 'end' : 'start',
    })
    cursor += span + CHORD_GAP
  })

  const byId = new Map(arcs.map((arc) => [arc.id, arc]))
  /* Each node hands out its arc in the author's link order, so the same data
     always allocates the same wedge to the same ribbon. */
  const filled = new Map<string, number>(arcs.map((arc) => [arc.id, arc.a0]))

  const ribbons: ChordRibbon[] = []
  for (const link of data.links) {
    const source = byId.get(link.from)
    const target = byId.get(link.to)
    if (source === undefined || target === undefined) continue

    const width = link.value * perUnit
    const s0 = filled.get(link.from) ?? source.a0
    const t0 = filled.get(link.to) ?? target.a0
    filled.set(link.from, s0 + width)
    filled.set(link.to, t0 + width)

    const inner = CHORD_RADIUS - CHORD_BAND
    ribbons.push({
      from: link.from,
      to: link.to,
      value: link.value,
      source: { a0: round(s0, 6), a1: round(s0 + width, 6) },
      target: { a0: round(t0, 6), a1: round(t0 + width, 6) },
      width: round(width, 6),
      path: ribbonPath(s0, s0 + width, t0, t0 + width, inner),
      colorIndex: source.colorIndex,
    })
  }

  return { radius: CHORD_RADIUS, band: CHORD_BAND, arcs, ribbons, totalValue }
}

/** Clockwise from the top, so the first node starts where a reader starts. */
function pointAt(angle: number, radius: number): { x: number; y: number } {
  return { x: round(Math.sin(angle) * radius, 3), y: round(-Math.cos(angle) * radius, 3) }
}

/**
 * The ribbon: along the source wedge, through the centre, along the target
 * wedge, back through the centre. The quadratic's control point is the circle's
 * centre, which is what gives a chord its pinched waist.
 */
function ribbonPath(s0: number, s1: number, t0: number, t1: number, radius: number): string {
  const a = pointAt(s0, radius)
  const b = pointAt(s1, radius)
  const c = pointAt(t0, radius)
  const d = pointAt(t1, radius)
  const sweepS = s1 - s0 > Math.PI ? 1 : 0
  const sweepT = t1 - t0 > Math.PI ? 1 : 0
  return [
    `M ${a.x} ${a.y}`,
    `A ${radius} ${radius} 0 ${sweepS} 1 ${b.x} ${b.y}`,
    `Q 0 0 ${c.x} ${c.y}`,
    `A ${radius} ${radius} 0 ${sweepT} 1 ${d.x} ${d.y}`,
    `Q 0 0 ${a.x} ${a.y}`,
    'Z',
  ].join(' ')
}

/** An arc as a stroked path, drawn on the outer band. */
export function arcPath(a0: number, a1: number, radius: number): string {
  const start = pointAt(a0, radius)
  const end = pointAt(a1, radius)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface FlowRibbon {
  from: string
  to: string
  value: number
  /** The link's share of the largest link. Width must track this exactly. */
  fraction: number
}

export interface FlowChart {
  ok: true
  variant: FlowWeightedData['variant']
  render: 'echarts' | 'chord'
  option: EChartsOption | null
  chord: ChordLayout | null
  /** The drawn order of the nodes, fixed by depth then by the author's order. */
  order: string[]
  ribbons: FlowRibbon[]
  caption: string
  warnings: string[]
}

export interface FlowRefusal {
  ok: false
  variant: FlowWeightedData['variant']
  problems: ShapeIssue[]
  warnings: string[]
}

export type FlowWeightedResult = FlowChart | FlowRefusal

export function buildFlowWeighted(data: FlowWeightedData, at = 'flow'): FlowWeightedResult {
  const issues = checkFlowWeighted(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  /*
   * An alluvial diagram is stages left to right, same as a sankey; the shape's
   * own check only refuses a cycle for `sankey`, but a cycle has no left-to-
   * right drawing either way. Refusing is the honest answer — the alternative
   * is a layout that quietly picks a place to cut the loop.
   */
  if (data.variant === 'alluvial') {
    const cycle = findCycle(data.nodes.map((n) => n.id), data.links)
    if (cycle !== null)
      problems.push({
        path: `${at}.links`,
        message: `an alluvial diagram runs through stages in one direction; this cycles: ${cycle.join(' → ')}`,
        level: 'reject',
      })
  }

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  const largest = data.links.reduce((n, l) => Math.max(n, l.value), 0)
  const ribbons: FlowRibbon[] = data.links.map((link) => ({
    from: link.from,
    to: link.to,
    value: link.value,
    fraction: largest > 0 ? round(link.value / largest, 6) : 0,
  }))

  if (data.variant === 'chord') {
    const chord = buildChord(data)
    return {
      ok: true,
      variant: data.variant,
      render: 'chord',
      option: null,
      chord,
      order: chord.arcs.map((arc) => arc.id),
      ribbons,
      caption: `Each arc is sized by the traffic through that group and each ribbon by its own value, both from one constant, so two ribbons are comparable anywhere in the circle. ${describeFlow(data)}`,
      warnings:
        data.nodes.length > 10
          ? [...warnings, `${at}.nodes — past about ten groups a chord's ribbons cross too often to follow`]
          : warnings,
    }
  }

  const ordered = nodeOrder(data.nodes, data.links)
  return {
    ok: true,
    variant: data.variant,
    render: 'echarts',
    option: sankeyOption(ordered, data),
    chord: null,
    order: ordered.map((node) => node.id),
    ribbons,
    caption: `${
      data.conserved
        ? 'Flow is conserved: every intermediate node passes on exactly what it takes in'
        : 'Flow is not declared conserved, so a node may take more than it passes on'
    }. Ribbon width is the value itself, untransformed. ${describeFlow(data)}`,
    warnings,
  }
}

function sankeyOption(
  ordered: readonly { id: string; label: string; depth: number }[],
  data: FlowWeightedData,
): EChartsOption {
  /* The rightmost stage, so its labels can be turned inward below. `ordered` is
     never empty here — the shape invariants refuse a flow with no stages. */
  const lastDepth = ordered.reduce((max, n) => (n.depth > max ? n.depth : max), 0)

  return {
    aria: { enabled: true },
    textStyle: { color: tokens.color.ink, fontSize: scalar(tokens.type.body.size) },
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.color.surfaceLift,
      borderColor: tokens.color.inkFaint,
      borderWidth: HAIR,
      padding: scalar(tokens.space.sm),
      textStyle: { color: tokens.color.ink, fontSize: TICK_FONT },
    },
    series: [
      {
        type: 'sankey',
        /*
         * ZERO ITERATIONS. The relaxation ECharts runs by default reorders
         * nodes within a column, so the same data can draw a different picture
         * on a different run. Depth is computed above instead, and the order
         * inside a column is the author's.
         */
        layoutIterations: 0,
        nodeAlign: 'left',
        nodeGap: scalar(tokens.space.md),
        nodeWidth: scalar(tokens.space.md),
        emphasis: { focus: 'adjacency' },
        label: { color: tokens.color.inkMuted, fontSize: TICK_FONT },
        lineStyle: { color: 'gradient', opacity: 0.32, curveness: 0.5 },
        itemStyle: { borderColor: tokens.color.void, borderWidth: HAIR },
        /*
         * THE LAST COLUMN LABELS INWARD. EVERY OTHER COLUMN LABELS OUTWARD.
         *
         * ECharts places a sankey label to the RIGHT of its node by default,
         * which is correct for every stage except the final one — there the
         * node already sits at the right edge of the plot, so the label is
         * drawn past the edge of echarts' own `<svg>`. Measured in a browser,
         * "Lapsed or withdrawn" was painted 78px outside the box at a 320px
         * viewport, and still 7.4px outside at 768px.
         *
         * That text is not merely off-screen, it is UNREACHABLE: content
         * overflowing an `<svg>` does not contribute to an ancestor's
         * `scrollWidth`, so the figure's scroll container has nothing to scroll
         * and no amount of scrolling reveals it. Widening the host only moves
         * the problem, because the label follows the node to the new right edge.
         *
         * Flipping the last column's label inward keeps it inside the plot at
         * every width, which is the only version of this that is true
         * independently of the container.
         */
        data: ordered.map((node, i) => ({
          name: node.id,
          value: undefined,
          depth: node.depth,
          itemStyle: { color: flowColor(i) },
          label: {
            formatter: node.label.replace(/[{}]/g, ''),
            position: node.depth === lastDepth ? ('left' as const) : ('right' as const),
          },
        })),
        /* The value goes through untouched: no scaling, no minimum width. */
        links: data.links.map((link) => ({ source: link.from, target: link.to, value: link.value })),
      },
    ],
  }
}

export function describeFlow(data: FlowWeightedData): string {
  const byId = new Map(data.nodes.map((n) => [n.id, n.label]))
  return `${data.variant}: ${data.links
    .map((l) => `${byId.get(l.from) ?? l.from} → ${byId.get(l.to) ?? l.to} (${num(l.value)})`)
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

export function FlowWeightedShape({ data, at }: { data: FlowWeightedData; at?: string }) {
  const built = buildFlowWeighted(data, at)
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

  if (built.render === 'chord' && built.chord !== null) {
    const chord = built.chord
    const extent = chord.radius + scalar(tokens.space.xxxl)
    return (
      <div>
        <FigureSvg
          viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
          role="img"
          aria-label={describeFlow(data)}
        >
          {/* Ribbons first, arcs on top: a ribbon that covered its own arc
              would make the arc look shorter than the traffic it carries. */}
          {chord.ribbons.map((ribbon, i) => (
            <path
              key={`ribbon-${i}`}
              d={ribbon.path}
              fill={flowColor(ribbon.colorIndex)}
              fillOpacity={0.28}
              stroke={flowColor(ribbon.colorIndex)}
              strokeOpacity={0.5}
              strokeWidth={scalar(tokens.stroke.hair)}
            >
              <title>{`${ribbon.from} → ${ribbon.to}: ${num(ribbon.value)}`}</title>
            </path>
          ))}
          {chord.arcs.map((arc) => (
            <g key={arc.id}>
              <path
                d={arcPath(arc.a0, arc.a1, chord.radius - chord.band / 2)}
                fill="none"
                stroke={flowColor(arc.colorIndex)}
                strokeWidth={chord.band}
              />
              <text
                className="lc-flow__node"
                x={arc.labelX}
                y={arc.labelY}
                textAnchor={arc.labelAnchor}
                dominantBaseline="middle"
              >
                {arc.label}
              </text>
            </g>
          ))}
        </FigureSvg>
        <p className="lc-caption">{built.caption}</p>
      </div>
    )
  }

  return (
    <div>
      {/*
        A SANKEY NEEDS ROOM FOR ITS LABELS, NOT JUST FOR ITS RIBBONS.
        --------------------------------------------------------------
        echarts paints stage labels OUTSIDE the node rectangles, and it lays out
        into whatever width the host gives it. At `width: 100%` on a 320px
        screen that meant "Lapsed or withdrawn" was drawn 78px past the right
        edge of echarts' own `<svg>`.

        The `.lc-figure-scroll` wrapper around every figure did NOT rescue it,
        and the reason is worth knowing: content that overflows an `<svg>` box
        does not contribute to an ancestor's `scrollWidth`. So the scroller had
        nothing to scroll — `scrollWidth === clientWidth` — and the text was
        genuinely unreachable, not merely off-screen. A check that only asks
        "is there a scrollable ancestor?" reports this as fine. It is not.

        `.lc-chart` carries a minimum width for exactly this reason, so echarts
        lays out where the labels fit, the wrapper gains real overflow, and the
        scroll becomes something a reader can actually perform.
      */}
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
            aria-label={describeFlow(data)}
          />
        )}
      </div>
      <p className="lc-caption">{built.caption}</p>
    </div>
  )
}
