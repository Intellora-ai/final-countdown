/* CS-9 — the physics is real, and the switching order falls out of the declarations.
 *
 * The chain assertion is the one worth having. Nobody hard-codes "after the
 * causal chain, offer the melting condition"; the registry derives it from what
 * the chain declared it cannot explain. If a future edit widened the chain's
 * `explains` dishonestly, this test would start passing for the wrong reason —
 * so it also checks the declarations themselves.
 */

import { describe, it, expect } from 'vitest'
import {
  buildLessonRegistry, LESSON_REPRESENTATIONS, MELT, WATER,
  phaseAt, meltingConditionTex, speedFactor,
} from './lesson-representations'

describe('CS-9 lesson representations', () => {
  it('registers every representation with a purpose and a declared limit', () => {
    const registry = buildLessonRegistry()
    expect(registry.all()).toHaveLength(LESSON_REPRESENTATIONS.length)
    for (const d of registry.all()) {
      expect(d.purpose.trim().length).toBeGreaterThan(10)
      expect(d.explains.length).toBeGreaterThan(0)
      // Every one of these genuinely cannot do something. A representation that
      // claimed no limits would be the one to distrust.
      expect(d.cannotExplain.length).toBeGreaterThan(0)
    }
  })

  it('offers the melting condition after the causal chain, because that is the gap', () => {
    const registry = buildLessonRegistry()
    const data = ['temperature']
    const ranked = registry.alternativesFor('causal-chain', data).map((d) => d.representationId)
    expect(ranked[0]).toBe('melting-condition')
    // And the reason is real, not coincidence: the chain says it cannot give
    // the threshold, and the condition says it can.
    const chain = registry.get('causal-chain')!
    const condition = registry.get('melting-condition')!
    expect(chain.cannotExplain).toContain(MELT.threshold)
    expect(condition.explains).toContain(MELT.threshold)
  })

  it('will not let the equation be presented as an explanation of the mechanism', () => {
    const registry = buildLessonRegistry()
    expect(() => registry.assertCanClaim('melting-condition', MELT.causation)).toThrow(/cannot explain/)
    expect(() => registry.assertCanClaim('melting-condition', MELT.threshold)).not.toThrow()
  })

  it('hides the temperature-driven representations when no temperature is defined', () => {
    const registry = buildLessonRegistry()
    const ids = registry.availableWith([]).map((d) => d.representationId)
    expect(ids).toContain('particle-lattice')
    expect(ids).toContain('causal-chain')
    expect(ids).not.toContain('melting-condition')
    expect(ids).not.toContain('particle-motion')
  })

  it('names the phase correctly at and around the real melting point', () => {
    // 273.15 K is the melting point of ice at one atmosphere, not a number
    // chosen to make the demo work.
    expect(WATER.fusionK).toBe(273.15)
    expect(phaseAt(200)).toBe('solid')
    expect(phaseAt(273.15)).toBe('melting')
    expect(phaseAt(300)).toBe('liquid')
    expect(phaseAt(373.15)).toBe('boiling')
    expect(phaseAt(500)).toBe('gas')
  })

  it('keeps "melting" as its own phase rather than rounding it into solid or liquid', () => {
    // A substance at its melting point absorbs heat WITHOUT getting hotter,
    // which is the whole subject of this lesson. Collapsing it would hide it.
    expect(phaseAt(273.0)).toBe('melting')
    expect(phaseAt(272.0)).toBe('solid')
    expect(phaseAt(274.0)).toBe('liquid')
  })

  it('produces LaTeX source, never a rendered image, and substitutes the live value', () => {
    const cold = meltingConditionTex(200)
    expect(cold).toContain('T = 200')
    expect(cold).toContain('<')
    expect(cold).toContain('still solid')
    const hot = meltingConditionTex(450)
    expect(hot).toContain('T = 450')
    expect(hot).toContain('>')
    expect(hot).toContain('no longer solid')
    // Structured source: the relationship is text a renderer interprets.
    expect(cold).toMatch(/T_\{\\mathrm\{fus\}\}/)
  })

  it('scales particle speed with the square root of temperature', () => {
    // Kinetic theory, not an eased curve chosen because it looked good.
    expect(speedFactor(WATER.fusionK)).toBeCloseTo(1, 6)
    expect(speedFactor(WATER.fusionK * 4)).toBeCloseTo(2, 6)
    expect(speedFactor(WATER.fusionK * 9)).toBeCloseTo(3, 6)
    // Monotonic, and never zero or negative even at absurd inputs.
    expect(speedFactor(0)).toBeGreaterThan(0)
    expect(speedFactor(500)).toBeGreaterThan(speedFactor(300))
  })
})
