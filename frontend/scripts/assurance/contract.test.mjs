import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { graduationMissing, loadContract, selfTest } from './contract.mjs'

/**
 * AG0 -- A CONTRACT EARNS AUTHORITY ONLY IF IT IS CONSISTENT.
 *
 * A contract can itself be wrong. The exact blind spot that hid the shelf bug
 * was an input nobody consciously placed -- so the self-test forbids any input
 * that is neither part of the identity nor a justified discard, and forbids a
 * field that is both relied on and discarded. A contract that fails any rule
 * has NO authority (default-false): it can neither block nor certify. This is
 * the base of the whole engine; if it can be fooled, everything above it can.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SHELF = new URL('../../assurance/contracts/shelf-matching.json', import.meta.url)

/** A minimal consistent contract, mutated per test to make it inconsistent. */
function aGoodContract() {
  return {
    decision: 'x',
    identity_site: { file: 'server/memory/lessons.ts', fn: 'findUnseen' },
    inputs: ['a', 'b', 'c'],
    identity: { fields: ['a', 'b'] },
    decision_relevant: ['a', 'b'],
    discarded: { c: 'a filter, justified' },
    distinguishing_pairs: [{ a: { a: '1' }, b: { a: '2' }, differ: true }],
    invariants: ['inv'],
    canaries: ['one'],
    assertions: { some_claim: { maturity: 'shadow', evidence: null } },
  }
}

describe('AG0 -- the contract self-test is the base of the engine', () => {
  it('the real shelf-matching contract is consistent', () => {
    const contract = JSON.parse(readFileSync(SHELF, 'utf8'))
    const verdict = selfTest(contract)
    expect(verdict.ok, `the real contract failed its own self-test: ${verdict.failures.join('; ')}`).toBe(true)
  })

  it('loadContract returns the contract and a passing self-test for a good file', () => {
    const { contract, selfTest: verdict } = loadContract(SHELF)
    expect(contract.decision).toBe('shelf_lookup')
    expect(verdict.ok).toBe(true)
  })

  it.each([
    ['a decision_relevant field not in inputs', (c) => { c.decision_relevant.push('ghost') }],
    ['an identity field not in inputs', (c) => { c.identity.fields.push('ghost') }],
    ['a field both relied on and discarded', (c) => { c.discarded.a = 'but a is decision_relevant' }],
    ['an input that is neither identity nor justified-discarded', (c) => { c.inputs.push('orphan') }],
    ['a distinguishing pair over a field that is not decision_relevant', (c) => { c.distinguishing_pairs[0].a = { z: '1' } }],
    ['a required assertion with no graduation evidence', (c) => { c.assertions.some_claim = { maturity: 'required', evidence: null } }],
    ['an empty canary name', (c) => { c.canaries.push('') }],
  ])('rejects: %s', (_why, breakIt) => {
    const c = aGoodContract()
    breakIt(c)
    const verdict = selfTest(c)
    expect(verdict.ok, 'an inconsistent contract was granted authority').toBe(false)
    expect(verdict.failures.length).toBeGreaterThan(0)
  })

  it('the real required assertion points at graduation evidence that actually exists (AG4)', () => {
    const contract = JSON.parse(readFileSync(SHELF, 'utf8'))
    const exists = (rel) => existsSync(fileURLToPath(new URL(`../../assurance/${rel}`, import.meta.url)))
    const missing = graduationMissing(contract, { exists })
    expect(missing, `a required assertion has no real graduation evidence: ${JSON.stringify(missing)}`).toEqual([])
  })

  it('a required assertion whose evidence file is missing is reported', () => {
    const c = aGoodContract()
    c.assertions.some_claim = { maturity: 'required', evidence: 'regressions/does/not/exist.json' }
    const missing = graduationMissing(c, { exists: () => false })
    expect(missing.map((m) => m.assertion)).toContain('some_claim')
  })

  it('a malformed file is refused, never trusted as empty', () => {
    const bad = new URL('./__does_not_exist__.json', import.meta.url)
    expect(() => loadContract(bad)).toThrow()
    expect(HERE.endsWith('assurance/')).toBe(true)
  })
})
