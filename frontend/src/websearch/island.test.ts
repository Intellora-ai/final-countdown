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

describe('engine.ts says websearch IS reached — this is what makes that a fact', () => {
  it('POSITIVE CONTROL — the five files that wire it are exactly these', () => {
    /*
     * THIS ASSERTION WAS `toEqual([])` AND IT FIRED, WHICH IS THE TEST WORKING.
     *
     * Its own note said so: "If this fails, that is GOOD NEWS and not a broken
     * test: someone wired this module into the product. Update the comment at
     * the top of `engine.ts`, which currently tells the reader the opposite."
     * That is what happened, and that comment has been rewritten to name these
     * five files.
     *
     * Pinned as an exact SET rather than `length > 0`, and that is the whole
     * value of the change. A `> 0` check would go green the moment one file
     * referenced it and then never speak again -- it could not tell "the chain
     * is wired" from "one stray import survived a deletion". An exact list
     * fails in BOTH directions: wire a sixth file and this breaks, unwire the
     * chain and it breaks, and either way somebody has to come back and say in
     * `engine.ts` what the new truth is.
     *
     * Sorted, because `sourceFiles` walks the directory in whatever order the
     * filesystem hands back and a set assertion must not depend on that.
     */
    const refs = [...referencesFrom('websearch')].sort()
    expect(refs).toEqual([
      'App.tsx',
      'canvas/CanvasRoute.tsx',
      'canvas/teach/chain.ts',
      'canvas/teach/contract.ts',
      'canvas/teach/webResolver.ts',
    ])
  })

  it('the live path is now the general one, and it needs a server', () => {
    /*
     * THIS TEST'S REASON CHANGED, AND THE ASSERTION MOVED WITH IT.
     *
     * It used to pin `wikipedia.ts` and said: "if this file ever disappears,
     * the chain is back to having no live source." That was true while a key
     * could not ship to a browser and no server existed to hold one, which made
     * Wikipedia -- keyless and CORS-enabled -- the only source a page could
     * reach.
     *
     * `frontend/vite-plugin-search.ts` is that server. The key lives in its
     * environment, it does the fetching a browser is not allowed to do, and
     * `webSearchClient.ts` reaches it over a relative route. So the live source
     * is now a GENERAL provider, and Wikipedia is one result among many with no
     * privileged position.
     *
     * `wikipedia.ts` is deliberately still here and deliberately NOT wired. It
     * is the only source that works without a server, and the route is dev-only
     * -- so a production build has no web rung at all until that is hosted.
     * Wiring it back as a silent fallback would quietly restore single-source
     * answering, which is the thing this whole change removed, so that is a
     * decision for a person rather than a default.
     */
    expect(sourceFiles(SRC).some((f) => f.endsWith('websearch/webSearchClient.ts'))).toBe(true)
    expect(sourceFiles(SRC).some((f) => f.endsWith('websearch/verify.ts'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* The key stays on the server, and the checkers are no longer dead            */
/* -------------------------------------------------------------------------- */

describe('nothing a browser downloads can name the search credential', () => {
  it('no file under src/ mentions the key environment variable', () => {
    /*
     * SOURCE, NOT BUNDLE, AND THAT IS THE STRONGER TEST HERE.
     *
     * Everything under `src/` is compiled into something a browser downloads.
     * Grepping the built bundle would catch the same leak later, more slowly,
     * and only when a build has run; grepping the source catches it the moment
     * somebody types it, and it cannot be defeated by minification renaming a
     * variable.
     *
     * The name lives in `frontend/vite-plugin-search.ts`, which is a dev-server
     * middleware and is never bundled. If it ever appears under `src/`,
     * somebody has moved the credential to the wrong side of the wire.
     */
    const offenders = sourceFiles(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('WEB_SEARCH_API_KEY'),
    )
    expect(offenders.map((f) => relative(SRC, f))).toEqual([])
  })

  it('POSITIVE CONTROL — the scan can actually see the string it looks for', () => {
    /* A "nothing matches" assertion is satisfied by a scanner that reads
       nothing at all. This proves the same scan finds a string that IS there,
       so the empty result above means absence rather than blindness. */
    const found = sourceFiles(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('SEARCH_ROUTE'),
    )
    expect(found.length).toBeGreaterThan(0)
  })

  it('the browser reaches search by a relative route, never a vendor host', () => {
    const client = readFileSync(join(SRC, 'websearch/webSearchClient.ts'), 'utf8')
    expect(client).toContain("'/api/search'")
    /* No vendor hostname anywhere in the file that the browser runs. */
    expect(client).not.toMatch(/https?:\/\/[a-z0-9.-]*(brave|tavily|serper|bing|google)/i)
  })
})

describe('select.ts and crosscheck.ts are executed by the shipped path', () => {
  it('the live client imports both, so neither is dead code any more', () => {
    /*
     * Both modules were written, fully tested, and reached by nothing that
     * ships — the exact shape `engine.ts` was in before the route landed, and
     * the exact shape coverage argues AGAINST noticing: a module imported only
     * by its own test reports 100% and the number rises as the orphan is tested
     * more thoroughly.
     *
     * Asserted on the import, not on a call, because an import that nothing
     * calls would still satisfy a looser check. `webSearchClient.test.ts` is
     * what proves they RUN: a `javascript:` source excluded by `select.ts`
     * loses its vote, and the four statuses come out of `crosscheck.ts`.
     */
    const client = readFileSync(join(SRC, 'websearch/webSearchClient.ts'), 'utf8')
    expect(client).toContain("from './select'")
    const verify = readFileSync(join(SRC, 'websearch/verify.ts'), 'utf8')
    expect(verify).toContain("from './crosscheck'")
    expect(verify).toContain("from './evidence'")
  })
})
