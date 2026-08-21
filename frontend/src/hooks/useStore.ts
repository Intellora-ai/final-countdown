import { useEffect, useReducer } from 'react'
import { store } from '../data/store'

/* Binds React to the store singleton: init once, re-render on every emit.
 * Any state change — local click, another tab, a future remote adapter —
 * arrives through the same subscription. */
export function useStore() {
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let un: (() => void) | null = null
    let alive = true
    store.init().then(() => {
      if (!alive) return
      un = store.subscribe(() => force())
      force()
    })
    return () => { alive = false; if (un) un() }
  }, [])
  return store
}

export function useNarrow() {
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const on = () => force()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return typeof window !== 'undefined' && window.innerWidth < 900
}
