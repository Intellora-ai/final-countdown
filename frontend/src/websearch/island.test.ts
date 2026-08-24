import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * THE COMMENT AT THE TOP OF `engine.ts` IS NOW ENFORCED.
 *
 * That comment states two facts about what reaches what. Both were verified by
 * hand when written. One of them — "`src/agent` has zero references from
 * outside itself either" — became FALSE within hours, when `TutorView` landed
 * and wired `createAgent` into `App.tsx`, and the sentence sat in the file
 * saying it anyway.
 *
 * Nothing failed, because a comment cannot fail. That is the entire problem: a
 * claim about reachability is exactly the kind that goes stale silently, since
 * it depends on code somebody else writes in a directory this module never
 * touches. The fix is not a better comment. It is a test that breaks when the
 * world moves, so the comment has to be updated to stay green.
 *
 * ASSERTED IN PAIRS, deliberately. `websearch` must be unreferenced and `agent`
 * must be referenced, through the SAME scan. A check that only ever asserts
 * "nothing references X" is satisfied by a scanner that finds nothing at all —
 * a broken glob, a wrong root, a silent exception — and would report a
 * comfortable PASS for the rest of the repository's life. The positive case is
 * what proves the scanner can see.
 */

/**
 * `fileURLToPath`, not `.pathname`.
 *
 * This checkout lives under a directory whose name contains a space, and
 * `URL.pathname` hands back the percent-encoded form — `final%20countdown` —
 * which `readdirSync` then cannot find. The failure is loud here only because
 * the vacuity check below runs first; without it, `sourceFiles` would have
 * thrown or returned nothing and every "nothing references X" assertion would
 * have passed for the wrong reason.
 */
const SRC = fileURLToPath(new URL('../', import.meta.url))

/** Every .ts/.tsx file under `src`, excluding tests. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      sourceFiles(full, out)
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.test\.tsx?$/.test(entry)) continue
    if (/\.d\.ts$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/**
 * Files outside `src/<area>/` that mention `<area>`.
 *
 * A plain text search, on purpose. An import-graph walk would miss
 * `React.lazy(() => import('./x'))`, a string route, or a dynamic specifier —
 * and the thing being measured is "does anything at all point here", which is
 * a weaker and more honest question than "is there a static edge".
 */
function referencesFrom(area: string): string[] {
  const areaPrefix = join(SRC, area) + '/'
  return sourceFiles(SRC)
    .filter((f) => !f.startsWith(areaPrefix))
    .filter((f) => readFileSync(f, 'utf8').includes(area))
    .map((f) => relative(SRC, f))
}

describe('the scanner can see — negative and positive through the same code path', () => {
  it('finds source files at all, so an empty result means empty and not broken', () => {
    /* Without this, a wrong root or a swallowed exception yields zero files,
       every "nothing references X" assertion below passes vacuously, and the
       suite reports a comfortable PASS forever. */
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => f.endsWith('App.tsx'))).toBe(true)
  })

  it('POSITIVE CONTROL — `agent` IS referenced from outside itself', () => {
    /* This is the half that changed. `src/tutor/TutorView.tsx` imports
       `createAgent`, and `App.tsx` lazy-imports `TutorView`. If this ever goes
       back to zero, `agent` has been unwired and engine.ts's comment is wrong
       in the other direction. */
    const refs = referencesFrom('agent')
    expect(refs.length).toBeGreaterThan(0)
  })

  it('POSITIVE CONTROL — `canvas` is referenced, via a lazy dynamic import', () => {
    /* Proves the text scan catches `React.lazy(() => import(...))`, which an
       import-graph walk keyed on static edges would miss. */
    expect(referencesFrom('canvas').length).toBeGreaterThan(0)
  })
})

describe('engine.ts says websearch is unreached — this is what makes that a fact', () => {
  it('NEGATIVE CONTROL — nothing outside `src/websearch` references it', () => {
    const refs = referencesFrom('websearch')
    /* If this fails, that is GOOD NEWS and not a broken test: someone wired
       this module into the product. Update the comment at the top of
       `engine.ts`, which currently tells the reader the opposite. */
    expect(refs).toEqual([])
  })
})
