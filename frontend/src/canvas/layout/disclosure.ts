import type { LessonElement } from '../contract/types'
import type { Archetype } from './archetypes'

/* THE DENSITY POLICY — a CAPACITY policy, and never a style policy.
 *
 * This is the single most abusable module in the engine, so the boundary is
 * stated before the code: density may change HOW MUCH is visible. It may never
 * change how anything LOOKS.
 *
 *   MAY control    initial item counts, pagination, whether asides collapse,
 *                  whether a chart aggregates, whether a timeline groups,
 *                  whether the composition falls back to a simpler archetype
 *
 *   MUST NOT touch font size, colour, spacing tokens, line height, radius,
 *                  stroke width, row height, arrow style, or any component
 *                  styling whatsoever
 *
 * The reason is that "make it smaller so it fits" is the easiest fix in
 * front-end work and the one that destroys a design system fastest. A board
 * that shrinks its type under pressure has two type scales; a board that
 * discloses under pressure has one. There is a test asserting that the value
 * returned by this module contains no style key at all — not that it happens
 * not to be used for styling, but that it cannot be.
 */

export type Density = 'relaxed' | 'normal' | 'compact'

export interface ContentMass {
  chars: number
  rows: number
  points: number
  items: number
  /** The weighted total the thresholds are read from. */
  mass: number
}

/** Rough size of an element's payload, in the units that drive layout. */
export function measure(element: LessonElement): Omit<ContentMass, 'mass'> {
  const p = element.payload as Record<string, unknown>
  const chars = JSON.stringify(p?.paragraphs ?? p?.steps ?? '').length
  const rows = Array.isArray(p?.rows) ? p.rows.length : 0
  const points = Array.isArray(p?.data) ? p.data.length : 0
  const items = (Array.isArray(p?.nodes) ? p.nodes.length : 0)
    + (Array.isArray(p?.events) ? p.events.length : 0)
    + (Array.isArray(p?.options) ? p.options.length : 0)
  return { chars, rows, points, items }
}

export function contentMass(elements: LessonElement[]): ContentMass {
  const total = elements.reduce(
    (acc, e) => {
      const m = measure(e)
      return {
        chars: acc.chars + m.chars,
        rows: acc.rows + m.rows,
        points: acc.points + m.points,
        items: acc.items + m.items,
      }
    },
    { chars: 0, rows: 0, points: 0, items: 0 },
  )
  const mass =
    total.chars / 600 + total.rows / 12 + total.points / 40 + total.items / 8
  return { ...total, mass }
}

export function densityFor(mass: number): Density {
  if (mass < 1.5) return 'relaxed'
  if (mass < 4.0) return 'normal'
  return 'compact'
}

/* ── what a density is ALLOWED to decide ───────────────────────────────── */

/* Note what is absent from this type. There is no fontSize, no padding, no
 * colour and no spacing — not "unused", absent, so no caller can reach for
 * one. Making the wrong thing unrepresentable beats documenting that it is
 * wrong. */
export interface DensityPolicy {
  density: Density
  /** Items shown before disclosure kicks in, per unit. */
  initialItems: number
  initialRows: number
  /** Does secondary content start collapsed into a drawer? */
  collapseAsides: boolean
  /** May the largest block paginate? */
  allowPagination: boolean
  /** May a chart aggregate rather than plot every point? */
  allowAggregation: boolean
  /** May a timeline group its events into phases? */
  allowGrouping: boolean
}

const POLICIES: Record<Density, Omit<DensityPolicy, 'density'>> = {
  relaxed: {
    initialItems: 12, initialRows: 12,
    collapseAsides: false, allowPagination: false,
    allowAggregation: false, allowGrouping: false,
  },
  normal: {
    initialItems: 8, initialRows: 10,
    collapseAsides: false, allowPagination: true,
    allowAggregation: false, allowGrouping: true,
  },
  compact: {
    initialItems: 5, initialRows: 8,
    collapseAsides: true, allowPagination: true,
    allowAggregation: true, allowGrouping: true,
  },
}

export function policyFor(density: Density): DensityPolicy {
  return { density, ...POLICIES[density] }
}

/* ── the ladder ────────────────────────────────────────────────────────── */

export type LadderRung =
  | 'block_strategy'
  | 'collapse_asides'
  | 'paginate_largest'
  | 'simpler_archetype'
  | 'split_canvas'

export interface LadderStep {
  rung: LadderRung
  applied: boolean
  detail: string
}

/** Simpler archetypes, in the order the ladder falls back through. Each is a
 *  real composition, so a fallback is still a designed layout rather than a
 *  degraded one. */
const SIMPLER: Partial<Record<Archetype, Archetype>> = {
  EXPLORATORY: 'SPLIT',
  DATA: 'SPLIT',
  COMPARISON: 'SPLIT',
  PROCESS: 'SPLIT',
  DERIVATION: 'NARRATIVE',
  SPLIT: 'NARRATIVE',
  /* NARRATIVE is the floor — a single readable column always fits. */
}

export function simplerThan(a: Archetype): Archetype | null {
  return SIMPLER[a] ?? null
}

export interface LadderResult {
  archetype: Archetype
  policy: DensityPolicy
  steps: LadderStep[]
  /** True when the ladder ran out and the canvas must split in two. */
  requiresSplit: boolean
}

/* Climb only as far as needed. Each rung is recorded whether or not it fired,
 * so "why does this lesson look like that" has an answer. */
export function climbLadder(
  archetype: Archetype,
  mass: ContentMass,
  slotCount: number,
  elementCount: number,
): LadderResult {
  const density = densityFor(mass.mass)
  const policy = policyFor(density)
  const steps: LadderStep[] = []
  let current = archetype
  let overflow = elementCount > slotCount

  steps.push({
    rung: 'block_strategy', applied: true,
    detail: `Density ${density} (mass ${mass.mass.toFixed(2)}); each block applies its own disclosure strategy.`,
  })

  steps.push({
    rung: 'collapse_asides', applied: policy.collapseAsides,
    detail: policy.collapseAsides
      ? 'Secondary content starts in a drawer, reachable in one action.'
      : 'Secondary content stays visible.',
  })

  steps.push({
    rung: 'paginate_largest', applied: policy.allowPagination && overflow,
    detail: policy.allowPagination && overflow
      ? 'The largest block paginates.'
      : 'No pagination needed.',
  })

  if (overflow && policy.collapseAsides) overflow = elementCount > slotCount + 2

  const simpler = overflow ? simplerThan(current) : null
  steps.push({
    rung: 'simpler_archetype', applied: simpler !== null,
    detail: simpler
      ? `${current} could not hold ${elementCount} elements in ${slotCount} slots; falling back to ${simpler}.`
      : 'The chosen composition holds the content.',
  })
  if (simpler) current = simpler

  const requiresSplit = overflow && simpler === null
  steps.push({
    rung: 'split_canvas', applied: requiresSplit,
    detail: requiresSplit
      ? 'Even the simplest composition cannot hold this; the lesson splits across two canvases.'
      : 'One canvas is enough.',
  })

  return { archetype: current, policy, steps, requiresSplit }
}
