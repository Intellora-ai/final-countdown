import { describe, it, expect } from 'vitest'
import { simulationContract } from './simulation'
import type { RepresentationContext } from '../types'

/* THE SIMULATION CONTRACT'S OWN SUITE — written because a mutation gate proved
 * it was missing.
 *
 * `simulation` was the sixth and last contract to be built, and it shipped with
 * no test file of its own. It was reached only sideways, through
 * LessonRenderer.test.tsx and archetypes.test.ts, both of which care that a
 * simulation RENDERS and neither of which cares what it REFUSES. The result was
 * a contract whose most load-bearing rule had nothing holding it.
 *
 * scripts/mutation-gate.mjs found it on its first run. Replacing
 * `if (!isObj(payload.model))` with `if (false)` -- accepting `model:
 * 'ideal-gas'`, a NAME instead of a model, which is precisely the hardcoded
 * physics this whole refactor exists to delete -- broke no test in a suite of
 * 418. The gate reported one survivor out of fifteen curated mutants.
 *
 * This suite closes that hole and the rest of the surface around it: every
 * rejection, every repair, the fitness ladder, the capacity policy, all four
 * invariants and the degradation. Written against the contract's stated
 * promises rather than against the mutant, because a test aimed at one mutation
 * only ever catches one mutation.
 */

const ctx = (over: Partial<RepresentationContext['viewport']> = {}): RepresentationContext => ({
  element: { id: 's', kind: 'simulation', purpose: 'demonstrate', payload: {} },
  sourceDataProfile: {},
  viewport: { width: 1408, height: 768, ...over },
  availableRenderers: ['SimulationPanel'],
  existingRelationships: [],
  accessibilityRequirements: { contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true },
})

/** The gas lesson's shape, reduced to what a test needs. */
const gas = () => ({
  simulation: 'particle-box',
  model: {
    vars: [
      { id: 'T', label: 'Temperature', value: 300, min: 200, max: 600, unit: 'K' },
      { id: 'V', label: 'Volume', value: 24, min: 10, max: 50, unit: 'L' },
    ],
    derived: [
      { id: 'P', label: 'Pressure', expr: '8.314 * T / V', unit: 'kPa', precision: 1 },
    ],
  },
  controls: ['T'],
  readouts: ['P'],
})

/** Validate and insist it passed, so a broken fixture reads as a broken fixture. */
function pass(payload: unknown) {
  const r = simulationContract.validate(payload)
  if (!r.ok) throw new Error('fixture should validate: ' + JSON.stringify(r.issues))
  return r
}
const norm = (payload: unknown) => simulationContract.normalize(pass(payload).value, ctx())

/* ------------------------------------------------------------------ */
describe('what the simulation contract refuses outright', () => {
  it('refuses a model named as a string instead of declared as data', () => {
    /* THE MUTATION THAT SURVIVED. `model: 'ideal-gas'` is what the gas lesson
     * actually shipped. Accepting it would mean the engine holds a lookup table
     * from names to physics -- the exact coupling the canvas exists to remove. */
    const r = simulationContract.validate({ ...gas(), model: 'ideal-gas' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const issue = r.issues.find((i) => i.path === 'model')
    expect(issue).toBeDefined()
    expect(issue!.level).toBe('reject')
    expect(issue!.message).toMatch(/not a name/i)
  })

  it('refuses a model given as an array, a number, or null', () => {
    for (const model of [[], 42, null, true]) {
      expect(simulationContract.validate({ ...gas(), model }).ok).toBe(false)
    }
  })

  it('refuses a payload that is not an object', () => {
    for (const p of [null, 'particle-box', 7, []]) {
      expect(simulationContract.validate(p).ok).toBe(false)
    }
  })

  it('names an unrecognised field rather than silently stripping it', () => {
    const r = simulationContract.validate({ ...gas(), speed: 3 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.issues.some((i) => i.path === 'speed')).toBe(true)
  })

  it('refuses appearance anywhere outside the model (Law 3)', () => {
    const r = simulationContract.validate({ ...gas(), controls: ['T'], readouts: ['P'], color: '#ff0000' })
    expect(r.ok).toBe(false)
  })

  it('refuses a simulation kind it cannot draw', () => {
    const r = simulationContract.validate({ ...gas(), simulation: 'wind-tunnel' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.issues.some((i) => i.path === 'simulation')).toBe(true)
  })

  it('refuses a model with no variables', () => {
    expect(simulationContract.validate({ ...gas(), model: { vars: [], derived: [] } }).ok).toBe(false)
    expect(simulationContract.validate({ ...gas(), model: { derived: [] } }).ok).toBe(false)
  })

  it('refuses a duplicate id, because two things under one name make every readout ambiguous', () => {
    const p = gas()
    p.model.derived.push({ id: 'T', label: 'Clash', expr: '1', unit: '', precision: 0 })
    const r = simulationContract.validate(p)
    expect(r.ok).toBe(false)
  })

  it('refuses when every declared variable is unusable', () => {
    const r = simulationContract.validate({
      ...gas(),
      model: { vars: [{ id: 'X', label: 'X', value: 1, min: 5, max: 5 }], derived: [] },
    })
    expect(r.ok).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
describe('what it repairs instead of refusing', () => {
  it('omits a variable whose range cannot be moved, and says so', () => {
    const r = pass({
      ...gas(),
      model: {
        vars: [
          { id: 'T', label: 'Temperature', value: 300, min: 200, max: 600 },
          { id: 'D', label: 'Degenerate', value: 1, min: 9, max: 2 },
        ],
        derived: [],
      },
      readouts: [],
    })
    expect(r.value.model.vars.map((v) => v.id)).toEqual(['T'])
    expect(r.issues.some((i) => i.level === 'repair' && /min >= max/.test(i.message))).toBe(true)
  })

  it('omits a formula it cannot parse rather than letting it throw at paint', () => {
    const r = pass({
      ...gas(),
      model: {
        vars: gas().model.vars,
        derived: [{ id: 'Bad', label: 'Bad', expr: '8.314 * / V' }],
      },
      readouts: [],
    })
    expect(r.value.model.derived).toHaveLength(0)
    expect(r.issues.some((i) => i.level === 'repair' && i.path.includes('expr'))).toBe(true)
  })

  it('clamps a starting value that sits outside its own range', () => {
    const r = pass({
      ...gas(),
      model: { vars: [{ id: 'T', label: 'T', value: 9000, min: 200, max: 600 }], derived: [] },
      readouts: [],
    })
    expect(r.value.model.vars[0].value).toBe(600)
  })

  it('drops controls past the ceiling instead of handing the learner ten sliders', () => {
    const vars = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, label: id, value: 1, min: 0, max: 10 }))
    const r = pass({ simulation: 'particle-box', model: { vars, derived: [] }, controls: vars.map((v) => v.id), readouts: [] })
    expect(r.value.controls).toHaveLength(4)
    expect(r.issues.some((i) => i.level === 'repair' && i.path.startsWith('controls'))).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
describe('normalize resolves the model once', () => {
  it('lists the ids the model actually declares', () => {
    const n = norm(gas())
    expect(n.varIds).toEqual(['T', 'V'])
    expect(n.derivedIds).toEqual(['P'])
    expect(n.failed).toEqual([])
  })

  it('records a formula that parses but cannot be evaluated from the declared variables', () => {
    const n = norm({
      ...gas(),
      model: {
        vars: [{ id: 'T', label: 'T', value: 300, min: 200, max: 600 }],
        derived: [{ id: 'P', label: 'P', expr: 'T * Q' }],
      },
    })
    expect(n.failed).toContain('P')
  })
})

/* ------------------------------------------------------------------ */
describe('fitness ranks a simulation by whether it can do its job', () => {
  it('all but refuses one nobody can move — that is a diagram, not a simulation', () => {
    expect(simulationContract.fitness(norm({ ...gas(), controls: [] }), ctx())).toBe(0.2)
  })

  it('ranks lowest of all when every readout could only ever show a dash', () => {
    const n = norm({
      ...gas(),
      model: {
        vars: [{ id: 'T', label: 'T', value: 300, min: 200, max: 600 }],
        derived: [{ id: 'P', label: 'P', expr: 'T * Q' }],
      },
      controls: ['T'],
    })
    expect(simulationContract.fitness(n, ctx())).toBe(0.15)
  })

  it('steps down when the reader asked for reduced motion', () => {
    expect(simulationContract.fitness(norm(gas()), ctx({ reducedMotion: true }))).toBe(0.4)
  })

  it('ranks a healthy interactive simulation highest', () => {
    expect(simulationContract.fitness(norm(gas()), ctx())).toBe(0.9)
  })

  it('ranks between the two when only some formulas fail', () => {
    const n = norm({
      ...gas(),
      model: {
        vars: [{ id: 'T', label: 'T', value: 300, min: 200, max: 600 }],
        derived: [
          { id: 'P', label: 'P', expr: 'T * 2' },
          { id: 'Q', label: 'Q', expr: 'T * Z' },
        ],
      },
      readouts: ['P', 'Q'],
    })
    expect(n.failed).toEqual(['Q'])
    expect(simulationContract.fitness(n, ctx())).toBe(0.6)
  })
})

/* ------------------------------------------------------------------ */
describe('capacity is a policy about room, never about style', () => {
  it('takes the full grid below a tablet, because a half-width stage is a thumbnail', () => {
    const cap = simulationContract.capacity(norm(gas()), ctx({ width: 390 }))
    expect(cap.span.pref).toBe(12)
    expect(cap.supply).toBe(4)
  })

  it('shares the grid on a wide viewport', () => {
    const cap = simulationContract.capacity(norm(gas()), ctx({ width: 1408 }))
    expect(cap.span.pref).toBe(7)
    expect(cap.supply).toBe(8)
  })

  it('reports demand as the number of live things on screen', () => {
    expect(simulationContract.capacity(norm(gas()), ctx()).demand).toBe(2)
  })
})

/* ------------------------------------------------------------------ */
describe('invariants refuse to let the panel lie about itself', () => {
  const check = (payload: unknown, name: string) =>
    simulationContract.invariants!(norm(payload), ctx()).find((i) => i.name === name)!

  it('holds on a well-formed simulation', () => {
    expect(simulationContract.invariants!(norm(gas()), ctx()).every((i) => i.holds)).toBe(true)
  })

  it('catches a slider wired to a variable the model never declared', () => {
    const i = check({ ...gas(), controls: ['Nope'] }, 'everyControlResolves')
    expect(i.holds).toBe(false)
    expect(i.detail).toMatch(/Nope/)
  })

  it('catches a readout naming a value that does not exist', () => {
    const i = check({ ...gas(), readouts: ['Ghost'] }, 'everyReadoutResolves')
    expect(i.holds).toBe(false)
    expect(i.detail).toMatch(/Ghost/)
  })

  it('catches a readout that could only ever show a dash', () => {
    const i = check({
      ...gas(),
      model: {
        vars: [{ id: 'T', label: 'T', value: 300, min: 200, max: 600 }],
        derived: [{ id: 'P', label: 'P', expr: 'T * Q' }],
      },
    }, 'everyFormulaEvaluates')
    expect(i.holds).toBe(false)
  })

  it('catches a simulation with nothing to manipulate', () => {
    expect(check({ ...gas(), controls: [] }, 'isInteractive').holds).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
describe('degradation keeps the relationships when the simulation cannot run', () => {
  it('falls back to a table of quantities, not a refusal', () => {
    const plan = simulationContract.degrade!(norm(gas()), ctx())
    expect(plan).not.toBeNull()
    expect(plan!.to).toBe('table')
    const rows = (plan!.payload as { rows: Array<Record<string, string>> }).rows
    expect(rows.map((r) => r.quantity)).toEqual(['Temperature', 'Volume', 'Pressure'])
    expect(rows.find((r) => r.quantity === 'Temperature')!.value).toBe('300 K')
  })

  it('leaves out a derived value it already knows cannot be computed', () => {
    const plan = simulationContract.degrade!(norm({
      ...gas(),
      model: {
        vars: [{ id: 'T', label: 'Temperature', value: 300, min: 200, max: 600 }],
        derived: [{ id: 'P', label: 'Pressure', expr: 'T * Q' }],
      },
    }), ctx())
    const rows = (plan!.payload as { rows: Array<Record<string, string>> }).rows
    expect(rows.map((r) => r.quantity)).toEqual(['Temperature'])
  })
})

/* ------------------------------------------------------------------ */
describe('the contract obeys the four laws', () => {
  it('names its renderer by key, so the contract layer never imports React', () => {
    expect(simulationContract.renderer).toBe('SimulationPanel')
    expect(typeof simulationContract.renderer).toBe('string')
  })

  it('emits nothing positional or stylistic for the renderer to obey', () => {
    const banned = ['x', 'y', 'top', 'left', 'width', 'height', 'color', 'fontSize', 'padding']
    const seen = JSON.stringify(norm(gas()))
    for (const key of banned) expect(seen).not.toContain(`"${key}":`)
  })
})

/* THE ACCOMMODATION THAT WAS READ AND NEVER WRITTEN.
 *
 * `derive` has always branched on `ctx.viewport.reducedMotion`, and until
 * Phase 5 nothing in production ever set it: a grep for `matchMedia` across
 * src/canvas found the two reads in this contract and no writer at all. The
 * flag looked covered because the fitness test above passes it by hand -- a
 * branch proven correct in isolation while nothing in the running app could
 * reach it.
 *
 * The five-project browser matrix is what exposed it, and only after the
 * matrix itself was repaired: Playwright 1.62.1 does not apply a project's
 * `use.reducedMotion` to the page fixture, so the reduced-motion project had
 * been running as a second copy of desktop-1440.
 *
 * These assert what `derive` promises, so the promise cannot quietly change.
 */
describe('derive spends WebGL only where it is worth it', () => {
  it('draws in 3D on a wide viewport with motion allowed', () => {
    const d = simulationContract.derive(norm(gas()), ctx({ width: 1440 }))
    expect(d.dimension).toBe('3D')
    expect(d.animate).toBe(true)
    expect(d.particles).toBeGreaterThan(0)
  })

  it('drops to 2D on a phone, where a 215 KB chunk is not worth it', () => {
    const d = simulationContract.derive(norm(gas()), ctx({ width: 375 }))
    expect(d.dimension).toBe('2D')
  })

  it('treats 900px as not wide — the boundary, not near it', () => {
    expect(simulationContract.derive(norm(gas()), ctx({ width: 900 })).dimension).toBe('2D')
    expect(simulationContract.derive(norm(gas()), ctx({ width: 901 })).dimension).toBe('3D')
  })

  it('honours reduced motion even on a wide screen, and stops animating', () => {
    /* Width alone must not win. A reader who asked for less motion on a large
     * display is the exact case a width-only rule gets wrong. */
    const d = simulationContract.derive(norm(gas()), ctx({ width: 1440, reducedMotion: true }))
    expect(d.dimension).toBe('2D')
    expect(d.animate).toBe(false)
    expect(d.particles).toBe(0)
  })

  it('still names a driver variable and keeps the controls', () => {
    const d = simulationContract.derive(norm(gas()), ctx({ width: 1440, reducedMotion: true }))
    expect(d.driverVar).toBe('T')
    expect(d.controlVars).toEqual(['T'])
  })
})
