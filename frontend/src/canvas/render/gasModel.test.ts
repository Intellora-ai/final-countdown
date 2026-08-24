import { describe, expect, it } from 'vitest'

import {
  advanceParticles,
  densityScale,
  GAS_CONSTANT,
  LIMITS,
  PARTICLE_COUNT,
  type Particle,
  particleSpeed,
  pressureKPa,
  REFERENCE_K,
  seedParticles,
  volumeScale,
} from './gasModel'

/**
 * The physics is the part of the renderer that can be wrong without looking
 * wrong, so it is the part that gets tested.
 *
 * Three groups, and they are not interchangeable:
 *   1. a KNOWN VALUE, which is the only thing that catches a unit error;
 *   2. MONOTONICITY, which catches an inverted term that a single value would
 *      happily agree with;
 *   3. the GUARDS, which catch the failure that produces no error at all.
 */

/* -------------------------------------------------------------------------- */
/* 1. Known values                                                            */
/* -------------------------------------------------------------------------- */

describe('pressureKPa — known values', () => {
  it('gives about one atmosphere for a mole of gas in 24 L at 300 K', () => {
    // 1 mol × 8.314 J/(mol·K) × 300 K / 24 L = 103.925 kPa.
    // If a stray ×1000 or ÷1000 ever appears in the formula, this is the line
    // that fails — a unit error is invisible to every other test here.
    expect(pressureKPa(300, 24, 1)).toBeCloseTo(103.925, 6)
  })

  it('agrees with n·R·T/V computed independently', () => {
    const cases: [number, number, number][] = [
      [273.15, 22.414, 1],
      [500, 10, 2],
      [150, 5, 0.25],
    ]
    for (const [t, v, n] of cases) {
      expect(pressureKPa(t, v, n)).toBeCloseTo((n * GAS_CONSTANT * t) / v, 9)
    }
  })

  it('is zero at absolute zero and zero with no gas present', () => {
    expect(pressureKPa(0, 24, 1)).toBe(0)
    expect(pressureKPa(300, 24, 0)).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Monotonicity                                                            */
/* -------------------------------------------------------------------------- */

describe('pressureKPa — the relationships the lesson is about', () => {
  it('rises with temperature', () => {
    const readings = [100, 200, 300, 400, 800].map((t) => pressureKPa(t, 24, 1))
    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]!).toBeGreaterThan(readings[i - 1]!)
    }
  })

  it('falls with volume', () => {
    const readings = [5, 10, 24, 50, 100].map((v) => pressureKPa(300, v, 1))
    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]!).toBeLessThan(readings[i - 1]!)
    }
  })

  it('rises with the amount of gas', () => {
    const readings = [0.5, 1, 2, 4].map((n) => pressureKPa(300, 24, n))
    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]!).toBeGreaterThan(readings[i - 1]!)
    }
  })

  it('doubles when temperature doubles and halves when volume doubles', () => {
    const base = pressureKPa(300, 24, 1)
    expect(pressureKPa(600, 24, 1)).toBeCloseTo(base * 2, 9)
    expect(pressureKPa(300, 48, 1)).toBeCloseTo(base / 2, 9)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. The guards                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every value JavaScript can put in a slot that a slider, a JSON spec or a
 * division can produce. Not one of them may come back as NaN or Infinity: a
 * non-finite pressure reaches a transform string, the scene goes blank, and no
 * error is ever raised anywhere.
 */
const HOSTILE = [0, -1, -1000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE]

describe('pressureKPa — guards', () => {
  it('survives a zero volume', () => {
    const p = pressureKPa(300, 0, 1)
    expect(Number.isFinite(p)).toBe(true)
    expect(p).toBeGreaterThan(0)
  })

  it('survives a negative volume', () => {
    expect(Number.isFinite(pressureKPa(300, -10, 1))).toBe(true)
  })

  it('survives NaN and Infinity in every slot, in every combination', () => {
    for (const t of HOSTILE) {
      for (const v of HOSTILE) {
        for (const n of HOSTILE) {
          const p = pressureKPa(t, v, n)
          expect(Number.isFinite(p), `pressureKPa(${t}, ${v}, ${n}) was ${p}`).toBe(true)
          expect(Number.isNaN(p)).toBe(false)
          expect(p).toBeGreaterThanOrEqual(0)
          expect(p).toBeLessThanOrEqual(LIMITS.pressureKPa.max)
        }
      }
    }
  })

  it('survives values that are not numbers at all', () => {
    const junk = [undefined, null, 'hot', {}, []] as unknown as number[]
    for (const value of junk) {
      expect(Number.isFinite(pressureKPa(value, 24, 1))).toBe(true)
      expect(Number.isFinite(pressureKPa(300, value, 1))).toBe(true)
      expect(Number.isFinite(pressureKPa(300, 24, value))).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* particleSpeed                                                              */
/* -------------------------------------------------------------------------- */

describe('particleSpeed', () => {
  it('is exactly 1 at the reference temperature', () => {
    expect(particleSpeed(REFERENCE_K)).toBe(1)
  })

  it('goes as the square root of temperature, not linearly', () => {
    // Four times the temperature is twice the speed. A linear renderer would
    // return 4 here and would be teaching the reader something false.
    expect(particleSpeed(4 * REFERENCE_K)).toBeCloseTo(2, 9)
    expect(particleSpeed(REFERENCE_K / 4)).toBeCloseTo(0.5, 9)
    expect(particleSpeed(600)).toBeCloseTo(Math.SQRT2, 9)
  })

  it('rises with temperature', () => {
    const readings = [0, 50, 300, 900].map(particleSpeed)
    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]!).toBeGreaterThan(readings[i - 1]!)
    }
  })

  it('is zero at absolute zero', () => {
    expect(particleSpeed(0)).toBe(0)
  })

  it('is finite for every hostile input', () => {
    for (const t of HOSTILE) {
      const speed = particleSpeed(t)
      expect(Number.isFinite(speed), `particleSpeed(${t}) was ${speed}`).toBe(true)
      expect(speed).toBeGreaterThanOrEqual(0)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The geometry both views share                                              */
/* -------------------------------------------------------------------------- */

describe('volumeScale and densityScale', () => {
  it('scales the box by the cube root of volume', () => {
    expect(volumeScale(24)).toBeCloseTo(1, 9)
    // Eight times the gas is twice the box, not eight times — but the clamp
    // catches it first, which is the behaviour the frame depends on.
    expect(volumeScale(24 * 8)).toBeLessThanOrEqual(1.3)
    expect(volumeScale(24 * 8)).toBeGreaterThan(volumeScale(24))
  })

  it('never leaves the frame, whatever it is handed', () => {
    for (const v of HOSTILE) {
      const scale = volumeScale(v)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThanOrEqual(0.55)
      expect(scale).toBeLessThanOrEqual(1.3)
    }
  })

  it('keeps particle size finite and bounded', () => {
    expect(densityScale(1)).toBeCloseTo(1, 9)
    for (const n of HOSTILE) {
      const scale = densityScale(n)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThanOrEqual(0.7)
      expect(scale).toBeLessThanOrEqual(1.6)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Particles                                                                  */
/* -------------------------------------------------------------------------- */

describe('seedParticles', () => {
  it('is deterministic, so 2D and 3D show the same gas', () => {
    expect(seedParticles(8, 7)).toEqual(seedParticles(8, 7))
  })

  it('starts every particle inside the unit box', () => {
    for (const p of seedParticles()) {
      for (const value of [p.x, p.y, p.z]) {
        expect(value).toBeGreaterThan(0)
        expect(value).toBeLessThan(1)
      }
      expect(Number.isFinite(p.vx + p.vy + p.vz)).toBe(true)
    }
  })

  it('defaults to the shared particle count', () => {
    expect(seedParticles()).toHaveLength(PARTICLE_COUNT)
  })
})

describe('advanceParticles', () => {
  it('keeps every particle inside the box over a long run', () => {
    const particles = seedParticles(PARTICLE_COUNT, 3)
    for (let frame = 0; frame < 2000; frame += 1) {
      advanceParticles(particles, 1 / 60, particleSpeed(900))
    }
    for (const p of particles) {
      for (const value of [p.x, p.y, p.z]) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('does not teleport particles when a backgrounded tab returns a huge delta', () => {
    const particles = seedParticles(4, 11)
    advanceParticles(particles, 45, 8)
    for (const p of particles) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
    }
  })

  it('survives NaN and Infinity deltas without moving anything off-box', () => {
    const particles = seedParticles(4, 5)
    for (const dt of HOSTILE) {
      for (const speed of HOSTILE) {
        advanceParticles(particles, dt, speed)
      }
    }
    for (const p of particles) {
      for (const value of [p.x, p.y, p.z]) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('holds the cloud still at absolute zero', () => {
    const particles = seedParticles(4, 2)
    const before = particles.map((p: Particle) => ({ ...p }))
    advanceParticles(particles, 1 / 60, particleSpeed(0))
    expect(particles).toEqual(before)
  })
})
