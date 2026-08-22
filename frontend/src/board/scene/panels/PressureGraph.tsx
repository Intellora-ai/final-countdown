import React, { useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import { useResolved, type ModelStore } from '../../model/modelStore'

/* PANEL ④ — Pressure against Temperature, with an axis that cannot be wrong.
 *
 * THE BUG THIS PANEL EXISTS TO MAKE IMPOSSIBLE. The reference image this scene
 * reproduces has a y-axis reading 200, 150, 100, 110 — descending, then not.
 * That is what happens when the thing that draws a chart is also the thing
 * that invents its numbers. Here the model supplies a RELATION (P = nRT/V) and
 * a domain; the ticks come from d3-scale's .nice(), which by construction
 * emits an ascending, evenly-spaced, round-numbered sequence. There is no code
 * path in this file that can produce a non-monotonic axis, because there is no
 * code in this file that chooses tick values at all.
 *
 * THE CURVE IS SAMPLED FROM THE SAME MODEL THE CUBE USES. Not a drawn path,
 * not a list of points a generator typed: forty samples of the board's own
 * pressure formula. The marker sits at the learner's current T. Move the
 * thermometer and the marker slides along a line it is guaranteed to be on.
 */

const SAMPLES = 40

export function PressureGraph({
  store,
  xVar,
  yVar,
  width,
  height,
}: {
  store: ModelStore
  /** Model variable on the x-axis — the one the learner controls. */
  xVar: string
  /** Derived value on the y-axis. */
  yVar: string
  width: number
  height: number
}) {
  const model = useResolved(store)
  const meta = model.meta

  const pad = { top: 16, right: 14, bottom: 34, left: 52 }
  const iw = width - pad.left - pad.right
  const ih = height - pad.top - pad.bottom

  const xInfo = model.domains[xVar]
  const current = model.scope[xVar]

  const { xs, ys, x, y, xTicks, yTicks, path } = useMemo(() => {
    const x0 = xInfo ? xInfo[0] : 0
    const x1 = xInfo ? xInfo[1] : 1

    /* Sample the board's own relation across the variable's full range. */
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const xv = x0 + ((x1 - x0) * i) / (SAMPLES - 1)
      const yv = model.evaluateAt(yVar, { [xVar]: xv })
      if (yv === null) continue
      xs.push(xv)
      ys.push(yv)
    }

    /* .nice() rounds the domain outward to round numbers, so the ticks it then
     * emits are round, ascending and evenly spaced. Not a convention — the
     * postcondition of the function. */
    const x = scaleLinear().domain([x0, x1]).nice(6).range([0, iw])
    const yMax = ys.length ? Math.max(...ys) : 1
    const yMin = Math.min(0, ys.length ? Math.min(...ys) : 0)
    const y = scaleLinear().domain([yMin, yMax]).nice(5).range([ih, 0])

    const path = xs.length
      ? xs.map((xv, i) => `${i ? 'L' : 'M'} ${x(xv).toFixed(2)} ${y(ys[i]).toFixed(2)}`).join(' ')
      : ''

    return { xs, ys, x, y, xTicks: x.ticks(6), yTicks: y.ticks(5), path }
  }, [xInfo, yVar, xVar, iw, ih, model])

  const curY = model.scope[yVar]
  const hasMarker =
    typeof current === 'number' && typeof curY === 'number' && Number.isFinite(curY)
  const mx = hasMarker ? x(current) : 0
  const my = hasMarker ? y(curY) : 0

  /* Dots along the curve, as the reference has — evenly spaced, on the line. */
  const dots = useMemo(() => {
    const out: Array<{ cx: number; cy: number }> = []
    if (xs.length < 2) return out
    for (let i = 1; i <= 4; i++) {
      const k = Math.round(((xs.length - 1) * i) / 5)
      out.push({ cx: x(xs[k]), cy: y(ys[k]) })
    }
    return out
  }, [xs, ys, x, y])

  const xLabel = `${meta[xVar]?.label ?? xVar}${meta[xVar]?.unit ? ` [${meta[xVar].unit}]` : ''}`
  const yLabel = `${meta[yVar]?.label ?? yVar}${meta[yVar]?.unit ? ` [${meta[yVar].unit}]` : ''}`

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`${yLabel} against ${xLabel}. Currently ${Math.round(current ?? 0)} ${meta[xVar]?.unit ?? ''} giving ${Math.round(curY ?? 0)} ${meta[yVar]?.unit ?? ''}.`}
    >
      <g transform={`translate(${pad.left},${pad.top})`}>
        {/* grid */}
        {yTicks.map((t) => (
          <line key={`gy${t}`} x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
        ))}
        {xTicks.map((t) => (
          <line key={`gx${t}`} y1={0} y2={ih} x1={x(t)} x2={x(t)} stroke="rgba(255,255,255,0.055)" />
        ))}

        {/* axes */}
        <line x1={0} y1={ih} x2={iw} y2={ih} stroke="rgba(255,255,255,0.32)" />
        <line x1={0} y1={0} x2={0} y2={ih} stroke="rgba(255,255,255,0.32)" />

        {yTicks.map((t) => (
          <text key={`ty${t}`} x={-8} y={y(t)} textAnchor="end" dominantBaseline="middle"
            fill="#9aa5ad" fontSize={10} fontFamily="ui-monospace, monospace">{t}</text>
        ))}
        {xTicks.map((t) => (
          <text key={`tx${t}`} x={x(t)} y={ih + 13} textAnchor="middle"
            fill="#9aa5ad" fontSize={10} fontFamily="ui-monospace, monospace">{t}</text>
        ))}

        {/* the relation */}
        <path d={path} fill="none" stroke="#2dd4bf" strokeWidth={1.7} strokeLinecap="round" />
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={3} fill="#2dd4bf" />
        ))}

        {/* where the learner is standing */}
        {hasMarker && (
          <g>
            <line x1={0} y1={my} x2={mx} y2={my} stroke="rgba(255,255,255,0.42)" strokeDasharray="3 3" />
            <line x1={mx} y1={my} x2={mx} y2={ih} stroke="rgba(255,255,255,0.42)" strokeDasharray="3 3" />
            <circle cx={mx} cy={my} r={5.5} fill="#0e1113" stroke="#5eead4" strokeWidth={2} />
            <text x={mx + 10} y={my + 12} fill="#e8eef2" fontSize={10.5} fontFamily="ui-monospace, monospace">
              {Math.round(current)}{meta[xVar]?.unit ?? ''}
            </text>
          </g>
        )}

        <text x={iw * 0.52} y={12} fill="#cbd5d1" fontSize={11} fontStyle="italic"
          fontFamily="'Fraunces', Georgia, serif">(P = kT)</text>

        <text x={iw / 2} y={ih + 27} textAnchor="middle" fill="#2dd4bf" fontSize={10}
          fontFamily="ui-monospace, monospace">{xLabel}</text>
        <text transform={`translate(${-33},${ih / 2}) rotate(-90)`} textAnchor="middle"
          fill="#2dd4bf" fontSize={10} fontFamily="ui-monospace, monospace">{yLabel}</text>
      </g>
    </svg>
  )
}
