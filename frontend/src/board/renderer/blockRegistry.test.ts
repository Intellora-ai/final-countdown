/* PHASE 1B REGISTRY TESTS — DOM-free, and honest about what that can prove.
 *
 * Nothing here renders a component (no jsdom, no new dependency). What IS
 * covered is the pure logic everything rests on: sixteen types resolve to
 * sixteen distinct components, junk resolves to the fallback instead of
 * undefined, and the registry agrees with the catalogue it claims to
 * implement. The Phase 1 "declared-but-unimplemented" test is gone because
 * no such types remain — its job is now done by the junk-string cases.
 */
import { describe, it, expect } from 'vitest'
import {
  ALL_BLOCK_TYPES,
  ALL_BLOCK_WIDTHS,
  IMPLEMENTED_BLOCK_TYPES,
} from '../types/learningBoard'
import { isRenderableBlock, registeredTypes, resolve } from './blockRegistry'
import { UnknownBlock } from '../blocks/UnknownBlock'

describe('blockRegistry — resolution', () => {
  it('resolves all 16 implemented types to 16 distinct known components', () => {
    const components = ALL_BLOCK_TYPES.map((t) => {
      const entry = resolve(t)
      expect(entry.known, t).toBe(true)
      return entry.Component
    })
    expect(new Set(components).size).toBe(ALL_BLOCK_TYPES.length)
  })

  it('carries the presentation decisions the JSON is not allowed to make', () => {
    /* treatment and defaultWidth exist ONLY here. If they ever became block
     * fields, a generator could set them and the frontend would no longer own
     * the visual design. Spot-checked across both treatments: */
    expect(resolve('explanation')).toMatchObject({ treatment: 'bare', defaultWidth: 'wide' })
    expect(resolve('table')).toMatchObject({ treatment: 'glass', defaultWidth: 'full' })
    expect(resolve('callout')).toMatchObject({ treatment: 'glass', defaultWidth: 'medium' })
    expect(resolve('timeline')).toMatchObject({ treatment: 'bare' })
    expect(resolve('simulation')).toMatchObject({ treatment: 'glass', defaultWidth: 'full' })
  })

  it('returns UnknownBlock, flagged unknown, for types this build cannot draw', () => {
    for (const junk of ['holographic_projection', 'unknown', '', '   ']) {
      const entry = resolve(junk)
      expect(entry.Component, JSON.stringify(junk)).toBe(UnknownBlock)
      expect(entry.known).toBe(false)
    }
  })

  it('returns the fallback rather than undefined for non-string input', () => {
    for (const junk of [undefined, null, 42, {}, [], true]) {
      expect(resolve(junk).Component, JSON.stringify(junk)).toBe(UnknownBlock)
    }
  })
})

describe('blockRegistry — registry and catalogue agree', () => {
  it('registers exactly ALL_BLOCK_TYPES — no more, no fewer', () => {
    expect(registeredTypes().sort()).toEqual([...ALL_BLOCK_TYPES].sort())
    expect(registeredTypes().sort()).toEqual([...IMPLEMENTED_BLOCK_TYPES].sort())
  })

  it('gives every registered type a valid treatment and default width', () => {
    for (const key of registeredTypes()) {
      const entry = resolve(key)
      expect(['bare', 'glass']).toContain(entry.treatment)
      expect(ALL_BLOCK_WIDTHS).toContain(entry.defaultWidth)
    }
  })
})

describe('isRenderableBlock — routing, not validation', () => {
  it('accepts anything with a string type; validateBoard owns well-formedness', () => {
    expect(isRenderableBlock({ type: 'explanation' })).toBe(true)
    expect(isRenderableBlock({ type: 'unknown', id: 'u1', originalType: 'x' })).toBe(true)
  })

  it('rejects values that cannot be looked up at all', () => {
    for (const junk of [null, undefined, 42, 'explanation', [], {}, { type: 7 }]) {
      expect(isRenderableBlock(junk), JSON.stringify(junk)).toBe(false)
    }
  })
})
