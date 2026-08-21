/* PHASE 1 TESTS — DOM-free, and honest about what that can prove.
 *
 * There is no jsdom in this project and Phase 1 adds no dependency, so nothing
 * here renders a component. These tests therefore make no claim about pixels.
 * What they do cover is the part of the architecture that is pure logic and
 * that everything else rests on: does a type resolve to the right component,
 * does an unrecognised type resolve to the fallback instead of undefined, and
 * do the registry and the declared list of implemented types agree.
 *
 * The last one matters more than it looks. `IMPLEMENTED_BLOCK_TYPES` is what
 * the rest of the codebase reads to know what this build can draw. If someone
 * adds a component to the registry and forgets the list, or trims the list and
 * leaves the component, every consumer of that list is quietly wrong. This is
 * the only place that disagreement can be caught.
 */

import { describe, it, expect } from 'vitest'
import {
  ALL_BLOCK_TYPES,
  ALL_BLOCK_WIDTHS,
  IMPLEMENTED_BLOCK_TYPES,
} from '../types/learningBoard'
import { isRenderableBlock, registeredTypes, resolve } from './blockRegistry'
import { ExplanationBlock } from '../blocks/ExplanationBlock'
import { TableBlock } from '../blocks/TableBlock'
import { CalloutBlock } from '../blocks/CalloutBlock'
import { UnknownBlock } from '../blocks/UnknownBlock'
import { CHANGE_OF_STATE_BOARD, CHANGE_OF_STATE_EYEBROW } from '../fixtures/change-of-state'

describe('blockRegistry — resolution', () => {
  it('maps each implemented type to its own component', () => {
    expect(resolve('explanation').Component).toBe(ExplanationBlock)
    expect(resolve('table').Component).toBe(TableBlock)
    expect(resolve('callout').Component).toBe(CalloutBlock)
  })

  it('carries the presentation decision the JSON is not allowed to make', () => {
    /* treatment and defaultWidth exist ONLY here. If these ever became fields
     * on a block, a generator could set them, and the frontend would no longer
     * own the visual design. */
    expect(resolve('explanation')).toMatchObject({ treatment: 'bare', defaultWidth: 'wide' })
    expect(resolve('table')).toMatchObject({ treatment: 'glass', defaultWidth: 'full' })
    expect(resolve('callout')).toMatchObject({ treatment: 'glass', defaultWidth: 'medium' })
  })

  it('returns UnknownBlock for a type it has never heard of, and says it is unknown', () => {
    const resolved = resolve('holographic_projection')
    expect(resolved.Component).toBe(UnknownBlock)
    expect(resolved.known).toBe(false)
  })

  it('returns the fallback rather than undefined for junk input', () => {
    /* A renderer that got `undefined` here would crash the whole board on one
     * malformed entry. Every one of these has to land on the fallback. */
    for (const junk of [undefined, null, 42, {}, [], '', '   ', true]) {
      const resolved = resolve(junk)
      expect(resolved.Component, `resolve(${JSON.stringify(junk)})`).toBe(UnknownBlock)
      expect(resolved.known).toBe(false)
    }
  })

  it('degrades every declared-but-unimplemented type to the fallback', () => {
    const pending = ALL_BLOCK_TYPES.filter(
      (t) => !(IMPLEMENTED_BLOCK_TYPES as readonly string[]).includes(t),
    )
    /* Guard against a vacuous pass: there really are future types declared. */
    expect(pending.length).toBeGreaterThan(0)
    for (const type of pending) {
      expect(resolve(type).known, `${type} should not be implemented yet`).toBe(false)
    }
  })
})

describe('blockRegistry — registry and declarations agree', () => {
  it('registers exactly the types IMPLEMENTED_BLOCK_TYPES declares', () => {
    expect(registeredTypes().sort()).toEqual([...IMPLEMENTED_BLOCK_TYPES].sort())
  })

  it('registers no key that is not a real block type', () => {
    for (const key of registeredTypes()) {
      expect(ALL_BLOCK_TYPES, `"${key}" is not in ALL_BLOCK_TYPES`).toContain(key)
    }
  })

  it('gives every registered type a valid treatment and a valid default width', () => {
    for (const key of registeredTypes()) {
      const entry = resolve(key)
      expect(['bare', 'glass']).toContain(entry.treatment)
      expect(ALL_BLOCK_WIDTHS).toContain(entry.defaultWidth)
    }
  })
})

describe('isRenderableBlock — routing, not validation', () => {
  it('accepts anything with a string type', () => {
    expect(isRenderableBlock({ type: 'explanation' })).toBe(true)
    /* Deliberately true: this guard decides whether a lookup is possible, not
     * whether the block is well-formed. Well-formedness is Phase 2's job, and
     * claiming it here would be a validator nobody wrote a test for. */
    expect(isRenderableBlock({ type: 'table' })).toBe(true)
  })

  it('rejects values that cannot be looked up at all', () => {
    for (const junk of [null, undefined, 42, 'explanation', [], {}, { type: 7 }]) {
      expect(isRenderableBlock(junk), JSON.stringify(junk)).toBe(false)
    }
  })
})

describe('the Phase 1 fixture', () => {
  it('uses only types this build can actually render', () => {
    for (const block of CHANGE_OF_STATE_BOARD.blocks) {
      expect(resolve(block.type).known, `${block.type} is not registered`).toBe(true)
    }
  })

  it('gives every block a unique id, so no two share a React key', () => {
    const ids = CHANGE_OF_STATE_BOARD.blocks.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
  })

  it('is labelled as a fixture and is never presented as learner data', () => {
    expect(CHANGE_OF_STATE_BOARD.metadata?.source).toBe('fixture')
  })

  it('points at curriculum ids that really exist', () => {
    /* The eyebrow is looked up rather than typed, so this fails loudly if the
     * chapter or concept is ever renamed. */
    expect(CHANGE_OF_STATE_BOARD.metadata?.chapterId).toBe('matter-in-our-surroundings')
    expect(CHANGE_OF_STATE_BOARD.metadata?.conceptId).toBe('change-of-state')
  })

  it('declares connectors as an empty list rather than omitting the field', () => {
    expect(CHANGE_OF_STATE_BOARD.connectors).toEqual([])
  })

  it('built its eyebrow from the curriculum, not from the fallback string', () => {
    /* The fallback would also read "CHEMISTRY · CHANGE OF STATE", so asserting
     * the string alone would pass even if the lookup silently failed. The
     * subtitle carries the concept's duration, which ONLY the real lookup can
     * produce -- so this pair proves the curriculum was actually read. */
    expect(CHANGE_OF_STATE_EYEBROW).toBe('CHEMISTRY · CHANGE OF STATE')
    expect(CHANGE_OF_STATE_BOARD.subtitle).toBe('Change of state · 25 min')
  })
})
