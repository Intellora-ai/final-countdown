/* THE STORE PHASES 1 AND 2 BUILT, IN MEMORY, WITH THE SAME UPDATE CONTRACT.
 *
 * ONE COPY, BECAUSE THERE WERE FOUR. `lessons.test.ts`, `aliases.test.ts`,
 * `concept-override-rekeys.test.ts` and `speed.test.ts` each hand-copied the
 * same three closures and the same `as unknown as MemoryStore` cast. The cast
 * is what makes that dangerous: it hides a drift from the typechecker, so a
 * change to `MemoryStore.update` -- another argument, a different merge rule --
 * would be caught in whichever suite happened to exercise the copy that was
 * missed, and nowhere else.
 *
 * `rows` IS EXPOSED because a test that proves nothing was written has to be
 * able to look. Nothing in the product reads it.
 */

import type { MemoryStore } from './sqliteStore.ts'

export function inMemoryStore(): MemoryStore & { readonly rows: Map<string, string> } {
  const rows = new Map<string, string>()
  return {
    rows,
    read: (key: string) => rows.get(key),
    write: (key: string, value: string) => {
      rows.set(key, value)
    },
    /* Read-decide-write inside one call, which is the whole point of `update`:
       two writers must not be able to drop each other's row. */
    update: (key: string, _at: string, change: (current: string | undefined) => string) => {
      rows.set(key, change(rows.get(key)))
    },
  } as unknown as MemoryStore & { readonly rows: Map<string, string> }
}
