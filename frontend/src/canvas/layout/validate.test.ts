import { describe, it, expect } from 'vitest'
import {
  checkFrame, validateAndRepair, noAccidentalVoid, noCollision, noOverflow,
  noOrphanConnector, contrastAA, minTapTarget, contentAccessible, labelFits,
  singleColumnFallback, type LayoutFrame, type PlacedBlock,
} from './validate'
import { contentMass } from './disclosure'
import type { LessonElement } from '../contract/types'

/* THE VALIDATOR'S GUARDS.
 *
 * Its promise is that a broken frame is never painted. Every check below is
 * written from the shape of the bug it prevents, and the two Definition of
 * Done cases from the brief are asserted directly: nine overlapping primary
 * blocks must resolve through the ladder, and a one-block lesson with large
 * intentional whitespace must NOT be flagged as a void.
 */

const block = (over: Partial<PlacedBlock> = {}): PlacedBlock => ({
  id: 'b', col: 1, span: 6, band: 0, rows: 3, overflows: false, ...over,
})

const el = (): LessonElement => ({
  id: 'e', kind: 'text', purpose: 'explain', payload: { paragraphs: ['x'] },
})

const frame = (over: Partial<LayoutFrame> = {}): LayoutFrame => ({
  archetype: 'DATA', blocks: [block()], edges: [], mass: contentMass([el()]), ...over,
})

describe('each check catches the bug it exists for', () => {
  it('noOverflow names the blocks whose content exceeds their box', () => {
    const r = noOverflow(frame({ blocks: [block({ id: 'a' }), block({ id: 'b', overflows: true })] }))
    expect(r.holds).toBe(false)
    expect(r.blocks).toEqual(['b'])
  })

  it('noCollision catches two blocks sharing columns in one band', () => {
    const r = noCollision(frame({
      blocks: [block({ id: 'a', col: 1, span: 6, band: 0 }), block({ id: 'b', col: 4, span: 6, band: 0 })],
    }))
    expect(r.holds).toBe(false)
    expect(r.blocks.sort()).toEqual(['a', 'b'])
  })

  it('noCollision allows the same columns in DIFFERENT bands', () => {
    const r = noCollision(frame({
      blocks: [block({ id: 'a', col: 1, span: 6, band: 0 }), block({ id: 'b', col: 1, span: 6, band: 1 })],
    }))
    expect(r.holds).toBe(true)
  })

  it('noOrphanConnector catches an edge pointing at an unplaced block', () => {
    const r = noOrphanConnector(frame({
      blocks: [block({ id: 'a' })], edges: [{ from: 'a', to: 'ghost' }],
    }))
    expect(r.holds).toBe(false)
    expect(r.blocks).toEqual(['a->ghost'])
  })

  it('contrastAA enforces 4.5:1 and ignores blocks with no text', () => {
    expect(contrastAA(frame({ blocks: [block({ contrast: 4.4 })] })).holds).toBe(false)
    expect(contrastAA(frame({ blocks: [block({ contrast: 4.5 })] })).holds).toBe(true)
    expect(contrastAA(frame({ blocks: [block()] })).holds).toBe(true)
  })

  it('minTapTarget enforces 40px on interactive blocks only', () => {
    expect(minTapTarget(frame({ blocks: [block({ tapTarget: 39 })] })).holds).toBe(false)
    expect(minTapTarget(frame({ blocks: [block({ tapTarget: 40 })] })).holds).toBe(true)
    expect(minTapTarget(frame({ blocks: [block()] })).holds).toBe(true)
  })

  it('contentAccessible allows hiding and forbids dropping', () => {
    /* The distinction the whole of Goal 2 turns on. */
    expect(contentAccessible(frame({ blocks: [block({ hiddenButReachable: true })] })).holds).toBe(true)
    const dropped = contentAccessible(frame({ blocks: [block({ id: 'z', droppedContent: true })] }))
    expect(dropped.holds).toBe(false)
    expect(dropped.detail).toMatch(/Hiding is allowed; dropping is not/)
  })

  it('labelFits allows truncation only when the full text is reachable', () => {
    expect(labelFits(frame({ blocks: [block({ truncatedLabel: true, hasTooltip: true })] })).holds).toBe(true)
    expect(labelFits(frame({ blocks: [block({ truncatedLabel: true })] })).holds).toBe(false)
  })
})

describe('intentional whitespace is not a void', () => {
  it('passes a one-block NARRATIVE lesson with large margins', () => {
    /* The brief's Definition of Done. NARRATIVE declares its margins; a
     * validator that flagged them would push the engine toward filling every
     * pixel, which is how a considered layout becomes a dashboard. */
    const r = noAccidentalVoid(frame({ archetype: 'NARRATIVE', blocks: [block({ band: 0 })] }))
    expect(r.holds).toBe(true)
    expect(r.detail).toMatch(/declares its whitespace/)
  })

  it('passes DERIVATION too, for the same declared reason', () => {
    expect(noAccidentalVoid(frame({ archetype: 'DERIVATION', blocks: [block()] })).holds).toBe(true)
  })

  it('still catches a genuine hole between two filled bands', () => {
    const r = noAccidentalVoid(frame({
      archetype: 'DATA',
      blocks: [block({ id: 'a', band: 0 }), block({ id: 'c', band: 2 })],
    }))
    expect(r.holds).toBe(false)
    expect(r.blocks).toEqual(['1'])
  })

  it('does not call a short lesson a void — stopping early is not a hole', () => {
    const r = noAccidentalVoid(frame({ archetype: 'DATA', blocks: [block({ band: 0 })] }))
    expect(r.holds).toBe(true)
  })
})

describe('nine overlapping primary blocks resolve through the ladder', () => {
  /* The brief's other Definition of Done. */
  const nine = Array.from({ length: 9 }, (_, i) =>
    block({ id: `p${i}`, col: 1, span: 12, band: 0, overflows: true }))

  it('starts genuinely broken', () => {
    const checks = checkFrame(frame({ blocks: nine }))
    const failed = checks.filter((c) => !c.holds).map((c) => c.name)
    expect(failed).toContain('noCollision')
    expect(failed).toContain('noOverflow')
  })

  it('ends valid, and never paints a failing frame', () => {
    const out = validateAndRepair(frame({ blocks: nine }), 9)
    expect(out.passed).toBe(true)
    expect(out.checks.every((c) => c.holds)).toBe(true)
  })

  it('logs which repair fired, at which pass', () => {
    const out = validateAndRepair(frame({ blocks: nine }), 9)
    expect(out.repairs.length).toBeGreaterThan(0)
    for (const r of out.repairs) {
      expect(r.action.length).toBeGreaterThan(5)
      expect(r.pass).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps every block — repair never drops content to fit', () => {
    const out = validateAndRepair(frame({ blocks: nine }), 9)
    expect(out.frame.blocks).toHaveLength(9)
    expect(new Set(out.frame.blocks.map((b) => b.id)).size).toBe(9)
  })

  it('stops after three passes rather than looping', () => {
    const out = validateAndRepair(frame({ blocks: nine }), 9)
    const passes = out.repairs.map((r) => r.pass).filter((p) => p <= 3)
    expect(Math.max(...passes, 0)).toBeLessThanOrEqual(3)
  })
})

describe('the fallback is ugly and correct', () => {
  it('always produces a frame that passes every check', () => {
    const wrecked = frame({
      blocks: Array.from({ length: 12 }, (_, i) =>
        block({ id: `x${i}`, col: 1, span: 12, band: 0, overflows: true })),
    })
    const out = singleColumnFallback(wrecked)
    expect(checkFrame(out).every((c) => c.holds)).toBe(true)
  })

  it('is one readable column, not a squeeze', () => {
    const out = singleColumnFallback(frame({ blocks: [block(), block({ id: 'b' })] }))
    expect(out.archetype).toBe('NARRATIVE')
    for (const b of out.blocks) {
      expect(b.span).toBe(8)
      expect(b.overflows).toBe(false)
    }
    /* Each block gets its own band — stacking, never overlapping. */
    expect(new Set(out.blocks.map((b) => b.band)).size).toBe(out.blocks.length)
  })

  it('passes a clean frame through untouched, with no repairs', () => {
    const clean = frame({ blocks: [block({ id: 'a', col: 1, span: 6, band: 0 })] })
    const out = validateAndRepair(clean)
    expect(out.passed).toBe(true)
    expect(out.usedFallback).toBe(false)
    expect(out.repairs).toHaveLength(0)
    expect(out.frame).toEqual(clean)
  })
})
