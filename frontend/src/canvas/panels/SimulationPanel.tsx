import React, { Suspense, lazy, useMemo, useRef } from 'react'
import { createModelStore, useResolved } from '../model/modelStore'
import { formatValue } from '../model/resolve'
import type { BoardModel } from '../model/types'
import { ParticleBox2D } from './ParticleBox2D'
import { Thermometer } from './Thermometer'
import { Gauge } from './Gauge'
import { color, type, space, radius, stroke, ink } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* THE PANEL THAT MAKES A SIMULATION REACHABLE FROM DATA.
 *
 * THE PROBLEM THIS SOLVES. Every gas panel takes a live `ModelStore`, not
 * values: Thermometer WRITES through `store.set`, Gauge calls
 * `model.evaluateAt(...)` -- a function -- and the particle boxes pull
 * `store.getResolved()` on every frame. A semantic payload is inert data, so
 * something has to turn one into the other.
 *
 * THE PANEL DOES IT, not the contract and not the renderer. Three options
 * existed and two were wrong:
 *
 *   contract.derive() returns a store   -- derive() runs inside a useMemo keyed
 *                                          on [lesson, ctx], and ctx is rebuilt
 *                                          on every viewport change, so the
 *                                          store would be destroyed and rebuilt
 *                                          mid-resize, resetting the learner's
 *                                          slider. It also drags stateful React
 *                                          machinery into a layer whose whole
 *                                          value is being pure.
 *   widen PanelProps                    -- contradicts its own contract:
 *                                          "A panel cannot reach the lesson,
 *                                          the layout, or another panel."
 *   the panel builds it                 -- no engine change at all. Chosen.
 *
 * WHY THE MEMO IS KEYED ON A SIGNATURE AND NOT ON `data`. `data` is a fresh
 * object whenever the renderer recomputes, which it does on every resize. Keyed
 * on identity, a learner dragging the temperature slider while the layout
 * settles would watch it snap back. The signature is the model's ids, bounds
 * and starting values -- the only things that actually define a different
 * store. Resizing the window is not a different model.
 */

/* ParticleBox3D pulls three.js: 804 KB raw, 215 KB gzip, more than three times
 * the entire initial bundle. It must never be statically reachable from the
 * registry, so it is lazy HERE as well as at the registry boundary. A 2D
 * fallback renders while it loads, so a slow connection sees the simulation
 * rather than a hole. */
const ParticleBox3D = lazy(() =>
  import('./ParticleBox3D').then((m) => ({ default: m.ParticleBox3D })),
)

interface SimulationData {
  simulation: string
  model: BoardModel
  controls: string[]
  readouts: string[]
  varIds: string[]
  derivedIds: string[]
  failed: string[]
}

interface SimulationDerived {
  dimension: '2D' | '3D'
  animate: boolean
  particles: number
  driverVar: string
  controlVars: string[]
  readoutValues: string[]
  unresolved: string[]
}

/** Ids, bounds and starting values. Everything that makes a store different. */
function signatureOf(model: BoardModel): string {
  return [
    ...model.vars.map((v) => `${v.id}:${v.value}:${v.min}:${v.max}`),
    ...model.derived.map((d) => `${d.id}=${d.expr}`),
  ].join('|')
}

export function SimulationPanel({ data, derived, disclosure, title }: PanelProps) {
  const d = data as unknown as SimulationData
  const dv = derived as unknown as SimulationDerived

  /* Held in a ref-like closure over the signature so the dependency array is
   * honest: the memo genuinely depends on the signature and on nothing else.
   * No lint suppression is used anywhere here. CLAUDE.md forbids one outright,
   * and needing one would have been a sign the dependency was wrong rather
   * than the linter. */
  const signature = signatureOf(d.model)
  const modelRef = useRef(d.model)
  modelRef.current = d.model
  const store = useMemo(() => createModelStore(modelRef.current), [signature])
  const resolved = useResolved(store)

  const controls = dv.controlVars ?? d.controls
  const readouts = dv.readoutValues ?? d.readouts

  return (
    <div data-canvas="simulation" data-dimension={dv.dimension}>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
        }}>{title}</h3>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.lg,
        border: `${stroke.hair}px solid ${color.border}`,
        borderRadius: radius.md, padding: space.lg, background: color.surface,
      }}>
        {/* Controls first in the DOM as well as on screen: a keyboard user
          * reaches what they can change before what merely reports. */}
        {controls.map((id) => {
          const v = d.model.vars.find((x) => x.id === id)
          if (!v) return null
          return (
            <Thermometer key={id} store={store} varId={v.id}
              min={v.min} max={v.max} unit={v.unit} />
          )
        })}

        <div data-canvas="simulation-stage" style={{ display: 'grid', placeItems: 'center' }}>
          {dv.dimension === '3D' ? (
            <Suspense fallback={<ParticleBox2D store={store} varId={dv.driverVar} />}>
              <ParticleBox3D store={store} tempVar={dv.driverVar} width={180} height={180} />
            </Suspense>
          ) : (
            <ParticleBox2D store={store} varId={dv.driverVar} />
          )}
        </div>

        {readouts.map((id) => {
          const asVar = d.model.vars.find((x) => x.id === id)
          const asDerived = d.model.derived.find((x) => x.id === id)
          const label = asVar?.label ?? asDerived?.label ?? id
          const unit = asVar?.unit ?? asDerived?.unit

          /* A derived readout with a declared range to sweep gets a dial; one
            * without gets a number. Inventing a range would invent a scale. */
          if (asDerived && controls[0]) {
            return (
              <div key={id} data-canvas="readout" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space.xs,
              }}>
                <span style={{ fontSize: type.label.size, color: color.textMuted }}>{label}</span>
                <Gauge store={store} valueId={id} spanFrom={controls[0]} />
              </div>
            )
          }
          return (
            <div key={id} data-canvas="readout" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space.xs,
            }}>
              <span style={{ fontSize: type.label.size, color: color.textMuted }}>{label}</span>
              <span style={{
                fontFamily: type.mono.family, fontSize: type.heading.size, color: color.text,
              }}>
                {formatValue(resolved.scope[id], asDerived?.precision)}{unit ? ` ${unit}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* A formula that could not be evaluated is stated, not hidden behind a
        * dash the learner has to interpret. */}
      {dv.unresolved?.length > 0 && (
        <p role="status" style={{
          fontFamily: type.mono.family, fontSize: type.mono.size,
          color: color.warning, margin: 0, marginTop: space.xs,
        }}>
          Not shown: {dv.unresolved.join(', ')} — the declared variables do not satisfy these formulas.
        </p>
      )}

      {disclosure?.notice && (
        <p style={{
          fontFamily: type.mono.family, fontSize: type.mono.size,
          color: ink.axis, margin: 0, marginTop: space.xs,
        }}>{disclosure.notice}</p>
      )}
    </div>
  )
}
