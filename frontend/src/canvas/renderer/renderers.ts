import type { ComponentType } from 'react'

/* THE MISSING HALF OF THE REGISTRY — root cause B.
 *
 * Every contract already ends with `renderer: 'TablePanel'`. That string was a
 * dangling reference: nothing anywhere mapped it to a component, so TablePanel
 * was 225 tested lines that no code path could reach. A contract could say what
 * should draw it and the engine had no way to obey.
 *
 * This is that map, and it is deliberately the ONLY place a lesson's data can
 * reach a React component. A contract names a key; this file decides what a key
 * means. Nothing else in the system may turn data into a component.
 *
 * WHY A KEY AND NOT THE COMPONENT ITSELF. Contracts are pure -- they validate,
 * measure and derive, and they are unit-tested with no DOM anywhere near them.
 * Importing React into a contract would drag a renderer into every one of those
 * tests and make the engine impossible to reason about without a browser. The
 * indirection costs one lookup and buys a layer boundary.
 *
 * AN UNKNOWN KEY IS NEVER EXECUTED. resolveRenderer returns a fallback rather
 * than throwing or rendering nothing: a lesson that names a component this
 * build does not have shows a visible placeholder saying so. Silently dropping
 * it would leave a hole the learner cannot see and nobody can debug.
 */

export type RendererKey =
  | 'TextPanel'
  | 'TablePanel'
  | 'ChartPanel'
  | 'EquationPanel'
  | 'DiagramPanel'

/** What every registered panel receives. Deliberately narrow: the derived
 *  state a contract computed, and nothing else. A panel cannot reach the
 *  lesson, the layout, or another panel. */
export interface PanelProps {
  /** The contract's normalize() output. */
  data: unknown
  /** The contract's derive() output — alignment, ticks, scales, marks. */
  derived: Record<string, unknown>
  /** The disclosure plan, when one applies. */
  disclosure?: {
    strategy: string
    initiallyVisible: number
    reachableVia: string
    notice?: string
  }
  title?: string
}

export interface RendererEntry {
  Component: ComponentType<PanelProps>
  /** false when the fallback was returned. */
  known: boolean
}

/* Lazy on purpose. A lesson that is three paragraphs must not download the
 * table renderer, and the 150 KB initial budget is measured, not hoped for. */
const REGISTRY: Record<RendererKey, () => Promise<{ default: ComponentType<PanelProps> }>> = {
  TextPanel: () => import('../panels/TextPanel').then((m) => ({ default: m.TextPanel })),
  TablePanel: () => import('../panels/TablePanelAdapter').then((m) => ({ default: m.TablePanelAdapter })),
  ChartPanel: () => import('../panels/ChartPanel').then((m) => ({ default: m.ChartPanel })),
  EquationPanel: () => import('../panels/EquationPanelAdapter').then((m) => ({ default: m.EquationPanelAdapter })),
  DiagramPanel: () => import('../panels/DiagramPanel').then((m) => ({ default: m.DiagramPanel })),
}

export function isRendererKey(value: unknown): value is RendererKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REGISTRY, value)
}

export function rendererKeys(): RendererKey[] {
  return Object.keys(REGISTRY) as RendererKey[]
}

/** The loader for a key, or null when the key is not registered. The renderer
 *  turns null into the visible fallback; this function does not decide policy. */
export function loaderFor(key: unknown): (() => Promise<{ default: ComponentType<PanelProps> }>) | null {
  return isRendererKey(key) ? REGISTRY[key] : null
}
