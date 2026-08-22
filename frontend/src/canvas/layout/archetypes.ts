import type { LessonElement, RepresentationKind } from '../contract/types'

/* SEVEN COMPOSITIONS, AND A PURE FUNCTION THAT PICKS ONE.
 *
 * This is not an algorithm with taste. It is an algorithm choosing from seven
 * layouts a human already tuned to look right — which is a much smaller and
 * much more tractable problem, and the reason the output can be trusted.
 *
 * DETERMINISTIC BY CONSTRUCTION: no model call, no randomness, no clock, no
 * reading of anything outside its arguments. The same lesson selects the same
 * archetype on every run, which is what makes a screenshot test meaningful and
 * a layout bug reproducible.
 *
 * EVERY SELECTION IS EXPLAINABLE. The function returns which rule fired and
 * the numbers it fired on. A composition nobody can explain is a composition
 * nobody can debug.
 */

export type Archetype =
  | 'NARRATIVE' | 'DATA' | 'PROCESS' | 'COMPARISON'
  | 'DERIVATION' | 'EXPLORATORY' | 'SPLIT'

export const GRID_COLUMNS = 12

/** A region of the grid. Positions come from HERE, never from a lesson. */
export interface Slot {
  /** 1-based column start. */
  col: number
  span: number
  /** Row band. The engine flows content within a band. */
  band: number
  /** Which priority this slot expects. */
  role: 'lead' | 'support' | 'aside'
}

export interface Composition {
  archetype: Archetype
  /** Ordered slots. More elements than slots means the tail flows into the
   *  last band; fewer means trailing slots go unused, which is intentional
   *  whitespace and must not be flagged as an accidental void. */
  slots: Slot[]
  /** Declared empty regions — the archetype saying "this space is on purpose". */
  intentionalVoid: boolean
  description: string
}

/* ── the seven, hand-tuned ─────────────────────────────────────────────── */

const COMPOSITIONS: Record<Archetype, Composition> = {
  /* Prose leads. One readable column, because a paragraph set across twelve
   * columns is unreadable at any font size. */
  NARRATIVE: {
    archetype: 'NARRATIVE',
    slots: [
      { col: 3, span: 8, band: 0, role: 'lead' },
      { col: 3, span: 8, band: 1, role: 'support' },
      { col: 3, span: 4, band: 2, role: 'aside' },
      { col: 7, span: 4, band: 2, role: 'aside' },
    ],
    intentionalVoid: true,
    description: 'A single readable column. Margins are deliberate.',
  },

  /* Tables and charts, packed. Data wants width and neighbours to compare to. */
  DATA: {
    archetype: 'DATA',
    slots: [
      { col: 1, span: 12, band: 0, role: 'lead' },
      { col: 1, span: 6, band: 1, role: 'support' },
      { col: 7, span: 6, band: 1, role: 'support' },
      { col: 1, span: 4, band: 2, role: 'aside' },
      { col: 5, span: 4, band: 2, role: 'aside' },
      { col: 9, span: 4, band: 2, role: 'aside' },
    ],
    intentionalVoid: false,
    description: 'Full-width lead, then a comparison pair, then a detail row.',
  },

  /* Sequence. The eye follows left-to-right, so the lead spans and the steps
   * sit beneath it in one band. */
  PROCESS: {
    archetype: 'PROCESS',
    slots: [
      { col: 1, span: 12, band: 0, role: 'lead' },
      { col: 1, span: 12, band: 1, role: 'support' },
      { col: 1, span: 6, band: 2, role: 'aside' },
      { col: 7, span: 6, band: 2, role: 'aside' },
    ],
    intentionalVoid: false,
    description: 'A wide flow, then supporting detail underneath it.',
  },

  /* Two or three things held side by side. The lead is the comparison itself. */
  COMPARISON: {
    archetype: 'COMPARISON',
    slots: [
      { col: 1, span: 12, band: 0, role: 'lead' },
      { col: 1, span: 4, band: 1, role: 'support' },
      { col: 5, span: 4, band: 1, role: 'support' },
      { col: 9, span: 4, band: 1, role: 'support' },
      { col: 3, span: 8, band: 2, role: 'aside' },
    ],
    intentionalVoid: false,
    description: 'The comparison leads; its subjects sit in equal columns.',
  },

  /* Mathematics. Steps stack in a narrow column so the eye tracks one line of
   * reasoning down the page, with room for annotation beside it. */
  DERIVATION: {
    archetype: 'DERIVATION',
    slots: [
      { col: 2, span: 6, band: 0, role: 'lead' },
      { col: 8, span: 4, band: 0, role: 'aside' },
      { col: 2, span: 6, band: 1, role: 'support' },
      { col: 8, span: 4, band: 1, role: 'aside' },
      { col: 2, span: 10, band: 2, role: 'support' },
    ],
    intentionalVoid: true,
    description: 'A narrow column of reasoning with annotation alongside.',
  },

  /* The gas scene's shape. A large interactive stage, controls and readouts
   * around it, supporting evidence beneath. */
  EXPLORATORY: {
    archetype: 'EXPLORATORY',
    slots: [
      { col: 1, span: 5, band: 0, role: 'lead' },
      { col: 6, span: 7, band: 0, role: 'support' },
      { col: 6, span: 4, band: 1, role: 'support' },
      { col: 10, span: 3, band: 1, role: 'aside' },
      { col: 1, span: 5, band: 1, role: 'aside' },
      { col: 1, span: 12, band: 2, role: 'aside' },
    ],
    intentionalVoid: false,
    description: 'An interactive stage with its evidence arranged around it.',
  },

  /* The honest default. Two columns, no claim about what the content is. */
  SPLIT: {
    archetype: 'SPLIT',
    slots: [
      { col: 1, span: 7, band: 0, role: 'lead' },
      { col: 8, span: 5, band: 0, role: 'support' },
      { col: 1, span: 7, band: 1, role: 'support' },
      { col: 8, span: 5, band: 1, role: 'aside' },
    ],
    intentionalVoid: false,
    description: 'A two-column split. The default when nothing else fits.',
  },
}

export function compositionFor(a: Archetype): Composition {
  return COMPOSITIONS[a]
}

export function allArchetypes(): Archetype[] {
  return Object.keys(COMPOSITIONS) as Archetype[]
}

/* ── the semantic profile a decision is made from ──────────────────────── */

export interface SemanticProfile {
  kinds: RepresentationKind[]
  primaryCount: number
  /** 0..1 — share of content that is data-shaped. */
  dataMass: number
  /** 0..1 — share of content that is prose. */
  textMass: number
  hasSimulation: boolean
  hasDerivation: boolean
  hasComparison: boolean
  hasSequence: boolean
}

const DATA_KINDS = new Set<RepresentationKind>(['table', 'chart', 'graph'])
const TEXT_KINDS = new Set<RepresentationKind>(['text', 'equation'])

export function profile(elements: LessonElement[]): SemanticProfile {
  const kinds = elements.map((e) => e.kind)
  const n = Math.max(1, elements.length)
  const data = kinds.filter((k) => DATA_KINDS.has(k)).length
  const text = kinds.filter((k) => TEXT_KINDS.has(k)).length

  return {
    kinds,
    primaryCount: elements.filter((e) => e.priority === 'primary').length,
    dataMass: data / n,
    textMass: text / n,
    hasSimulation: kinds.indexOf('simulation') >= 0,
    hasDerivation: elements.some((e) => e.purpose === 'derive'),
    hasComparison: kinds.indexOf('comparison') >= 0,
    hasSequence: kinds.indexOf('timeline') >= 0 || kinds.indexOf('diagram') >= 0,
  }
}

/* ── selection ─────────────────────────────────────────────────────────── */

export interface ArchetypeDecision {
  archetype: Archetype
  /** Which rule fired, by name. */
  rule: string
  /** The numbers it fired on, so the decision can be argued with. */
  because: string
  profile: SemanticProfile
}

/* ORDER IS THE DESIGN. Simulation beats derivation beats comparison, because a
 * lesson with a simulation IS an exploratory lesson even if it also derives
 * something. The first matching rule wins and nothing later can override it —
 * which is what makes this explainable rather than a weighted mystery. */
export function selectArchetype(elements: LessonElement[]): ArchetypeDecision {
  const p = profile(elements)
  const decide = (archetype: Archetype, rule: string, because: string): ArchetypeDecision =>
    ({ archetype, rule, because, profile: p })

  if (p.hasSimulation) {
    return decide('EXPLORATORY', 'has simulation',
      'A lesson the learner can manipulate is an exploratory lesson, whatever else it contains.')
  }
  if (p.hasDerivation) {
    return decide('DERIVATION', 'has derivation',
      'An element with the purpose "derive" needs a column the eye can track down.')
  }
  if (p.hasComparison && p.primaryCount === 1) {
    return decide('COMPARISON', 'has comparison && exactly one primary',
      `${p.kinds.length} elements, one primary — the comparison is the lesson.`)
  }
  if (p.hasSequence) {
    return decide('PROCESS', 'has flowchart or timeline',
      'Sequence reads left-to-right and needs the width to do it.')
  }
  if (p.dataMass > 0.5) {
    return decide('DATA', 'dataMass > 0.5',
      `${Math.round(p.dataMass * 100)}% of elements are tables, charts or graphs.`)
  }
  if (p.textMass > 0.6) {
    return decide('NARRATIVE', 'textMass > 0.6',
      `${Math.round(p.textMass * 100)}% of elements are prose or equations.`)
  }
  return decide('SPLIT', 'default',
    `No rule fired: dataMass ${p.dataMass.toFixed(2)}, textMass ${p.textMass.toFixed(2)}.`)
}
