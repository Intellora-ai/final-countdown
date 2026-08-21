import type { ComponentType } from 'react'
import {
  IMPLEMENTED_BLOCK_TYPES,
  type Block,
  type BlockWidth,
  type ImplementedBlockType,
} from '../types/learningBoard'
import { ExplanationBlock } from '../blocks/ExplanationBlock'
import { TextBlock } from '../blocks/TextBlock'
import { TableBlock } from '../blocks/TableBlock'
import { CalloutBlock } from '../blocks/CalloutBlock'
import { PieChartBlock } from '../blocks/charts/PieChartBlock'
import { BarChartBlock } from '../blocks/charts/BarChartBlock'
import { LineChartBlock } from '../blocks/charts/LineChartBlock'
import { EquationBlock } from '../blocks/EquationBlock'
import { ProcessBlock } from '../blocks/ProcessBlock'
import { TimelineBlock } from '../blocks/TimelineBlock'
import { ComparisonBlock } from '../blocks/ComparisonBlock'
import { DiagramBlock } from '../blocks/DiagramBlock'
import { ExampleBlock } from '../blocks/ExampleBlock'
import { QuizBlock } from '../blocks/QuizBlock'
import { ImageBlock } from '../blocks/ImageBlock'
import { SimulationBlock } from '../blocks/SimulationBlock'
import { UnknownBlock } from '../blocks/UnknownBlock'

/* THE REGISTRY — where a block type meets its component, and where every
 * visual decision about that type lives.
 *
 * WHY `treatment` AND `defaultWidth` ARE HERE AND NOT IN THE JSON. This is the
 * whole boundary, expressed as a data structure. A generator chooses WHAT a
 * block is; the registry chooses what that kind of block LOOKS like. There is
 * no field in LearningBoard where a generator could set `treatment: 'glass'`,
 * because the decision was never its to make.
 *
 * WHY THERE IS NO SWITCH IN THE RENDERER. Sixteen block types, and adding a
 * seventeenth is one entry here plus one interface in the types file.
 * BoardRenderer does not change and cannot grow a special case for one type.
 */

/** How BoardBlock frames this kind of block. Chosen per type, never per board. */
export type BlockTreatment = 'bare' | 'glass'

interface Entry<T extends Block> {
  Component: ComponentType<{ block: T }>
  treatment: BlockTreatment
  defaultWidth: BlockWidth
}

/* Typed per block type at the definition site: a component that accepts the
 * wrong block shape is a compile error here, the only place it can be caught. */
type Registry = {
  [K in ImplementedBlockType]: Entry<Extract<Block, { type: K }>>
}

const REGISTRY: Registry = {
  /* Prose carries the argument, so it is bare — text on the canvas itself.
   * Wrapping it in a panel is what turns a board into a stack of cards. */
  explanation: { Component: ExplanationBlock, treatment: 'bare', defaultWidth: 'wide' },
  text:        { Component: TextBlock,        treatment: 'bare', defaultWidth: 'wide' },
  process:     { Component: ProcessBlock,     treatment: 'bare', defaultWidth: 'wide' },
  timeline:    { Component: TimelineBlock,    treatment: 'bare', defaultWidth: 'wide' },
  /* Surfaces with edges earn a panel. */
  table:       { Component: TableBlock,       treatment: 'glass', defaultWidth: 'full' },
  callout:     { Component: CalloutBlock,     treatment: 'glass', defaultWidth: 'medium' },
  pie_chart:   { Component: PieChartBlock,    treatment: 'glass', defaultWidth: 'medium' },
  bar_chart:   { Component: BarChartBlock,    treatment: 'glass', defaultWidth: 'medium' },
  line_chart:  { Component: LineChartBlock,   treatment: 'glass', defaultWidth: 'wide' },
  equation:    { Component: EquationBlock,    treatment: 'glass', defaultWidth: 'medium' },
  comparison:  { Component: ComparisonBlock,  treatment: 'glass', defaultWidth: 'full' },
  diagram:     { Component: DiagramBlock,     treatment: 'glass', defaultWidth: 'full' },
  example:     { Component: ExampleBlock,     treatment: 'glass', defaultWidth: 'wide' },
  quiz:        { Component: QuizBlock,        treatment: 'glass', defaultWidth: 'wide' },
  image:       { Component: ImageBlock,       treatment: 'glass', defaultWidth: 'medium' },
  simulation:  { Component: SimulationBlock,  treatment: 'glass', defaultWidth: 'full' },
}

/* THE ONE PLACE THE PER-TYPE TYPING IS ERASED. Every component above was
 * checked against its own block shape; a single call site then renders any of
 * them, and no honest type describes that without the caller narrowing —
 * which is the switch this design exists to avoid. The erasure is deliberate,
 * visible, and confined to this type and resolve(). */
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

/** The registry's keys — what this build can actually draw. */
export function registeredTypes(): string[] {
  return Object.keys(REGISTRY)
}

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

/* ROUTING, NOT VALIDATION. Enough structure for a lookup — nothing more.
 * Well-formedness is validateBoard()'s job. */
export function isRenderableBlock(value: unknown): value is { type: string; id?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

export { IMPLEMENTED_BLOCK_TYPES }
