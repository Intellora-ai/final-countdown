import React, { useMemo } from 'react'
import { useValue, type ModelStore } from '../model/modelStore'
import { color, pending } from '../design/tokens'

/* THE 2D FACE OF THE SAME BOX — what the toggle actually switches to.
 *
 * A 2D mode that showed a picture of the 3D mode would make the toggle a lie.
 * This is a genuine flat projection: same seeded particles, same √T speed law,
 * same wall, drawn as SVG with no WebGL context at all. That matters for more
 * than honesty — it is the fallback when WebGL is unavailable, and it is the
 * cheap mode on a low-power device.
 *
 * STATIC BY CONSTRUCTION. Positions are a pure function of the seed and the
 * arrow lengths a pure function of temperature, so nothing animates and the
 * panel is reduced-motion safe without a media query.
 */
const N = 16

function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function ParticleBox2D({
  store, varId, width = 232, height = 214,
}: { store: ModelStore; varId: string; width?: number; height?: number }) {
  const t = useValue(store, varId)
  const resolved = store.getResolved()
  const t0 = resolved.domains[varId]?.[0] ?? 1
  const speed = typeof t === 'number' && t > 0 && t0 > 0 ? Math.sqrt(t / t0) : 1

  const pad = 22
  const particles = useMemo(
    () => Array.from({ length: N }, (_, i) => ({
      x: pad + seeded(i, 4) * (width - pad * 2),
      y: pad + seeded(i, 5) * (height - pad * 2),
      a: seeded(i, 3) * Math.PI * 2,
    })),
    [width, height],
  )

  return (
    <svg width={width} height={height} role="img"
      aria-label={`Gas particles in a fixed container at ${Math.round(t ?? 0)} kelvin, moving at ${speed.toFixed(2)} times the speed at ${t0} kelvin.`}>
      <defs>
        <linearGradient id="box2d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color.borderStrong} />
          <stop offset="100%" stopColor={pending.white03} />
        </linearGradient>
      </defs>
      <rect x={3} y={3} width={width - 6} height={height - 6} rx={12}
        fill="url(#box2d)" stroke={pending.glassStroke2d} strokeWidth={1.1} />
      {particles.map((p, i) => {
        const len = 9 * speed
        const dx = Math.cos(p.a) * len, dy = Math.sin(p.a) * len
        return (
          <g key={i}>
            <line x1={p.x - dx} y1={p.y - dy} x2={p.x} y2={p.y} stroke={color.accentGlow} strokeWidth={1.1} opacity={0.55} />
            <circle cx={p.x} cy={p.y} r={7} fill={pending.particleCore} opacity={0.16} />
            <circle cx={p.x} cy={p.y} r={3.6} fill={pending.particleHalo} />
          </g>
        )
      })}
    </svg>
  )
}
