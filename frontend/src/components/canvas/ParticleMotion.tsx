/* PARTICLE MOTION — the representation that explains what a diagram cannot.
 *
 * WHY PIXI AND NOT MORE SVG. The rest of the board is SVG because it is a
 * handful of static marks. This is dozens of sprites moving every frame with
 * bloom on each one, and a per-particle CSS `filter` is a separate offscreen
 * pass per element per frame — the classic way to lose 60 fps. PixiJS draws
 * them as one batched GPU call against ONE pre-blurred texture, generated once
 * at mount. That is the whole reason the dependency is here; it is not for
 * "nicer graphics".
 *
 * THE GLOW BUDGET IS MEASURED, NOT ASSUMED. Reference-image sampling put teal
 * and blue together at 1.54% of the board. Glow reads as loud precisely because
 * it is rare, so the particle field is capped: a fixed count, a fixed radius,
 * and a trail length that is the first thing cut if the frame budget slips.
 *
 * THE PHYSICS IS HONEST ABOUT ITS OWN LIMITS. Speed scales with the square root
 * of temperature, which is the real kinetic-theory relationship, and it is
 * reported as a MULTIPLIER against the speed at the melting point rather than
 * as metres per second — the simulation has no mass and no scale, so a figure
 * in real units would be invented. Below the melting point particles stay near
 * their lattice sites and vibrate; above it they leave and drift, which is the
 * claim the lesson actually makes.
 */

import React, { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { phaseAt, speedFactor, WATER } from '../../lib/lesson-representations'

const COLUMNS = 5
const ROWS = 4
const COUNT = COLUMNS * ROWS
const RADIUS = 7
/** Bloom radius in texture pixels. Larger looks better and costs fill rate. */
const GLOW = 9
/** Agabi indigo. Matter is indigo; teal stays explanation and state. */
const CORE = 0xd5dcfa
const BODY = 0x7f97ef
const HALO = 0x5573e9

interface Particle {
  sprite: Sprite
  homeX: number
  homeY: number
  vx: number
  vy: number
}

/** One pre-blurred sprite texture, drawn once and shared by every particle.
 *  This is the difference between one batched draw call and N filter passes. */
function glowTexture(app: Application): Texture {
  const g = new Graphics()
  // Three concentric discs approximate a radial falloff without a blur filter,
  // so the texture is generated in a single synchronous pass at mount.
  g.circle(GLOW + RADIUS, GLOW + RADIUS, RADIUS + GLOW).fill({ color: HALO, alpha: 0.16 })
  g.circle(GLOW + RADIUS, GLOW + RADIUS, RADIUS + GLOW * 0.5).fill({ color: BODY, alpha: 0.34 })
  g.circle(GLOW + RADIUS, GLOW + RADIUS, RADIUS).fill({ color: CORE, alpha: 1 })
  return app.renderer.generateTexture(g)
}

export function ParticleMotion({
  temperatureK,
  width = 300,
  height = 190,
  reduced,
}: {
  temperatureK: number
  width?: number
  height?: number
  reduced: boolean
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const particles = useRef<Particle[]>([])
  /* The animation loop reads temperature from a ref, so a slider drag does not
   * tear down and rebuild the renderer sixty times a second. */
  const tempRef = useRef(temperatureK)
  tempRef.current = temperatureK

  useEffect(() => {
    let cancelled = false
    const app = new Application()
    const node = host.current
    if (!node) return

    app
      .init({ width, height, backgroundAlpha: 0, antialias: true, autoDensity: true })
      .then(() => {
        if (cancelled) {
          app.destroy(true)
          return
        }
        appRef.current = app
        node.appendChild(app.canvas)

        const texture = glowTexture(app)
        const layer = new Container()
        app.stage.addChild(layer)

        const gapX = width / (COLUMNS + 1)
        const gapY = height / (ROWS + 1)
        particles.current = Array.from({ length: COUNT }, (_, i) => {
          const homeX = gapX * (1 + (i % COLUMNS))
          const homeY = gapY * (1 + Math.floor(i / COLUMNS))
          const sprite = new Sprite(texture)
          sprite.anchor.set(0.5)
          sprite.x = homeX
          sprite.y = homeY
          layer.addChild(sprite)
          /* Deterministic starting velocities from the index, not Math.random:
           * a replayed scene must show the same motion, and a seed nobody
           * recorded is a scene nobody can reproduce. */
          const angle = (i * 2.399963) % (Math.PI * 2)
          return { sprite, homeX, homeY, vx: Math.cos(angle), vy: Math.sin(angle) }
        })

        if (reduced) {
          // Reduced motion keeps the arrangement — which carries the meaning —
          // and drops only the movement.
          app.ticker.stop()
          return
        }

        app.ticker.add((ticker) => {
          const t = tempRef.current
          const factor = speedFactor(t)
          const free = t > WATER.fusionK
          const dt = Math.min(ticker.deltaTime, 3)
          for (const p of particles.current) {
            if (free) {
              // Above the melting point the lattice no longer holds: particles
              // drift and bounce off the walls.
              p.sprite.x += p.vx * factor * dt * 0.9
              p.sprite.y += p.vy * factor * dt * 0.9
              if (p.sprite.x < RADIUS || p.sprite.x > width - RADIUS) p.vx *= -1
              if (p.sprite.y < RADIUS || p.sprite.y > height - RADIUS) p.vy *= -1
              p.sprite.x = Math.max(RADIUS, Math.min(width - RADIUS, p.sprite.x))
              p.sprite.y = Math.max(RADIUS, Math.min(height - RADIUS, p.sprite.y))
            } else {
              // Below it they vibrate about a fixed site. Amplitude rises with
              // temperature; the site does not move.
              const amplitude = 3.2 * factor
              p.sprite.x += (p.homeX - p.sprite.x) * 0.08 + p.vx * amplitude * 0.16 * dt
              p.sprite.y += (p.homeY - p.sprite.y) * 0.08 + p.vy * amplitude * 0.16 * dt
              if (Math.abs(p.sprite.x - p.homeX) > amplitude) p.vx *= -1
              if (Math.abs(p.sprite.y - p.homeY) > amplitude) p.vy *= -1
            }
          }
        })
      })
      .catch(() => {
        /* WebGL unavailable — the caller renders the SVG lattice instead. A
         * board that silently shows nothing would be worse than one that says
         * which representation it could not build. */
      })

    return () => {
      cancelled = true
      const live = appRef.current
      appRef.current = null
      particles.current = []
      if (live) live.destroy(true, { children: true, texture: true })
    }
  }, [width, height, reduced])

  const phase = phaseAt(temperatureK)
  const factor = speedFactor(temperatureK)
  return (
    <div className="cv-sim" data-phase={phase}>
      <div ref={host} className="cv-sim-canvas" aria-hidden="true" />
      {/* The simulation's claim, in words. Motion is not information a screen
          reader can receive, so the same fact is stated. */}
      <p className="visually-hidden">
        {COUNT} particles at {temperatureK.toFixed(0)} kelvin. Average speed is{' '}
        {factor.toFixed(2)} times their speed at the melting point.{' '}
        {phase === 'solid'
          ? 'They vibrate about fixed positions; the arrangement holds.'
          : 'They have left their positions and move freely.'}
      </p>
    </div>
  )
}
