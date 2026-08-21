import { describe, it, expect } from 'vitest'
import { layoutDiagram, NODE_W, NODE_H } from './diagramLayout'

describe('layoutDiagram', () => {
  it('honours explicit positions verbatim (relative order preserved)', () => {
    const r = layoutDiagram([
      { id: 'a', position: { col: 0, row: 0 } },
      { id: 'b', position: { col: 2, row: 0 } },
      { id: 'c', position: { col: 1, row: 1 } },
    ])
    expect(r.pos.b.x).toBeGreaterThan(r.pos.a.x)
    expect(r.pos.c.y).toBeGreaterThan(r.pos.a.y)
    expect(r.pos.c.x).toBeGreaterThan(r.pos.a.x)
    expect(r.pos.c.x).toBeLessThan(r.pos.b.x)
  })

  it('places every unpositioned node, grouped nodes sharing a row', () => {
    const r = layoutDiagram([
      { id: 's', group: 'states' }, { id: 'l', group: 'states' }, { id: 'g', group: 'states' },
      { id: 'heat' },
    ])
    expect(Object.keys(r.pos)).toHaveLength(4)
    expect(r.pos.s.y).toBe(r.pos.l.y)
    expect(r.pos.l.y).toBe(r.pos.g.y)
    expect(r.pos.heat.y).toBeGreaterThan(r.pos.s.y)
  })

  it('is deterministic: same input, identical output', () => {
    const nodes = [{ id: 'x', group: 'a' }, { id: 'y' }, { id: 'z', position: { col: 3, row: 2 } }]
    expect(layoutDiagram(nodes)).toEqual(layoutDiagram(nodes))
  })

  it('never overlaps an auto-placed node with an explicit one on the same row', () => {
    const r = layoutDiagram([
      { id: 'fixed', position: { col: 0, row: 0 } },
      /* Auto rows start BELOW the deepest explicit row, so the only way to
       * collide is the skip logic failing within a row. */
      { id: 'a1', group: 'g' }, { id: 'a2', group: 'g' },
    ])
    const seen = new Set(Object.values(r.pos).map((p) => `${p.x}/${p.y}`))
    expect(seen.size).toBe(3)
  })

  it('produces finite coordinates and positive bounds, including for empty input', () => {
    const r = layoutDiagram([{ id: 'only' }])
    expect(Number.isFinite(r.pos.only.x)).toBe(true)
    expect(r.width).toBeGreaterThanOrEqual(NODE_W)
    expect(r.height).toBeGreaterThanOrEqual(NODE_H)
    const empty = layoutDiagram([])
    expect(empty.width).toBeGreaterThan(0)
    expect(empty.height).toBeGreaterThan(0)
  })
})
