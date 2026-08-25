import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  analyze,
  analyzeProductReachability,
  isTestFile,
  blankComments,
  blankStrings,
  exportsOf,
  importsOf,
  MANIFEST,
  report,
  ROOT,
  runAll,
  symbolsOf,
  unreachableExports,
} from './reachability-gate.mjs'

/*
 * THE GATE THAT HAS TO BE ABLE TO FAIL.
 *
 * `reachability-gate.mjs` exists because two modules --- `execute/execute.ts`
 * and `world/world.ts` --- were fully written, fully unit-tested, and imported
 * by nothing that ships. Fifty-nine tests were green on code the product could
 * never reach.
 *
 * A gate against that has one failure mode worth fearing above all others: that
 * it passes because it looks at nothing. Every check below therefore comes in
 * pairs --- one input that must pass and one that must fail --- because a test
 * that only asserts PASS on a healthy tree is satisfied by `return true`, which
 * is precisely the shape of the bug being defended against.
 *
 *
 * WHY THIS FILE IS SAFE UNDER `scripts/`, AND `mutation-gate.test.mjs` IS NOT.
 *
 * That file carries a warning: the mutation gate RUNS VITEST, so a test that
 * drove it into its baseline run would spawn a suite containing itself, for
 * ever. Nothing here spawns anything. The gate is pure filesystem reads and
 * string parsing, so it can be called directly and exercised on every path,
 * including the ones that fail. The constraint next door is about `execFileSync`
 * and recursion, not about `scripts/` being off-limits.
 */

const FIXTURE = resolve(ROOT, '.reachability-fixture')

function fixture(files) {
  rmSync(FIXTURE, { recursive: true, force: true })
  for (const [path, source] of Object.entries(files)) {
    const full = join(FIXTURE, path)
    mkdirSync(resolve(full, '..'), { recursive: true })
    writeFileSync(full, source)
  }
  return {
    name: 'fixture',
    root: '.reachability-fixture',
    entries: ['.reachability-fixture/entry.ts'],
  }
}

afterEach(() => rmSync(FIXTURE, { recursive: true, force: true }))

describe('the repository itself', () => {
  it('has no orphan modules and no unreachable exports', () => {
    const { failed, text } = report(runAll())
    expect(text).toContain('REACHABILITY GATE: PASS')
    expect(failed).toBe(false)
  })

  it('actually scanned something, rather than passing on an empty file list', () => {
    /* The vacuity check. A glob that matched nothing would report PASS above
       with total confidence, so the count is asserted separately. */
    for (const area of runAll()) {
      expect(area.files.length).toBeGreaterThan(5)
      expect(area.reached.length).toBeGreaterThan(5)
    }
  })

  it('names src/agent/index.ts as the sole entry, not the loop', () => {
    /* Regression guard on the subtlest way this gate could be defeated. When
       `loop.ts` was an entry, the loop was reachable from itself and the
       missing composition root --- nobody anywhere constructing its ports ---
       produced no finding at all. */
    const agent = MANIFEST.find((a) => a.name === 'agent')
    expect(agent.entries).toContain('src/agent/index.ts')
    expect(agent.entries).not.toContain('src/agent/kernel/loop.ts')
  })
})

describe('orphan detection', () => {
  it('passes a tree where everything is reachable', () => {
    const area = fixture({
      'entry.ts': `import { used } from './used'\nexport function go() { return used() }\n`,
      'used.ts': `export function used() { return 1 }\n`,
    })
    const out = analyze(area)
    expect(out.orphans).toEqual([])
    expect(out.deadExports).toEqual([])
  })

  it('FAILS on a module imported only by its own test --- the original bug', () => {
    const area = fixture({
      'entry.ts': `export function go() { return 1 }\n`,
      'orphan.ts': `export function neverRuns() { return 2 }\n`,
      'orphan.test.ts': `import { neverRuns } from './orphan'\nneverRuns()\n`,
    })
    const out = analyze(area)
    expect(out.orphans).toEqual(['.reachability-fixture/orphan.ts'])
    expect(report([out]).failed).toBe(true)
  })

  it('does not let a test file launder a module into reachability', () => {
    /* The same shape one hop further out: the test imports a middleman that
       imports the orphan. If test files counted as edges, both would look
       connected. */
    const area = fixture({
      'entry.ts': `export function go() { return 1 }\n`,
      'middle.ts': `import { deep } from './deep'\nexport const middle = deep\n`,
      'deep.ts': `export function deep() { return 3 }\n`,
      'middle.test.ts': `import { middle } from './middle'\nmiddle()\n`,
    })
    const out = analyze(area)
    expect(out.orphans).toContain('.reachability-fixture/middle.ts')
    expect(out.orphans).toContain('.reachability-fixture/deep.ts')
  })

  it('refuses an entry point that does not exist rather than reporting PASS', () => {
    fixture({ 'entry.ts': `export const a = 1\n` })
    expect(() =>
      analyze({
        name: 'fixture',
        root: '.reachability-fixture',
        entries: ['.reachability-fixture/nope.ts'],
      }),
    ).toThrow(/entry point does not exist/)
  })

  it('refuses a test file as an entry point', () => {
    fixture({ 'entry.ts': `export const a = 1\n`, 'x.test.ts': `export const b = 2\n` })
    expect(() =>
      analyze({
        name: 'fixture',
        root: '.reachability-fixture',
        entries: ['.reachability-fixture/x.test.ts'],
      }),
    ).toThrow(/entry point does not exist or is a test file/)
  })
})

describe('dead export detection', () => {
  it('calls an export LIVE when its own module uses it internally', () => {
    /* `rank()` in knowledge.ts is exported so its rules can be tested directly
       and is called by `research()` beside it. Calling that dead would train
       everyone to ignore this gate, which is worse than not having it. */
    const area = fixture({
      'entry.ts': `import { outer } from './m'\nexport const go = outer\n`,
      'm.ts': `export function inner() { return 1 }\nexport function outer() { return inner() }\n`,
    })
    expect(analyze(area).deadExports).toEqual([])
  })

  it('calls a helper DEAD when the only thing referencing it is itself dead', () => {
    /* The case a naive "is it referenced anywhere" check gets wrong: `helper`
       IS referenced, by a function no entry point can reach. */
    const area = fixture({
      'entry.ts': `import { used } from './m'\nexport const go = used\n`,
      'm.ts': `export function helper() { return 1 }
export function stranded() { return helper() }
export function used() { return 2 }
`,
    })
    const dead = analyze(area).deadExports.map((d) => d.name).sort()
    expect(dead).toEqual(['helper', 'stranded'])
  })

  /* `export default` was invisible to this gate.

     DECL_RE requires a declaration keyword straight after `export`, and
     `default` is not one of them, so `export default function x() {}` produced
     no symbol at all -- not a live one, not a dead one. A genuinely dead
     default export was planted in a reachable file and the gate answered
     `orphans: [] dead: [] warnings: []` and PASS. Seven shipping files in
     src/ use `export default`, so this was not a corner.

     The import side already speaks the right vocabulary: `parseClause` records
     a default import under the name `default`. Only the export side was
     missing, which is why the two never met. */

  it('calls a DEAD default export dead', () => {
    const area = fixture({
      'entry.ts': `import { used } from './m'\nexport const go = used\n`,
      'm.ts': `export function used() { return 2 }
export default function nobodyImportsThis() { return 1 }
`,
    })
    const dead = analyze(area).deadExports.map((d) => d.name)
    expect(dead).toEqual(['default'])
  })

  it('calls a default export LIVE when another module imports it', () => {
    /* The PAIR. Without it, reporting every default export as dead would
       satisfy the test above, and seven real files would light up red. */
    const area = fixture({
      'entry.ts': `import thing from './m'\nexport const go = thing\n`,
      'm.ts': `export default function whateverItIsCalled() { return 1 }\n`,
    })
    expect(analyze(area).deadExports).toEqual([])
  })

  it('does not treat the declared name of a default export as importable', () => {
    /* A default export is imported under whatever name the importer chooses,
       so its declared name is NOT an export anyone can ask for. Marking
       `whateverItIsCalled` as an exported name would report it dead on every
       file that uses `export default`, which is the cry-wolf direction. */
    const area = fixture({
      'entry.ts': `import thing from './m'\nexport const go = thing\n`,
      'm.ts': `export default function whateverItIsCalled() { return 1 }\n`,
    })
    const dead = analyze(area).deadExports.map((d) => d.name)
    expect(dead).not.toContain('whateverItIsCalled')
  })

  it('calls a default export dead even when a live comment says the word "default"', () => {
    /* CAUGHT BY THE TWO-WAY PROOF, NOT BY THE FIXTURES.

       Naming the symbol `default` made it collide with an ordinary English
       word. Propagation resurrects a symbol whose name matches `\bname\b`
       anywhere in a live symbol's span, so one live function whose COMMENT
       read "falls to the `conversation` default" was enough to mark the
       default export live. The unit fixtures passed and the same plant in
       `src/agent/communicate/communicate.ts` still sailed through the real
       gate.

       `default` is not an identifier anyone can write to reach that export --
       an importer binds it to a name of their own choosing. So it can be
       SEEDED by a real default import and must never be reached by text. */
    const area = fixture({
      'entry.ts': `import { used } from './m'\nexport const go = used\n`,
      'm.ts': `/* falls back to the conversation default when nothing matches */
export function used() { return 2 }
export default function nobodyImportsThis() { return 1 }
`,
    })
    const dead = analyze(area).deadExports.map((d) => d.name)
    expect(dead).toEqual(['default'])
  })

  it('treats a star import as consuming everything', () => {
    const area = fixture({
      'entry.ts': `import * as m from './m'\nexport const go = m\n`,
      'm.ts': `export const a = 1\nexport const b = 2\n`,
    })
    expect(analyze(area).deadExports).toEqual([])
  })

  it('resolves an aliased import to the name the target actually exports', () => {
    const area = fixture({
      'entry.ts': `import { build as makeIt } from './m'\nexport const go = makeIt\n`,
      'm.ts': `export function build() { return 1 }\n`,
    })
    expect(analyze(area).deadExports).toEqual([])
  })

  it('follows a multi-line import clause', () => {
    const area = fixture({
      'entry.ts': `import {\n  a,\n  type B,\n} from './m'\nexport const go = [a]\nexport type C = B\n`,
      'm.ts': `export const a = 1\nexport interface B { x: number }\n`,
    })
    expect(analyze(area).orphans).toEqual([])
    expect(analyze(area).deadExports).toEqual([])
  })
})

describe('parsing', () => {
  it('does not read a commented-out import as a real edge', () => {
    const area = fixture({
      'entry.ts': `// import { ghost } from './ghost'\nexport const go = 1\n`,
      'ghost.ts': `export const ghost = 1\n`,
    })
    expect(analyze(area).orphans).toEqual(['.reachability-fixture/ghost.ts'])
  })

  it('does not let a URL inside a string open a comment', () => {
    const src = `const u = 'https://example.com/x'\nimport { a } from './m'\n`
    expect(importsOf(src).map((i) => i.spec)).toContain('./m')
  })

  it('blanks a block comment while preserving offsets', () => {
    const src = 'a\n/* two\n   lines */\nb'
    const out = blankComments(src)
    expect(out.length).toBe(src.length)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    expect(out).toMatch(/^a\n/)
    expect(out.trimEnd().endsWith('b')).toBe(true)
  })

  it('reports a parse divergence instead of silently under-reporting edges', () => {
    /* A regex literal containing a quote can desynchronise the string scan.
       The gate cross-checks and warns rather than quietly missing an import,
       because a missed import shows up as a FALSE ORPHAN, and a gate that
       cries wolf gets switched off. */
    const area = fixture({
      'entry.ts': `const re = /['"]/\nimport { a } from './m'\nexport const go = a\n`,
      'm.ts': `export const a = 1\n`,
    })
    const out = analyze(area)
    /* Either it parsed correctly, or it said it could not. Never neither. */
    expect(out.orphans.length === 0 || out.warnings.length > 0).toBe(true)
  })

  it('finds every declaration form as an export', () => {
    const names = exportsOf(`export function f() {}
export async function g() {}
export const c = 1
export class K {}
export interface I { x: number }
export type T = string
export enum E { A }
`)
    expect(names.sort()).toEqual(['E', 'I', 'K', 'T', 'c', 'f', 'g'])
  })

  it('does not mistake a nested const for a top-level symbol', () => {
    const names = symbolsOf(`export function outer() {\n  const inner = 1\n  return inner\n}\n`).map(
      (s) => s.name,
    )
    expect(names).toEqual(['outer'])
  })

  it('promotes a name listed in a bare export block', () => {
    expect(exportsOf(`function f() {}\nexport { f }\n`)).toContain('f')
  })

  it('seeds unreachableExports from the imported set and no wider', () => {
    const src = `export function a() { return b() }\nexport function b() { return 1 }\nexport function c() { return 2 }\n`
    expect(unreachableExports(src, new Set(['a']))).toEqual(['c'])
    expect(unreachableExports(src, new Set()).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('the gate agrees with vitest about what a test file is', () => {
  /* THE BYPASS THIS CLOSES.
   *
   * `isTestFile` decides which files are NOT edges. If vitest ever runs a test
   * that the gate does not recognise as one, that file becomes a SOURCE file
   * whose imports count as reachability edges — and an orphan imported by it
   * is laundered into looking connected. That is the original bug wearing a
   * different hat, and it would arrive silently the day someone adds
   * `__tests__/**` or `*.spec.mts` to the vitest config.
   *
   * Two constants in two files that have to agree, with nothing checking that
   * they do, is the exact defect class that has bitten this repository four
   * times today: a mutation floor of 27 against a catalogue of 39, a file
   * floor pinned to a value that legitimately moves, a hardcoded catalogue
   * size that made the mutation suite recurse into itself. This is the same
   * shape, so it gets the same treatment: derived and asserted, not
   * remembered.
   */

  const CONFIG = resolve(ROOT, 'vite.config.ts')

  /** The `include:` globs from vitest's `test` block, not the deps one. */
  function vitestIncludes() {
    const src = readFileSync(CONFIG, 'utf8')
    /* Anchor on the src/ glob rather than on "include", because vite.config.ts
       contains a SECOND `include:` for optimizeDeps listing bare package
       names. Matching the wrong one would assert nothing and still pass. */
    const block = src.match(/include:\s*\[([^\]]*'src\/[^\]]*)\]/)
    if (!block) throw new Error('could not find the vitest test include block')
    return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  }

  it('recognises every path vitest would run under src/ as a test file', () => {
    const globs = vitestIncludes().filter((g) => g.startsWith('src/'))
    expect(globs.length).toBeGreaterThan(0)

    /* Turn each glob into a concrete example and check the gate agrees. A
       glob the gate does not classify as a test is a laundering channel. */
    for (const glob of globs) {
      const samples = expand(glob)
      expect(samples.length, `no sample generated for ${glob}`).toBeGreaterThan(0)
      for (const sample of samples) {
        expect(isTestFile(sample), `vitest runs ${sample} but the gate treats it as source`).toBe(
          true,
        )
      }
    }
  })

  it('still treats ordinary source files as source', () => {
    /* The other half. A classifier that answers "test" to everything would
       satisfy the check above and make the whole gate vacuous — every file
       would stop being an edge and nothing would ever be an orphan. */
    for (const path of [
      'src/agent/index.ts',
      'src/agent/kernel/loop.ts',
      'src/agent/kernel/contracts.ts',
      'src/canvas/render/FigureView.tsx',
    ]) {
      expect(isTestFile(path)).toBe(false)
    }
  })

  /** `src/**\/*.{test,spec}.{ts,tsx}` -> concrete paths, one per alternation. */
  function expand(glob) {
    const bodies = []
    const braces = [...glob.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].split(','))
    const combos = braces.reduce(
      (acc, options) => acc.flatMap((prefix) => options.map((o) => [...prefix, o])),
      [[]],
    )
    for (const combo of combos) {
      let i = 0
      bodies.push(glob.replace(/\{[^}]*\}/g, () => combo[i++]).replace(/\*\*\//g, 'a/').replace(/\*/g, 'x'))
    }
    return bodies
  }
})

describe('a type-only import is not a runtime edge', () => {
  /* THE BYPASS THAT DEFEATED THIS GATE, found by an adversarial pass after the
     gate was already green and already merged into a PR body as proof.
     Two lines appended to any reachable file made an orphan invisible:

         import type { neverCalled } from '../__orphan'
         void (0 as unknown as typeof neverCalled)

         reachability gate: PASS, 16/16
         grep the built bundle for the orphan: ABSENT

     tsc ERASES a type-only import. The parser stripped the `type` keyword and
     treated what was left as an ordinary import, so it had no representation
     for "this edge disappears at compile time" and could not have been right.

     Nobody writes that line to cheat. It is the ordinary way to import a type,
     which is why it had to be handled rather than trusted. */

  it('FAILS on a module reached only by `import type`', () => {
    const area = fixture({
      'entry.ts': `import type { Shape } from './orphan'\nexport const go = (x: Shape) => x\n`,
      'orphan.ts': `export interface Shape { x: number }\nexport function neverCalled() { return 1 }\n`,
    })
    expect(analyze(area).orphans).toEqual(['.reachability-fixture/orphan.ts'])
  })

  it('FAILS on a module reached only by `export type ... from`', () => {
    const area = fixture({
      'entry.ts': `export type { Shape } from './orphan'\nexport const go = 1\n`,
      'orphan.ts': `export interface Shape { x: number }\n`,
    })
    expect(analyze(area).orphans).toEqual(['.reachability-fixture/orphan.ts'])
  })

  it('FAILS when every specifier is individually marked `type`', () => {
    const area = fixture({
      'entry.ts': `import { type A, type B } from './orphan'\nexport const go: A | B = 1 as never\n`,
      'orphan.ts': `export type A = 1\nexport type B = 2\n`,
    })
    expect(analyze(area).orphans).toEqual(['.reachability-fixture/orphan.ts'])
  })

  it('PASSES a MIXED clause, because one real specifier still ships', () => {
    /* `{ type A, b }` erases A and keeps b. The module reaches the bundle, so
       calling it an orphan would be a false positive — and a gate that cries
       wolf gets switched off, which costs more than the hole. */
    const area = fixture({
      'entry.ts': `import { type A, b } from './used'\nexport const go = (x: A) => b\n`,
      'used.ts': `export type A = 1\nexport const b = 2\n`,
    })
    expect(analyze(area).orphans).toEqual([])
  })

  it('marks the edge typeOnly rather than discarding the names', () => {
    /* The names still matter for the dead-export check: a type genuinely
       consumed by a shipping file is not dead in the TypeScript sense, even
       though it contributes nothing at run time. */
    const [edge] = importsOf(`import type { Shape } from './orphan'\n`)
    expect(edge.spec).toBe('./orphan')
    expect(edge.names).toEqual(['Shape'])
    expect(edge.typeOnly).toBe(true)
  })

  it('does not mark an ordinary import as typeOnly', () => {
    const [edge] = importsOf(`import { thing } from './m'\n`)
    expect(edge.typeOnly).toBe(false)
  })

  it('treats a side-effect import as a real edge', () => {
    /* `import './x'` has no specifiers to be type-only about, and it runs. */
    const area = fixture({
      'entry.ts': `import './side'\nexport const go = 1\n`,
      'side.ts': `export const registered = 1\n`,
    })
    expect(analyze(area).orphans).toEqual([])
  })
})

describe('import syntax inside a string is not an edge', () => {
  /* The second hole. FROM_RE anchors on a line start against text where only
     comments had been blanked, so a documentation string containing import
     syntax minted an edge to a module nothing imports. One constant took
     reachability from 15/16 to 16/16. */

  it('FAILS on an orphan "imported" only inside a template literal', () => {
    const area = fixture({
      'entry.ts': `export const DOC = \`\nimport { neverCalled } from './orphan'\n\`\nexport const go = 1\n`,
      'orphan.ts': `export function neverCalled() { return 1 }\n`,
    })
    expect(analyze(area).orphans).toEqual(['.reachability-fixture/orphan.ts'])
  })

  it('still reads the specifier out of a REAL import, which is also a string', () => {
    /* The obvious over-correction: blanking every string destroys the thing
       the parser exists to read. Only template literals are blanked, because
       only they can span lines and put text at the start of one. */
    expect(importsOf(`import { a } from './m'\n`).map((i) => i.spec)).toEqual(['./m'])
  })

  it('preserves offsets when blanking a template literal', () => {
    const src = 'const a = `line one\nline two`\nconst b = 2'
    const out = blankStrings(src)
    expect(out.length).toBe(src.length)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    expect(out).toContain('const b = 2')
  })
})

describe('a backslash line-continuation cannot mint an edge either', () => {
  /* THE THIRD BYPASS, and the one that came from a WRONG PREMISE OF MINE.
     I wrote, in this file's own commit message, that quoted strings "cannot
     contain a raw newline, so their contents can never sit at a line start".
     That is false. A backslash line-continuation does exactly that, and it is
     ES5:

         const DOC = "\
         import { helperA } from './__orphanA'"

     One string, one value, and a real newline immediately before `import` —
     which is what FROM_RE's `(?:^|\n)` anchors on.

     Paired with two MUTUALLY-importing orphans, so neither has an unimported
     export and the dead-export check stays quiet, it produced:

         [agent] 17/17 source files reachable    PASS    exit 0
         grep dist/ for the orphans              ABSENT

     Neither half is a bypass alone. The string trick gives reachability but
     leaves the dead-export check firing; the mutual pair silences that check
     but cannot bootstrap its own reachability. Both of my checks were
     individually sound and the COMPOSITION was not, which is harder to see
     than either bug. */

  it('FAILS on an orphan reached only through a line-continued string', () => {
    const area = fixture({
      'entry.ts': `export const DOC = "\\\nimport { helperA } from './orphanA'"\nexport const go = 1\n`,
      'orphanA.ts': `import { helperB } from './orphanB'\nexport function helperA() { return helperB() }\n`,
      'orphanB.ts': `import { helperA } from './orphanA'\nexport function helperB() { return typeof helperA }\n`,
    })
    const out = analyze(area)
    expect(out.orphans).toContain('.reachability-fixture/orphanA.ts')
    expect(out.orphans).toContain('.reachability-fixture/orphanB.ts')
  })

  it('catches a mutually-importing pair on its own, with no string trick', () => {
    /* The half that already worked, pinned so a fix to the string half cannot
       break it. Reachability walks FORWARD from declared entries rather than
       asking "is anything importing this", so a cycle cannot bootstrap itself.
       That is the design decision this file's header defends, and it holds. */
    const area = fixture({
      'entry.ts': `export const go = 1\n`,
      'a.ts': `import { b } from './b'\nexport const a = b\n`,
      'b.ts': `import { a } from './a'\nexport const b = typeof a\n`,
    })
    const out = analyze(area)
    expect(out.orphans).toContain('.reachability-fixture/a.ts')
    expect(out.orphans).toContain('.reachability-fixture/b.ts')
  })

  it('STILL reads the specifier out of an ordinary quoted import', () => {
    /* The over-correction this fix had to avoid. The module specifier IS a
       quoted string, so blanking the whole class would destroy `m[2]` and the
       parser would see no imports at all — a gate that finds every file to be
       an orphan is as useless as one that finds none. Only literals carrying a
       continuation are blanked; a specifier never carries one. */
    expect(importsOf(`import { a } from './m'\n`).map((i) => i.spec)).toEqual(['./m'])
    expect(importsOf(`import { a } from "./m"\n`).map((i) => i.spec)).toEqual(['./m'])
  })

  it('leaves an ordinary quoted string untouched', () => {
    const src = `const msg = 'hello world'\nconst n = 1`
    expect(blankStrings(src)).toBe(src)
  })

  it('blanks a continued string while preserving length and lines', () => {
    const src = `const d = "a\\\nb"\nconst n = 1`
    const out = blankStrings(src)
    expect(out.length).toBe(src.length)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    expect(out).toContain('const n = 1')
    expect(out).not.toContain('b"')
  })

  it('does not hang or truncate on an unterminated string', () => {
    /* A real file can be mid-edit. The scanner must terminate and must not
       silently drop the rest of the file, which would hide every import
       below the bad line. */
    const out = blankStrings(`const bad = 'unterminated\nimport { x } from './m'`)
    expect(out.length).toBeGreaterThan(0)
    expect(() => importsOf(out)).not.toThrow()
  })
})

/* -------------------------------------------------------------------------- */

/*
 * THE QUESTION THE ORPHAN CHECK CANNOT ASK.
 *
 * `analyze()` walks an area from that area's OWN declared entry, so it answers
 * "is every file under src/agent reachable from src/agent/index.ts". It cannot
 * answer "is src/agent/index.ts reachable from anything that ships", because
 * nothing in MANIFEST describes the product: `src/main.tsx`, `src/App.tsx`,
 * `src/canvas` and `src/practice` are in no area and are never walked.
 *
 * That gap is not hypothetical. Seventeen required checks passed on 9ec5d81 --
 * reachability among them -- with the entire 11k-line `src/agent` imported by
 * nothing the product loads. The gate ran, reported PASS, and the area it was
 * built to police was an island. Declaring entries fixes vacuity at the FILE
 * level and moves it up one level: an unimported front door is unfalsifiable,
 * because the front door is exempt from the question by construction.
 *
 * The distinguishing question for any gate is "what would have to be true for
 * this to fail, and is that the thing I am afraid of?" For the orphan check the
 * answer is "a file inside src/agent that src/agent does not import". The thing
 * actually worth fearing is "src/agent, entire, that the product does not
 * import". Different sentences. This block tests the second one.
 *
 * Pairs, as above: every check has an input that must fail AND an input that
 * must pass. A product-reachability check asserted only to FAIL is satisfied by
 * `return false`, which is the same vacuity wearing the opposite sign.
 */
describe('area reachability from the product entry', () => {
  function productFixture(files) {
    rmSync(FIXTURE, { recursive: true, force: true })
    for (const [path, source] of Object.entries(files)) {
      const full = join(FIXTURE, path)
      mkdirSync(resolve(full, '..'), { recursive: true })
      writeFileSync(full, source)
    }
    return {
      manifest: [
        {
          name: 'island',
          root: '.reachability-fixture/area',
          entries: ['.reachability-fixture/area/index.ts'],
        },
      ],
      opts: {
        entry: '.reachability-fixture/main.tsx',
        root: '.reachability-fixture',
      },
    }
  }

  it('FAILS on the real repository, because src/agent ships to nobody', () => {
    /* The whole reason this check exists. If this ever goes green without
       someone deliberately wiring the agent into the product, the check has
       stopped measuring what it claims to measure. */
    const unreached = analyzeProductReachability()
    expect(unreached.map((u) => u.area)).toContain('agent')
  })

  it('PASSES when the product actually imports the area entry', () => {
    const { manifest, opts } = productFixture({
      'main.tsx': `import { go } from './area/index'\ngo()\n`,
      'area/index.ts': `export function go() { return 1 }\n`,
    })
    expect(analyzeProductReachability(manifest, opts)).toEqual([])
  })

  it('FAILS when nothing in the product imports the area entry', () => {
    const { manifest, opts } = productFixture({
      'main.tsx': `export const app = 1\n`,
      'area/index.ts': `export function go() { return 1 }\n`,
    })
    const unreached = analyzeProductReachability(manifest, opts)
    expect(unreached).toEqual([
      { area: 'island', unreachable: ['.reachability-fixture/area/index.ts'] },
    ])
  })

  it('does not let a test file launder an area into product reachability', () => {
    /* The original bug, one level up. A test importing the area entry is
       exactly the edge that made the orphans look connected. */
    const { manifest, opts } = productFixture({
      'main.tsx': `export const app = 1\n`,
      'area/index.ts': `export function go() { return 1 }\n`,
      'area/index.test.ts': `import { go } from './index'\ngo()\n`,
    })
    expect(analyzeProductReachability(manifest, opts)).toHaveLength(1)
  })

  it('does not count an `import type` edge as shipping the area', () => {
    /* tsc erases it, so the area contributes nothing to the bundle and is
       exactly as absent as one nobody imports at all. This is also the shape
       of the only apparent importer of src/agent in the real tree, which
       turned out to be a line inside a comment. */
    const { manifest, opts } = productFixture({
      'main.tsx': `import type { T } from './area/index'\nexport const x: T | null = null\n`,
      'area/index.ts': `export type T = { a: number }\n`,
    })
    expect(analyzeProductReachability(manifest, opts)).toHaveLength(1)
  })

  it('refuses an AREA entry that does not exist rather than reporting it UNREACHED', () => {
    /* Found by feeding this function three entries that did not exist. It
       reported all three UNREACHED -- a confident finding, over input it had
       never validated, that would send someone hunting an island that is not
       there.

       `analyze()` has always thrown on a missing area entry. This function
       checked only the PRODUCT entry and took the area's on trust, so the two
       halves of the same gate disagreed about whether a typo is a finding or
       an error. It is an error. "Not reachable" and "not a file" must never
       render as the same sentence. */
    const { opts } = productFixture({
      'main.tsx': `export const app = 1\n`,
      'area/index.ts': `export function go() { return 1 }\n`,
    })
    expect(() =>
      analyzeProductReachability(
        [
          {
            name: 'typo',
            root: '.reachability-fixture/area',
            entries: ['.reachability-fixture/area/indexx.ts'],
          },
        ],
        opts,
      ),
    ).toThrow(/area entry/)
  })

  it('refuses a product entry that does not exist rather than reporting PASS', () => {
    /* Fails closed, like the rest of the gate. A missing entry means the walk
       reached nothing, and "reached nothing" must never render as "everything
       is fine". */
    const { manifest } = productFixture({
      'main.tsx': `export const app = 1\n`,
      'area/index.ts': `export function go() { return 1 }\n`,
    })
    expect(() =>
      analyzeProductReachability(manifest, {
        entry: '.reachability-fixture/does-not-exist.tsx',
        root: '.reachability-fixture',
      }),
    ).toThrow(/product entry/)
  })

  it('follows a dynamic import(), because a lazy chunk genuinely ships', () => {
    /* ALREADY TRUE, PREVIOUSLY UNASSERTED. The product reaches its two largest
       areas through a dynamic import, not a static one:

           App.tsx:30  React.lazy(() => import('./canvas/CanvasRoute'))
           App.tsx:36  React.lazy(() => import('./practice/PracticeView'))

       Those are code-split chunks that absolutely ship -- they arrive when the
       route opens. A walker following only `... from '...'` would stop at
       App.tsx and call both areas orphans in the SAME words it uses for the
       real src/agent finding, and one indistinguishable false positive beside
       a true one is how a gate gets switched off.

       `importsOf` already handles `import()` and yields a star edge for it, so
       this passed the moment it was written. That is exactly why it is worth
       pinning: nothing asserted it, so nothing would have caught a future
       narrowing of the scanner that quietly reintroduced the false positive. */
    const { manifest, opts } = productFixture({
      'main.tsx': `const Lazy = React.lazy(() => import('./area/index'))\nexport default Lazy\n`,
      'area/index.ts': `export function go() { return 1 }\n`,
    })
    expect(analyzeProductReachability(manifest, opts)).toEqual([])
  })

  it('still refuses a `import type` edge after learning about import()', () => {
    /* The pair. Widening the walker must not widen it onto erased edges --
       otherwise the fix for the false positive manufactures a false negative. */
    const { manifest, opts } = productFixture({
      'main.tsx': `import type { T } from './area/index'\nexport const x: T | null = null\n`,
      'area/index.ts': `export type T = { a: number }\n`,
    })
    expect(analyzeProductReachability(manifest, opts)).toHaveLength(1)
  })

  it('leaves the default report untouched, so this lands without flipping main red', () => {
    /* Deliberate. The finding is real and merge-blocking, and turning a
       required check red across every open PR is the repo owner's call, not
       this file's. The instrument is built and proven; arming it is a
       separate decision. */
    const { failed, text } = report(runAll())
    expect(failed).toBe(false)
    expect(text).not.toContain('UNREACHED')
  })

  it('reports the finding when explicitly asked for it', () => {
    const { failed, text } = report(runAll(), {
      productReachability: analyzeProductReachability(),
    })
    expect(failed).toBe(true)
    expect(text).toContain('UNREACHED')
    expect(text).toContain('agent')
  })
})

describe('importsOf: clause bounding without semicolons', () => {
  it('does not swallow an interface body into a later re-export', () => {
    const src = [
      'export interface Config {',
      '  a: string',
      '}',
      "export { thing } from './mod'",
    ].join('\n')
    const found = importsOf(src)
    const mod = found.find((f) => f.spec === './mod')
    expect(mod).toBeDefined()
    expect(mod.names).toEqual(['thing'])
  })

  it('still parses a multi-line import clause, which is what [^;] was protecting', () => {
    const src = ['import {', '  a,', '  b,', "} from './x'"].join('\n')
    const found = importsOf(src)
    expect(found.find((f) => f.spec === './x').names).toEqual(['a', 'b'])
  })

  /* The minimal cut is TWO conditions, not three. A brace block only makes the
     corruption obvious; without one the clause still runs away and quietly adds
     a phantom `default` import, which is the more dangerous shape because it
     looks like a legitimate parse. Found by testing the "safe" cases rather
     than trusting that they were safe. */
  it('does not invent a default import from a preceding export statement', () => {
    const src = ['export const n = 1', "export { t } from './m'"].join('\n')
    expect(importsOf(src).find((f) => f.spec === './m').names).toEqual(['t'])
  })

  it('parses cleanly when either condition of the cut is absent', () => {
    const withSemis = ['export interface C {', '  a: string;', '};', "export { t } from './m'"].join('\n')
    const notExportKw = ['const x = {', '  a: 1', '}', "export { t } from './m'"].join('\n')
    for (const src of [withSemis, notExportKw]) {
      expect(importsOf(src).find((f) => f.spec === './m').names).toEqual(['t'])
    }
  })
})

describe('the summary ratio measures the area, not the whole walk', () => {
  const AREA = resolve(ROOT, '.ratio-area')
  const OUTSIDE = resolve(ROOT, '.ratio-outside')

  afterEach(() => {
    rmSync(AREA, { recursive: true, force: true })
    rmSync(OUTSIDE, { recursive: true, force: true })
  })

  function twoDirs(areaFiles, outsideFiles) {
    rmSync(AREA, { recursive: true, force: true })
    rmSync(OUTSIDE, { recursive: true, force: true })
    for (const [dir, files] of [[AREA, areaFiles], [OUTSIDE, outsideFiles]]) {
      for (const [path, source] of Object.entries(files)) {
        const full = join(dir, path)
        mkdirSync(resolve(full, '..'), { recursive: true })
        writeFileSync(full, source)
      }
    }
    return { name: 'ratio', root: '.ratio-area', entries: ['.ratio-area/entry.ts'] }
  }

  it("does not count a file from another area as one of this area's own", () => {
    const area = twoDirs(
      { 'entry.ts': "import { h } from '../.ratio-outside/helper'\nexport const a = h\n" },
      { 'helper.ts': 'export const h = 1\n' },
    )
    const { text } = report([analyze(area)])
    expect(text).toContain('[ratio] 1/1 source files reachable from entry points')
  })

  it('drops the numerator when a file in the area is unreachable, so the ratio can still say something is wrong', () => {
    const area = twoDirs(
      {
        'entry.ts': "import { h } from '../.ratio-outside/helper'\nexport const a = h\n",
        'orphan.ts': 'export const stranded = 2\n',
      },
      { 'helper.ts': 'export const h = 1\n' },
    )
    const { text } = report([analyze(area)])
    expect(text).toContain('[ratio] 1/2 source files reachable from entry points')
  })
})
