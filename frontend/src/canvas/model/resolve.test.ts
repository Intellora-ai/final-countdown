import { describe, it, expect } from 'vitest'
import { resolveModel, formatValue } from './resolve'
import { interpolate, interpolateToString, bindingsIn, hasBindings } from './interpolate'
import type { BoardModel } from './types'

const gas: BoardModel = {
  vars: [
    { id: 'T', label: 'Temperature', value: 300, min: 100, max: 600, unit: 'K' },
    { id: 'V', label: 'Volume', value: 10, min: 1, max: 50, unit: 'L' },
    { id: 'n', label: 'Amount', value: 1, min: 0.5, max: 4, unit: 'mol' },
  ],
  derived: [
    { id: 'P', label: 'Pressure', expr: 'n * 8.314 * T / V', unit: 'kPa', precision: 1 },
    { id: 'KE', label: 'Kinetic energy', expr: '1.5 * 8.314 * T', unit: 'J/mol' },
  ],
}

describe('resolveModel', () => {
  it('puts vars and deriveds in one scope', () => {
    const r = resolveModel(gas)
    expect(r.scope.T).toBe(300)
    expect(r.scope.P).toBeCloseTo(249.42, 2)
    expect(r.scope.KE).toBeCloseTo(3741.3, 1)
    expect(r.failed).toEqual([])
  })

  it('applies overrides and clamps them into the declared range', () => {
    expect(resolveModel(gas, { T: 500 }).scope.P).toBeCloseTo(415.7, 1)
    expect(resolveModel(gas, { T: 9999 }).scope.T).toBe(600)
    expect(resolveModel(gas, { T: -1 }).scope.T).toBe(100)
    expect(resolveModel(gas, { T: NaN }).scope.T).toBe(300)
  })

  it('resolves deriveds in dependency order, not declaration order', () => {
    const m: BoardModel = {
      vars: [{ id: 'r', label: 'r', value: 2, min: 0, max: 10 }],
      derived: [
        { id: 'volume', label: 'V', expr: 'area * 4' },   // declared BEFORE area
        { id: 'area', label: 'A', expr: 'pi * r ^ 2' },
      ],
    }
    const r = resolveModel(m)
    expect(r.scope.area).toBeCloseTo(Math.PI * 4, 10)
    expect(r.scope.volume).toBeCloseTo(Math.PI * 16, 10)
    expect(r.failed).toEqual([])
  })

  it('names every member of a cycle rather than hanging', () => {
    const m: BoardModel = {
      vars: [],
      derived: [
        { id: 'a', label: 'a', expr: 'b + 1' },
        { id: 'b', label: 'b', expr: 'a + 1' },
      ],
    }
    const r = resolveModel(m)
    expect(r.failed.sort()).toEqual(['a', 'b'])
    expect(r.problems.join(' ')).toMatch(/refers to itself/)
    expect(r.scope.a).toBeUndefined()
  })

  it('reports a broken formula by name and keeps the rest of the board working', () => {
    const m: BoardModel = {
      vars: [{ id: 'x', label: 'x', value: 4, min: 0, max: 10 }],
      derived: [
        { id: 'bad', label: 'bad', expr: '2 +' },
        { id: 'good', label: 'good', expr: 'x * 3' },
      ],
    }
    const r = resolveModel(m)
    expect(r.failed).toEqual(['bad'])
    expect(r.scope.good).toBe(12)
    expect(r.problems[0]).toMatch(/'bad'/)
  })

  it('propagates a failure instead of substituting zero', () => {
    const m: BoardModel = {
      vars: [],
      derived: [
        { id: 'a', label: 'a', expr: 'missing * 2' },
        { id: 'b', label: 'b', expr: 'a + 1' },
      ],
    }
    const r = resolveModel(m)
    expect(r.scope.a).toBeUndefined()
    expect(r.scope.b).toBeUndefined()
    expect(r.failed.sort()).toEqual(['a', 'b'])
  })

  it('treats an absent model as an empty one', () => {
    const r = resolveModel(undefined)
    expect(r.scope).toEqual({})
    expect(r.failed).toEqual([])
  })
})

describe('formatValue', () => {
  it('never renders NaN, Infinity or undefined as a number', () => {
    expect(formatValue(undefined)).toBe('—')
    expect(formatValue(NaN)).toBe('—')
    expect(formatValue(Infinity)).toBe('—')
  })
  it('shows integers bare and fractions to two places by default', () => {
    expect(formatValue(300)).toBe('300')
    expect(formatValue(249.4212)).toBe('249.42')
    expect(formatValue(249.4212, 1)).toBe('249.4')
    expect(formatValue(249.4212, 0)).toBe('249')
  })
})

describe('interpolate', () => {
  const r = resolveModel(gas)

  it('splits prose into literal and bound segments', () => {
    const segs = interpolate('At {T} K the pressure is {P|1} kPa.', r)
    expect(segs.map((s) => s.text)).toEqual(['At ', '300', ' K the pressure is ', '249.4', ' kPa.'])
    expect(segs[1].bound).toBe('T')
    expect(segs[0].bound).toBeUndefined()
  })

  it('uses the declared precision when none is written inline', () => {
    expect(interpolateToString('{P}', r)).toBe('249.4')
  })

  it('shows an unknown name as a dash, never as raw braces', () => {
    expect(interpolateToString('x is {nope}', r)).toBe('x is —')
  })

  it('leaves text without bindings exactly as written', () => {
    expect(interpolateToString('No bindings here {not an id!}', r)).toBe('No bindings here {not an id!}')
    expect(hasBindings('plain')).toBe(false)
    expect(hasBindings('has {T}')).toBe(true)
  })

  it('lists the names a string reads, once each', () => {
    expect(bindingsIn('{T} and {P} and {T}')).toEqual(['T', 'P'])
  })
})
