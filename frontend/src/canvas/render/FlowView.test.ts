import { describe, expect, it } from 'vitest'

import { curvePath } from '../design/primitives'
import { describe as describeChain, layoutChain, wrapLabel } from './FlowView'
import type { Block } from '../spec/spec'

type FlowBlock = Extract<Block, { kind: 'flow' }>

const chain = (count: number): FlowBlock => ({
  kind: 'flow',
  id: 'c',
  emphasis: 'primary',
  tone: 'neutral',
  role: 'support',
  depth: 'core',
  nodes: Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    label: `Step ${i}`,
    tone: 'neutral' as const,
  })),
  links: Array.from({ length: count - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
})

describe('layoutChain', () => {
  it('places a short chain on one row', () => {
    const out = layoutChain(chain(4))
    const ys = new Set(out.nodes.map((n) => n.cy))
    expect(ys.size).toBe(1)
    expect(out.links).toHaveLength(3)
  })

  it('wraps a long chain and marks the wrapping link', () => {
    const out = layoutChain(chain(8))
    const ys = new Set(out.nodes.map((n) => n.cy))
    expect(ys.size).toBeGreaterThan(1)

    /* Exactly one link crosses rows. It is flagged so the renderer can treat it
       differently — a wrapping link drawn like a same-row step would silently
       imply the last node of row one leads to the first of row two in the same
       left-to-right way, which is a different claim. */
    expect(out.links.filter((l) => l.wrap)).toHaveLength(1)
  })

  it('drops a link whose endpoint does not exist rather than throwing', () => {
    const broken = { ...chain(3), links: [{ from: 'n0', to: 'ghost' }] } as FlowBlock
    // The validator refuses this upstream; the renderer still must stay total.
    expect(() => layoutChain(broken)).not.toThrow()
    expect(layoutChain(broken).links).toHaveLength(0)
  })

  it('never emits a non-finite coordinate', () => {
    for (const count of [2, 5, 9, 12]) {
      const out = layoutChain(chain(count))
      for (const node of out.nodes) {
        expect(Number.isFinite(node.cx)).toBe(true)
        expect(Number.isFinite(node.cy)).toBe(true)
      }
    }
  })
})

describe('same-row connectors are flat, and that is a rendering hazard', () => {
  /*
   * REGRESSION GUARD — this shipped invisible.
   *
   * Two nodes on the same row produce a path with identical start and end y,
   * so its bounding box is `{ width: 64, height: 0 }`. An SVG filter whose
   * region is given in PERCENTAGES is relative to that bbox, so 500% of zero
   * is zero: the filter output had no area and the connector — plus its
   * arrowhead — painted nothing at all. Stroke, width and opacity were all
   * correct the whole time, which is what made it hard to see.
   *
   * The fix was to stop filtering connectors and glow them with a second wide
   * stroke instead. This test pins the PRECONDITION so the hazard cannot be
   * forgotten: as long as same-row links are flat, no percentage-region filter
   * may be applied to them.
   */
  it('produces a zero-height path for two points on the same y', () => {
    const d = curvePath({ x: 120, y: 27 }, { x: 184, y: 27 })
    const ys = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))

    expect(ys.length).toBeGreaterThan(0)
    expect(new Set(ys).size).toBe(1)
    expect(ys[0]).toBe(27)
  })

  it('produces a path with real height when the rows differ', () => {
    const d = curvePath({ x: 700, y: 27 }, { x: 60, y: 115 })
    const ys = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(new Set(ys).size).toBeGreaterThan(1)
  })
})

describe('wrapLabel', () => {
  it('keeps one or two words on a single line', () => {
    expect(wrapLabel('Pressure')).toEqual(['Pressure'])
    expect(wrapLabel('Pressure up')).toEqual(['Pressure up'])
  })

  it('splits longer labels into exactly two lines', () => {
    // Never three: a three-line node label is a sentence, not a step.
    expect(wrapLabel('More frequent wall collisions')).toHaveLength(2)
    expect(wrapLabel('One two three four five six seven')).toHaveLength(2)
  })
})

describe('describe', () => {
  it('states the chain in words for anyone who cannot see it', () => {
    const text = describeChain(chain(3))
    expect(text).toContain('Step 0 leads to Step 1')
    expect(text).toContain('Step 1 leads to Step 2')
  })
})
