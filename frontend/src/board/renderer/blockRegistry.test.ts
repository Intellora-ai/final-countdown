/* REGISTRY TESTS — DOM-free, updated for the lazy catalogue.
 *
 * The Phase 1B identity assertions (Component === ExplanationBlock) died with
 * the static imports, deliberately: importing a block component here would
 * defeat the code-splitting the registry now exists to provide. What replaces
 * them is stronger for the new invariant: every type has a DISTINCT lazy
 * component and a REAL loader that resolves to a component function — proven
 * by calling the loaders, which is exactly what the browser will do.
 */
import { describe, it, expect } from 'vitest'
import {
  ALL_BLOCK_TYPES,
  ALL_BLOCK_WIDTHS,
  IMPLEMENTED_BLOCK_TYPES,
} from '../types/learningBoard'
import { entryMeta, isRenderableBlock, loaderFor, registeredTypes, resolve } from './blockRegistry'
import { UnknownBlock } from '../blocks/UnknownBlock'

describe('blockRegistry — resolution', () => {
  it('resolves all 16 implemented types to 16 distinct known lazy components', () => {
    const components = ALL_BLOCK_TYPES.map((t) => {
      const entry = resolve(t)
      expect(entry.known, t).toBe(true)
      return entry.Component
    })
    expect(new Set(components).size).toBe(ALL_BLOCK_TYPES.length)
  })

  it('returns a STABLE lazy component per type — no remount-on-rerender', () => {
    expect(resolve('table').Component).toBe(resolve('table').Component)
  })

  it('every loader actually resolves to a component function', async () => {
    for (const t of ALL_BLOCK_TYPES) {
      const load = loaderFor(t)
      expect(load, t).not.toBeNull()
      const mod = await load!()
      expect(typeof mod.default, t).toBe('function')
    }
  })

  it('loaders are distinct modules — no two types share an implementation', async () => {
    const impls = await Promise.all(ALL_BLOCK_TYPES.map((t) => loaderFor(t)!().then((m) => m.default)))
    expect(new Set(impls).size).toBe(ALL_BLOCK_TYPES.length)
  })

  it('carries the presentation decisions the JSON is not allowed to make', () => {
    expect(entryMeta('explanation')).toEqual({ treatment: 'bare', defaultWidth: 'wide', layout: 'flow' })
    expect(entryMeta('table')).toEqual({ treatment: 'glass', defaultWidth: 'full', layout: 'grid' })
    expect(entryMeta('callout')).toEqual({ treatment: 'glass', defaultWidth: 'medium', layout: 'grid' })
    expect(entryMeta('simulation')).toEqual({ treatment: 'glass', defaultWidth: 'full', layout: 'spatial' })
  })

  it('returns eager UnknownBlock, flagged unknown, for types this build cannot draw', () => {
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

  it('gives every registered type a valid treatment, default width and layout', () => {
    for (const key of registeredTypes()) {
      const meta = entryMeta(key)!
      expect(['bare', 'glass']).toContain(meta.treatment)
      expect(ALL_BLOCK_WIDTHS).toContain(meta.defaultWidth)
      expect(['flow', 'grid', 'spatial']).toContain(meta.layout)
    }
  })

  it("confines 'spatial' to exactly diagram and simulation — the invariant as data", () => {
    const spatial = registeredTypes().filter((t) => entryMeta(t)!.layout === 'spatial').sort()
    expect(spatial).toEqual(['diagram', 'simulation'])
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
