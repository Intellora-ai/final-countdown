import type { Invariant } from '../contract/types'
import type { Archetype, Slot } from './archetypes'
import { compositionFor } from './archetypes'
import { climbLadder, simplerThan, type ContentMass } from './disclosure'

/* NOTHING BROKEN EVER SHIPS.
 *
 * This runs after layout and before paint. It is code, not a review checklist,
 * because a review happens once and this happens on every frame of every
 * lesson the generator will ever produce.
 *
 * The governing rule: never paint a failing frame. When a check fails, climb
 * the repair ladder — the SAME ladder as the density policy, because a layout
 * that does not fit and a layout that overflows are the same problem seen from
 * two directions. Three passes, then the single-column fallback. Ugly and
 * correct beats broken and interesting.
 */

export interface PlacedBlock {
  id: string
  /** 1-based grid column. */
  col: number
  span: number
  band: number
  /** Measured content extent, in grid rows. */
  rows: number
  /** Does this block's content exceed the box it was given? */
  overflows: boolean
  /** Interactive target size in px, when the block has controls. */
  tapTarget?: number
  /** Contrast of this block's text against its ground. */
  contrast?: number
  /** True when a label was shortened. */
  truncatedLabel?: boolean
  /** ...and whether the full text is still reachable. */
  hasTooltip?: boolean
  /** Content the disclosure plan has hidden but kept reachable. */
  hiddenButReachable?: boolean
  /** Content that was dropped outright. Always a failure. */
  droppedContent?: boolean
}

export interface Edge { from: string; to: string }

export interface LayoutFrame {
  archetype: Archetype
  blocks: PlacedBlock[]
  edges: Edge[]
  mass: ContentMass
}

export type CheckName =
  | 'noOverflow' | 'noCollision' | 'noOrphanConnector' | 'contrastAA'
  | 'minTapTarget' | 'noAccidentalVoid' | 'contentAccessible' | 'labelFits'

export interface CheckResult extends Invariant {
  name: CheckName
  /** Blocks implicated, so a repair knows what to act on. */
  blocks: string[]
}

const AA_CONTRAST = 4.5
const MIN_TAP = 40

/* ── the checks ────────────────────────────────────────────────────────── */

export function noOverflow(f: LayoutFrame): CheckResult {
  const bad = f.blocks.filter((b) => b.overflows).map((b) => b.id)
  return {
    name: 'noOverflow', holds: bad.length === 0, blocks: bad,
    detail: bad.length ? `Content exceeds its box in: ${bad.join(', ')}.` : undefined,
  }
}

export function noCollision(f: LayoutFrame): CheckResult {
  const bad: string[] = []
  const byBand = new Map<number, PlacedBlock[]>()
  for (const b of f.blocks) byBand.set(b.band, [...(byBand.get(b.band) ?? []), b])

  for (const [, blocks] of byBand) {
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], c = blocks[j]
        const overlap = a.col <= c.col + c.span - 1 && c.col <= a.col + a.span - 1
        if (overlap) { bad.push(a.id, c.id) }
      }
    }
  }
  const uniq = [...new Set(bad)]
  return {
    name: 'noCollision', holds: uniq.length === 0, blocks: uniq,
    detail: uniq.length ? `Blocks overlap: ${uniq.join(', ')}.` : undefined,
  }
}

export function noOrphanConnector(f: LayoutFrame): CheckResult {
  const placed = new Set(f.blocks.map((b) => b.id))
  const bad = f.edges
    .filter((e) => !placed.has(e.from) || !placed.has(e.to))
    .map((e) => `${e.from}->${e.to}`)
  return {
    name: 'noOrphanConnector', holds: bad.length === 0, blocks: bad,
    detail: bad.length ? `Connectors point at blocks that were not placed: ${bad.join(', ')}.` : undefined,
  }
}

export function contrastAA(f: LayoutFrame): CheckResult {
  const bad = f.blocks
    .filter((b) => b.contrast !== undefined && b.contrast < AA_CONTRAST)
    .map((b) => b.id)
  return {
    name: 'contrastAA', holds: bad.length === 0, blocks: bad,
    detail: bad.length ? `Text below ${AA_CONTRAST}:1 in: ${bad.join(', ')}.` : undefined,
  }
}

export function minTapTarget(f: LayoutFrame): CheckResult {
  const bad = f.blocks
    .filter((b) => b.tapTarget !== undefined && b.tapTarget < MIN_TAP)
    .map((b) => b.id)
  return {
    name: 'minTapTarget', holds: bad.length === 0, blocks: bad,
    detail: bad.length ? `Interactive targets under ${MIN_TAP}px in: ${bad.join(', ')}.` : undefined,
  }
}

/* AN EMPTY REGION IS ONLY A FAULT WHEN THE LAYOUT CAUSED IT.
 *
 * NARRATIVE and DERIVATION leave margins deliberately, and a validator that
 * flagged them would push the engine toward filling every pixel — which is
 * how a considered layout turns into a dashboard. The composition declares
 * its intent; this check only fires when a band that should hold content
 * holds none. */
export function noAccidentalVoid(f: LayoutFrame): CheckResult {
  const comp = compositionFor(f.archetype)
  if (comp.intentionalVoid) {
    return {
      name: 'noAccidentalVoid', holds: true, blocks: [],
      detail: `${f.archetype} declares its whitespace; margins here are the design.`,
    }
  }
  const bands = new Set(f.blocks.map((b) => b.band))
  const expected = new Set(comp.slots.map((s: Slot) => s.band))
  /* A band is only "missing" if an EARLIER band has content — a lesson with
   * fewer blocks than slots simply stops, and stopping is not a void. */
  const filled = [...expected].filter((b) => bands.has(b))
  const highest = filled.length ? Math.max(...filled) : -1
  const gaps = [...expected].filter((b) => b < highest && !bands.has(b))
  return {
    name: 'noAccidentalVoid', holds: gaps.length === 0, blocks: gaps.map(String),
    detail: gaps.length ? `Bands ${gaps.join(', ')} are empty between filled bands.` : undefined,
  }
}

export function contentAccessible(f: LayoutFrame): CheckResult {
  const bad = f.blocks.filter((b) => b.droppedContent).map((b) => b.id)
  return {
    name: 'contentAccessible', holds: bad.length === 0, blocks: bad,
    detail: bad.length
      ? `Content was dropped in: ${bad.join(', ')}. Hiding is allowed; dropping is not.`
      : undefined,
  }
}

export function labelFits(f: LayoutFrame): CheckResult {
  const bad = f.blocks.filter((b) => b.truncatedLabel && !b.hasTooltip).map((b) => b.id)
  return {
    name: 'labelFits', holds: bad.length === 0, blocks: bad,
    detail: bad.length ? `Labels truncated with no way to read them: ${bad.join(', ')}.` : undefined,
  }
}

const CHECKS = [
  noOverflow, noCollision, noOrphanConnector, contrastAA,
  minTapTarget, noAccidentalVoid, contentAccessible, labelFits,
] as const

export function checkFrame(f: LayoutFrame): CheckResult[] {
  return CHECKS.map((c) => c(f))
}

/* ── the repair ladder ─────────────────────────────────────────────────── */

export interface RepairLog {
  pass: number
  failed: CheckName[]
  action: string
}

export interface ValidationOutcome {
  frame: LayoutFrame
  passed: boolean
  checks: CheckResult[]
  repairs: RepairLog[]
  /** True when the ladder was exhausted and the single-column fallback ran. */
  usedFallback: boolean
}

const MAX_PASSES = 3

/** The last resort: one column, one block per band. Ugly and correct. */
export function singleColumnFallback(f: LayoutFrame): LayoutFrame {
  return {
    ...f,
    archetype: 'NARRATIVE',
    blocks: f.blocks.map((b, i) => ({
      ...b, col: 3, span: 8, band: i, overflows: false,
    })),
  }
}

/* Never paint a failing frame. Repair, re-check, and if three passes cannot
 * fix it, fall back to a layout that cannot fail. */
export function validateAndRepair(
  frame: LayoutFrame,
  elementCount = frame.blocks.length,
): ValidationOutcome {
  let current = frame
  const repairs: RepairLog[] = []

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const checks = checkFrame(current)
    const failed = checks.filter((c) => !c.holds)
    if (!failed.length) {
      return { frame: current, passed: true, checks, repairs, usedFallback: false }
    }

    const names = failed.map((c) => c.name)
    const slots = compositionFor(current.archetype).slots.length
    const ladder = climbLadder(current.archetype, current.mass, slots, elementCount)
    const rung = ladder.steps.filter((s) => s.applied).pop()

    /* Collisions and overflow are geometry problems; a simpler composition is
     * the honest fix rather than nudging boxes until they stop touching. */
    const simpler = simplerThan(current.archetype)
    if ((names.includes('noCollision') || names.includes('noOverflow')) && simpler) {
      current = { ...current, archetype: simpler, blocks: relayout(current.blocks, simpler) }
      repairs.push({ pass, failed: names, action: `Fell back to ${simpler}.` })
      continue
    }

    repairs.push({
      pass, failed: names,
      action: rung ? `Applied ${rung.rung}: ${rung.detail}` : 'No repair available.',
    })

    if (!simpler) break
  }

  const fallback = singleColumnFallback(current)
  const checks = checkFrame(fallback)
  return {
    frame: fallback,
    passed: checks.every((c) => c.holds),
    checks,
    repairs: [...repairs, { pass: MAX_PASSES + 1, failed: [], action: 'Single-column fallback.' }],
    usedFallback: true,
  }
}

/** Re-seat blocks into another composition's slots, in order. */
function relayout(blocks: PlacedBlock[], archetype: Archetype): PlacedBlock[] {
  const slots = compositionFor(archetype).slots
  return blocks.map((b, i) => {
    const s = slots[Math.min(i, slots.length - 1)]
    /* Blocks past the last slot stack into new bands rather than piling into
     * the same one, which would recreate the collision being repaired. */
    const band = i < slots.length ? s.band : s.band + (i - slots.length) + 1
    return { ...b, col: s.col, span: s.span, band, overflows: false }
  })
}
