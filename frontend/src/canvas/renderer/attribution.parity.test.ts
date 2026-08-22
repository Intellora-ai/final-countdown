import { describe, it, expect } from 'vitest'
import { rendererKeys } from './renderers'
import { RENDERER_SOURCE, RENDERER_FALLBACK, sourceForRenderer } from '../../../e2e/util/attribution'

/* THE MAP THAT MAKES A CI ANNOTATION POINT AT THE RIGHT FILE.
 *
 * e2e/util/attribution.ts turns a renderer key into the source path that
 * canvas-reporter puts in `::error file=`. A stale entry there is worse than no
 * entry: it sends whoever reads the annotation to a file that had nothing to do
 * with the failure, which is a slower way to be wrong than the spec-line
 * annotations it replaced.
 *
 * Two ways it can go stale, and they are closed in two different places:
 *
 *   a renderer added to REGISTRY and not to the map  -> HERE. Pure data, no
 *      DOM, fails on a plain `npm test` rather than only when someone
 *      remembers to run Playwright.
 *
 *   a panel renamed or moved, leaving a path at nothing  -> NOT here. Checking
 *      the filesystem from a file under src/ means node:fs and __dirname,
 *      which vitest resolves and `tsc -b` rejects because the src tsconfig
 *      carries no node types. import.meta.glob has the same problem from the
 *      other direction. That assertion lives in scripts/gate_integrity.py
 *      check (l), which already reads the repo from disk and runs inside
 *      preflight, a required check. Better home, stronger gate.
 */


describe('every renderer maps to a real source file', () => {
  it('covers exactly the registered renderer keys, no more and no fewer', () => {
    expect(Object.keys(RENDERER_SOURCE).sort()).toEqual([...rendererKeys()].sort())
  })

  it('sends an unknown or absent renderer to the file that decides renderers', () => {
    /* A block with no renderer is LessonRenderer's decision, so that is the
     * honest place to point. Guessing a panel would be worse than the
     * fallback. */
    expect(sourceForRenderer(null)).toBe(RENDERER_FALLBACK)
    expect(sourceForRenderer(undefined)).toBe(RENDERER_FALLBACK)
    expect(sourceForRenderer('NoSuchPanel')).toBe(RENDERER_FALLBACK)
  })

  it('points every path at frontend/, the prefix GitHub resolves from the repo root', () => {
    for (const rel of [...Object.values(RENDERER_SOURCE), RENDERER_FALLBACK]) {
      expect(rel.startsWith('frontend/'), rel).toBe(true)
    }
  })
})
