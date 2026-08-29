import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { RENDERER_SOURCE, RENDERER_FALLBACK } from './attribution'

/* THE CHECK `attributeFiles` NEVER HAD.
 *
 * `attribute()` is computed -- it maps a `data-kind` the DOM actually emitted
 * to a renderer -- and two parity tests in composed-renderer.spec.ts hold it
 * honest. `attributeFiles()` takes whatever a human typed, and nothing checked
 * it, in a file whose own header records the last hand-written map going stale:
 * six of six paths pointed at nothing and every attribution degraded silently.
 *
 * This runs in milliseconds and needs no browser, so there is no reason the
 * check lived only in the five-browser suite.
 */

const ROOT = resolve(process.cwd(), '..')
const E2E = resolve(process.cwd(), 'e2e')

function specSources(): string[] {
  return readdirSync(E2E)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => readFileSync(resolve(E2E, f), 'utf8'))
}

/** Every string literal handed to `attributeFiles`, across every spec. */
function attributedPaths(): string[] {
  const found = new Set<string>()
  for (const src of specSources()) {
    for (const call of src.matchAll(/attributeFiles\s*\(\s*testInfo\s*,\s*\[([\s\S]*?)\]/g)) {
      for (const lit of call[1].matchAll(/['"]([^'"]+)['"]/g)) found.add(lit[1])
    }
  }
  return [...found].sort()
}

describe('attributeFiles', () => {
  test('it is actually used, so this check is not vacuously passing', () => {
    expect(attributedPaths().length).toBeGreaterThan(0)
  })

  /* THE LOAD-BEARING ONE. A path that does not exist sends a reader to a file
     that cannot contain the bug, which is precisely what happened. */
  test('every hand-typed path names a file that exists', () => {
    const missing = attributedPaths().filter((p) => !existsSync(resolve(ROOT, p)))
    expect(missing, 'attributed paths that do not exist').toEqual([])
  })
})

describe('attribute', () => {
  test('every computed renderer path exists too', () => {
    const all = [...new Set([...Object.values(RENDERER_SOURCE), RENDERER_FALLBACK])]
    expect(all.filter((p) => !existsSync(resolve(ROOT, p)))).toEqual([])
  })
})
