import { describe, expect, it } from 'vitest'

import { curvePath } from '../../design/primitives'
import {
  buildIntervals,
  criticalPath,
  layoutIntervals,
  niceTicks,
} from './IntervalsShape'
import type { IntervalsData } from '../../spec/shapeInvariants'

/**
 * Intervals are tested through the layout, because this renderer draws its own
 * axis and its own arrows: there is no library underneath to blame for a tick
 * that is not evenly spaced or an arrow that does not exist.
 */

const VARIANTS: IntervalsData['variant'][] = ['gantt', 'timeline']

/** A schedule with a genuine critical path: 0→10→18→30 is longer than 0→10→14. */
function schedule(variant: IntervalsData['variant']): IntervalsData {
  return {
    variant,
    items: [
      { id: 'design', label: 'Design', start: 0, end: 10 },
      { id: 'build', label: 'Build', start: 10, end: 18, dependsOn: ['design'] },
      { id: 'docs', label: 'Docs', start: 10, end: 14, dependsOn: ['design'] },
      { id: 'ship', label: 'Ship', start: 18, end: 30, dependsOn: ['build', 'docs'] },
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Every listed variant builds                                             */
/* -------------------------------------------------------------------------- */

describe('every intervals variant builds', () => {
  it.each(VARIANTS)('%s builds without throwing', (variant) => {
    const built = buildIntervals(schedule(variant))
    expect(built.ok).toBe(true)
  })

  it('emits only finite coordinates', () => {
    for (const variant of VARIANTS) {
      const layout = layoutIntervals(schedule(variant))
      for (const bar of layout.bars)
        for (const n of [bar.x0, bar.x1, bar.y, bar.height]) expect(Number.isFinite(n)).toBe(true)
      for (const tick of layout.ticks) expect(Number.isFinite(tick.x)).toBe(true)
      for (const arrow of layout.arrows) {
        const numbers = [...arrow.d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
        for (const n of numbers) expect(Number.isFinite(n)).toBe(true)
      }
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
    }
  })

  it('is deterministic: the same items lay out identically', () => {
    for (const variant of VARIANTS) {
      expect(JSON.stringify(layoutIntervals(schedule(variant)))).toBe(
        JSON.stringify(layoutIntervals(schedule(variant))),
      )
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. THE TRAP: an axis of its own making                                     */
/* -------------------------------------------------------------------------- */

describe('the time axis is evenly spaced by construction', () => {
  it('produces monotonic, evenly spaced ticks', () => {
    for (const [lo, hi] of [
      [0, 30],
      [3.7, 91.2],
      [-40, 40],
      [1000, 1007],
      [0.001, 0.009],
    ] as [number, number][]) {
      const scale = niceTicks(lo, hi)
      expect(scale.values.length).toBeGreaterThan(1)

      const gaps = scale.values.slice(1).map((v, i) => v - (scale.values[i] ?? 0))
      const first = gaps[0] ?? 0
      for (const gap of gaps) expect(gap).toBeCloseTo(first, 9)
      for (const gap of gaps) expect(gap).toBeGreaterThan(0)
    }
  })

  it('uses a step of 1, 2 or 5 times a power of ten', () => {
    for (const [lo, hi] of [
      [0, 30],
      [0, 7],
      [0, 470],
    ] as [number, number][]) {
      const { step } = niceTicks(lo, hi)
      const mantissa = step / 10 ** Math.floor(Math.log10(step))
      expect([1, 2, 5]).toContain(Math.round(mantissa))
    }
  })

  it('covers the data at both ends rather than clipping a bar', () => {
    const scale = niceTicks(3.7, 91.2)
    expect(scale.lo).toBeLessThanOrEqual(3.7)
    expect(scale.hi).toBeGreaterThanOrEqual(91.2)
  })

  it('survives a zero-width domain instead of dividing by it', () => {
    const scale = niceTicks(5, 5)
    expect(scale.values.every((v) => Number.isFinite(v))).toBe(true)
    const layout = layoutIntervals({
      variant: 'timeline',
      items: [{ id: 'a', label: 'A', start: 5, end: 5 }],
    })
    for (const bar of layout.bars) expect(Number.isFinite(bar.x0)).toBe(true)
  })

  it('places bars in proportion to their values on that axis', () => {
    const layout = layoutIntervals(schedule('gantt'))
    const design = layout.bars.find((b) => b.id === 'design')
    const ship = layout.bars.find((b) => b.id === 'ship')
    /* Design runs 0–10 and Ship 18–30: twelve units must be wider than ten. */
    expect((ship?.x1 ?? 0) - (ship?.x0 ?? 0)).toBeGreaterThan((design?.x1 ?? 0) - (design?.x0 ?? 0))
    /* Two decimal places is where the layout rounds, which is below one device
       pixel at every size this canvas draws at. */
    expect((ship?.x1 ?? 0) - (ship?.x0 ?? 0)).toBeCloseTo(
      (((design?.x1 ?? 0) - (design?.x0 ?? 0)) * 12) / 10,
      2,
    )
  })
})

/* -------------------------------------------------------------------------- */
/* 3. THE TRAP: no arrows means it is not a schedule                          */
/* -------------------------------------------------------------------------- */

describe('dependencies are drawn', () => {
  it('emits one arrow per declared dependency', () => {
    const layout = layoutIntervals(schedule('gantt'))
    expect(layout.arrows).toHaveLength(4)
    expect(layout.arrows.map((a) => `${a.from}>${a.to}`)).toEqual([
      'design>build',
      'design>docs',
      'build>ship',
      'docs>ship',
    ])
  })

  it('starts each arrow at the source’s end and lands it on the dependent’s start', () => {
    const layout = layoutIntervals(schedule('gantt'))
    const byId = new Map(layout.bars.map((bar) => [bar.id, bar]))
    for (const arrow of layout.arrows) {
      const from = byId.get(arrow.from)
      const to = byId.get(arrow.to)
      const points = [...arrow.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ])
      const head = points[0] ?? [0, 0]
      const tail = points[points.length - 1] ?? [0, 0]

      /* `curvePath` rounds to two decimals, so the comparison does too. */
      expect(head[0]).toBeCloseTo(from?.x1 ?? 0, 1)
      expect(head[1]).toBeCloseTo((from?.y ?? 0) + (from?.height ?? 0) / 2, 1)
      expect(tail[0]).toBeCloseTo(to?.x0 ?? 0, 1)
      expect(tail[1]).toBeCloseTo((to?.y ?? 0) + (to?.height ?? 0) / 2, 1)
    }
  })

  it('says out loud when a gantt has no dependencies at all', () => {
    const built = buildIntervals({
      variant: 'gantt',
      items: [
        { id: 'a', label: 'A', start: 0, end: 5 },
        { id: 'b', label: 'B', start: 5, end: 9 },
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('bar chart of dates'))).toBe(true)
    expect(built.caption).toContain('no critical path')
  })

  it('marks a dependency the schedule cannot honour, and still draws it', () => {
    const impossible: IntervalsData = {
      variant: 'gantt',
      items: [
        { id: 'a', label: 'A', start: 0, end: 10 },
        { id: 'b', label: 'B', start: 4, end: 12, dependsOn: ['a'] },
      ],
    }
    const built = buildIntervals(impossible)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('starts before'))).toBe(true)
    expect(built.layout.arrows[0]?.impossible).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. A same-row arrow is flat, and that is a rendering hazard                 */
/* -------------------------------------------------------------------------- */

describe('flat connectors must never be filtered', () => {
  /*
   * REGRESSION GUARD, inherited from the flow renderer where this shipped.
   * A connector between two points on the same y has a zero-height bounding
   * box. `lc-bloom`'s region is in PERCENTAGES of that box, so 500% of zero is
   * zero: the path, its stroke and its arrowhead all paint nothing while every
   * attribute reads correct. This pins the precondition; the renderer glows
   * with a second wide stroke instead.
   */
  it('flags an arrow whose ends share a row', () => {
    /* Two items in one lane on the same row is impossible here — every item
       gets its own row — so `flat` is proved directly on the path geometry. */
    const d = curvePath({ x: 200, y: 14 }, { x: 320, y: 14 })
    const ys = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(new Set(ys).size).toBe(1)
  })

  it('reports `flat` on every arrow, so the hazard stays in the data', () => {
    const layout = layoutIntervals(schedule('gantt'))
    for (const arrow of layout.arrows) expect(typeof arrow.flat).toBe('boolean')
    /* Every item has its own row here, so no arrow is flat. */
    expect(layout.arrows.every((a) => !a.flat)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 5. The critical path                                                       */
/* -------------------------------------------------------------------------- */

describe('the critical path is the longest chain of durations', () => {
  it('finds the chain a day lost is lost from', () => {
    /* design 10 → build 8 → ship 12 = 30, against design 10 → docs 4 → ship 12
       = 26. Build is on the path; docs is not. */
    expect(criticalPath(schedule('gantt').items)).toEqual(['design', 'build', 'ship'])
  })

  it('measures by duration, not by hop count', () => {
    const items: IntervalsData['items'] = [
      { id: 'start', label: 'Start', start: 0, end: 1 },
      { id: 'long', label: 'Long', start: 1, end: 21, dependsOn: ['start'] },
      { id: 'a', label: 'A', start: 1, end: 3, dependsOn: ['start'] },
      { id: 'b', label: 'B', start: 3, end: 5, dependsOn: ['a'] },
      { id: 'c', label: 'C', start: 5, end: 7, dependsOn: ['b'] },
      { id: 'end', label: 'End', start: 21, end: 22, dependsOn: ['long', 'c'] },
    ]
    /* Three two-day hops do not delay a project the way one twenty-day task
       does, however many arrows they draw. */
    expect(criticalPath(items)).toEqual(['start', 'long', 'end'])
  })

  it('returns nothing when nothing depends on anything', () => {
    expect(
      criticalPath([
        { id: 'a', label: 'A', start: 0, end: 5 },
        { id: 'b', label: 'B', start: 6, end: 9 },
      ]),
    ).toEqual([])
  })

  it('marks the bars and the connecting arrows, and only those', () => {
    const layout = layoutIntervals(schedule('gantt'))
    const critical = layout.bars.filter((b) => b.critical).map((b) => b.id)
    expect(critical).toEqual(['design', 'build', 'ship'])

    const markedArrows = layout.arrows.filter((a) => a.critical).map((a) => `${a.from}>${a.to}`)
    expect(markedArrows).toEqual(['design>build', 'build>ship'])
  })

  it('is stable: the same items give the same path every time', () => {
    const first = criticalPath(schedule('gantt').items)
    expect(criticalPath(schedule('gantt').items)).toEqual(first)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Refusals                                                                */
/* -------------------------------------------------------------------------- */

describe('a reject-level violation produces a refusal, not a chart', () => {
  it('refuses an item that ends before it starts', () => {
    const built = buildIntervals({
      variant: 'timeline',
      items: [{ id: 'a', label: 'A', start: 9, end: 3 }],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems[0]?.message).toContain('ends before it starts')
  })

  it('refuses a dependency on an item that does not exist', () => {
    const built = buildIntervals({
      variant: 'gantt',
      items: [{ id: 'a', label: 'A', start: 0, end: 1, dependsOn: ['ghost'] }],
    })
    expect(built.ok).toBe(false)
  })

  it('refuses dependencies that cycle', () => {
    const built = buildIntervals({
      variant: 'gantt',
      items: [
        { id: 'a', label: 'A', start: 0, end: 1, dependsOn: ['b'] },
        { id: 'b', label: 'B', start: 1, end: 2, dependsOn: ['a'] },
      ],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('cycle'))).toBe(true)
  })

  it('refuses a non-finite date', () => {
    expect(
      buildIntervals({
        variant: 'timeline',
        items: [{ id: 'a', label: 'A', start: 0, end: Number.NaN }],
      }).ok,
    ).toBe(false)
  })

  it('names the path of every problem', () => {
    const built = buildIntervals(
      { variant: 'timeline', items: [{ id: 'a', label: 'A', start: 9, end: 3 }] },
      'block[7].data',
    )
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.every((p) => p.path.startsWith('block[7].data'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Lanes and zero-length items                                             */
/* -------------------------------------------------------------------------- */

describe('lanes and milestones', () => {
  it('bands the rows by lane, in the author’s order', () => {
    const layout = layoutIntervals({
      variant: 'gantt',
      items: [
        { id: 'a', label: 'A', start: 0, end: 2, lane: 'Backend' },
        { id: 'b', label: 'B', start: 0, end: 2, lane: 'Design' },
        { id: 'c', label: 'C', start: 2, end: 4, lane: 'Backend' },
      ],
    })
    expect(layout.lanes.map((l) => l.name)).toEqual(['Backend', 'Design'])
    /* Rows are grouped by lane, so the two Backend items sit together. */
    expect(layout.bars.map((b) => b.id)).toEqual(['a', 'c', 'b'])
    expect(layout.bars.map((b) => b.lane)).toEqual(['Backend', 'Backend', 'Design'])
  })

  it('gives every bar its own row, so none is drawn on top of another', () => {
    const layout = layoutIntervals(schedule('gantt'))
    const ys = layout.bars.map((b) => b.y)
    expect(new Set(ys).size).toBe(ys.length)
  })

  it('draws a zero-length item as a point, because a zero-width bar is nothing', () => {
    const built = buildIntervals({
      variant: 'timeline',
      items: [
        { id: 'launch', label: 'Launch', start: 12, end: 12 },
        { id: 'run', label: 'Run', start: 0, end: 12 },
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.layout.bars.find((b) => b.id === 'launch')?.milestone).toBe(true)
    expect(built.layout.bars.find((b) => b.id === 'run')?.milestone).toBe(false)
    expect(built.caption).toContain('drawn as a point')
  })
})
