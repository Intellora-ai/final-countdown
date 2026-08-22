import { describe, it, expect } from 'vitest'
import { resolveModel } from './model/resolve'
import { GAS_MODEL } from './gasModel'

/* FIDELITY, LOCKED AS A TEST.
 *
 * The reference image is the specification for this scene, so the two numbers
 * it actually asserts are asserted here. If someone later "tidies" the volume
 * to 22.4 because it looks more like a textbook constant, the dial silently
 * stops reading 165 and this test is what says so. */

describe('gas model reproduces the reference scene', () => {
  it('reads 165 kPa at 450 K — the dial in the reference', () => {
    const r = resolveModel(GAS_MODEL)
    expect(Math.round(r.scope.P)).toBe(165)
  })

  it('reads 110 kPa at 300 K — the value the reference axis prints', () => {
    const r = resolveModel(GAS_MODEL, { T: 300 })
    expect(Math.round(r.scope.P)).toBe(110)
  })

  it('is one model, not two: sampling agrees with resolving', () => {
    const r = resolveModel(GAS_MODEL)
    /* What the graph samples at 300 K must equal what the dial would read if
     * the learner dragged the slider there. Two code paths, one answer. */
    expect(r.evaluateAt('P', { T: 300 })).toBeCloseTo(resolveModel(GAS_MODEL, { T: 300 }).scope.P, 9)
  })

  it('keeps pressure proportional to temperature at constant V and n', () => {
    const r = resolveModel(GAS_MODEL)
    const a = r.evaluateAt('P', { T: 200 })!
    const b = r.evaluateAt('P', { T: 400 })!
    expect(b / a).toBeCloseTo(2, 9)
  })

  it('scales particle speed as the square root of temperature', () => {
    const r = resolveModel(GAS_MODEL)
    expect(r.evaluateAt('speed', { T: 100 })).toBeCloseTo(1, 9)
    expect(r.evaluateAt('speed', { T: 400 })).toBeCloseTo(2, 9)
  })

  it('holds V and n genuinely constant — a degenerate range cannot be dragged', () => {
    const r = resolveModel(GAS_MODEL, { V: 50, n: 9 })
    expect(r.scope.V).toBe(22.674)
    expect(r.scope.n).toBe(1)
  })

  it('has no broken formulas', () => {
    const r = resolveModel(GAS_MODEL)
    expect(r.failed).toEqual([])
    expect(r.problems).toEqual([])
  })
})
