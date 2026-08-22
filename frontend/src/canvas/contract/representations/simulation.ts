import type {
  RepresentationContract, CapacityProfile, DisclosurePlan, Invariant, DegradationPlan,
} from '../types'
import { Issues, isObj, isStr, isNum, isArr, unknownKey, appearanceKeysDeep } from '../validate'
import { compile, ExpressionError } from '../../model/expression'
import { resolveModel } from '../../model/resolve'
import type { BoardModel, ModelVar, ModelDerived } from '../../model/types'

/* THE SIMULATION CONTRACT — the last kind the gas lesson needed.
 *
 * `simulation` has been a member of `RepresentationKind` since Step 2 with no
 * contract behind it, so the flagship lesson's PRIMARY element rendered as
 * "not renderable in this build" on every viewport. The engine meant to
 * replace the hardcoded gas scene could not express the one lesson that scene
 * exists to show.
 *
 * WHAT MADE THIS HARDER THAN THE OTHER FIVE. Text, tables, charts, diagrams and
 * equations are inert: a payload goes in, pixels come out. A simulation is
 * live. Thermometer WRITES (`store.set`), Gauge and PressureGraph call
 * `model.evaluateAt(...)` -- a FUNCTION, not a value -- and ParticleBox3D pulls
 * `store.getResolved()` every frame. None of that survives a JSON payload.
 *
 * The seam is that a `BoardModel` is pure data. `ModelVar` is
 * {id,label,value,min,max,step?,unit?} and `ModelDerived` is
 * {id,label,expr,unit?,precision?} -- not one appearance field between them, so
 * the payload passes the same `appearanceKeysDeep` ban every other contract
 * enforces. The contract validates the MODEL; the panel turns it into a live
 * store with `createModelStore`. Contracts stay pure and React-free, and
 * `PanelProps` does not grow a field.
 *
 * WHY THE MODEL LIVES IN THE PAYLOAD AND NOT IN `Lesson.model`.
 * `Lesson.model` is declared as `{vars: unknown[]; derived: unknown[]}` and is
 * read by NOTHING -- verified by grep across src/. More decisively,
 * `RepresentationContext` carries `element` but never the `Lesson`, so a
 * contract physically cannot reach it. Routing the model through the context
 * would mean an engine change to serve one representation, which is exactly
 * the coupling the registry exists to prevent. The payload is the semantic
 * unit a contract owns, so the model goes there.
 */

const KEYS = ['simulation', 'model', 'controls', 'readouts'] as const
const VAR_KEYS = ['id', 'label', 'value', 'min', 'max', 'step', 'unit'] as const
const DERIVED_KEYS = ['id', 'label', 'expr', 'unit', 'precision'] as const

/** Which family of simulation to draw. A KIND, never a component name. */
export type SimulationKind = 'particle-box'

const KINDS: SimulationKind[] = ['particle-box']

/* Ceilings that keep one lesson from becoming a physics engine. resolveModel
 * already caps at 24 vars / 32 deriveds; these are tighter because a learner
 * cannot hold more than a few live controls at once. */
const MAX_CONTROLS = 4
const MAX_READOUTS = 6

export interface SimulationPayload {
  simulation: SimulationKind
  model: BoardModel
  /** Var ids the learner may move. */
  controls: string[]
  /** Var or derived ids to display as live values. */
  readouts: string[]
}

export interface NormalizedSimulation extends SimulationPayload {
  /** Ids that exist in the model, resolved once so nothing re-derives them. */
  varIds: string[]
  derivedIds: string[]
  /** Deriveds whose formula could not be evaluated from the declared vars. */
  failed: string[]
}

function readVar(v: unknown, i: number, issues: Issues): ModelVar | null {
  if (!isObj(v)) { issues.repair(`model.vars[${i}]`, 'A variable was not an object and was omitted.'); return null }
  const bad = unknownKey(v, VAR_KEYS)
  if (bad) { issues.repair(`model.vars[${i}].${bad}`, `Variable carried unrecognised '${bad}' and was omitted.`); return null }
  if (!isStr(v.id) || !isStr(v.label)) { issues.repair(`model.vars[${i}]`, 'A variable needs an id and a label.'); return null }
  if (!isNum(v.value) || !isNum(v.min) || !isNum(v.max)) {
    issues.repair(`model.vars[${i}]`, `Variable '${v.id}' needs finite value, min and max.`); return null
  }
  if (v.min >= v.max) {
    /* A degenerate range makes every ratio in the panel a division by zero --
     * ParticleBox3D's sqrt(T/T0) collapses to 1 and the box stops responding. */
    issues.repair(`model.vars[${i}]`, `Variable '${v.id}' has min >= max; it cannot be moved.`); return null
  }
  return {
    id: v.id, label: v.label,
    value: Math.min(v.max, Math.max(v.min, v.value)),
    min: v.min, max: v.max,
    ...(isNum(v.step) ? { step: v.step } : {}),
    ...(isStr(v.unit) ? { unit: v.unit } : {}),
  }
}

function readDerived(d: unknown, i: number, issues: Issues): ModelDerived | null {
  if (!isObj(d)) { issues.repair(`model.derived[${i}]`, 'A derived value was not an object and was omitted.'); return null }
  const bad = unknownKey(d, DERIVED_KEYS)
  if (bad) { issues.repair(`model.derived[${i}].${bad}`, `Derived carried unrecognised '${bad}' and was omitted.`); return null }
  if (!isStr(d.id) || !isStr(d.label) || !isStr(d.expr)) {
    issues.repair(`model.derived[${i}]`, 'A derived value needs an id, a label and an expr.'); return null
  }
  /* Compile now, not at paint. A formula that throws mid-render takes the whole
   * root down: there is no error boundary anywhere in src/. */
  try {
    compile(d.expr)
  } catch (e) {
    const why = e instanceof ExpressionError ? e.message : 'could not be parsed'
    issues.repair(`model.derived[${i}].expr`, `'${d.id}' has an unusable formula and was omitted: ${why}`)
    return null
  }
  return {
    id: d.id, label: d.label, expr: d.expr,
    ...(isStr(d.unit) ? { unit: d.unit } : {}),
    ...(isNum(d.precision) ? { precision: d.precision } : {}),
  }
}

export const simulationContract: RepresentationContract<SimulationPayload, NormalizedSimulation> = {
  kind: 'simulation',
  renderer: 'SimulationPanel',

  validate(payload) {
    const issues = new Issues()
    if (!isObj(payload)) return issues.fail('', 'A simulation payload must be an object.')

    const bad = unknownKey(payload, KEYS)
    if (bad) return issues.fail(bad, `Unrecognised field '${bad}'. Unknown fields are refused, not stripped.`)

    /* `model` holds author-named ids, so its leaves are exempt from the
     * appearance scan for the same reason chart's `data` is: an author may
     * legitimately name a variable `width`. The KEYS allowlist above still
     * refuses anything at the top level. */
    const appearance = appearanceKeysDeep(payload, '', ['model'])
    if (appearance) {
      return issues.fail(appearance, `'${appearance}' carries appearance. A simulation states its model; the renderer chooses every pixel.`)
    }

    const simulation = payload.simulation
    if (!isStr(simulation) || KINDS.indexOf(simulation as SimulationKind) < 0) {
      return issues.fail('simulation', `A simulation must name a known kind: ${KINDS.join(', ')}.`)
    }

    /* THE STRING-MODEL REJECTION IS LOAD-BEARING. The gas lesson shipped
     * `model: 'ideal-gas'` -- a name, not a model. A contract that guessed what
     * that string meant would be a lookup table of hardcoded physics living
     * inside the engine, which is the thing this whole refactor removes. */
    if (!isObj(payload.model)) {
      return issues.fail('model', 'A simulation needs a model object with vars and derived, not a name. Naming a built-in model would put the physics back inside the engine.')
    }
    const rawModel = payload.model
    if (!isArr(rawModel.vars) || !rawModel.vars.length) {
      return issues.fail('model.vars', 'A simulation needs at least one variable.')
    }

    const vars: ModelVar[] = []
    rawModel.vars.forEach((v, i) => { const parsed = readVar(v, i, issues); if (parsed) vars.push(parsed) })
    if (!vars.length) return issues.fail('model.vars', 'No usable variable survived validation.')

    const derived: ModelDerived[] = []
    if (isArr(rawModel.derived)) {
      rawModel.derived.forEach((d, i) => { const parsed = readDerived(d, i, issues); if (parsed) derived.push(parsed) })
    }

    const ids = new Set<string>()
    for (const item of [...vars, ...derived]) {
      if (ids.has(item.id)) return issues.fail('model', `Duplicate id '${item.id}'. Two things answering to one name makes every readout ambiguous.`)
      ids.add(item.id)
    }

    const readList = (key: 'controls' | 'readouts', max: number): string[] => {
      const raw = payload[key]
      if (!isArr(raw)) return []
      const out: string[] = []
      raw.forEach((c, i) => {
        if (!isStr(c)) { issues.repair(`${key}[${i}]`, 'An id was not a string and was omitted.'); return }
        if (out.length >= max) { issues.repair(`${key}[${i}]`, `More than ${max} ${key}; '${c}' was omitted.`); return }
        out.push(c)
      })
      return out
    }

    return issues.ok({
      simulation: simulation as SimulationKind,
      model: { vars, derived },
      controls: readList('controls', MAX_CONTROLS),
      readouts: readList('readouts', MAX_READOUTS),
    })
  },

  normalize(payload) {
    const varIds = payload.model.vars.map((v) => v.id)
    const derivedIds = payload.model.derived.map((d) => d.id)
    /* Resolve once here so `invariants` can report which formulas the declared
     * variables cannot actually satisfy, rather than discovering it at paint. */
    const resolved = resolveModel(payload.model)
    return {
      ...payload,
      varIds,
      derivedIds,
      failed: [...resolved.failed],
    }
  },

  fitness(n, ctx) {
    /* A SIMULATION NOBODY CAN MOVE IS A DIAGRAM. The whole claim of this
     * representation is that the learner changes something and watches the
     * consequence; with no control there is no consequence to watch. */
    if (!n.controls.length) return 0.2
    /* Every formula failing means the readouts would all show a dash. */
    if (n.derivedIds.length > 0 && n.failed.length === n.derivedIds.length) return 0.15
    /* Reduced motion is a stated preference, not a guess. An animated particle
     * box is the single most motion-heavy thing this canvas draws. */
    if (ctx.viewport.reducedMotion) return 0.4
    return n.failed.length ? 0.6 : 0.9
  },

  capacity(n, ctx): CapacityProfile {
    const wide = ctx.viewport.width > 900
    return {
      unit: 'items',
      demand: n.controls.length + n.readouts.length,
      supply: wide ? 8 : 4,
      /* A stage the learner manipulates needs room; below a tablet it takes
       * the full width because a half-width particle box is a thumbnail. */
      span: { min: 6, pref: wide ? 7 : 12, max: 12 },
      rows: { min: 5, pref: 8, max: 12 },
    }
  },

  disclosure(n, ctx): DisclosurePlan[] {
    const cap = this.capacity(n, ctx)
    const demand = n.controls.length + n.readouts.length
    if (demand <= cap.supply) return []
    return [{
      strategy: 'progressive_disclosure',
      /* Controls before readouts: a control the learner cannot reach makes the
       * simulation inert, while a hidden readout is still a number they can
       * open. */
      initiallyVisible: Math.max(n.controls.length, cap.supply),
      reachableVia: 'expand',
      notice: `${demand} controls and readouts; ${cap.supply} shown, the rest on expand.`,
    }]
  },

  derive(n, ctx) {
    /* EVERY FRONTEND DECISION IS MADE HERE, FROM MEASURED CONTEXT. The payload
     * states no dimension, no particle count and no renderer technology. */
    const wide = ctx.viewport.width > 900
    const reduced = Boolean(ctx.viewport.reducedMotion)
    return {
      /* 3D costs a 215 KB chunk and a WebGL context. Neither is worth it on a
       * phone, and neither is honest under reduced motion. */
      dimension: wide && !reduced ? '3D' : '2D',
      animate: !reduced,
      particles: reduced ? 0 : wide ? 42 : 24,
      /* The var whose value drives particle speed: the first control. */
      driverVar: n.controls[0] ?? n.varIds[0],
      /* Readouts split by what they are, so the panel need not re-derive it. */
      controlVars: n.controls.filter((id) => n.varIds.includes(id)),
      readoutValues: n.readouts.filter((id) => !n.failed.includes(id)),
      unresolved: n.failed,
    }
  },

  invariants(n): Invariant[] {
    const known = new Set([...n.varIds, ...n.derivedIds])
    const danglingControls = n.controls.filter((c) => !n.varIds.includes(c))
    const danglingReadouts = n.readouts.filter((r) => !known.has(r))

    return [
      {
        name: 'everyControlResolves',
        holds: danglingControls.length === 0,
        detail: danglingControls.length
          ? `Controls name variables the model does not declare: ${danglingControls.join(', ')}. A slider wired to nothing is a lie about interactivity.`
          : undefined,
      },
      {
        name: 'everyReadoutResolves',
        holds: danglingReadouts.length === 0,
        detail: danglingReadouts.length
          ? `Readouts name values the model does not define: ${danglingReadouts.join(', ')}.`
          : undefined,
      },
      {
        name: 'everyFormulaEvaluates',
        holds: n.failed.length === 0,
        detail: n.failed.length
          ? `These formulas cannot be evaluated from the declared variables: ${n.failed.join(', ')}. A readout that can only ever show a dash is not a readout.`
          : undefined,
      },
      {
        name: 'isInteractive',
        holds: n.controls.length > 0,
        detail: n.controls.length ? undefined
          : 'A simulation with no control cannot be manipulated, which is the only thing that makes it a simulation.',
      },
    ]
  },

  degrade(n): DegradationPlan | null {
    /* WHAT AN UNRUNNABLE SIMULATION STILL KNOWS. Its variables and formulas are
     * a statement about how quantities relate, and that survives as a table
     * even when nothing can be moved. Better than a refusal, which throws the
     * relationships away. */
    const rows = [
      ...n.model.vars.map((v) => ({
        quantity: v.label,
        value: `${v.value}${v.unit ? ` ${v.unit}` : ''}`,
        role: 'Variable',
      })),
      ...n.model.derived
        .filter((d) => !n.failed.includes(d.id))
        .map((d) => ({ quantity: d.label, value: d.expr, role: 'Derived' })),
    ]
    if (!rows.length) return null
    return {
      to: 'table',
      reason: 'This simulation cannot run here, so its quantities are shown as values instead.',
      payload: {
        columns: [
          { key: 'quantity', label: 'Quantity', type: 'text' },
          { key: 'value', label: 'Value', type: 'text' },
          { key: 'role', label: 'Role', type: 'category' },
        ],
        rows,
      },
    }
  },
}
