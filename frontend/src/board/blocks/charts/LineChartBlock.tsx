import React from 'react'
import type { LineChartBlock as LineChartBlockData } from '../../types/learningBoard'
import { linearScale, ticks, linePath, baseline, fitLabel } from '../../lib/chartGeometry'
import { sample } from '../../perf/marks'

/* An ordered series. X positions come from point ORDER when x is categorical
 * and from value when numeric — the heating-curve fixture uses numeric heat
 * on x, so the plateau is genuinely flat rather than decoratively flat.
 * One point renders one marker: a line needs two ends, a fact this component
 * respects instead of hiding. */
const W = 460, H = 240, PAD_L = 46, PAD_R = 16, PAD_T = 14, PAD_B = 34

export function LineChartBlock({ block }: { block: LineChartBlockData }) {
  const pts = Array.isArray(block.points) ? block.points : []
  /* Unreachable from a validated board; visible rather than silent if a future
   * caller ever bypasses the validator. */
  if (!pts.length) return <p data-board="chart-empty">No data to draw.</p>
  const t0 = performance.now()
  const numericX = pts.every((p) => typeof p.x === 'number')
  const xsRaw = numericX ? pts.map((p) => p.x as number) : pts.map((_, i) => i)
  const ys = pts.map((p) => p.y)
  const x = linearScale(Math.min(...xsRaw), Math.max(...xsRaw), PAD_L, W - PAD_R)
  const lo = Math.min(0, ...ys), hi = Math.max(...ys)
  const y = linearScale(lo, hi, H - PAD_B, PAD_T)
  const X = xsRaw.map((v) => x(v)), Y = ys.map((v) => y(v))
  const hl = typeof block.highlightIndex === 'number' && pts[block.highlightIndex] ? block.highlightIndex : null
  const tks = ticks(lo, hi)
  /* Categorical ticks are already thinned to at most eight; the width each
   * survivor gets is what decides how much of its label can be drawn. */
  const shownTicks = Math.min(pts.length, 8)
  const labelCap = Math.max(3, Math.floor((W - PAD_L - PAD_R) / shownTicks / 6.5))
  sample('chart-geometry-ms', performance.now() - t0)

  return (
    <div data-board="chart">
      <svg viewBox={`0 0 ${W} ${H}`} data-board="chart-svg" role="img"
        aria-label={(block.title || 'Series') + ' — line chart'}>
        <desc>{pts.map((p) => `${p.x}: ${p.y}`).join(', ')}</desc>
        {tks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} data-board="gridline" />
            <text x={PAD_L - 8} y={y(t)} data-board="tick" dominantBaseline="middle" textAnchor="end">{t}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={baseline(y)} y2={baseline(y)} data-board="axis" />
        {pts.length > 1 && <path d={linePath(X, Y)} data-board="line" fill="none" />}
        {pts.map((p, i) => (
          <circle key={i} cx={X[i]} cy={Y[i]} r={hl === i ? 5 : pts.length === 1 ? 5 : 2.5}
            data-board={hl === i ? 'point-highlight' : 'point'} />
        ))}
        {!numericX && pts.map((p, i) => (
          (pts.length <= 8 || i % Math.ceil(pts.length / 8) === 0) &&
          <text key={'l' + i} x={X[i]} y={H - PAD_B + 16} data-board="tick" textAnchor="middle">
            <title>{`${p.x}: ${p.y}`}</title>
            {fitLabel(String(p.x), labelCap)}
          </text>
        ))}
      </svg>
      {(block.xLabel || block.yLabel) && (
        <p data-board="chart-axis-label">
          {block.yLabel}{block.xLabel && block.yLabel ? ' · ' : ''}{block.xLabel}
        </p>
      )}
      <p data-board="visually-hidden">
        {(block.title || 'Line chart') + ': ' + pts.map((p) => `${p.x}, ${p.y}`).join('; ') + '.'}
      </p>
    </div>
  )
}
