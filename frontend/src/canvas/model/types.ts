/* THE BOARD MODEL — the shared truth a lesson's representations agree about.
 *
 * WHAT THIS ADDS THAT THE BOARD DID NOT HAVE. Until now every block owned its
 * own state, so a slider inside a simulation could not be seen by the chart
 * beside it, and "one variable drives a number, an equation, a graph, a table
 * and a simulation" was structurally impossible rather than merely unbuilt.
 * A board may now declare variables and derived values ONCE; blocks read them.
 *
 * SOURCE AND DERIVED ARE DIFFERENT KINDS. A `var` is state a learner can move.
 * A `derived` is a formula over vars and earlier deriveds — never stored,
 * always recomputed. Keeping them apart is what stops a board from carrying
 * the same number twice and letting the two copies disagree.
 *
 * FORMULAS ARE STRINGS THE ENGINE PARSES. See model/expression.ts. Nothing in
 * this file is ever executed as code.
 */

export interface ModelVar {
  /** Identifier used inside formulas and {bindings}. */
  id: string
  label: string
  /** Starting value. Clamped into [min, max] by the validator. */
  value: number
  min: number
  max: number
  /** Slider granularity. Defaults to a hundredth of the range. */
  step?: number
  unit?: string
}

export interface ModelDerived {
  id: string
  label: string
  /** Arithmetic over vars, constants and earlier deriveds. */
  expr: string
  unit?: string
  /** Decimal places when displayed. Default 2. */
  precision?: number
}

export interface BoardModel {
  vars: ModelVar[]
  derived: ModelDerived[]
}

/** Flat name -> number, ready for expression evaluation and interpolation. */
export type Scope = Record<string, number>

export interface ResolvedModel {
  scope: Scope
  /** [min, max] for every declared var. A chart's x-domain comes from here,
   *  never from a coordinate a generator wrote. */
  domains: Record<string, [number, number]>
  /** Recompute one id with some vars temporarily moved — how a chart samples a
   *  relation across a range without disturbing what the learner is looking at.
   *  Returns null when the formula cannot produce a finite number there. */
  evaluateAt: (id: string, overrides: Scope) => number | null
  /** Ids whose formula could not produce a finite number. */
  failed: string[]
  /** Human-readable reasons, one per failure, in declaration order. */
  problems: string[]
  /** Display metadata by id, for readouts and interpolation formatting. */
  meta: Record<string, { label: string; unit?: string; precision?: number; kind: 'var' | 'derived' }>
}
