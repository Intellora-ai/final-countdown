import React, { useMemo, useState } from 'react'
import type { SimulationBlock as SimulationBlockData } from '../types/learningBoard'

/* A 2D particle box that tells the truth.
 *
 * THE PHYSICS, AND ITS STATED LIMITS. Pressure is shown proportional to
 * temperature, which holds only at constant volume with a fixed amount of gas
 * — so the caption says exactly that, on the board, where the learner reads
 * it. Temperature is Kelvin because P ∝ T is false in Celsius. Arrow length
 * scales with √(T/T₀), the real kinetic relationship; speed is shown as a
 * multiple of the speed at minTemp rather than in m/s, because this box has
 * no mass and no scale, and a number in real units would be invented.
 *
 * THE SLIDER IS THE ONE LIVE CONTROL IN PHASE 1B. Every shell control remains
 * inert. There is no animation loop and no timer: the scene is a pure function
 * of the slider value, deterministic (positions seeded by index, never
 * Math.random), which is also what makes it reduced-motion safe by
 * construction — nothing moves unless the learner moves it.
 */
const W = 320, H = 220, PAD = 18
const PARTICLES = 18

function seeded(i: number, salt: number): number {
  /* Deterministic pseudo-random in [0,1): a hash, not a clock, not Math.random. */
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function SimulationBlock({ block }: { block: SimulationBlockData }) {
  const min = block.minTemp, max = block.maxTemp
  const [temp, setTemp] = useState(() => Math.min(max, Math.max(min, block.initialTemp)))
  const speed = Math.sqrt(temp / min)
  const pressure = Math.round((temp / min) * 100)

  const particles = useMemo(
    () => Array.from({ length: PARTICLES }, (_, i) => ({
      x: PAD + seeded(i, 1) * (W - PAD * 2),
      y: PAD + seeded(i, 2) * (H - PAD * 2),
      angle: seeded(i, 3) * Math.PI * 2,
    })),
    [],
  )

  return (
    <div data-board="sim">
      <div data-board="sim-row">
        <svg viewBox={`0 0 ${W} ${H}`} data-board="sim-svg" role="img"
          aria-label={`Particle box at ${Math.round(temp)} kelvin; particle speed ${speed.toFixed(2)} times the base speed`}>
          <desc>Gas particles in a fixed container. Higher temperature means faster particles and more frequent wall collisions.</desc>
          <rect x={2} y={2} width={W - 4} height={H - 4} rx={14} data-board="sim-box" />
          {particles.map((p, i) => {
            const len = 8 * speed
            const dx = Math.cos(p.angle) * len, dy = Math.sin(p.angle) * len
            return (
              <g key={i}>
                <line x1={p.x} y1={p.y} x2={p.x - dx} y2={p.y - dy} data-board="sim-trail" />
                <circle cx={p.x} cy={p.y} r={4} data-board="sim-particle" />
              </g>
            )
          })}
        </svg>
        <div data-board="sim-readout">
          <label data-board="sim-control">
            <span data-board="sim-label">Temperature</span>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={temp}
              onChange={(e) => setTemp(Number(e.currentTarget.value))}
              aria-label={`Temperature in kelvin, ${min} to ${max}`}
            />
            <span data-board="sim-value">{Math.round(temp)} K</span>
          </label>
          <dl data-board="sim-figures">
            <div><dt>Particle speed</dt><dd>{speed.toFixed(2)}× base</dd></div>
            <div><dt>Relative pressure</dt><dd>{pressure}%</dd></div>
          </dl>
        </div>
      </div>
      <p data-board="sim-caption">
        P ∝ T — assumes constant volume and a fixed amount of gas. Speed shown relative to {min} K.
      </p>
    </div>
  )
}
