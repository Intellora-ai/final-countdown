import { useEffect, useState } from 'react'
import type { BoardSource } from '../types/learningBoard'
import { FIXTURES, eyebrowFor } from '../fixtures'

/* LOADING, WITHOUT PRETENDING.
 *
 * The loading state exists because fixture modules arrive through dynamic
 * import() — a real async boundary, not a setTimeout wearing one. When a
 * generator replaces the fixture manifest in a later phase, this hook's shape
 * is already the shape of that fetch: id in, {loading | ok | failed} out.
 *
 * The stale-response guard matters even for imports: switch fixtures quickly
 * and the slow module must not overwrite the fast one.
 */
export type BoardSourceState =
  | { status: 'loading' }
  | { status: 'ok'; source: BoardSource; eyebrow: string }
  | { status: 'failed'; error: string }

export function useBoardSource(fixtureId: string): BoardSourceState {
  const [state, setState] = useState<BoardSourceState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    const entry = FIXTURES.find((f) => f.id === fixtureId)
    if (!entry) {
      setState({ status: 'failed', error: `No board named '${fixtureId}' exists.` })
      return
    }
    Promise.all([entry.load(), eyebrowFor(entry)])
      .then(([source, eyebrow]) => {
        if (alive) setState({ status: 'ok', source, eyebrow })
      })
      .catch((e: unknown) => {
        if (alive) setState({ status: 'failed', error: e instanceof Error ? e.message : 'The board failed to load.' })
      })
    return () => { alive = false }
  }, [fixtureId])

  return state
}
