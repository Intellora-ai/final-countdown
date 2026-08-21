import type { ComponentType } from 'react'
import {
  IMPLEMENTED_BLOCK_TYPES,
  type Block,
  type BlockWidth,
  type ImplementedBlockType,
} from '../types/learningBoard'
import { ExplanationBlock } from '../blocks/ExplanationBlock'
import { TableBlock } from '../blocks/TableBlock'
import { CalloutBlock } from '../blocks/CalloutBlock'
import { UnknownBlock } from '../blocks/UnknownBlock'

/* THE REGISTRY — where a block type meets its component, and where every
 * visual decision about that type lives.
 *
 * WHY `treatment` AND `defaultWidth` ARE HERE AND NOT IN THE JSON.
 *
 * This is the whole boundary, expressed as a data structure. A generator
 * chooses WHAT a block is; the registry chooses what that kind of block LOOKS
 * like. There is no field in LearningBoard where a generator could set
 * `treatment: 'glass'`, because the decision was never its to make. The AI
 * cannot make the board ugly, not because it is asked not to, but because the
 * knob is not exposed.
 *
 * `layout.width` is the one hint that does cross, and it crosses as a word —
 * 'wide', not '8 columns'. What a word is worth at a given size is decided in
 * board-theme.css.
 *
 * WHY THERE IS NO SWITCH IN THE RENDERER. Adding TimelineBlock later is one
 * entry here plus one interface in the types file. BoardRenderer does not
 * change, has never needed to know a block type by name, and cannot grow a
 * special case for one.
 */

/** How BoardBlock frames this kind of block. Chosen per type, never per board. */
export type BlockTreatment = 'bare' | 'glass'

interface Entry<T extends Block> {
  Component: ComponentType<{ block: T }>
  treatment: BlockTreatment
  defaultWidth: BlockWidth
}

/* Typed per block type at the definition site: a component that accepts the
 * wrong block shape is a compile error here, which is the only place it can be
 * caught. */
type Registry = {
  [K in ImplementedBlockType]: Entry<Extract<Block, { type: K }>>
}

const REGISTRY: Registry = {
  /* Prose carries the argument, so it is bare — a heading and readable text on
   * the canvas itself. Wrapping it in a panel is what turns a board into a
   * collection of cards. */
  explanation: { Component: ExplanationBlock, treatment: 'bare', defaultWidth: 'wide' },
  /* A table is a surface with edges; it earns a panel and its own scroll. */
  table: { Component: TableBlock, treatment: 'glass', defaultWidth: 'full' },
  /* Small, glass, one restrained accent. It sits beside the explanation rather
   * than under it, which is why it is 'medium' and not 'full'. */
  callout: { Component: CalloutBlock, treatment: 'glass', defaultWidth: 'medium' },
}

/* THE ONE PLACE THE PER-TYPE TYPING IS ERASED.
 *
 * Above, every component was checked against its own block shape: a component
 * that accepts the wrong shape is a compile error at its registry entry, which
 * is where the mistake would actually be made. A single call site then has to
 * render any of them, and no honest type describes "a component for whichever
 * of fourteen shapes this happens to be" without the caller narrowing first --
 * which is exactly the switch statement this design exists to avoid.
 *
 * So the erasure is deliberate, it is `any` rather than a chain of casts that
 * would hide it, and it is confined to this type and to resolve(). It does not
 * leak: BoardRenderer never sees a block-specific component type at all. */
export interface ResolvedEntry {
  Component: ComponentType<{ block: any }>
  treatment: BlockTreatment
  defaultWidth: BlockWidth
  /** false when the type had no component and the fallback was returned. */
  known: boolean
}

const FALLBACK: ResolvedEntry = {
  Component: UnknownBlock,
  treatment: 'glass',
  defaultWidth: 'full',
  known: false,
}

/** The registry's keys, for tests and for anything that needs to enumerate
 *  what this build can actually draw. */
export function registeredTypes(): string[] {
  return Object.keys(REGISTRY)
}

/* Erasure happens here, once. See the comment on ResolvedEntry. */
export function resolve(type: unknown): ResolvedEntry {
  if (typeof type !== 'string') return FALLBACK
  const entry = (REGISTRY as Record<string, Entry<Block> | undefined>)[type]
  if (!entry) return FALLBACK
  return {
    Component: entry.Component as ComponentType<any>,
    treatment: entry.treatment,
    defaultWidth: entry.defaultWidth,
    known: true,
  }
}

/* ROUTING, NOT VALIDATION. This answers exactly one question — is there enough
 * structure here to look a type up? Everything else (unknown keys, wrong field
 * types, out-of-range values, repair, notices) is Phase 2's validator, and
 * pretending otherwise here would produce a validator nobody wrote a test for. */
export function isRenderableBlock(value: unknown): value is Block {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/** Exported so the test can assert the registry and the declared list agree. */
export { IMPLEMENTED_BLOCK_TYPES }
