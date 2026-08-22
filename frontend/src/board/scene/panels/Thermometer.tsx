import React, { useCallback, useRef } from 'react'
import { useValue, type ModelStore } from '../../model/modelStore'

/* THE ONE CONTROL ON THE BOARD — a thermometer that writes to the model.
 *
 * It is a real slider under the paint: a native range input, absolutely
 * positioned over the drawn track at full opacity zero. Keyboard focus,
 * arrow keys, Home/End, screen-reader announcement and the operating system's
 * own pointer handling all come free, and the visible thermometer is only
 * ever a rendering of the value. Reimplementing that with pointer events is
 * how sliders end up unusable by anyone not holding a mouse.
 */
export function Thermometer({
  store,
  varId,
  min,
  max,
  unit,
  height = 132,
}: {
  store: ModelStore
  varId: string
  min: number
  max: number
  unit?: string
  height?: number
}) {
  const value = useValue(store, varId) ?? min
  const ref = useRef<HTMLInputElement | null>(null)
  const frac = max > min ? (value - min) / (max - min) : 0
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => store.set(varId, Number(e.currentTarget.value)),
    [store, varId],
  )

  const trackW = 7
  const bulbR = 9

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
      <div style={{ position: 'relative', width: 26, height }}>
        <svg width={26} height={height} aria-hidden="true">
          <rect x={(26 - trackW) / 2} y={2} width={trackW} height={height - bulbR - 6} rx={trackW / 2}
            fill="rgba(255,255,255,0.10)" />
          <rect
            x={(26 - trackW) / 2}
            y={2 + (height - bulbR - 6) * (1 - frac)}
            width={trackW}
            height={(height - bulbR - 6) * frac}
            rx={trackW / 2}
            fill="url(#therm)"
          />
          <defs>
            <linearGradient id="therm" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#5eead4" />
            </linearGradient>
          </defs>
          <circle cx={13} cy={2 + (height - bulbR - 6) * (1 - frac)} r={5.5}
            fill="#eafcff" stroke="#22d3ee" strokeWidth={1.5} />
          <circle cx={13} cy={height - bulbR} r={bulbR} fill="#22d3ee" opacity={0.9} />
        </svg>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={1}
          value={Math.round(value)}
          onChange={onChange}
          aria-label={`Temperature${unit ? ` in ${unit}` : ''}`}
          style={{
            position: 'absolute', inset: 0,
            width: height, height: 26,
            transform: `rotate(-90deg) translate(${-height / 2 + 13}px, ${height / 2 - 13}px)`,
            transformOrigin: 'center',
            opacity: 0, cursor: 'ns-resize', margin: 0,
          }}
        />
      </div>
      <span style={{ fontFamily: 'var(--sc-mono)', fontSize: 12, color: 'var(--sc-accent-soft)' }}>
        {Math.round(value)}{unit ?? ''}
      </span>
    </div>
  )
}
