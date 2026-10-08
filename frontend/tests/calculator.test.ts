import { describe, expect, it } from 'vitest'
import { calculate } from '../server/calculator'

describe('calculator tool', () => {
  it('evaluates bounded arithmetic without code execution', () => {
    expect(calculate('2 + 3 * (4 ^ 2)')).toBe(50)
    expect(calculate('-2.5 / 0.5')).toBe(-5)
  })
  it('rejects unsafe or unbounded input', () => {
    expect(() => calculate('globalThis.process')).toThrow()
    expect(() => calculate('1 / 0')).toThrow()
    expect(() => calculate('9'.repeat(201))).toThrow()
  })
})
