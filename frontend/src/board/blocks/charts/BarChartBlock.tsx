import React from 'react'
import type { BarChartBlock as BarChartBlockData } from '../../types/learningBoard'
import { linearScale, ticks, baseline } from '../../lib/chartGeometry'

/* Bars from data. Negative values are legal and hang below the baseline —
 * the zero line is computed, not assumed to be the floor. A highlighted bar
 * uses the accent; every other bar uses the muted series colour, because a
 * chart where everything is highlighted highlights nothing. */
const W = 440, H = 240, PAD_L = 46, PAD_R = 12, PAD_T = 14, PAD_B = 34

export function BarChartBlock({ block }: { block: BarChartBlockData }) {
  const data = Array.isArray(block.data) ? block.data : []
  if (!data.length) return null
  const values = data.map((d) => d.value)
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values)
  const y = linearScale(lo, hi, H - PAD_B, PAD_T)
  const zero = baseline(y)
  const tks = ticks(lo, hi)
  const innerW = W - PAD_L - PAD_R
  const step = innerW / data.length
  const barW = Math.min(56, step * 0.62)

  return (
    <div data-board="chart">
      <svg viewBox={`0 0 ${W} ${H}`} data-board="chart-svg" role="img"
        aria-label={(block.title || 'Values') + ' — bar chart'}>
        <desc>{data.map((d) => `${d.label}: ${d.value}`).join(', ')}</desc>
        {tks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} data-board="gridline" />
            <text x={PAD_L - 8} y={y(t)} data-board="tick" dominantBaseline="middle" textAnchor="end">{t}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={zero} y2={zero} data-board="axis" />
        {data.map((d, i) => {
          const x = PAD_L + step * i + (step - barW) / 2
          const yv = y(d.value)
          const top = Math.min(yv, zero), h = Math.max(1, Math.abs(yv - zero))
          return (
            <g key={i}>
              <rect x={x} y={top} width={barW} height={h} rx={4}
                data-board={d.highlight ? 'bar-highlight' : 'bar'} />
              <text x={x + barW / 2} y={H - PAD_B + 16} data-board="tick" textAnchor="middle">{d.label}</text>
            </g>
          )
        })}
      </svg>
      {block.yLabel ? <p data-board="chart-axis-label">{block.yLabel}</p> : null}
      <p data-board="visually-hidden">
        {(block.title || 'Bar chart') + ': ' + data.map((d) => `${d.label} ${d.value}`).join(', ') + '.'}
      </p>
    </div>
  )
}
