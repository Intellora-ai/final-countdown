/* THE REPRESENTATIONS THIS LESSON CAN OFFER, AND WHY EACH ONE EXISTS.
 *
 * Registered rather than hard-coded into the board, so "show me another way"
 * is a lookup instead of a switch statement someone has to remember to extend.
 * Each declares what it explains and — the load-bearing half — what it cannot.
 *
 * The chain those declarations produce is the lesson's own pedagogy:
 *
 *   particle-lattice  cannot explain  the exact threshold, how much heat
 *   causal-chain      cannot explain  the exact threshold, how much heat
 *   melting-condition explains        the exact threshold
 *   particle-motion   explains        how individual particles move
 *
 * So a learner who has watched the causal chain and asks for another way is
 * offered the melting condition, because that is the representation covering
 * what the chain just admitted it could not. Nobody wrote that ordering down;
 * it falls out of the declarations.
 */

import { RepresentationRegistry, type RepresentationDefinition } from './representations'

/* Claims specific to change of state. Constants, so a typo is a compile error
 * rather than an edge that silently never matches. */
export const MELT = {
  ordering: 'how particles are arranged in a solid',
  causation: 'why heat leads to melting',
  threshold: 'the exact temperature at which it melts',
  quantity: 'how much heat a given mass needs',
  motion: 'how individual particles move at a given temperature',
} as const

export const LESSON_REPRESENTATIONS: RepresentationDefinition[] = [
  {
    representationId: 'particle-lattice',
    name: 'Particle lattice',
    renderer: 'svg',
    purpose: 'show that a solid is particles held in a fixed arrangement',
    explains: [MELT.ordering],
    cannotExplain: [MELT.threshold, MELT.quantity, MELT.motion],
    misconceptionRisk: ['a still diagram suggests the particles are not moving at all'],
    requiredData: [],
    supportedZoomLevels: [1, 2],
    supportsInteraction: false,
    supportsAnimation: true,
  },
  {
    representationId: 'causal-chain',
    name: 'Causal chain',
    renderer: 'svg',
    purpose: 'show the sequence by which added heat ends in a collapsed lattice',
    explains: [MELT.causation],
    cannotExplain: [MELT.threshold, MELT.quantity, MELT.motion],
    misconceptionRisk: ['a chain of boxes suggests the steps happen one after another in time'],
    requiredData: [],
    supportedZoomLevels: [1, 2],
    supportsInteraction: false,
    supportsAnimation: true,
  },
  {
    representationId: 'melting-condition',
    name: 'Melting condition',
    renderer: 'katex',
    purpose: 'state the exact temperature threshold, and test the current temperature against it',
    explains: [MELT.threshold],
    cannotExplain: [MELT.causation, MELT.motion, MELT.ordering],
    misconceptionRisk: ['an inequality can look like a rule the substance obeys rather than a description'],
    requiredData: ['temperature'],
    supportedZoomLevels: [2, 3],
    supportsInteraction: false,
    supportsAnimation: false,
  },
  {
    representationId: 'particle-motion',
    name: 'Particle motion',
    renderer: 'pixi',
    purpose: 'show particle speed rising with temperature, and the lattice breaking at the melting point',
    explains: [MELT.motion, MELT.ordering],
    cannotExplain: [MELT.threshold, MELT.quantity],
    misconceptionRisk: ['a fast particle can look like a hot particle, when temperature is an average over many'],
    requiredData: ['temperature'],
    supportedZoomLevels: [2, 3],
    supportsInteraction: true,
    supportsAnimation: true,
  },
]

export function buildLessonRegistry(): RepresentationRegistry {
  const registry = new RepresentationRegistry()
  for (const definition of LESSON_REPRESENTATIONS) registry.register(definition)
  return registry
}

/* ── the physics the representations render ──────────────────────────────────
 * Real constants for water, named where they come from, because a board that
 * invents a melting point teaches a wrong number with total confidence. */
export const WATER = {
  /** Melting point of ice at one atmosphere. */
  fusionK: 273.15,
  /** Boiling point of water at one atmosphere. */
  vaporisationK: 373.15,
} as const

export type Phase = 'solid' | 'melting' | 'liquid' | 'boiling' | 'gas'

export function phaseAt(temperatureK: number): Phase {
  // A substance at exactly its melting point is doing something specific and
  // worth naming: absorbing heat without getting hotter. Collapsing that into
  // "solid" or "liquid" would hide the very thing this lesson is about.
  if (Math.abs(temperatureK - WATER.fusionK) < 0.5) return 'melting'
  if (Math.abs(temperatureK - WATER.vaporisationK) < 0.5) return 'boiling'
  if (temperatureK < WATER.fusionK) return 'solid'
  if (temperatureK < WATER.vaporisationK) return 'liquid'
  return 'gas'
}

/** The melting condition as LaTeX, with the learner's current temperature
 *  substituted. Structured source, never a picture of maths. */
export function meltingConditionTex(temperatureK: number): string {
  const phase = phaseAt(temperatureK)
  const relation = temperatureK < WATER.fusionK ? '<' : temperatureK > WATER.fusionK ? '>' : '='
  const verdict =
    phase === 'melting' ? '\\text{melting}' :
    phase === 'solid' ? '\\text{still solid}' :
    '\\text{no longer solid}'
  return `T = ${temperatureK.toFixed(0)}\\,\\mathrm{K} \\;${relation}\\; T_{\\mathrm{fus}} = ${WATER.fusionK}\\,\\mathrm{K} \\;\\Rightarrow\\; ${verdict}`
}

/* Root-mean-square particle speed rises with the square root of temperature.
 * Returned as a unitless multiplier against the speed at the melting point, so
 * the simulation can scale motion without claiming a metres-per-second figure
 * it has no mass to compute. */
export function speedFactor(temperatureK: number): number {
  return Math.sqrt(Math.max(temperatureK, 1) / WATER.fusionK)
}
