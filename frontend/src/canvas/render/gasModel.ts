/**
 * The ideal gas, as arithmetic. No React, no DOM, no clock, no unseeded
 * randomness — so every number below is testable without a browser.
 *
 * WHY THIS FILE GUARDS SO HARD
 * ----------------------------
 * A NaN produced here does not fail here. It travels: into a `translate(NaN
 * NaN)` on an SVG group, or into a Matrix4 on an InstancedMesh. Neither throws.
 * The particles simply stop being drawn, the scene goes blank, the console stays
 * empty, and nothing in the stack can tell you which slider did it. That silence
 * is why every exported function here is TOTAL: any value in, a finite value
 * out, no exceptions and no NaN.
 *
 * The clamps are floors, not repairs. A garbage volume reads as an implausibly
 * large pressure in the readout — loudly wrong, where a reader can see it —
 * rather than as a plausible number, or as a blank canvas.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Universal gas constant, J/(mol·K). */
export const GAS_CONSTANT = 8.314

/**
 * The temperature `particleSpeed` normalises against.
 *
 * Room temperature, so a lesson that opens near 300 K opens near speed 1 and
 * the reader's first impression of "normal" is the scene's baseline.
 */
export const REFERENCE_K = 300

/** One mole of ideal gas at room temperature and pressure, in litres. */
export const REFERENCE_VOLUME_L = 24

/**
 * How many particles both views draw.
 *
 * FIXED, and shared by the 2D schematic and the 3D scene, so the mode toggle is
 * a change of viewpoint rather than a change of subject. It is a legibility
 * number and not Avogadro's: `moles` shows up in the readout and in particle
 * size, never by spawning 6e23 spheres.
 */
export const PARTICLE_COUNT = 28

/**
 * Sane floors and ceilings for every input.
 *
 * The volume floor is what stops the division. The ceilings stop a
 * `Number.MAX_VALUE` in any slot from multiplying its way to Infinity before
 * the division ever runs — a guard that only clamped the floor would still let
 * `pressureKPa(MAX_VALUE, 0.001, MAX_VALUE)` overflow.
 */
export const LIMITS = {
  temperatureK: { min: 0, max: 1e6 },
  volumeL: { min: 1e-3, max: 1e6 },
  moles: { min: 0, max: 1e6 },
  pressureKPa: { min: 0, max: 1e12 },
} as const

/**
 * What a quantity is worth when the spec declares no control for it.
 *
 * A spec may drive temperature and volume only — the reference lesson does
 * exactly that — and the pressure readout still needs an amount of gas. One
 * mole in 24 L is the standard the whole lesson is pitched around.
 */
export const DEFAULT_STATE = { temperature: 300, volume: 24, moles: 1 } as const

/** The three quantities this model understands. Mirrors the spec's control keys. */
export type GasQuantity = keyof typeof DEFAULT_STATE

/* -------------------------------------------------------------------------- */
/* The guard every public function runs its inputs through                    */
/* -------------------------------------------------------------------------- */

/**
 * Force a value into `[min, max]`, total over everything JavaScript can hand
 * you — including the things TypeScript swears cannot arrive.
 *
 * `v: unknown` looks over-defensive against a `number` signature and is not: a
 * slider value arrives as a string from the DOM, and a spec arrives as JSON from
 * a model. The types are a promise about our code, not about the input.
 */
export function clampFinite(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback
  if (v === Number.POSITIVE_INFINITY) return max
  if (v === Number.NEGATIVE_INFINITY) return min
  return Math.min(max, Math.max(min, v))
}

/* -------------------------------------------------------------------------- */
/* PV = nRT                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Pressure in kilopascals, from the ideal gas law.
 *
 * THE UNITS, BECAUSE THEY ARE THE EASY THING TO GET WRONG
 * ------------------------------------------------------
 *   PV = nRT, with R = 8.314 J/(mol·K)   →   P = nRT / V
 *
 * n·R·T is in joules. Divide joules by litres and you get J/L — and 1 J/L is
 * exactly 1 kPa, because 1 J = 1 Pa·m³ and 1 L = 1e-3 m³, so 1 J/L = 1e3 Pa.
 * So NO conversion factor belongs in the expression below: the litre is already
 * doing the work. A stray ×1000 here is the classic version of this bug and it
 * looks completely right until you check it against one known value.
 *
 * Sanity: n=1, T=300 K, V=24 L → 8.314 × 300 / 24 ≈ 103.9 kPa, which is about
 * one atmosphere, which is what a mole of gas in 24 litres ought to be.
 *
 * Never returns NaN, never returns Infinity, never returns a negative.
 */
export function pressureKPa(temperatureK: number, volumeL: number, moles: number): number {
  const t = clampFinite(temperatureK, LIMITS.temperatureK.min, LIMITS.temperatureK.max, LIMITS.temperatureK.min)
  const v = clampFinite(volumeL, LIMITS.volumeL.min, LIMITS.volumeL.max, LIMITS.volumeL.min)
  const n = clampFinite(moles, LIMITS.moles.min, LIMITS.moles.max, LIMITS.moles.min)

  const pressure = (n * GAS_CONSTANT * t) / v

  /* Belt and braces. The clamps above make this unreachable; it costs one
     comparison, and it is the last place a non-finite number can be stopped
     before it reaches a transform string. */
  return clampFinite(pressure, LIMITS.pressureKPa.min, LIMITS.pressureKPa.max, LIMITS.pressureKPa.min)
}

/**
 * How fast the particles should look, relative to room temperature.
 *
 * Kinetic theory puts mean molecular speed ∝ √T, and that square root IS the
 * lesson: doubling the temperature does not double the motion, it multiplies it
 * by about 1.41. A linear scaling would look smoother and would teach the reader
 * something false, so the renderer is not allowed to "simplify" it.
 *
 * Normalised so 300 K returns exactly 1.
 */
export function particleSpeed(temperatureK: number): number {
  const t = clampFinite(temperatureK, LIMITS.temperatureK.min, LIMITS.temperatureK.max, LIMITS.temperatureK.min)
  return clampFinite(Math.sqrt(t / REFERENCE_K), 0, Number.MAX_SAFE_INTEGER, 0)
}

/* -------------------------------------------------------------------------- */
/* Geometry the two views must agree on                                       */
/* -------------------------------------------------------------------------- */

/**
 * Container edge length, relative to the reference volume.
 *
 * Cube root, because a volume is a length cubed: eight times the gas is twice
 * the box, not eight times. Clamped so the container stays inside the frame at
 * either end of whatever slider range a spec happens to declare — the 2D and 3D
 * views share this so the container is the same size in both.
 */
export function volumeScale(volumeL: number): number {
  const v = clampFinite(volumeL, LIMITS.volumeL.min, LIMITS.volumeL.max, REFERENCE_VOLUME_L)
  return clampFinite(Math.cbrt(v / REFERENCE_VOLUME_L), 0.55, 1.3, 1)
}

/**
 * Particle radius, relative to one mole.
 *
 * A LEGIBILITY PROXY, NOT PHYSICS. Real molecules do not swell when you add more
 * of them — but `PARTICLE_COUNT` is fixed, so without this a moles slider would
 * move a number and nothing else, and a control that appears inert reads as
 * broken. Chunkier dots stand in for a denser gas.
 */
export function densityScale(moles: number): number {
  const n = clampFinite(moles, LIMITS.moles.min, LIMITS.moles.max, 1)
  return clampFinite(Math.cbrt(Math.max(n, 0.05)), 0.7, 1.6, 1)
}

/* -------------------------------------------------------------------------- */
/* Particles                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One particle, in a unit box: every coordinate lives in [0, 1] and each view
 * maps that onto whatever space it draws in. Keeping the model unitless is what
 * lets an SVG schematic and a WebGL scene run the same simulation.
 */
export interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

/**
 * Deterministic positions and directions.
 *
 * SEEDED ON PURPOSE. `Math.random` here would mean the 2D and 3D views disagree
 * about where the gas is, a reduced-motion reader gets a different still image
 * on every mount, and no test of either view could ever mean anything.
 */
export function seedParticles(count: number = PARTICLE_COUNT, seed: number = 1): Particle[] {
  const n = Math.floor(clampFinite(count, 0, 4096, PARTICLE_COUNT))
  const random = lcg(Math.floor(clampFinite(seed, 1, 2 ** 31, 1)))
  const particles: Particle[] = []

  for (let i = 0; i < n; i += 1) {
    /* A direction on the sphere, then a speed in [0.55, 1], so the cloud looks
       thermal rather than like a shoal all heading the same way. */
    const theta = random() * Math.PI * 2
    const phi = Math.acos(2 * random() - 1)
    const magnitude = 0.55 + random() * 0.45

    particles.push({
      // Inset from the walls, so nothing starts mid-bounce.
      x: 0.08 + random() * 0.84,
      y: 0.08 + random() * 0.84,
      z: 0.08 + random() * 0.84,
      vx: Math.sin(phi) * Math.cos(theta) * magnitude,
      vy: Math.sin(phi) * Math.sin(theta) * magnitude,
      vz: Math.cos(phi) * magnitude,
    })
  }

  return particles
}

/**
 * Advance the cloud by one frame, bouncing off the walls of the unit box.
 *
 * MUTATES IN PLACE, deliberately: this runs sixty times a second for every
 * particle, and allocating a fresh array each frame is how a smooth scene turns
 * into a stuttering one. It stays deterministic — same array, same dt, same
 * speed, same result — so it is still testable.
 *
 * `dt` is clamped to 50 ms. A backgrounded tab hands you a delta of several
 * seconds the moment it comes back, and an unclamped step teleports every
 * particle straight through a wall and out of the box for good.
 */
export function advanceParticles(particles: Particle[], dtSeconds: number, speedScale: number): void {
  const dt = clampFinite(dtSeconds, 0, 0.05, 0)
  const speed = clampFinite(speedScale, 0, 64, 0)
  if (dt === 0 || speed === 0) return

  for (const p of particles) {
    p.x = bounce(p.x + p.vx * speed * dt, p, 'vx')
    p.y = bounce(p.y + p.vy * speed * dt, p, 'vy')
    p.z = bounce(p.z + p.vz * speed * dt, p, 'vz')
  }
}

/** Reflect a coordinate back inside [0, 1] and flip the velocity that took it out. */
function bounce(next: number, p: Particle, axis: 'vx' | 'vy' | 'vz'): number {
  if (!Number.isFinite(next)) {
    /* Unreachable given the clamps above, and handled anyway: a single NaN
       coordinate is enough to blank an entire scene, so it is recentred here
       rather than propagated into a matrix. */
    p[axis] = 0
    return 0.5
  }
  if (next < 0) {
    p[axis] = Math.abs(p[axis])
    return Math.min(1, -next)
  }
  if (next > 1) {
    p[axis] = -Math.abs(p[axis])
    return Math.max(0, 2 - next)
  }
  return next
}

/** A linear congruential generator. Small, seedable, and good enough for dots. */
function lcg(seed: number): () => number {
  let state = (seed || 1) >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}
