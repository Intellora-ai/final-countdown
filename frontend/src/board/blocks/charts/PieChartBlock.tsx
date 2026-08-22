import React from 'react'
import type { PieChartBlock as PieChartBlockData } from '../../types/learningBoard'
import { pieArcs } from '../../lib/chartGeometry'
import { sample } from '../../perf/marks'

/* A ring chart, drawn from data. All arithmetic lives in chartGeometry (where
 * it is unit-tested); this file is markup. Colours come from the board ramp
 * (--board-series-N in the theme), never from data.
 *
 * ACCESSIBILITY IS THE DATA, TWICE. The <desc> names the chart for the SVG
 * itself; the visually-hidden list states every label and value in text, so a
 * screen reader gets the same information a sighted learner reads off the
 * ring. A chart that only LOOKS informative is decoration for half the room. */
const SIZE = 220
const R_OUT = 88
const R_IN = 56

export function PieChartBlock({ block }: { block: PieChartBlockData }) {
  const data = Array.isArray(block.data) ? block.data : []
  const t0 = performance.now()
  const arcs = pieArcs(data.map((d) => d.value), SIZE / 2, SIZE / 2, R_OUT, R_IN)
  sample('chart-geometry-ms', performance.now() - t0)
  /* Unreachable from a validated board; visible rather than silent if a future
   * caller ever bypasses the validator. Legend labels wrap in HTML, so a pie
   * needs no truncation the way an axis does. */
  if (!arcs.length) return <p data-board="chart-empty">No data to draw.</p>
  const total = data.reduce((n, d) => n + d.value, 0)
  return (
    <div data-board="chart">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} data-board="chart-svg" role="img"
        aria-label={(block.title || 'Distribution') + ' — ring chart'}>
        <desc>{data.map((d) => `${d.label}: ${d.value}`).join(', ')}</desc>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} data-board="series" data-series={i % 5} />
        ))}
      </svg>
      <ul data-board="chart-legend">
        {data.map((d, i) => (
          <li key={i}>
            <span data-board="legend-swatch" data-series={i % 5} aria-hidden="true" />
            <span data-board="legend-label">{d.label}</span>
            <span data-board="legend-value">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <p data-board="visually-hidden">
        {(block.title || 'Distribution') + ': ' + data.map((d) => `${d.label} ${Math.round((d.value / total) * 100)} percent`).join(', ') + '.'}
      </p>
    </div>
  )
}
