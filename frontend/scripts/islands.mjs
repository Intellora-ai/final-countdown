/*
 * EVERY MODULE THAT ONLY TESTS IMPORT, ACROSS THE WHOLE FRONTEND.
 *
 * The reachability gate answers a narrower question: within three DECLARED
 * areas (`agent`, `websearch`, `server`), is every file reachable from that
 * area's own entry points? It said PASS while `/api/memory` sat with no
 * browser caller for a whole PR, and it says nothing at all about `src/canvas`
 * or `src/practice`, which are not declared areas.
 *
 * This walks every TypeScript module under `src/` and `server/`, resolves every
 * relative import, and reports the ones nothing but a test brings in. A module
 * like that is either deliberate -- a fixture, an entry point, a measuring
 * instrument -- or it is product code that ships to nobody, which is the
 * failure this repository has now made twice.
 *
 * It reports; `islands.test.mjs` is what pins the inventory so a NEW one
 * cannot arrive quietly.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['src', 'server']
const SKIP = /node_modules|[/\\]dist|[/\\]generated/
const CODE = /\.(ts|tsx|mjs)$/
const DECLARATION = /\.d\.ts$/
const TEST = /\.(test|spec)\.(ts|tsx|mjs)$/
const SPEC = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function sourceFiles() {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (SKIP.test(full)) continue
      if (entry.isDirectory()) walk(full)
      else if (CODE.test(entry.name) && !DECLARATION.test(entry.name)) found.push(path.relative(FRONTEND, full))
    }
  }
  for (const root of ROOTS) walk(path.join(FRONTEND, root))
  return found.sort()
}

/** Only relative imports: a package is somebody else's problem. */
function resolveImport(from, spec, known) {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(FRONTEND, path.dirname(from), spec).replace(/\.(ts|tsx|js|mjs)$/, '')
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    const rel = path.relative(FRONTEND, candidate)
    if (known.has(rel)) return rel
  }
  return null
}

export function islands() {
  const files = sourceFiles()
  const known = new Set(files)
  const importers = new Map(files.map((f) => [f, { test: 0, production: 0 }]))
  for (const file of files) {
    const text = fs.readFileSync(path.join(FRONTEND, file), 'utf8')
    for (const match of text.matchAll(SPEC)) {
      const target = resolveImport(file, match[1], known)
      if (target === null || target === file) continue
      importers.get(target)[TEST.test(file) ? 'test' : 'production'] += 1
    }
  }
  const production = files.filter((f) => !TEST.test(f))
  return {
    modules: production.length,
    /** Imported by tests and by nothing that ships. */
    islands: production.filter((f) => importers.get(f).production === 0 && importers.get(f).test > 0),
    /** Imported by nothing at all, tests included. */
    unimported: production.filter((f) => importers.get(f).production === 0 && importers.get(f).test === 0),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = islands()
  console.log(`${found.modules} production modules`)
  console.log(`\nislands (only tests import them): ${found.islands.length}`)
  for (const one of found.islands) console.log(`  ${one}`)
  console.log(`\nno importer at all: ${found.unimported.length}`)
  for (const one of found.unimported) console.log(`  ${one}`)
}
