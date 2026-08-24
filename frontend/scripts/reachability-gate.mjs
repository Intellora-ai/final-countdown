#!/usr/bin/env node
/**
 * THE REACHABILITY GATE --- "no test may be green on code that never runs".
 *
 * WHY THIS EXISTS
 * ---------------
 * This repository shipped two modules --- `execute/execute.ts` (29 tests) and
 * `world/world.ts` (30 tests) --- that were imported by NOTHING except their
 * own test files. Fifty-nine tests were green. The capabilities they
 * implemented were reported as complete. Neither module was part of the
 * running system, and no gate in the repo could tell.
 *
 * That is not a missing test. It is a missing KIND of test. Unit tests answer
 * "does this function do what it says"; coverage answers "did any test touch
 * this line". Neither asks the only question that would have caught it:
 *
 *     is this file connected to the thing we actually ship?
 *
 * Coverage in particular is actively misleading here. A module imported solely
 * by its own test reports 100% coverage. The number goes UP as the orphan gets
 * more thoroughly tested. Coverage measures test reach, not product reach, and
 * those two diverge exactly when it matters.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. ORPHAN MODULES. Every non-test source file under a scanned root must be
 *      transitively reachable, through static imports, from a DECLARED entry
 *      point. Test files are not edges: `x.test.ts` importing `x.ts` does not
 *      make `x.ts` reachable, which is the whole point.
 *
 *   2. DEAD EXPORTS. Every export of a non-entry module must be imported by at
 *      least one other non-test file. This catches the subtler version of the
 *      same bug: a module that IS wired in, but through one function, while
 *      fifteen others sit beside it tested and unreachable.
 *
 * WHY ENTRY POINTS ARE DECLARED AND NOT INFERRED
 * ----------------------------------------------
 * The obvious implementation infers entries --- "a file nobody imports is an
 * entry point". That inference makes the gate vacuous: every orphan is, by
 * definition, a file nobody imports, so every orphan would be reclassified as
 * an entry and the gate would pass on exactly the input it exists to catch.
 * Entries are listed in MANIFEST below. Adding one is a visible diff.
 *
 * FAILS CLOSED
 * ------------
 * Unlike the skills hook, this gate BLOCKS on error. A parse failure here
 * means the analysis is incomplete, and an incomplete reachability analysis
 * that reports success is worse than no gate --- it is the false assurance the
 * gate was built to remove. There is nothing to recover from inside a build,
 * so there is no reason to fail open.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '..')

/**
 * The scanned areas and their entry points, relative to `frontend/`.
 *
 * An entry point is a file whose exports are the PUBLIC SURFACE of the area:
 * something outside the area is expected to call it, so "nobody inside imports
 * it" is correct rather than suspicious. Everything else must earn its place
 * by being reachable from one.
 */
export const MANIFEST = [
  {
    name: 'agent',
    root: 'src/agent',
    /* `index.ts` is the whole surface: `createAgent()` is the only supported
       way to get an agent, and `handle()` reaches it from there. Listing
       `loop.ts` as a second entry would have hidden the missing composition
       root --- the loop was reachable from itself, so nothing complained that
       nobody ever built its ports.

       `contracts.ts` is listed because a type-only module is legitimately
       imported for its types by files outside the area, and because its
       exports are the shared vocabulary rather than callable behaviour. */
    entries: ['src/agent/index.ts', 'src/agent/kernel/contracts.ts'],
  },
]

/* -------------------------------------------------------------------------- */
/* Source scanning                                                            */
/* -------------------------------------------------------------------------- */

const SOURCE_EXT = ['.ts', '.tsx']
const TEST_RE = /\.(test|spec)\.tsx?$/

export function isTestFile(path) {
  return TEST_RE.test(path)
}

/** Every source file under `dir`, as paths relative to ROOT, sorted. */
export function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (SOURCE_EXT.some((e) => name.endsWith(e))) {
      out.push(relative(ROOT, full))
    }
  }
  return out
}

/**
 * Blank out comments so a commented-out import is not read as a real edge.
 *
 * String literals are tracked, because `'https://x'` would otherwise open a
 * line comment and swallow the rest of the line. Regex literals are NOT
 * tracked --- distinguishing `/` division from `/` regex-start needs a real
 * parser --- so a regex containing a quote character can desynchronise the
 * scan. That is why `analyze()` cross-checks this result against a raw scan
 * and reports any divergence instead of trusting either silently.
 *
 * Replaced characters become spaces rather than being deleted, so every
 * surviving offset still matches the original source.
 */
export function blankComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' '
        i++
      }
    } else if (c === '/' && next === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      out += '  '
      i += 2
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += c
      i++
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        i++
      }
      out += src[i] ?? ''
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

/**
 * Blank the INSIDE of template literals, keeping the backticks and newlines.
 *
 * THE SECOND WAY THIS GATE WAS FOOLED. `FROM_RE` anchors on a line start
 * against text where only comments had been blanked, so a documentation string
 * containing import syntax minted an edge to a module nothing actually
 * imports:
 *
 *     export const USAGE_DOC = `
 *     import { neverCalled } from './__orphan'
 *     `
 *
 * That one constant took reachability from 15/16 to 16/16.
 *
 * ONLY TEMPLATE LITERALS ARE BLANKED, and the restriction is what keeps this
 * safe. A `'...'` or `"..."` string cannot contain a raw newline, so its
 * contents can never sit at the start of a line and `FROM_RE` cannot match
 * inside one. Backtick strings can span lines, so they can. Blanking the
 * quoted forms too would destroy the specifier this function's whole purpose
 * is to read --- the specifier IS a quoted string.
 *
 * Newlines are preserved so every surviving offset still matches the original.
 */
export function blankStrings(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const q = src[i]
    if (q !== '`' && q !== "'" && q !== '"') {
      out += src[i]
      i++
      continue
    }

    /* Read the whole literal first, so the decision below can be made on its
       contents rather than on its opening character. */
    let body = ''
    let j = i + 1
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') {
        body += src[j] + (src[j + 1] ?? '')
        j += 2
        continue
      }
      body += src[j]
      j++
    }
    const closed = j < n

    /* A LITERAL IS BLANKED ONLY IF ITS CONTENTS CAN SIT AT A LINE START,
       because that is the only way it can mint a phantom edge --- `FROM_RE`
       anchors on `(?:^|\n)`.

       Backticks always qualify. Quoted strings qualify when they carry a
       BACKSLASH LINE CONTINUATION, which puts a raw newline inside a
       double-quoted string and is ES5, not exotic:

           const DOC = "\
           import { helperA } from './__orphanA'"

       One string, one value, and a real `\n` immediately before `import`. An
       earlier version of this function asserted that quoted strings "cannot
       contain a raw newline" and was simply wrong; the gate reported 17/17 PASS
       on two modules absent from the built bundle.

       Quoted strings WITHOUT a continuation are copied through untouched, and
       that is not laziness --- the module specifier this whole parser exists to
       read IS a quoted string, and a specifier never contains a line
       continuation. Blanking the class wholesale would destroy `m[2]`. */
    const blank = q === '`' || /\\\r?\n/.test(body)

    out += q
    out += blank ? body.replace(/[^\n]/g, ' ') : body
    if (closed) out += q
    i = j + 1
  }
  return out
}

/* An import or re-export with a module specifier. The clause is bounded by
   `[^;]` so a multi-line `import {\n a,\n b,\n}` is matched while a runaway
   match across unrelated statements is not. */
const FROM_RE = /(?:^|\n)[ \t]*(?:import|export)\s+([^;]*?)\s*from\s*['"]([^'"]+)['"]/g
const BARE_RE = /(?:^|\n)[ \t]*import\s*['"]([^'"]+)['"]/g
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * The module specifiers a source file imports, with the names taken from each.
 *
 * Returns `[{ spec, names, star, typeOnly }]`.
 *
 * `star` marks `import * as ns` and `export * from`, both of which consume
 * every export of the target and so suppress the dead-export check for it.
 *
 * `typeOnly` MARKS AN EDGE THAT DOES NOT EXIST AT RUN TIME, and it is the
 * difference between this gate measuring what it claims to measure and
 * measuring something adjacent. Earlier versions stripped the `type` keyword
 * and treated what was left as an ordinary import, which meant two lines
 * appended to any reachable file made an orphan invisible:
 *
 *     import type { neverCalled } from '../__orphan'
 *     void (0 as unknown as typeof neverCalled)
 *
 *     reachability gate: PASS, 16/16
 *     grep the built bundle for the orphan's contents: ABSENT
 *
 * tsc ERASES a type-only import. Nothing of the target reaches the bundle, so
 * it is not reachable in the only sense that matters here. The parser had no
 * representation for "this edge disappears at compile time" and therefore could
 * not have been right, whatever the regex said.
 *
 * Nobody would write that line to cheat. It is the ordinary way to import a
 * type, which is exactly why it had to be handled rather than trusted.
 */
export function importsOf(src) {
  const clean = blankStrings(blankComments(src))
  const found = []

  for (const m of clean.matchAll(FROM_RE)) {
    /* `import type {...}` and `export type {...}` are type-only in whole. */
    const raw = m[1].trim()
    const wholeClauseIsType = /^type\b/.test(raw)
    const clause = raw.replace(/^type\s+/, '').trim()
    const parsed = parseClause(clause)
    found.push({
      spec: m[2],
      ...parsed,
      /* Type-only in whole, or every specifier individually marked `type`. A
         mixed `{ type A, b }` still ships `b`, so it is a real edge. */
      typeOnly: wholeClauseIsType || parsed.allSpecifiersType === true,
    })
  }
  for (const m of clean.matchAll(BARE_RE)) {
    /* `import './x'` is a side-effect import. Always a runtime edge. */
    found.push({ spec: m[1], names: [], star: false, typeOnly: false })
  }
  for (const m of clean.matchAll(DYNAMIC_RE)) {
    found.push({ spec: m[1], names: [], star: true, typeOnly: false })
  }
  return found
}

function parseClause(clause) {
  if (clause.startsWith('*')) return { names: [], star: true }

  const braces = clause.match(/\{([\s\S]*)\}/)
  const names = []
  let specifiers = 0
  let typeSpecifiers = 0
  if (braces) {
    for (const raw of braces[1].split(',')) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      specifiers++
      if (/^type\s+/.test(trimmed)) typeSpecifiers++
      const part = trimmed.replace(/^type\s+/, '')
      /* `a as b` is imported under the name `a`. The alias is the local
         binding and says nothing about what the target module exports. */
      names.push(part.split(/\s+as\s+/)[0].trim())
    }
  }
  const before = braces ? clause.slice(0, braces.index) : clause
  const dflt = before.replace(/,/g, '').trim()
  if (dflt && dflt !== '*') {
    names.push('default')
    specifiers++
  }

  return {
    names,
    star: /\*\s+as\s+/.test(clause),
    allSpecifiersType: specifiers > 0 && typeSpecifiers === specifiers,
  }
}

/* Any top-level declaration, exported or not. Anchored at column 0, because a
   nested `const` inside a function body is part of that function rather than a
   sibling of it. */
const DECL_RE =
  /^(export\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm

/**
 * The top-level symbols of a file, each with the source span it owns.
 *
 * A symbol's span runs from its own declaration to the start of the next one.
 * That is a coarse approximation of a body --- trailing blank lines and
 * comments belong to whoever came last --- but it is exact where it matters:
 * a name appearing inside a span is a reference FROM that symbol.
 *
 * @returns {{ name: string, exported: boolean, start: number, end: number }[]}
 */
export function symbolsOf(src) {
  const clean = blankComments(src)
  const found = []
  for (const m of clean.matchAll(DECL_RE)) {
    found.push({ name: m[2], exported: Boolean(m[1]), start: m.index, end: 0, src: clean })
  }
  found.sort((a, b) => a.start - b.start)
  for (let i = 0; i < found.length; i++) {
    found[i].end = i + 1 < found.length ? found[i + 1].start : clean.length
  }

  /* `export { a, b as c }` promotes already-declared symbols. The exported
     name is the alias when there is one, which is the opposite of the import
     case, so both names are recorded as exported. */
  for (const m of clean.matchAll(/(?:^|\n)export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const raw of m[1].split(',')) {
      const part = raw.trim().replace(/^type\s+/, '')
      if (!part) continue
      const local = part.split(/\s+as\s+/)[0].trim()
      const hit = found.find((s) => s.name === local)
      if (hit) hit.exported = true
      else found.push({ name: local, exported: true, start: m.index, end: m.index, src: clean })
    }
  }
  return found
}

/** The names a file exports. Types are included: an unreachable type is dead. */
export function exportsOf(src) {
  return [...new Set(symbolsOf(src).filter((s) => s.exported).map((s) => s.name))]
}

/**
 * The exported names of `src` that nothing can ever reach.
 *
 * WHY THIS IS A CALL GRAPH AND NOT A COUNT OF IMPORTS
 * ---------------------------------------------------
 * The naive rule --- "exported but never imported means dead" --- is wrong in
 * both directions here. `rank()` is exported so its ranking rules can be
 * tested directly, and is called by `research()` in the same file: it runs on
 * every search, and calling it dead would train everyone to ignore this gate.
 * Meanwhile a helper called only by an unreachable function is genuinely dead
 * even though it is referenced.
 *
 * So: seed with the names other shipping files actually import, then propagate
 * through in-file references to a fixpoint. What survives unreached is code
 * that no entry point can arrive at by any path.
 *
 * @param {string} src
 * @param {Set<string>} imported names taken from this file by shipping code
 */
export function unreachableExports(src, imported) {
  const symbols = symbolsOf(src)
  const byName = new Map(symbols.map((s) => [s.name, s]))

  const live = new Set()
  const queue = [...imported].filter((n) => byName.has(n))
  while (queue.length > 0) {
    const name = queue.shift()
    if (live.has(name)) continue
    live.add(name)
    const sym = byName.get(name)
    if (!sym) continue
    const body = sym.src.slice(sym.start, sym.end)
    for (const other of symbols) {
      if (other.name === name || live.has(other.name)) continue
      if (new RegExp(`\\b${escapeName(other.name)}\\b`).test(body)) queue.push(other.name)
    }
  }

  return symbols.filter((s) => s.exported && !live.has(s.name)).map((s) => s.name)
}

/**
 * Escape a symbol name for use inside a RegExp.
 *
 * THE FIRST VERSION ESCAPED ONLY `$`, which is the bug CodeQL calls
 * `js/incomplete-sanitization`: a partial escape reads as deliberate, so
 * nobody looks at it again. The name comes from `DECL_RE`, so today it can
 * only ever be `[A-Za-z_$][\w$]*` and no other metacharacter can reach here
 * --- but that is an argument for why the bug is currently unreachable, not
 * for why the escape should stay incomplete. The character class that made it
 * safe lives in a different constant, forty lines away, and the day someone
 * widens `DECL_RE` this silently starts building malformed patterns.
 *
 * Escaping the whole metacharacter set costs nothing and removes the
 * dependency between two regexes that have no reason to know about each other.
 * Backslash is first in the class so it is escaped before anything else.
 */
function escapeName(name) {
  return name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx']

/** Resolve a relative specifier to a repo-relative source path, or null. */
export function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(ROOT, dirname(fromFile), spec)
  for (const suffix of CANDIDATES) {
    const candidate = base.endsWith('.ts') || base.endsWith('.tsx') ? base : base + suffix
    try {
      if (statSync(candidate).isFile()) return relative(ROOT, candidate)
    } catch {
      /* not this one */
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* The analysis                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Run the gate over one MANIFEST area.
 *
 * @returns {{ area: string, files: string[], reached: string[],
 *             orphans: string[], deadExports: {file: string, name: string}[],
 *             warnings: string[] }}
 */
export function analyze(area) {
  const root = resolve(ROOT, area.root)
  const files = walk(root)
  const sources = files.filter((f) => !isTestFile(f))
  const warnings = []

  const read = new Map()
  for (const f of files) read.set(f, readFileSync(resolve(ROOT, f), 'utf8'))

  /* Edges come from NON-TEST files only. A test importing its subject is
     precisely the edge that made the orphans look connected, so it is not an
     edge here. */
  const edges = new Map()
  for (const f of sources) {
    const src = read.get(f)
    const list = importsOf(src)

    /* Cross-check against a scan that ignores comments entirely. A divergence
       means blankComments() desynchronised --- almost certainly a regex
       literal containing a quote --- and the analysis below cannot be trusted
       to be complete, so it is surfaced rather than swallowed. */
    const rawCount = [...src.matchAll(FROM_RE)].length
    if (rawCount !== [...blankComments(src).matchAll(FROM_RE)].length) {
      warnings.push(`${f}: import scan disagrees with raw scan (${rawCount} raw)`)
    }

    edges.set(
      f,
      list
        .map((imp) => ({ ...imp, target: resolveSpec(f, imp.spec) }))
        .filter((imp) => imp.target !== null),
    )
  }

  /* 1. Orphan modules --- breadth-first from the declared entries. */
  const reached = new Set()
  const queue = [...area.entries]
  for (const e of area.entries) {
    if (!sources.includes(e)) {
      throw new Error(`entry point does not exist or is a test file: ${e}`)
    }
  }
  while (queue.length > 0) {
    const f = queue.shift()
    if (reached.has(f)) continue
    reached.add(f)
    for (const imp of edges.get(f) ?? []) {
      /* TYPE-ONLY EDGES ARE NOT TRAVERSED. tsc erases them, so a module
         reachable only through `import type` contributes nothing to the
         bundle and is exactly as absent as one nobody imports at all. This
         line is the difference between measuring reachability and measuring
         "mentioned in something that looks like an import". */
      if (imp.typeOnly) continue
      if (!reached.has(imp.target)) queue.push(imp.target)
    }
  }
  const orphans = sources.filter((f) => !reached.has(f))

  /* 2. Dead exports --- every name a non-entry module exports must be taken
        by some other non-test file. Star importers consume everything. */
  const taken = new Map()
  const starred = new Set()
  for (const [, list] of edges) {
    for (const imp of list) {
      if (imp.star) starred.add(imp.target)
      const set = taken.get(imp.target) ?? new Set()
      for (const n of imp.names) set.add(n)
      taken.set(imp.target, set)
    }
  }

  const deadExports = []
  for (const f of sources) {
    if (orphans.includes(f)) continue /* already reported, one finding per file */
    if (starred.has(f)) continue
    /* An entry point's exports ARE the public surface, so they are seeds
       rather than candidates --- but everything they reach inside the file
       still has to be reached, so the same propagation runs. */
    const seed = area.entries.includes(f)
      ? new Set(exportsOf(read.get(f)))
      : (taken.get(f) ?? new Set())
    for (const name of unreachableExports(read.get(f), seed)) {
      deadExports.push({ file: f, name })
    }
  }

  return { area: area.name, files, reached: [...reached].sort(), orphans, deadExports, warnings }
}

export function runAll(manifest = MANIFEST) {
  return manifest.map(analyze)
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

export function report(results) {
  const lines = []
  let failed = false

  for (const r of results) {
    const sources = r.files.filter((f) => !isTestFile(f)).length
    lines.push(`[${r.area}] ${r.reached.length}/${sources} source files reachable from entry points`)

    for (const w of r.warnings) {
      failed = true
      lines.push(`  PARSE  ${w}`)
    }
    for (const o of r.orphans) {
      failed = true
      lines.push(`  ORPHAN ${o} --- built and tested, imported by nothing that ships`)
    }
    for (const d of r.deadExports) {
      failed = true
      lines.push(`  DEAD   ${d.file} exports ${d.name}, and no shipping file imports it`)
    }
  }

  lines.push(failed ? 'REACHABILITY GATE: FAIL' : 'REACHABILITY GATE: PASS')
  return { failed, text: lines.join('\n') }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const { failed, text } = report(runAll())
  process.stdout.write(text + '\n')
  process.exit(failed ? 1 : 0)
}
