import { useSyncExternalStore } from 'react'

import { store } from '../data/store'

/**
 * The class the student picked at onboarding, as the practice map sees it.
 *
 * Read through `useSyncExternalStore` rather than a `useState` + effect pair:
 * the dashboard store is a hand-written class with its own subscribe, and
 * mirroring it into React state would let the map render one class behind on
 * the frame the student changes it in settings.
 */
export function useMapClass(): string | null {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.student()?.cls ?? null,
    () => null,
  )
}
