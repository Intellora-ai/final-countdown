/* THE STORE PHASES 1 AND 2 BUILT, IN MEMORY, WITH THE SAME UPDATE CONTRACT.
 *
 * NAMED `.spec.ts` BECAUSE IT IS TEST EQUIPMENT, AND THE GATES AGREE ON WHAT
 * THAT SUFFIX MEANS. As `inMemory.ts` this file was an ORPHAN to the
 * reachability gate -- "built and tested, imported by nothing that ships" --
 * which is the gate doing its job: a helper only tests import does not belong
 * in the product tree under a product name. The `.spec` suffix is the one
 * marker BOTH systems already honour: the reachability gate's TEST_RE skips
 * any file ending in .test.ts, .spec.ts, .test.tsx or .spec.tsx from the
 * product scan, and vitest's include for the server tree collects files
 * ending in .test.ts ONLY -- so this is skipped as product AND not collected
 * as a suite. (The glob is not quoted here verbatim because it contains the
 * two characters that end a block comment, which is how this header once
 * broke every suite that imports the file.) It holds no tests on purpose; it
 * is the shared double four suites build their stores from.
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
