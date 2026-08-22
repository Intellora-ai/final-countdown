import React from 'react'
import { scaleLinear, scaleBand } from 'd3-scale'
import { color, type, space, stroke, series, ink } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* CHARTS FROM A DERIVED PLAN — the renderer draws, the contract decided.
 *
 * Every judgement was already made by the chart contract: which mark, whether
 * the axis starts at zero, what the ticks are, which token index each series
 * takes. This file turns those decisions into SVG and makes none of its own.
 * That split is what stops two charts in one lesson disagreeing about what an
 * honest axis is.
 *
 * The ticks arrive from d3-scale's .nice() via derive(). Nothing here computes
 * a tick, so nothing here can compute a wrong one.
 *
 * WHY THE DISPATCH IS EXHAUSTIVE, having previously been `mark === 'bar'` and
 * an else. The contract can choose five marks. Four of them shared one branch,
 * so a `composition` of three unordered categories — India's GDP by sector —
 * was drawn as a descending LINE, asserting a trend across categories that
 * have no order, while the SVG's own aria-label announced "a pie chart". A
 * renderer that cannot draw what the contract chose must say so, not silently
 * draw something else. `assertNever` below makes a new mark a COMPILE error
 * rather than a wrong picture.
 *
 * AXES ARE PER-MARK, not global. A pie has no x and no y; drawing gridlines
 * and a value axis behind one is decoration that means nothing. Cartesian
 * marks keep the axes, and the DOM says which via `data-axis`.
 */
const H = 200
const PAD = { top: space.lg, right: space.lg, bottom: space.xxl, left: space.h1 }

type Mark = 'bar' | 'line' | 'area' | 'pie' | 'scatter'

interface ChartData {
  data: Array<Record<string, unknown>>
  x: { name: string; unit?: string }
  y: { name: string; unit?: string }
}

interface ChartDerived {
  mark: Mark
  yDomain: [number, number]
  yTicks: number[]
  xTicks: number[]
  seriesIndices: number[]
  legend: 'none' | 'inline' | 'block'
  xLabel: string
  yLabel: string
  downsampled: boolean
}

/** A mark with no branch is a compile error, not a silent fallthrough. */
function assertNever(x: never, mark: string): never {
  throw new Error(
    `ChartPanel has no branch for mark '${mark}'. Every mark the chart contract `
    + `can derive must have one; drawing a different mark instead would misstate the data.`,
  )
}

const CARTESIAN: ReadonlySet<Mark> = new Set<Mark>(['bar', 'line', 'area', 'scatter'])

/** Token colour for the nth category, wrapping rather than running off the end. */
function seriesColour(i: number): string {
  return series[i % series.length]
}

export function ChartPanel({ data, derived, disclosure, title }: PanelProps) {
  const d = data as unknown as ChartData
  const dv = derived as unknown as ChartDerived

  const W = 520
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom

  const rows = d.data
  const mark = dv.mark

  const heading = title ? (
    <h3 style={{
      fontFamily: type.title.family, fontSize: type.title.size,
      fontWeight: type.title.weight, letterSpacing: type.title.tracking,
      textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
    }}>{title}</h3>
  ) : null

  const notice = disclosure?.notice ? (
    <p style={{
      fontFamily: type.mono.family, fontSize: type.mono.size,
      color: ink.axis, margin: 0, marginTop: space.xs,
    }}>{disclosure.notice}</p>
  ) : null

  /* ── pie: a part-of-whole, drawn as parts of a whole ──────────────────── */
  if (mark === 'pie') {
    const slices = rows.map((r, i) => ({
      label: String(r[d.x.name]),
      value: Number(r[d.y.name]),
      colour: seriesColour(i),
    }))
    const usable = slices.filter((s) => Number.isFinite(s.value) && s.value > 0)
    const total = usable.reduce((sum, s) => sum + s.value, 0)

    /* A share chart of nothing is not an empty pie, it is a false one. Say so
     * rather than drawing a circle that implies a distribution exists. */
    if (!usable.length || total <= 0) {
      return (
        <div>
          {heading}
          <p data-chart="unrenderable" role="status" style={{
            fontFamily: type.mono.family, fontSize: type.mono.size,
            color: color.warning, margin: 0,
          }}>
            These values cannot be shares of a whole: they total {total}. Shown as no chart
            rather than a misleading one.
          </p>
          {notice}
        </div>
      )
    }

    const size = H
    const cx = size / 2
    const cy = size / 2
    const radius = size / 2 - space.lg

    let cursor = -Math.PI / 2 /* start at twelve o'clock */
    const sectors = usable.map((s) => {
      const fraction = s.value / total
      const start = cursor
      const end = cursor + fraction * Math.PI * 2
      cursor = end
      const mid = (start + end) / 2
      return { ...s, fraction, start, end, mid }
    })

    const pointOn = (angle: number, r: number) =>
      [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const

    /* A single slice is a full turn, and an arc whose start equals its end
     * draws nothing. A circle is the honest primitive for 100%. */
    const wholeCircle = sectors.length === 1

    return (
      <div>
        {heading}
        <svg viewBox={`0 0 ${W} ${size}`} width="100%" role="img"
          aria-label={
            `${dv.yLabel} by ${dv.xLabel}, drawn as a pie chart of ${sectors.length} `
            + `sectors: ${sectors.map((s) => `${s.label} ${Math.round(s.fraction * 100)}%`).join(', ')}.`
          }>
          {sectors.map((s) => {
            if (wholeCircle) {
              return (
                <circle key={s.label} data-mark="pie" data-category={s.label}
                  cx={cx} cy={cy} r={radius} fill={s.colour}
                  /* A lone sector still needs the arc grammar in its `d` for
                   * the same reason the others do; a circle has none, so the
                   * category is carried on the element instead. */
                  d={`M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`}>
                  <title>{s.label}: {s.value} ({Math.round(s.fraction * 100)}%)</title>
                </circle>
              )
            }
            const [sx, sy] = pointOn(s.start, radius)
            const [ex, ey] = pointOn(s.end, radius)
            const largeArc = s.end - s.start > Math.PI ? 1 : 0
            return (
              <path key={s.label} data-mark="pie" data-category={s.label}
                d={`M ${cx} ${cy} L ${sx.toFixed(2)} ${sy.toFixed(2)} `
                  + `A ${radius} ${radius} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`}
                fill={s.colour}
                stroke={color.surface} strokeWidth={stroke.base}>
                <title>{s.label}: {s.value} ({Math.round(s.fraction * 100)}%)</title>
              </path>
            )
          })}

          {/* The legend IS the labelling for a pie — an unlabelled sector is a
            * coloured wedge with no meaning. Percentages are stated because a
            * sector's angle encodes a share and a reader cannot measure one. */}
          {sectors.map((s, i) => (
            <g key={s.label} transform={`translate(${size + space.md},${space.lg + i * space.xl})`}>
              <rect width={space.md} height={space.md} rx={2} fill={s.colour} />
              <text x={space.lg} y={space.md} dominantBaseline="alphabetic"
                fill={color.text} fontSize={type.label.size} fontFamily={type.label.family}>
                {s.label}
              </text>
              <text x={space.lg} y={space.md + space.md} dominantBaseline="alphabetic"
                fill={color.textMuted} fontSize={type.micro.size} fontFamily={type.mono.family}>
                {s.value}{d.y.unit ? ` ${d.y.unit}` : ''} · {Math.round(s.fraction * 100)}%
              </text>
            </g>
          ))}
        </svg>
        {notice}
      </div>
    )
  }

  /* ── cartesian marks share one frame ──────────────────────────────────── */
  const ys = rows.map((r) => Number(r[d.y.name]))
  const y = scaleLinear().domain(dv.yDomain).range([ih, 0])

  const xsNumeric = rows.map((r) => Number(r[d.x.name])).filter((v) => Number.isFinite(v))
  const useBand = mark === 'bar' || mark === 'scatter' || xsNumeric.length !== rows.length
  const xBand = scaleBand<string>()
    .domain(rows.map((r) => String(r[d.x.name])))
    .range([0, iw])
    .padding(0.28)
  const xLin = scaleLinear()
    .domain([Math.min(...xsNumeric), Math.max(...xsNumeric)])
    .range([0, iw])

  const px = (r: Record<string, unknown>) =>
    useBand ? (xBand(String(r[d.x.name])) ?? 0) + xBand.bandwidth() / 2 : xLin(Number(r[d.x.name]))

  const linePath = rows
    .map((r, i) => `${i ? 'L' : 'M'} ${px(r).toFixed(2)} ${y(ys[i]).toFixed(2)}`)
    .join(' ')

  const accent = seriesColour(dv.seriesIndices?.[0] ?? 0)

  /* THE DISPATCH. Exhaustive by construction: the `assertNever` default makes
   * an unhandled mark a type error at build time. */
  let marks: React.ReactNode
  switch (mark) {
    case 'bar':
      marks = rows.map((r, i) => (
        <rect key={i} data-mark="bar" data-category={String(r[d.x.name])}
          x={xBand(String(r[d.x.name])) ?? 0}
          y={y(ys[i])}
          width={xBand.bandwidth()}
          height={Math.max(0, ih - y(ys[i]))}
          fill={accent}
          rx={2}
        >
          <title>{String(r[d.x.name])}: {ys[i]}</title>
        </rect>
      ))
      break

    case 'scatter':
      /* INDEPENDENT POINTS, AND NO PATH BETWEEN THEM. A relationship over
       * unordered categories has no sequence to trace, so a connecting line
       * would invent one. Every point is drawn — the old branch stopped
       * emitting dots past 24 rows, which turned a dense scatter into a bare
       * polyline: the marks vanished and only the invented line remained. */
      marks = rows.map((r, i) => (
        <circle key={i} data-mark="scatter" data-category={String(r[d.x.name])}
          cx={px(r)} cy={y(ys[i])} r={4} fill={accent}>
          <title>{String(r[d.x.name])}: {ys[i]}</title>
        </circle>
      ))
      break

    case 'area':
      marks = (
        <>
          <path data-mark="area"
            d={`${linePath} L ${px(rows[rows.length - 1])} ${ih} L ${px(rows[0])} ${ih} Z`}
            fill={accent} opacity={0.14} />
          <path data-mark="line" d={linePath} fill="none" stroke={accent}
            strokeWidth={stroke.bold} strokeLinecap="round" />
        </>
      )
      break

    case 'line':
      marks = (
        <>
          <path data-mark="line" d={linePath} fill="none" stroke={accent}
            strokeWidth={stroke.bold} strokeLinecap="round" />
          {rows.length <= 24 && rows.map((r, i) => (
            <circle key={i} data-point="line" cx={px(r)} cy={y(ys[i])} r={3} fill={accent} />
          ))}
        </>
      )
      break

    default:
      return assertNever(mark, String(mark))
  }

  return (
    <div>
      {heading}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`${dv.yLabel} against ${dv.xLabel}, ${rows.length} points, drawn as a ${mark} chart.`}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Horizontal gridlines only. Vertical ones fight the marks. */}
          {dv.yTicks.map((t) => (
            <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke={color.border} strokeWidth={stroke.hair} />
          ))}

          <line data-axis="x" x1={0} y1={ih} x2={iw} y2={ih} stroke={color.borderStrong} strokeWidth={stroke.hair} />
          <line data-axis="y" x1={0} y1={0} x2={0} y2={ih} stroke={color.borderStrong} strokeWidth={stroke.hair} />

          {dv.yTicks.map((t) => (
            <text key={t} x={-space.sm} y={y(t)} textAnchor="end" dominantBaseline="middle"
              fill={color.textMuted} fontSize={type.micro.size} fontFamily={type.mono.family}>{t}</text>
          ))}

          {marks}

          {/* x labels: every tick when they fit, thinned when they do not.
            * Thinning drops LABELS, never data — the marks all stay. */}
          {rows.map((r, i) => {
            const step = Math.ceil(rows.length / 8)
            if (i % step !== 0) return null
            return (
              <text key={i} x={px(r)} y={ih + space.lg} textAnchor="middle"
                fill={color.textMuted} fontSize={type.micro.size} fontFamily={type.mono.family}>
                {String(r[d.x.name])}
              </text>
            )
          })}

          <text x={iw / 2} y={ih + space.xxl} textAnchor="middle"
            fill={color.accent} fontSize={type.micro.size} fontFamily={type.mono.family}>{dv.xLabel}</text>
          <text transform={`translate(${-PAD.left + space.md},${ih / 2}) rotate(-90)`} textAnchor="middle"
            fill={color.accent} fontSize={type.micro.size} fontFamily={type.mono.family}>{dv.yLabel}</text>
        </g>
      </svg>

      {/* Downsampling that is not stated is a lie about the data. */}
      {notice}
    </div>
  )
}

/** Exported so a parity test can assert the renderer covers every derivable
 *  mark without reaching into the component's internals. */
export const RENDERABLE_MARKS: readonly Mark[] = ['bar', 'line', 'area', 'pie', 'scatter']
export { CARTESIAN as CARTESIAN_MARKS }
