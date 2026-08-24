import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  analyze,
  blankComments,
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
