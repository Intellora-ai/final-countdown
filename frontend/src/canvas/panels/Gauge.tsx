import React from 'react'
import { useResolved, type ModelStore } from '../model/modelStore'
import { formatValue } from '../model/resolve'
import { color, pending, pendingSize, type } from '../design/tokens'

/* THE PRESSURE DIAL — a derived value, drawn as an arc.
 *
 * The needle's angle is the value's position between the pressures reachable
 * at the ends of the temperature slider, computed through the SAME formula the
 * graph samples. So the dial cannot show 165 kPa while the graph's marker sits
 * at 249: there is one pressure on this board and three ways of looking at it.
 */
export function Gauge({
  store,
  valueId,
  spanFrom,
  size = 62,
}: {
  store: ModelStore
  /** Derived id to display. */
  valueId: string
  /** Var whose declared range defines this dial's full sweep. */
  spanFrom: string
  size?: number
}) {
  const model = useResolved(store)
  const value = model.scope[valueId]
  const meta = model.meta[valueId]

  const domain = model.domains[spanFrom]
  const lo = domain ? model.evaluateAt(valueId, { [spanFrom]: domain[0] }) : null
  const hi = domain ? model.evaluateAt(valueId, { [spanFrom]: domain[1] }) : null

  const frac =
    typeof value === 'number' && lo !== null && hi !== null && hi !== lo
      ? Math.min(1, Math.max(0, (value - lo) / (hi - lo)))
      : 0

  const r = size / 2 - 5
  const cx = size / 2
  const cy = size / 2
  /* A 260° sweep starting at 140°, so the gap sits at the bottom like a dial. */
  const START = (140 * Math.PI) / 180
  const SWEEP = (260 * Math.PI) / 180

  const arc = (from: number, to: number) => {
    const x0 = cx + r * Math.cos(from), y0 = cy + r * Math.sin(from)
    const x1 = cx + r * Math.cos(to), y1 = cy + r * Math.sin(to)
    const large = to - from > Math.PI ? 1 : 0
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }

  const needle = START + SWEEP * frac

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: pendingSize.gap5 }}>
      <svg width={size} height={size} role="img"
        aria-label={`${meta?.label ?? valueId} ${formatValue(value, meta?.precision)} ${meta?.unit ?? ''}`}>
        <path d={arc(START, START + SWEEP)} fill="none" stroke={pending.white12} strokeWidth={5} strokeLinecap="round" />
        <path d={arc(START, needle)} fill="none" stroke={color.accent} strokeWidth={5} strokeLinecap="round" />
        <line
          x1={cx} y1={cy}
          x2={cx + (r - 9) * Math.cos(needle)}
          y2={cy + (r - 9) * Math.sin(needle)}
          stroke={color.text} strokeWidth={1.8} strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={2.6} fill={color.text} />
      </svg>
      <span data-sc="gauge-value" style={{ fontFamily: 'var(--sc-mono)', fontSize: type.label.size, color: 'var(--sc-ink)' }}>
        {formatValue(value, meta?.precision)} {meta?.unit ?? ''}
      </span>
    </div>
  )
}
