/**
 * P10-T1/T2 — a types-only module imported by reachable code is LIVE.
 *
 * THE PROBLEM THE RULE FIXES
 * --------------------------
 * TypeScript erases `import type`, so the gate skips type-only edges: a module
 * reached only that way ships nothing. Correct for a module with runtime code,
 * and IMPOSSIBLE for a module that has none.
 *
 * `src/agent/kernel/contracts.ts` has 31 type exports and 0 value exports.
 * There is no arrangement of imports that makes it product-reachable, because
 * every legitimate import of it is a type import. So it was declared a MANIFEST
 * entry to keep the gate quiet — and the comment at `reachability-gate.mjs:78`
 * justified that by saying things outside the area import its types, which was
 * a claim about imports the gate was not allowed to follow.
 *
 * A rule a file can never satisfy is not a rule, it is an exemption with
 * paperwork. This teaches the gate the third answer it was missing.
 *
 * THE RULE, STATED PRECISELY
 * --------------------------
 *   A module with ZERO value exports and at least one type export is LIVE when
 *   reachable code imports it, by a type-only edge or otherwise.
 *
 * It is deliberately narrow. A module with even one value export is NOT covered
 * — that module can be reached normally, and letting it in through this door
 * would hide exactly the orphan the gate exists to find.
 *
 * BOTH DIRECTIONS ARE TESTED. A rule asserted only to make things reachable is
 * satisfied by "everything is reachable", which is the gate switched off.
 */

import { describe, expect, it } from 'vitest'

import { isTypesOnlyModule } from './reachability-gate.mjs'

describe('isTypesOnlyModule', () => {
  it('is true for a module of only type exports', () => {
    const src = `
export type Foo = { a: number }
export interface Bar { b: string }
`
    expect(isTypesOnlyModule(src)).toBe(true)
  })

  it('is FALSE when a single value export exists', () => {
    /*
     * The load-bearing half. One `export const` means the module ships runtime
     * code, so a normal import can reach it and the exemption must not apply.
     * Without this assertion the rule would launder every orphan in the repo.
     */
    const src = `
export type Foo = { a: number }
export const DEFAULT_FOO: Foo = { a: 1 }
`
    expect(isTypesOnlyModule(src)).toBe(false)
  })

  it.each([
    ['export function f() {}', 'function'],
    ['export class C {}', 'class'],
    ['export let x = 1', 'let'],
    ['export var y = 2', 'var'],
    ['export default 3', 'default'],
  ])('is FALSE for a module exporting a %s', (line) => {
    expect(isTypesOnlyModule(`export type T = number\n${line}\n`)).toBe(false)
  })

  it('is FALSE for a module with no exports at all', () => {
    /*
     * An empty module is not "types-only", it is empty. Calling it types-only
     * would make every stub file permanently live.
     */
    expect(isTypesOnlyModule('const private = 1\n')).toBe(false)
  })

  it('is not fooled by the word "type" inside a string or comment', () => {
    const src = `
// export const type = 'not real'
const s = "export const type = 'also not real'"
export type Real = number
`
    expect(isTypesOnlyModule(src)).toBe(true)
  })

  it('treats "export type {...}" re-exports as type exports', () => {
    expect(isTypesOnlyModule(`export type { A } from './a'\n`)).toBe(true)
  })

  it('treats a value re-export as a value export', () => {
    /*
     * `export { thing } from './x'` ships runtime code even though this file
     * declares nothing itself. Reading it as types-only would exempt every
     * barrel file in the repository.
     */
    expect(isTypesOnlyModule(`export { thing } from './x'\n`)).toBe(false)
  })
})
