import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * `docs/websearch.md` IS NOW ENFORCED, FOR THE SAME REASON `island.test.ts` EXISTS.
 *
 * That file's argument is that a claim written in a comment cannot fail, so it
 * goes stale silently while every test around it stays green. The argument does
 * not stop at comments. `docs/websearch.md` carries a 48-row table saying which
 * numbered section is built and which file proves it, and nothing anywhere
 * compared that table to the directory it describes.
 *
 * Measured on `main` at 2447199, with every required check green:
 *
 *   - §30, §31 and §32 were marked **NOT BUILT** and the summary read
 *     "42 built, 3 not built". `hops.ts` (§30 and §31) and `provenance.ts` (§32)
 *     were merged and sitting in the directory the table describes.
 *   - Eight modules — `bench.ts`, `evalReport.ts`, `hops.ts`, `index.ts`,
 *     `provenance.ts`, `verify.ts`, `webSearchClient.ts`, `wikipedia.ts` — were
 *     named nowhere in the document at all.
 *   - "Known gaps" said "Nothing in the product calls this. `src/websearch` has
 *     zero references from anywhere outside itself", citing `island.test.ts` as
 *     what kept that true. `TutorView.tsx` imports `../websearch`, and
 *     `island.test.ts` had already been rewritten to assert the OPPOSITE. The
 *     document and its own named enforcer disagreed, and only the document
 *     could not fail.
 *   - "Known gaps" also said CI lints only `src/canvas`, so this directory's
 *     `no-explicit-any` never runs on a PR. The lint script covers
 *     `src/websearch`, `eslint.config.js` carries the matching `files:` block,
 *     and the workflow runs the script.
 *
 * Three false statements, one cause: nothing checked.
 *
 * The counts assertion below would have passed through every one of them — 42
 * rows really did say built and the summary really did say 42. A number that
 * agrees with itself proves nothing about the world, which is exactly why it is
 * not the only check here.
 *
 * Uses only the three `node:fs` functions `node-fs.d.ts` already declares. That
 * file asks the next person not to grow it, so `existsSync` is not imported and
 * existence is answered from a walk instead.
 */

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const DOC = join(REPO, 'docs/websearch.md')

/** Roots the document is allowed to name a file in. */
const ROOTS = ['frontend/src', 'frontend/scripts', 'scripts', 'docs']

const doc = (): string => readFileSync(DOC, 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    out.push(full)
  }
  return out
}

let indexed: { paths: Set<string>; names: Set<string> } | undefined
function repoFiles(): { paths: Set<string>; names: Set<string> } {
  if (indexed === undefined) {
    const all = ROOTS.flatMap((r) => walk(join(REPO, r)))
    indexed = {
      paths: new Set(all.map((p) => relative(REPO, p))),
      names: new Set(all.map((p) => p.slice(p.lastIndexOf('/') + 1))),
    }
  }
  return indexed
}

/** Non-test, non-declaration modules in this directory. */
function modules(): string[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => !f.endsWith('.d.ts'))
    .sort()
}

/** Every source path the document names inside backticks. */
function namedFiles(text: string): string[] {
  return [...text.matchAll(/`([A-Za-z0-9_./-]+\.(?:ts|tsx|mjs))`/g)]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
}

/**
 * The document names files three ways and all three are legitimate: bare
 * (`interpret.ts`, and also `TutorView.tsx`, which is not a sibling of it),
 * repo-relative (`frontend/scripts/mutation-gate.mjs`) and frontend-relative
 * (`src/agent/knowledge/knowledge.ts`). Resolving only one shape invents
 * phantom failures for the rest: the first draft of this file reported
 * `App.tsx` as a name with no file behind it, and `frontend/src/App.tsx` was
 * sitting there the whole time. A check that cries wolf is a check somebody
 * deletes.
 */
function resolves(name: string): boolean {
  const { paths, names } = repoFiles()
  if (name.includes('/')) return paths.has(name) || paths.has(join('frontend', name))
  return names.has(name)
}

function statusRows(text: string): string[] {
  return text.split('\n').filter((l) => /^\| *\d+ *\|/.test(l))
}

/** Files outside this directory that import it. */
function importers(): string[] {
  return walk(join(REPO, 'frontend/src'))
    .filter((p) => /\.tsx?$/.test(p))
    .filter((p) => !p.startsWith(HERE))
    .filter((p) => /from ['"][^'"]*websearch[^'"]*['"]/.test(readFileSync(p, 'utf8')))
}

describe('docs/websearch.md must describe the directory that exists', () => {
  it('NEGATIVE CONTROL — the scanners see real input, so an empty pass is impossible', () => {
    expect(modules().length).toBeGreaterThanOrEqual(20)
    expect(namedFiles(doc()).length).toBeGreaterThanOrEqual(20)
    expect(statusRows(doc()).length).toBeGreaterThanOrEqual(40)
    expect(repoFiles().names.size).toBeGreaterThanOrEqual(50)
  })

  it('names every module in this directory — a module the document omits is untracked', () => {
    const named = new Set(namedFiles(doc()).map((n) => n.slice(n.lastIndexOf('/') + 1)))
    expect(modules().filter((m) => !named.has(m))).toEqual([])
  })

  it('names no file that does not exist — the other direction of the same claim', () => {
    expect(namedFiles(doc()).filter((n) => !resolves(n))).toEqual([])
  })

  it('summarises its own table correctly', () => {
    const rows = statusRows(doc())
    const built = rows.filter((r) => r.includes('**built**')).length
    const notBuilt = rows.filter((r) => r.includes('**NOT BUILT**')).length
    const claim = /\*\*(\d+) built, (\d+) not built\.\*\*/.exec(doc())
    expect(claim).not.toBeNull()
    expect([Number(claim?.[1]), Number(claim?.[2])]).toEqual([built, notBuilt])
  })

  it('does not call this directory unreachable while a file outside it imports it', () => {
    const claimsIsolation = /zero references\s+from anywhere outside itself/.test(doc())
    expect({ imported: importers().length > 0, claimsIsolation }).not.toEqual({
      imported: true,
      claimsIsolation: true,
    })
  })

  it('does not call this directory unlinted while both halves of the wiring exist', () => {
    const pkg = readFileSync(join(REPO, 'frontend/package.json'), 'utf8')
    const eslint = readFileSync(join(REPO, 'frontend/eslint.config.js'), 'utf8')

    // Flat config lints only paths with a matching `files:` entry, so the script
    // and the config are both load-bearing. Either one alone lints nothing here.
    const inScript = /"lint":[^"]*"[^"]*src\/websearch/.test(pkg)
    const inConfig = /files: *\[ *'src\/websearch\//.test(eslint)
    const claimsUnlinted = /never runs on a PR/.test(doc())

    expect({ linted: inScript && inConfig, claimsUnlinted }).not.toEqual({
      linted: true,
      claimsUnlinted: true,
    })
  })
})
