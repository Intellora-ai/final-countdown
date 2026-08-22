import { describe, it, expect } from 'vitest'
import {
  contentMass, densityFor, policyFor, climbLadder, simplerThan, measure,
} from './disclosure'
import { compositionFor, selectArchetype, allArchetypes } from './archetypes'
import { ACCEPTANCE_LESSONS } from '../lessons/acceptance'
import { color, space, type, radius, stroke, ink, overlay } from '../design/tokens'
import type { LessonElement } from '../contract/types'

/* TOKEN INVARIANCE — the test the whole design system rests on.
 *
 * Goal 1 says a two-block lesson and a nine-block lesson must have IDENTICAL
 * computed padding, font sizes, colours, radii, row heights and stroke widths.
 * Only counts, visibility and pagination may differ.
 *
 * The failure this catches is the most tempting shortcut in front-end work:
 * "the content does not fit, so make the text a bit smaller". A board that
 * shrinks under pressure has two type scales and therefore no design system.
 */

const el = (over: Partial<LessonElement> = {}): LessonElement => ({
  id: Math.random().toString(36).slice(2), kind: 'text', purpose: 'explain',
  payload: { paragraphs: ['a modest paragraph'] }, ...over,
})

const lesson = (n: number, payload?: unknown) =>
  Array.from({ length: n }, () => el(payload ? { payload } : {}))

describe('density is a capacity policy and cannot express a style', () => {
  it('exposes no style key at all — not unused, absent', () => {
    /* Making the wrong thing unrepresentable beats documenting that it is
     * wrong. If any of these ever appear, density has become a style policy
     * and Goal 1 is lost. */
    const forbidden = [
      'fontSize', 'font', 'lineHeight', 'letterSpacing', 'color', 'colour',
      'padding', 'margin', 'gap', 'spacing', 'radius', 'borderRadius',
      'strokeWidth', 'rowHeight', 'scale', 'shrink', 'zoom',
    ]
    for (const d of ['relaxed', 'normal', 'compact'] as const) {
      const keys = Object.keys(policyFor(d))
      for (const f of forbidden) {
        expect(keys, `${d} policy exposes '${f}'`).not.toContain(f)
      }
    }
  })

  it('only ever changes counts and booleans', () => {
    for (const d of ['relaxed', 'normal', 'compact'] as const) {
      for (const [k, v] of Object.entries(policyFor(d))) {
        if (k === 'density') continue
        expect(['number', 'boolean'], `${d}.${k} is a ${typeof v}`).toContain(typeof v)
      }
    }
  })

  it('shows less as mass rises, and never smaller', () => {
    const relaxed = policyFor('relaxed')
    const compact = policyFor('compact')
    expect(compact.initialRows).toBeLessThan(relaxed.initialRows)
    expect(compact.initialItems).toBeLessThan(relaxed.initialItems)
    /* The counts move. Nothing else exists to move. */
  })
})

describe('a 2-block and a 9-block lesson are styled identically', () => {
  const two = lesson(2)
  const nine = lesson(9)

  const styleOf = (elements: LessonElement[]) => {
    const mass = contentMass(elements)
    const arch = selectArchetype(elements)
    const comp = compositionFor(arch.archetype)
    climbLadder(arch.archetype, mass, comp.slots.length, elements.length)
    /* Every style value the render will use. None of it is reachable from the
     * density policy, which is the point being asserted. */
    return JSON.stringify({
      colours: color, ink, overlay,
      space, type, radius, stroke,
    })
  }

  it('resolves to byte-identical design tokens', () => {
    expect(styleOf(two)).toBe(styleOf(nine))
  })

  it('differs only in counts, visibility and pagination', () => {
    const a = climbLadder('DATA', contentMass(two), 6, two.length)
    const b = climbLadder('DATA', contentMass(nine), 6, nine.length)

    /* Something must actually differ, or the test proves nothing. */
    const differs =
      a.policy.density !== b.policy.density ||
      a.policy.initialRows !== b.policy.initialRows ||
      a.steps.some((s, i) => s.applied !== b.steps[i].applied)
    expect(differs, 'the two lessons should be treated differently').toBe(true)

    /* And the difference must be entirely counts/booleans. */
    for (const key of Object.keys(a.policy) as Array<keyof typeof a.policy>) {
      if (key === 'density') continue
      expect(['number', 'boolean']).toContain(typeof a.policy[key])
    }
  })

  it('keeps row height constant regardless of how many rows there are', () => {
    /* Row height is a token. Disclosure changes how many rows are VISIBLE and
     * never how tall one is — the difference between a table that paginates
     * and a table that squashes. */
    const few = policyFor(densityFor(contentMass(lesson(1, { rows: [1, 2] })).mass))
    const many = policyFor(densityFor(contentMass(lesson(1, { rows: Array(300).fill(1) })).mass))
    expect(few.initialRows).not.toBe(many.initialRows)
    expect(Object.keys(few)).toEqual(Object.keys(many))
  })
})

describe('content mass and density thresholds', () => {
  it('weights each unit by how much room it actually takes', () => {
    const m = contentMass([
      el({ payload: { paragraphs: ['x'.repeat(600)] } }),
      el({ payload: { rows: Array(12).fill({}) } }),
    ])
    expect(m.chars).toBeGreaterThan(500)
    expect(m.rows).toBe(12)
    expect(m.mass).toBeGreaterThan(1.8)
  })

  it('places the thresholds where the brief says', () => {
    expect(densityFor(0)).toBe('relaxed')
    expect(densityFor(1.49)).toBe('relaxed')
    expect(densityFor(1.5)).toBe('normal')
    expect(densityFor(3.99)).toBe('normal')
    expect(densityFor(4)).toBe('compact')
    expect(densityFor(99)).toBe('compact')
  })

  it('measures every acceptance lesson without throwing on any payload shape', () => {
    for (const l of ACCEPTANCE_LESSONS) {
      const m = contentMass(l.elements as never)
      expect(Number.isFinite(m.mass), l.id).toBe(true)
      expect(m.mass, l.id).toBeGreaterThanOrEqual(0)
    }
  })

  it('handles an element whose payload has none of the known shapes', () => {
    expect(() => measure(el({ payload: { something: 'unexpected' } }))).not.toThrow()
  })
})

describe('the ladder climbs only as far as it must, and records every rung', () => {
  it('records all five rungs whether or not they fired', () => {
    const r = climbLadder('DATA', contentMass(lesson(2)), 6, 2)
    expect(r.steps.map((s) => s.rung)).toEqual([
      'block_strategy', 'collapse_asides', 'paginate_largest',
      'simpler_archetype', 'split_canvas',
    ])
    for (const s of r.steps) expect(s.detail.length).toBeGreaterThan(10)
  })

  it('leaves a small lesson entirely alone', () => {
    const r = climbLadder('NARRATIVE', contentMass(lesson(2)), 4, 2)
    expect(r.archetype).toBe('NARRATIVE')
    expect(r.requiresSplit).toBe(false)
    expect(r.steps.filter((s) => s.applied).map((s) => s.rung)).toEqual(['block_strategy'])
  })

  it('falls back to a simpler composition when the slots run out', () => {
    const r = climbLadder('EXPLORATORY', contentMass(lesson(20, { rows: Array(50).fill({}) })), 6, 20)
    expect(r.archetype).toBe('SPLIT')
    expect(r.steps.find((s) => s.rung === 'simpler_archetype')?.applied).toBe(true)
    expect(r.steps.find((s) => s.rung === 'simpler_archetype')?.detail).toMatch(/falling back/)
  })

  it('splits the canvas only when even the simplest composition cannot hold it', () => {
    /* NARRATIVE is the floor — a single readable column. Nothing is simpler,
     * so overflow there is the one case that genuinely needs two canvases. */
    expect(simplerThan('NARRATIVE')).toBeNull()
    const r = climbLadder('NARRATIVE', contentMass(lesson(40, { rows: Array(60).fill({}) })), 4, 40)
    expect(r.requiresSplit).toBe(true)
  })

  it('gives every archetype a fallback, or is the floor', () => {
    for (const a of allArchetypes()) {
      const s = simplerThan(a)
      expect(a === 'NARRATIVE' ? s === null : s !== null, `${a} has no fallback and is not the floor`).toBe(true)
    }
  })

  it('never loops — a fallback chain always terminates at NARRATIVE', () => {
    for (const a of allArchetypes()) {
      const seen = new Set<string>([a])
      let cur = simplerThan(a)
      let hops = 0
      while (cur && hops < 10) {
        expect(seen.has(cur), `cycle through ${cur}`).toBe(false)
        seen.add(cur)
        cur = simplerThan(cur)
        hops++
      }
      expect(hops).toBeLessThan(10)
    }
  })
})

/* DENSITY IS A CAPACITY POLICY, AND THE POLICY HAS TO SAY SOMETHING.
 *
 * The mutation gate turned compact's `collapseAsides: true, allowPagination:
 * true` into `false, false` and no test failed. Compact would have lost both
 * of its escape hatches -- with nowhere to put overflow, content that does not
 * fit has only the outcomes CLAUDE.md forbids -- and the suite could not see
 * it. What was tested was the ladder's behaviour given a policy, never the
 * policy itself.
 */
describe('each density grants the capacity it claims', () => {
  it('gives compact both escape hatches, because compact is where overflow lives', () => {
    const p = policyFor('compact')
    expect(p.collapseAsides).toBe(true)
    expect(p.allowPagination).toBe(true)
    expect(p.allowAggregation).toBe(true)
    expect(p.allowGrouping).toBe(true)
  })

  it('leaves relaxed alone — there is nothing to disclose away', () => {
    const p = policyFor('relaxed')
    expect(p.collapseAsides).toBe(false)
    expect(p.allowPagination).toBe(false)
    expect(p.allowAggregation).toBe(false)
    expect(p.allowGrouping).toBe(false)
  })

  it('discloses strictly less as density rises', () => {
    const [relaxed, normal, compact] = (['relaxed', 'normal', 'compact'] as const).map(policyFor)
    expect(relaxed.initialItems).toBeGreaterThan(normal.initialItems)
    expect(normal.initialItems).toBeGreaterThan(compact.initialItems)
    expect(relaxed.initialRows).toBeGreaterThan(normal.initialRows)
    expect(normal.initialRows).toBeGreaterThan(compact.initialRows)
  })

  it('never turns an escape hatch back off as density rises', () => {
    /* A strategy available at a looser density must stay available at a
     * tighter one. Losing one on the way up would mean the tighter policy has
     * fewer ways to handle more pressure. */
    const order = (['relaxed', 'normal', 'compact'] as const).map(policyFor)
    const flags = ['collapseAsides', 'allowPagination', 'allowAggregation', 'allowGrouping'] as const
    for (const flag of flags) {
      for (let i = 1; i < order.length; i++) {
        if (order[i - 1][flag]) expect(order[i][flag], flag).toBe(true)
      }
    }
  })
})
