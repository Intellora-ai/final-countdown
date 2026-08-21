import { describe, it, expect } from 'vitest'
import { pieArcs, linearScale, ticks, linePath, baseline } from './chartGeometry'

/* The arithmetic behind every chart, tested where it lives. The components
 * contain only markup; if these pass, a wrong chart is a wrong INPUT. */

describe('pieArcs', () => {
  it('covers the full circle: fractions sum to 1 and angles chain', () => {
    const arcs = pieArcs([40, 25, 15, 20], 50, 50, 40, 24)
    expect(arcs).toHaveLength(4)
    expect(arcs.reduce((n, a) => n + a.fraction, 0)).toBeCloseTo(1, 10)
    for (let i = 1; i < arcs.length; i++) {
      expect(arcs[i].startAngle).toBeCloseTo(arcs[i - 1].startAngle + arcs[i - 1].fraction * Math.PI * 2, 6)
    }
  })

  it('returns nothing for a zero or negative total rather than dividing by it', () => {
    expect(pieArcs([], 50, 50, 40, 24)).toEqual([])
    expect(pieArcs([0, 0], 50, 50, 40, 24)).toEqual([])
  })

  it('a single value fills the ring without collapsing to a zero-length arc', () => {
    const [arc] = pieArcs([7], 50, 50, 40, 24)
    expect(arc.fraction).toBe(1)
    expect(arc.endAngle - arc.startAngle).toBeGreaterThan(Math.PI * 1.9)
    expect(arc.d).not.toContain('NaN')
  })

  it('emits finite path data for every segment', () => {
    for (const arc of pieArcs([1, 2, 3], 60, 60, 44, 28)) {
      expect(arc.d).not.toMatch(/NaN|Infinity/)
    }
  })
})

describe('linearScale', () => {
  it('maps domain ends onto range ends', () => {
    const s = linearScale(0, 100, 0, 200)
    expect(s(0)).toBe(0)
    expect(s(100)).toBe(200)
    expect(s(50)).toBe(100)
  })

  it('pads an equal domain instead of dividing by zero', () => {
    /* Every bar the same height is a legal chart. */
    const s = linearScale(5, 5, 0, 100)
    expect(Number.isFinite(s(5))).toBe(true)
    expect(s.domain).toEqual([4, 6])
    expect(s(5)).toBe(50)
  })

  it('spans negative domains', () => {
    const s = linearScale(-10, 10, 0, 100)
    expect(s(-10)).toBe(0)
    expect(s(0)).toBe(50)
    expect(s(10)).toBe(100)
  })
})

describe('ticks', () => {
  it('produces round-numbered ticks inside the domain', () => {
    const t = ticks(0, 100)
    expect(t.length).toBeGreaterThanOrEqual(3)
    for (const v of t) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100 + 1e-9) }
  })

  it('survives an equal domain', () => {
    const t = ticks(3, 3)
    expect(t.length).toBeGreaterThan(0)
    for (const v of t) expect(Number.isFinite(v)).toBe(true)
  })

  it('handles negative spans', () => {
    const t = ticks(-40, 40)
    expect(t).toContain(0)
  })
})

describe('linePath', () => {
  it('builds M/L chains', () => {
    expect(linePath([0, 10, 20], [5, 15, 10])).toBe('M 0.00 5.00 L 10.00 15.00 L 20.00 10.00')
  })
  it('one point is a bare move, not an invisible line', () => {
    expect(linePath([7], [3])).toBe('M 7.00 3.00')
  })
  it('empty input is an empty path', () => {
    expect(linePath([], [])).toBe('')
  })
})

describe('baseline', () => {
  it('sits at zero when the domain spans it', () => {
    const s = linearScale(-10, 30, 100, 0)
    expect(baseline(s)).toBe(s(0))
  })
  it('clamps to the domain edge when zero is outside', () => {
    const s = linearScale(10, 30, 100, 0)
    expect(baseline(s)).toBe(s(10))
  })
})
