import { useMemo, useSyncExternalStore } from 'react'
import { resolveModel } from './resolve'
import type { BoardModel, ResolvedModel, Scope } from './types'

/* THE LIVE MODEL — one store per scene, read by every panel that shows a number.
 *
 * WHY A STORE AND NOT useState IN A PANEL. The whole point of the scene is
 * that moving the thermometer changes the cube, the gauge, the graph marker,
 * the equation's highlighted term and the prose, at the same instant. State
 * owned by any one panel cannot do that. This holds the source variables; the
 * derived values are recomputed from them on every read, never stored, so two
 * panels can never disagree about what the pressure is.
 *
 * useSyncExternalStore rather than a context + useState: panels subscribe
 * individually, so dragging the thermometer re-renders the four panels that
 * read T and nothing else on the board.
 */
export interface ModelStore {
  getResolved: () => ResolvedModel
  set: (id: string, value: number) => void
  subscribe: (fn: () => void) => () => void
}

export function createModelStore(model: BoardModel): ModelStore {
  const overrides: Scope = {}
  for (const v of model.vars) overrides[v.id] = v.value

  let snapshot = resolveModel(model, overrides)
  const listeners = new Set<() => void>()

  return {
    getResolved: () => snapshot,
    set(id, value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return
      if (overrides[id] === value) return
      overrides[id] = value
      /* Recompute once, here — not per subscriber. A hundred readers of the
       * same derived value cost one evaluation, not a hundred. */
      snapshot = resolveModel(model, overrides)
      listeners.forEach((fn) => fn())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}

/** Subscribe to the whole resolved model. */
export function useResolved(store: ModelStore): ResolvedModel {
  return useSyncExternalStore(store.subscribe, store.getResolved, store.getResolved)
}

/** Subscribe to one value. Re-renders only when THAT number changes. */
export function useValue(store: ModelStore, id: string): number | undefined {
  const get = useMemo(() => () => store.getResolved().scope[id], [store, id])
  return useSyncExternalStore(store.subscribe, get, get)
}
