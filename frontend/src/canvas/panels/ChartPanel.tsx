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
 */
const H = 200
const PAD = { top: space.lg, right: space.lg, bottom: space.xxl, left: space.h1 }

export function ChartPanel({ data, derived, disclosure, title }: PanelProps) {
  const d = data as {
    data: Array<Record<string, unknown>>
    x: { name: string; unit?: string }
    y: { name: string; unit?: string }
  }
  const dv = derived as unknown as {
    mark: 'bar' | 'line' | 'area' | 'pie' | 'scatter'
    yDomain: [number, number]
    yTicks: number[]
    xTicks: number[]
    seriesIndices: number[]
    legend: 'none' | 'inline' | 'block'
    xLabel: string
    yLabel: string
    downsampled: boolean
  }

  const W = 520
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom

  const rows = d.data
  const ys = rows.map((r) => Number(r[d.y.name]))
  const y = scaleLinear().domain(dv.yDomain).range([ih, 0])

  const xsNumeric = rows.map((r) => Number(r[d.x.name])).filter((v) => Number.isFinite(v))
  const useBand = dv.mark === 'bar' || xsNumeric.length !== rows.length
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

  const accent = series[dv.seriesIndices?.[0] ?? 0]

  return (
    <div>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
        }}>{title}</h3>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`${dv.yLabel} against ${dv.xLabel}, ${rows.length} points, drawn as a ${dv.mark} chart.`}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Horizontal gridlines only. Vertical ones fight the marks. */}
          {dv.yTicks.map((t) => (
            <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke={color.border} strokeWidth={stroke.hair} />
          ))}

          <line x1={0} y1={ih} x2={iw} y2={ih} stroke={color.borderStrong} strokeWidth={stroke.hair} />
          <line x1={0} y1={0} x2={0} y2={ih} stroke={color.borderStrong} strokeWidth={stroke.hair} />

          {dv.yTicks.map((t) => (
            <text key={t} x={-space.sm} y={y(t)} textAnchor="end" dominantBaseline="middle"
              fill={color.textMuted} fontSize={type.micro.size} fontFamily={type.mono.family}>{t}</text>
          ))}

          {dv.mark === 'bar'
            ? rows.map((r, i) => {
                const h = Math.max(0, ih - y(ys[i]))
                return (
                  <rect key={i}
                    x={xBand(String(r[d.x.name])) ?? 0}
                    y={y(ys[i])}
                    width={xBand.bandwidth()}
                    height={h}
                    fill={accent}
                    rx={2}
                  />
                )
              })
            : (
              <>
                {dv.mark === 'area' && (
                  <path d={`${linePath} L ${px(rows[rows.length - 1])} ${ih} L ${px(rows[0])} ${ih} Z`}
                    fill={accent} opacity={0.14} />
                )}
                <path d={linePath} fill="none" stroke={accent} strokeWidth={stroke.bold} strokeLinecap="round" />
                {rows.length <= 24 && rows.map((r, i) => (
                  <circle key={i} cx={px(r)} cy={y(ys[i])} r={3} fill={accent} />
                ))}
              </>
            )}

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
      {disclosure?.notice && (
        <p style={{
          fontFamily: type.mono.family, fontSize: type.mono.size,
          color: ink.axis, margin: 0, marginTop: space.xs,
        }}>{disclosure.notice}</p>
      )}
    </div>
  )
}
