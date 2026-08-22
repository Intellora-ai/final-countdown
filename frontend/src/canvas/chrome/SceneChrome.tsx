import React from 'react'

/* THE CHROME — everything that is the application rather than the explanation.
 *
 * It sits OUTSIDE the transformed world, deliberately: pan and zoom move the
 * board, never the controls. A zoom rail that scaled with the thing it zooms
 * is the classic infinite-canvas bug, and keeping the chrome in screen space
 * makes it unrepresentable rather than merely avoided.
 */

export function IconBack() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3 L5 8 L10 13" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
export function IconLayers() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8 L14.5 5.2 L8 8.6 L1.5 5.2 Z" stroke="currentColor" strokeWidth={1.15} strokeLinejoin="round" />
      <path d="M2.4 8 L8 10.9 L13.6 8" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.4 10.8 L8 13.7 L13.6 10.8" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
export function IconPanel() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x={1.8} y={2.8} width={12.4} height={10.4} rx={2} stroke="currentColor" strokeWidth={1.15} />
      <line x1={6.4} y1={2.8} x2={6.4} y2={13.2} stroke="currentColor" strokeWidth={1.15} />
    </svg>
  )
}
export function IconZoom() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx={7} cy={7} r={4.4} stroke="currentColor" strokeWidth={1.2} />
      <line x1={10.4} y1={10.4} x2={13.6} y2={13.6} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  )
}
export function IconFit() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {[[2, 6, 2, 2, 6, 2], [14, 6, 14, 2, 10, 2], [2, 10, 2, 14, 6, 14], [14, 10, 14, 14, 10, 14]].map((p, i) => (
        <polyline key={i} points={`${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]}`}
          stroke="currentColor" strokeWidth={1.25} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

export function DimensionToggle({
  value, onChange, style,
}: { value: '2D' | '3D'; onChange: (v: '2D' | '3D') => void; style?: React.CSSProperties }) {
  return (
    <div className="sc-seg" style={style} role="group" aria-label="Dimension">
      {(['2D', '3D'] as const).map((v) => (
        <button key={v} data-on={value === v} onClick={() => onChange(v)} aria-pressed={value === v}>{v}</button>
      ))}
    </div>
  )
}

export function ZoomRail({
  scale, min, max, onZoom, style,
}: {
  scale: number
  min: number
  max: number
  onZoom: (next: number) => void
  style?: React.CSSProperties
}) {
  const frac = max > min ? (scale - min) / (max - min) : 0
  return (
    <div className="sc-rail" style={{ height: 190, ...style }}>
      <button onClick={() => onZoom(scale * 1.2)} aria-label="Zoom in">+</button>
      <div className="sc-rail-track">
        <div className="sc-rail-thumb" style={{ bottom: `calc(${(frac * 100).toFixed(1)}% - 4.5px)` }} />
      </div>
      <button onClick={() => onZoom(scale / 1.2)} aria-label="Zoom out">−</button>
    </div>
  )
}
