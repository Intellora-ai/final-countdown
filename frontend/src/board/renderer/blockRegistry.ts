import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  IMPLEMENTED_BLOCK_TYPES,
  type BlockWidth,
  type ImplementedBlockType,
} from '../types/learningBoard'
import { UnknownBlock } from '../blocks/UnknownBlock'

/* THE REGISTRY — where a block type meets its component, and where every
 * visual decision about that type lives.
 *
 * NOW LAZY, AND FOR A MEASURED REASON. Statically imported, all sixteen block
 * bodies ride in the route's initial chunk — a learner opening a lesson that
 * is one explanation downloads the particle simulation. Each entry is a
 * dynamic import; a component's code arrives the first time a step actually
 * mounts that block type. The loading boundary ("future charts are not
 * loaded before their step") becomes a property of the bundler output, not a
 * promise.
 *
 * METADATA STAYS SYNCHRONOUS. treatment and defaultWidth are layout inputs —
 * the frame renders before the body code lands — so they live here as plain
 * data, still out of the JSON's reach, still per-type, still the boundary.
 *
 * UnknownBlock is the ONE eager component: the fallback path must not itself
 * be able to fail to load.
 */

export type BlockTreatment = 'bare' | 'glass'

interface Entry {
  load: () => Promise<{ default: ComponentType<{ block: any }> }>
  treatment: BlockTreatment
  defaultWidth: BlockWidth
}

const ENTRIES: Record<ImplementedBlockType, Entry> = {
  /* Prose is bare — text on the canvas itself. Panels are for surfaces. */
  explanation: { load: () => import('../blocks/ExplanationBlock').then((m) => ({ default: m.ExplanationBlock })), treatment: 'bare', defaultWidth: 'wide' },
  text:        { load: () => import('../blocks/TextBlock').then((m) => ({ default: m.TextBlock })),               treatment: 'bare', defaultWidth: 'wide' },
  process:     { load: () => import('../blocks/ProcessBlock').then((m) => ({ default: m.ProcessBlock })),         treatment: 'bare', defaultWidth: 'wide' },
  timeline:    { load: () => import('../blocks/TimelineBlock').then((m) => ({ default: m.TimelineBlock })),       treatment: 'bare', defaultWidth: 'wide' },
  table:       { load: () => import('../blocks/TableBlock').then((m) => ({ default: m.TableBlock })),             treatment: 'glass', defaultWidth: 'full' },
  callout:     { load: () => import('../blocks/CalloutBlock').then((m) => ({ default: m.CalloutBlock })),         treatment: 'glass', defaultWidth: 'medium' },
  pie_chart:   { load: () => import('../blocks/charts/PieChartBlock').then((m) => ({ default: m.PieChartBlock })), treatment: 'glass', defaultWidth: 'medium' },
  bar_chart:   { load: () => import('../blocks/charts/BarChartBlock').then((m) => ({ default: m.BarChartBlock })), treatment: 'glass', defaultWidth: 'medium' },
  line_chart:  { load: () => import('../blocks/charts/LineChartBlock').then((m) => ({ default: m.LineChartBlock })), treatment: 'glass', defaultWidth: 'wide' },
  equation:    { load: () => import('../blocks/EquationBlock').then((m) => ({ default: m.EquationBlock })),       treatment: 'glass', defaultWidth: 'medium' },
  comparison:  { load: () => import('../blocks/ComparisonBlock').then((m) => ({ default: m.ComparisonBlock })),   treatment: 'glass', defaultWidth: 'full' },
  diagram:     { load: () => import('../blocks/DiagramBlock').then((m) => ({ default: m.DiagramBlock })),         treatment: 'glass', defaultWidth: 'full' },
  example:     { load: () => import('../blocks/ExampleBlock').then((m) => ({ default: m.ExampleBlock })),         treatment: 'glass', defaultWidth: 'wide' },
  quiz:        { load: () => import('../blocks/QuizBlock').then((m) => ({ default: m.QuizBlock })),               treatment: 'glass', defaultWidth: 'wide' },
  image:       { load: () => import('../blocks/ImageBlock').then((m) => ({ default: m.ImageBlock })),             treatment: 'glass', defaultWidth: 'medium' },
  simulation:  { load: () => import('../blocks/SimulationBlock').then((m) => ({ default: m.SimulationBlock })),   treatment: 'glass', defaultWidth: 'full' },
}

/* One lazy wrapper per type, created once — recreating lazy() per render
 * would remount the block on every parent update. */
const LAZY: Partial<Record<ImplementedBlockType, LazyExoticComponent<ComponentType<{ block: any }>>>> = {}

function lazyFor(type: ImplementedBlockType): LazyExoticComponent<ComponentType<{ block: any }>> {
  return (LAZY[type] ??= lazy(ENTRIES[type].load))
}

export interface ResolvedEntry {
  Component: ComponentType<{ block: any }>
  treatment: BlockTreatment
  defaultWidth: BlockWidth
  /** false when the type had no entry and the fallback was returned. */
  known: boolean
}

const FALLBACK: ResolvedEntry = {
  Component: UnknownBlock,
  treatment: 'glass',
  defaultWidth: 'full',
  known: false,
}

export function registeredTypes(): string[] {
  return Object.keys(ENTRIES)
}

/** Metadata without touching the loader — for tests and layout math. */
export function entryMeta(type: string): { treatment: BlockTreatment; defaultWidth: BlockWidth } | null {
  const e = (ENTRIES as Record<string, Entry | undefined>)[type]
  return e ? { treatment: e.treatment, defaultWidth: e.defaultWidth } : null
}

/** The raw loader — the proof harness uses it to verify code-splitting. */
export function loaderFor(type: string): Entry['load'] | null {
  const e = (ENTRIES as Record<string, Entry | undefined>)[type]
  return e ? e.load : null
}

export function resolve(type: unknown): ResolvedEntry {
  if (typeof type !== 'string') return FALLBACK
  const e = (ENTRIES as Record<string, Entry | undefined>)[type]
  if (!e) return FALLBACK
  return {
    Component: lazyFor(type as ImplementedBlockType),
    treatment: e.treatment,
    defaultWidth: e.defaultWidth,
    known: true,
  }
}

/* ROUTING, NOT VALIDATION. Enough structure for a lookup — nothing more. */
export function isRenderableBlock(value: unknown): value is { type: string; id?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

export { IMPLEMENTED_BLOCK_TYPES }
