import React from 'react'
import type { BarChartBlock as BarChartBlockData } from '../../types/learningBoard'
import { linearScale, ticks, baseline, fitLabel } from '../../lib/chartGeometry'
import { sample } from '../../perf/marks'

/* Bars from data. Negative values are legal and hang below the baseline —
 * the zero line is computed, not assumed to be the floor. A highlighted bar
 * uses the accent; every other bar uses the muted series colour, because a
 * chart where everything is highlighted highlights nothing. */
const W = 440, H = 240, PAD_L = 46, PAD_R = 12, PAD_T = 14, PAD_B = 34
/* Tick text is 11px; ~6.5px of advance per character is the measured average
 * for this face at that size. Used only to decide how many characters fit. */
const CHAR_PX = 6.5

export function BarChartBlock({ block }: { block: BarChartBlockData }) {
  const data = Array.isArray(block.data) ? block.data : []
  /* Unreachable from a validated board — the validator drops empty charts with
   * a notice. Said out loud anyway, because a chart that returns null leaves a
   * hole the learner cannot ask about. */
  if (!data.length) return <p data-board="chart-empty">No data to draw.</p>
  const t0 = performance.now()
  const values = data.map((d) => d.value)
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values)
  const y = linearScale(lo, hi, H - PAD_B, PAD_T)
  const zero = baseline(y)
  const tks = ticks(lo, hi)
  const innerW = W - PAD_L - PAD_R
  const step = innerW / data.length
  const barW = Math.min(56, step * 0.62)
  const labelCap = Math.max(3, Math.floor(step / CHAR_PX))
  sample('chart-geometry-ms', performance.now() - t0)

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
              {/* The full label lives here so a pointer recovers whatever the
                * axis had to shorten; the summary below carries it for screen
                * readers. Nothing is lost by truncating the drawn text. */}
              <title>{`${d.label}: ${d.value}`}</title>
              <rect x={x} y={top} width={barW} height={h} rx={4}
                data-board={d.highlight ? 'bar-highlight' : 'bar'} />
              <text x={x + barW / 2} y={H - PAD_B + 16} data-board="tick" textAnchor="middle">
                {fitLabel(d.label, labelCap)}
              </text>
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
