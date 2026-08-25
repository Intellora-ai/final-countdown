import '../design/canvas.css'

/*
 * THE STYLESHEET IS IMPORTED BY THE COMPONENT, NOT BY THE ROUTE.
 *
 * `canvas.css` used to be imported by `CanvasRoute.tsx` alone. That worked
 * while the canvas route was the only consumer, and broke silently the moment
 * the practice screen started rendering figures: every `lc-*` class emitted
 * below resolved to no rule at all on `/practice`.
 *
 * Nothing failed. A class with no rule is not an error in CSS, in TypeScript,
 * in the linter, or in any test -- so the markup was right, the styles were
 * absent, and only looking at the screen would have shown it. `lc-refusal` was
 * the worst of them: the box that says a figure contradicts its own data
 * rendered as ordinary body text and read like part of the lesson.
 *
 * Enforced by `styleOwnership.test.ts`.
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { Block } from '../spec/spec'
import type { GasSceneProps } from './GasScene3D'
import {
  advanceParticles,
  DEFAULT_STATE,
  densityScale,
  type GasQuantity,
  PARTICLE_COUNT,
  particleSpeed,
  pressureKPa,
  seedParticles,
  volumeScale,
} from './gasModel'

type SimulationBlock = Extract<Block, { kind: 'simulation' }>

/**
 * The instrument.
 *
 * WHAT THE SPEC DECIDES AND WHAT THIS DECIDES
 * -------------------------------------------
 * The author says a gas exists, which quantities the reader may drive, and
 * which numbers to show. Everything below — that a slider is a slider, that the
 * container narrows as volume falls, that speed reads as a trail — is this
 * file's, and the author never learns any of it.
 *
 * READOUT ORDER IS THE AUTHOR'S EMPHASIS
 * --------------------------------------
 * `block.readouts` is walked in the order it was written and never sorted.
 * The reference lesson puts `pressure` first because pressure is the answer to
 * the question the lesson asks; re-ordering them alphabetically would be a
 * renderer quietly overruling the argument.
 *
 * three.js is loaded ONLY when the reader opens the 3D view — see the `lazy`
 * below. `GasSceneProps` is imported with `import type`, which is erased at
 * build time; making that a value import would pull ~600 KB into the initial
 * bundle and nothing about the page would look any different.
 */
const GasScene3D = lazy(() => import('./GasScene3D'))

export function SimulationView({ block, mode }: { block: SimulationBlock; mode: '2d' | '3d' }) {
  /* ONE state object rather than a `useState` per control.
     `block.controls` is a variable-length array, and a hook inside that loop
     would change hook order the moment a lesson declared a different number of
     controls — the illegal kind of bug that only shows up on the second spec. */
  const [values, setValues] = useState<Record<GasQuantity, number>>(() => seedFrom(block))
  const [seededFor, setSeededFor] = useState(block.id)

  /* A different simulation arrived in the same slot: re-seed during render,
     which is React's documented alternative to a resetting effect and avoids
     painting one frame of the previous lesson's numbers. */
  if (seededFor !== block.id) {
    setSeededFor(block.id)
    setValues(seedFrom(block))
  }

  const still = usePrefersReducedMotion()

  /* Derived, never stored. A pressure held in state is a pressure that can fall
     out of step with the sliders that produce it. */
  const pressure = pressureKPa(values.temperature, values.volume, values.moles)

  const scene: GasSceneProps = {
    temperatureK: values.temperature,
    volumeL: values.volume,
    moles: values.moles,
    still,
  }

  return (
    <div>
      {mode === '3d' ? (
        <Suspense
          fallback={
            <p className="lc-caption" role="status">
              Loading 3D view…
            </p>
          }
        >
          <GasScene3D {...scene} />
        </Suspense>
      ) : (
        <Schematic2D {...scene} />
      )}

      {/* `aria-live` so a reader who cannot see the box still hears the pressure
          move when they drag the temperature. */}
      <div
        aria-live="polite"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--s-xl)',
          marginTop: 'var(--s-lg)',
          paddingTop: 'var(--s-lg)',
          borderTop: 'var(--stroke-hair) solid var(--c-line)',
        }}
      >
        {block.readouts.map((key) => {
          const shown = key === 'pressure' ? pressure : values[key]
          const control = block.controls.find((c) => c.key === key)
          return (
            <div key={key}>
              <div className="lc-caption" style={{ margin: 0 }}>
                {control?.label ?? LABEL[key]}
              </div>
              <div>
                <span className="lc-metric__value">{format(shown, DECIMALS[key])}</span>
                <span className="lc-metric__unit">{control?.unit ?? UNIT[key]}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gap: 'var(--s-lg)', marginTop: 'var(--s-xl)' }}>
        {block.controls.map((control) => (
          <label key={control.key} style={{ display: 'block' }}>
            <span
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--s-md)',
                marginBottom: 'var(--s-xs)',
              }}
            >
              <span className="lc-caption" style={{ margin: 0 }}>
                {control.label}
              </span>
              <span
                className="lc-caption"
                style={{ margin: 0, color: 'var(--c-accent-soft)', fontVariantNumeric: 'tabular-nums' }}
              >
                {format(values[control.key], DECIMALS[control.key])}
                {control.unit ? ` ${control.unit}` : ''}
              </span>
            </span>
            <input
              className="lc-slider"
              type="range"
              min={control.min}
              max={control.max}
              /* `any` rather than a computed step: a step derived from the range
                 quantises a 100–800 K slider into visible jumps, and the reader
                 is dragging to feel a continuous relationship. */
              step="any"
              value={values[control.key]}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  [control.key]: Number(event.target.value),
                }))
              }
            />
          </label>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* The 2D schematic                                                           */
/* -------------------------------------------------------------------------- */

/* SVG user units — a coordinate system, not a design scale. 16:10 to match the
   aspect the chart renderer already uses, so the two blocks sit level. */
const VIEW_W = 400
const VIEW_H = 250
const TRAIL_MAX = VIEW_W * 0.05
const DOT_R = VIEW_W * 0.011

/**
 * A cross-section of the container, animated on `requestAnimationFrame`.
 *
 * WHY THE LOOP TOUCHES THE DOM AND NOT REACT STATE
 * ------------------------------------------------
 * Twenty-eight positions changing sixty times a second through `setState` is
 * 1680 reconciliations a second for a picture no reconciler is needed to
 * produce. The loop writes one `transform` per particle straight onto the
 * element instead, and React stays responsible for everything that actually
 * changes structurally — the box width, the trail length, the dot radius.
 *
 * SPEED IS SHOWN AS A TRAIL, NOT AS A BLUR FILTER
 * -----------------------------------------------
 * An `feGaussianBlur` re-rasterises its whole region every frame and is the
 * fastest way to turn this panel into a slideshow. A line trailing each dot,
 * rotated to sit behind its direction of travel and lengthened by
 * `particleSpeed(T)`, costs nothing and reads as motion just as well.
 */
function Schematic2D({ temperatureK, volumeL, moles, still }: GasSceneProps) {
  const particles = useMemo(() => seedParticles(PARTICLE_COUNT), [])
  const groups = useRef<(SVGGElement | null)[]>([])

  const speed = particleSpeed(temperatureK)
  const radius = DOT_R * densityScale(moles)

  /* No trail on a still frame: a motion streak on a picture that never moves
     reads as a rendering artefact rather than as speed. */
  const trail = still ? 0 : TRAIL_MAX * Math.min(1, speed / 2)

  const box = useMemo(() => geometry(volumeL), [volumeL])

  /* The loop reads geometry and speed from refs so that changing a slider never
     has to tear the loop down and start a new one. */
  const boxRef = useRef(box)
  const speedRef = useRef(speed)

  const paint = useCallback(() => {
    const frame = boxRef.current
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i]
      const node = groups.current[i]
      if (!particle || !node) continue

      const x = frame.x + particle.x * frame.w
      const y = frame.y + particle.y * frame.h

      /* The model promises finite unit-box coordinates. Trusting that without
         checking is exactly how `translate(NaN NaN)` reaches an attribute, every
         particle vanishes, and no error is raised anywhere. */
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue

      const heading = Math.atan2(particle.vy, particle.vx) * (180 / Math.PI)
      node.setAttribute(
        'transform',
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${heading.toFixed(1)})`,
      )
    }
  }, [particles])

  /* Before the browser paints, so a still frame is never shown empty and the
     cloud follows the wall the instant the volume slider moves. */
  useLayoutEffect(() => {
    boxRef.current = box
    speedRef.current = speed
    paint()
  }, [box, speed, paint])

  useEffect(() => {
    if (still) return

    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      advanceParticles(particles, (now - last) / 1000, speedRef.current)
      last = now
      paint()
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    /* STOPPING THE LOOP IS THE WHOLE POINT OF THIS RETURN.
       `tick` overwrites `frame` before it returns, so `frame` always holds the
       id of the one request that is currently pending — one cancel is enough,
       and it runs on unmount and whenever `still` flips. A leaked rAF keeps its
       whole closure alive: the particle array, the SVG nodes, and through them
       every ancestor of this component, for as long as the tab is open. */
    return () => cancelAnimationFrame(frame)
  }, [still, paint, particles])

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      /* Observable on purpose. "Is the render loop running" was otherwise
         unanswerable from outside, and the first attempt to diagnose a moving
         still frame had to guess between two equally plausible causes: the
         loop ignoring `still`, or `still` never becoming true. One attribute
         settles it, and a feature nobody can observe is indistinguishable from
         one that never ran. */
      data-still={still ? 'true' : 'false'}
      aria-label={describe(temperatureK, volumeL, moles)}
      style={{ display: 'block', width: '100%', aspectRatio: '16 / 10' }}
    >
      {/* The container. Rigid walls, so no rounded corners. */}
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="var(--c-surface)"
        fillOpacity={0.55}
        stroke="var(--c-line-strong)"
        strokeWidth="var(--stroke-thin)"
      />

      {/* The movable wall. Volume is the only control with a physical edge to
          point at, so it gets one. */}
      <rect
        x={box.x + box.w}
        y={box.y}
        width={PISTON_W}
        height={box.h}
        fill="var(--c-accent)"
        opacity={0.7}
      />

      {particles.map((_, i) => (
        <g
          key={i}
          ref={(element) => {
            groups.current[i] = element
          }}
        >
          <line
            x1={0}
            y1={0}
            x2={-trail}
            y2={0}
            stroke="var(--c-accent-soft)"
            strokeWidth="var(--stroke-thick)"
            strokeLinecap="round"
            opacity={0.45}
          />
          {/* One circle, haloed by its own wide translucent stroke: glow rather
              than fill, and a quarter of the nodes a second glow circle costs. */}
          <circle
            r={radius}
            fill="var(--c-accent)"
            stroke="var(--c-accent)"
            strokeWidth={radius * 1.8}
            strokeOpacity={0.16}
          />
        </g>
      ))}
    </svg>
  )
}

const PISTON_W = VIEW_W * 0.018

/** Where the container sits, in SVG user units, for a given volume. */
function geometry(volumeL: number): { x: number; y: number; w: number; h: number } {
  const x = VIEW_W * 0.05
  const y = VIEW_H * 0.08
  const h = VIEW_H - y * 2
  const widest = VIEW_W - x * 2 - PISTON_W

  /* `volumeScale` tops out at 1.3, so dividing by it maps a full container to
     the full width and the smallest one to about 42% — the same cube-root
     relationship the 3D box uses, so the two views agree about size. */
  return { x, y, h, w: widest * (volumeScale(volumeL) / 1.3) }
}

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Whether to hold the gas still.
 *
 * Watched rather than read once: this is a system setting a reader can change
 * mid-session, often BECAUSE something on screen is making them unwell, and a
 * value captured at mount would ignore them until they reloaded.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION).matches === true,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia(REDUCED_MOTION)
    const onChange = () => setReduced(query.matches)
    setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/* -------------------------------------------------------------------------- */
/* Readouts                                                                   */
/* -------------------------------------------------------------------------- */

type ReadoutKey = SimulationBlock['readouts'][number]

/** Used only when the author gave the control no label of their own. */
const LABEL: Record<ReadoutKey, string> = {
  pressure: 'Pressure',
  temperature: 'Temperature',
  volume: 'Volume',
  moles: 'Amount',
}

const UNIT: Record<ReadoutKey, string> = {
  pressure: 'kPa',
  temperature: 'K',
  volume: 'L',
  moles: 'mol',
}

/* Enough precision to see the slider move, not so much that the digits churn. */
const DECIMALS: Record<ReadoutKey, number> = {
  pressure: 1,
  temperature: 0,
  volume: 1,
  moles: 2,
}

function format(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** The state of the gas, as a sentence, for anyone who cannot see the box. */
function describe(temperatureK: number, volumeL: number, moles: number): string {
  const pressure = format(pressureKPa(temperatureK, volumeL, moles), 1)
  return `${PARTICLE_COUNT} gas particles in a sealed container at ${format(temperatureK, 0)} kelvin and ${format(volumeL, 1)} litres, giving a pressure of ${pressure} kilopascals.`
}

/** Control initials win; anything the spec left out falls back to the standard state. */
function seedFrom(block: SimulationBlock): Record<GasQuantity, number> {
  const values: Record<GasQuantity, number> = { ...DEFAULT_STATE }
  for (const control of block.controls) values[control.key] = control.initial
  return values
}
