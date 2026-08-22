import { describe, it, expect } from 'vitest'
import { compile, evaluate, tryEvaluate, ExpressionError } from './expression'

const at = (src: string, scope: Record<string, number> = {}) => tryEvaluate(src, scope)

describe('expression — arithmetic', () => {
  it('respects precedence and associativity', () => {
    expect(at('2 + 3 * 4')).toBe(14)
    expect(at('(2 + 3) * 4')).toBe(20)
    expect(at('2 ^ 3 ^ 2')).toBe(512)      // right-associative
    expect(at('10 / 4')).toBe(2.5)
    expect(at('7 % 3')).toBe(1)
  })

  it('treats a leading minus as unary, binding tighter than ^ does not', () => {
    expect(at('-2 ^ 2')).toBe(-4)          // -(2^2), as every calculator does
    expect(at('(-2) ^ 2')).toBe(4)
    expect(at('3 - -2')).toBe(5)
    expect(at('--3')).toBe(3)
  })

  it('reads identifiers from scope and constants from the engine', () => {
    expect(at('n * R * T / V', { n: 2, R: 8.314, T: 300, V: 10 })).toBeCloseTo(498.84, 2)
    expect(at('pi')).toBeCloseTo(Math.PI, 12)
    /* A lesson cannot shadow a constant. */
    expect(at('pi', { pi: 3 })).toBeCloseTo(Math.PI, 12)
  })

  it('supports the whitelisted functions with correct arity', () => {
    expect(at('sqrt(16)')).toBe(4)
    expect(at('max(3, 9)')).toBe(9)
    expect(at('round(2.6)')).toBe(3)
    expect(at('pow(2, 10)')).toBe(1024)
  })

  it('accepts ** as an alias for ^ and decimals without a leading zero', () => {
    expect(at('2 ** 5')).toBe(32)
    expect(at('.5 * 8')).toBe(4)
    expect(at('1e3 + 1')).toBe(1001)
  })
})

describe('expression — refusal surface', () => {
  it('refuses anything that is not arithmetic', () => {
    for (const src of [
      'globalThis',                 // an identifier, but unbound -> null
      'a.b',                        // property access
      'x["y"]',                     // index
      'alert(1)',                   // not a whitelisted function
      'constructor',                // unbound identifier
      '1; 2',                       // statement separator
      'x = 1',                      // assignment
      '`t`',                        // template literal
      '1 && 2',                     // logical
    ]) {
      expect(at(src), src).toBeNull()
    }
  })

  it('names the problem when a formula is malformed', () => {
    const bad = ['2 +', '(1 + 2', '1 + 2)', 'max(1)', 'sqrt(1, 2)', '', '   ', '@']
    for (const src of bad) {
      expect(() => compile(src), src).toThrow(ExpressionError)
    }
  })

  it('refuses an absurdly long formula rather than parsing it', () => {
    expect(() => compile('1+'.repeat(400) + '1')).toThrow(ExpressionError)
  })
})

describe('expression — never emits a non-finite number', () => {
  it('returns null instead of NaN or Infinity', () => {
    expect(at('1 / 0')).toBeNull()
    expect(at('0 / 0')).toBeNull()
    expect(at('sqrt(-1)')).toBeNull()
    expect(at('ln(0)')).toBeNull()
    expect(at('1e308 * 10')).toBeNull()
  })

  it('returns null when an identifier is unbound or non-finite', () => {
    expect(at('T * 2', {})).toBeNull()
    expect(at('T * 2', { T: NaN })).toBeNull()
    expect(at('T * 2', { T: Infinity })).toBeNull()
    expect(at('T * 2', { T: 21 })).toBe(42)
  })
})

describe('expression — dependency tracking', () => {
  it('reports every variable read, once, excluding constants', () => {
    const c = compile('n * R * T / V + T')
    expect(c.deps.sort()).toEqual(['R', 'T', 'V', 'n'])
    expect(compile('2 * pi * r').deps).toEqual(['r'])
    expect(compile('1 + 1').deps).toEqual([])
  })

  it('survives evaluation being called twice with different scopes', () => {
    const c = compile('T / 100')
    expect(evaluate(c, { T: 300 })).toBe(3)
    expect(evaluate(c, { T: 500 })).toBe(5)
  })
})
