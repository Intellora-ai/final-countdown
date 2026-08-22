import { compile, evaluate, ExpressionError, type CompiledExpression } from './expression'
import type { BoardModel, ResolvedModel, Scope } from './types'

/* RESOLVING THE MODEL — vars first, then deriveds in dependency order.
 *
 * DECLARATION ORDER IS NOT EVALUATION ORDER. A generator that writes
 * `pressure` before the `moles` it depends on is writing a correct model
 * badly, not an incorrect model; sorting it out here means the lesson author
 * never has to think about ordering. Cycles are the one thing that cannot be
 * sorted out, so they are reported by name and the members resolve to nothing.
 *
 * A FAILED DERIVED IS ABSENT, NOT ZERO. Defaulting to 0 would put a plausible
 * wrong number on a physics board. Absent propagates: anything reading it also
 * fails, and the reader shows a dash.
 */

const MAX_VARS = 24
const MAX_DERIVED = 32

interface Compiled { id: string; expr: CompiledExpression | null; error?: string }

export function resolveModel(model: BoardModel | undefined, overrides?: Scope): ResolvedModel {
  const scope: Scope = {}
  const failed: string[] = []
  const problems: string[] = []
  const meta: ResolvedModel['meta'] = {}
  const domains: Record<string, [number, number]> = {}

  if (!model) {
    return { scope, failed, problems, meta, domains, evaluateAt: () => null }
  }

  const vars = (model.vars ?? []).slice(0, MAX_VARS)
  for (const v of vars) {
    const override = overrides && Object.prototype.hasOwnProperty.call(overrides, v.id) ? overrides[v.id] : undefined
    const raw = typeof override === 'number' && Number.isFinite(override) ? override : v.value
    scope[v.id] = Math.min(v.max, Math.max(v.min, raw))
    domains[v.id] = [v.min, v.max]
    meta[v.id] = { label: v.label, kind: 'var', ...(v.unit ? { unit: v.unit } : {}) }
  }

  const derived = (model.derived ?? []).slice(0, MAX_DERIVED)

  /* Compile everything first: a syntax error is a property of the formula, not
   * of the order it happens to be evaluated in. */
  const compiled: Compiled[] = derived.map((d) => {
    try {
      return { id: d.id, expr: compile(d.expr) }
    } catch (e) {
      return { id: d.id, expr: null, error: e instanceof ExpressionError ? e.message : 'The formula could not be read.' }
    }
  })

  for (const d of derived) {
    meta[d.id] = {
      label: d.label, kind: 'derived',
      ...(d.unit ? { unit: d.unit } : {}),
      ...(typeof d.precision === 'number' ? { precision: d.precision } : {}),
    }
  }

  const byId = new Map(compiled.map((c) => [c.id, c]))
  const state = new Map<string, 'pending' | 'busy' | 'done'>()
  for (const c of compiled) state.set(c.id, 'pending')

  const fail = (id: string, why: string) => {
    if (failed.indexOf(id) < 0) { failed.push(id); problems.push(why) }
    state.set(id, 'done')
  }

  const visit = (id: string, trail: string[]): void => {
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'busy') {
      /* A cycle: name every member so the author can see the loop, not just
       * the node that happened to be entered first. */
      const start = trail.indexOf(id)
      const loop = (start >= 0 ? trail.slice(start) : trail).concat(id)
      for (const m of loop) fail(m, `'${loop.join(' → ')}' refers to itself, so it has no value.`)
      return
    }
    const c = byId.get(id)
    if (!c) return
    state.set(id, 'busy')

    if (!c.expr) { fail(id, `'${id}': ${c.error}`); return }

    for (const dep of c.expr.deps) {
      if (byId.has(dep)) visit(dep, trail.concat(id))
    }

    /* A dependency that failed leaves nothing in scope, so evaluate() returns
     * null and the failure propagates without a special case. */
    const value = evaluate(c.expr, scope)
    if (value === null) {
      const missing = c.expr.deps.filter((d) => !Object.prototype.hasOwnProperty.call(scope, d))
      fail(id, missing.length
        ? `'${id}' needs ${missing.map((m) => `'${m}'`).join(', ')}, which ${missing.length === 1 ? 'has' : 'have'} no value.`
        : `'${id}' did not produce a usable number.`)
      return
    }
    scope[id] = value
    state.set(id, 'done')
  }

  for (const c of compiled) visit(c.id, [])

  /* SAMPLING A RELATION WITHOUT MOVING THE LEARNER.
   *
   * A chart needs P at forty temperatures the learner is not currently at. It
   * must not do that by writing to the store forty times. evaluateAt re-runs
   * the resolver over a COPY of the scope with the named vars replaced, so the
   * sampling is a pure read: the board the learner is looking at does not
   * change, and the sampled curve is guaranteed to come from the same formula
   * the readouts use rather than a second, drifting copy of the physics. */
  const evaluateAt = (id: string, at: Scope): number | null => {
    if (!at || !Object.keys(at).length) {
      const v = scope[id]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    const merged: Scope = {}
    for (const v of vars) {
      const o = Object.prototype.hasOwnProperty.call(at, v.id) ? at[v.id] : scope[v.id]
      merged[v.id] = Math.min(v.max, Math.max(v.min, typeof o === 'number' && Number.isFinite(o) ? o : v.value))
    }
    const done = new Set<string>()
    const walk = (target: string): number | null => {
      if (Object.prototype.hasOwnProperty.call(merged, target)) return merged[target]
      const c = byId.get(target)
      if (!c || !c.expr) return null
      if (done.has(target)) return null          // cycle — already reported above
      done.add(target)
      for (const dep of c.expr.deps) {
        if (byId.has(dep) && !Object.prototype.hasOwnProperty.call(merged, dep)) {
          const v = walk(dep)
          if (v === null) return null
          merged[dep] = v
        }
      }
      return evaluate(c.expr, merged)
    }
    return walk(id)
  }

  return { scope, failed, problems, meta, domains, evaluateAt }
}

/** Format a resolved value the way a readout or an interpolation should show
 *  it. Absent values are an em-dash — never '0', never 'NaN'. */
export function formatValue(value: number | undefined, precision?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const p = typeof precision === 'number' && precision >= 0 && precision <= 6 ? Math.floor(precision) : undefined
  if (p !== undefined) return value.toFixed(p)
  /* No precision stated: show integers as integers, otherwise two decimals.
   * A board full of '300.00 K' reads like a spreadsheet, not a lesson. */
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
