/* A static import that cannot resolve deletes a whole test directory.
 *
 * WHAT HAPPENED
 *   `e2e/deep.spec.mjs` began as `import '<harness>/playwright/deep.spec.mjs'`
 *   -- a filename the harness has never shipped. Playwright does not report
 *   that as an error against that file. It fails to COLLECT the entire
 *   directory and prints:
 *
 *       Total: 0 tests in 0 files
 *
 *   One unresolvable line hid 320 passing tests in three other files, and
 *   every "e2e passed" after it ran nothing.
 *
 * WHY A SECOND GATE WHEN e2e-collection ALREADY CATCHES ZERO
 *   The collection gate is the backstop and it is the one that cannot be
 *   argued with. But it reports a COUNT: "0 tests" tells you the suite is
 *   dead, not which line killed it, and it costs a browser-runner startup to
 *   find out. This runs in the unit suite in milliseconds and names the file,
 *   the specifier, and the path it tried.
 *
 * THE RULE
 *   A STATIC import in a spec is loaded before any test runs, so it must
 *   resolve, and it must resolve inside this repository. A machine-local or
 *   optional dependency is loaded with `await import()` inside a try, which
 *   can fail without taking the directory down -- that is what deep.spec.mjs
 *   does now, and it is why the suite still collects on a machine with no
 *   harness installed.
 */

import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../..', import.meta.url))

/** Top-level `import ... from 'x'` and bare `import 'x'`. Deliberately NOT
 *  `await import(...)`: a dynamic import can be guarded, and guarding it is
 *  the sanctioned way to depend on something optional. */
const STATIC_IMPORT = /^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function trackedSpecs() {
  const out = execFileSync('git', ['ls-files', '*.spec.ts', '*.spec.mjs', '*.spec.js'], {
    cwd: REPO, encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

/** Every offence in one file: a relative specifier that escapes the repo or
 *  resolves to nothing on disk. */
export function offences(specPath, source) {
  const found = []
  const dir = dirname(resolve(REPO, specPath))
  for (const [, spec] of source.matchAll(STATIC_IMPORT)) {
    const isRelative = spec.startsWith('.')
    const isAbs = isAbsolute(spec)
    if (!isRelative && !isAbs) continue // bare package specifier — node resolves it

    const target = isAbs ? spec : resolve(dir, spec)
    const rel = relative(REPO, target)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      found.push({ spec, target, why: 'resolves outside the repository' })
      continue
    }
    const exists = existsSync(target) ||
      ['.ts', '.tsx', '.js', '.mjs', '.jsx'].some((e) => existsSync(target + e))
    if (!exists) found.push({ spec, target, why: 'resolves to a file that does not exist' })
  }
  return found
}

describe('static imports in tracked spec files', () => {
  it('finds spec files at all', () => {
    // Evidence first: an empty list makes every check below vacuous, and an
    // empty list is what a broken `git ls-files` pattern produces.
    expect(trackedSpecs().length).toBeGreaterThan(0)
  })

  it('all resolve, and none escape the repository', () => {
    const bad = []
    for (const spec of trackedSpecs()) {
      for (const o of offences(spec, readFileSync(resolve(REPO, spec), 'utf8'))) {
        bad.push(`${spec}\n    import '${o.spec}'\n    -> ${o.target}\n    ${o.why}`)
      }
    }
    expect(bad, `a static import in a spec is loaded before any test runs, so an
unresolvable one makes Playwright report "Total: 0 tests in 0 files" for the
WHOLE directory. Load anything optional or machine-local with
\`await import()\` inside a try instead.\n\n${bad.join('\n\n')}`).toEqual([])
  })

  it('catches an invented import nobody listed', () => {
    /* A check only ever asserted to pass is satisfied by `return []`. This
     * plants a specifier that exists in no source anywhere and requires both
     * offence kinds to be reported. */
    const missing = offences('frontend/e2e/x.spec.mjs',
      "import './marmalade-sentinel.mjs'\n")
    expect(missing).toHaveLength(1)
    expect(missing[0].why).toBe('resolves to a file that does not exist')

    const escaping = offences('frontend/e2e/x.spec.mjs',
      "import '../../../../etc/marmalade.mjs'\n")
    expect(escaping).toHaveLength(1)
    expect(escaping[0].why).toBe('resolves outside the repository')
  })

  it('does not cry wolf on a guarded dynamic import or a package', () => {
    /* The false-positive half is load bearing: this exact pattern is how
     * deep.spec.mjs depends on an optional harness without endangering the
     * suite. Flagging it would push the next author back to a static import. */
    const source = [
      "import { test } from '@playwright/test'",
      "import { homedir } from 'node:os'",
      "const mod = await import(join(homedir(), '.claude', 'harness', 'run.mjs'))",
    ].join('\n')
    expect(offences('frontend/e2e/x.spec.mjs', source)).toEqual([])
  })

  it('resolves an extensionless relative import that does exist', () => {
    const dir = resolve(REPO, 'frontend/scripts/.tmp-marmalade')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'helper.ts'), 'export const x = 1\n')
    try {
      const src = "import { x } from './helper'\n"
      expect(offences('frontend/scripts/.tmp-marmalade/a.spec.ts', src)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
