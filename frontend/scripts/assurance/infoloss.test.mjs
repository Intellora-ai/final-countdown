import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { loadContract } from './contract.mjs'
import { infoloss, scanBody } from './infoloss.mjs'

/**
 * AG1 -- INFORMATION-LOSS TRIPWIRE (attack A, static).
 *
 * The cheapest attack: read the identity function's own source and check that
 * every field the contract says forms the decision's identity actually appears
 * in it. It catches the blatant shape of the shelf bug -- an identity function
 * that never even mentions `asked`.
 *
 * It is a TRIPWIRE, not the authority. A field could be aliased and still fool
 * the text scan; the runtime equivalence detector (AG2) is the deterministic
 * proof. Keeping A anyway buys a second, uncorrelated mechanism that needs no
 * execution -- it catches the bug even when the code cannot run.
 */

const SHELF = new URL('../../assurance/contracts/shelf-matching.json', import.meta.url)

/** The historical bug shape: findUnseen without `ask`. */
const BUGGED_SOURCE = `
  export function writtenLessons(store, recipe) {
    return {
      findUnseen(concept, spent) {
        const shelf = shelfFrom(store.read(keyFor(concept)))
        return Object.values(shelf).filter((one) => !spent.includes(one.route))[0] ?? null
      },
    }
  }
`

const FIXED_SOURCE = `
  export function writtenLessons(store, recipe) {
    return {
      findUnseen(concept, spent, ask) {
        const wanted = ask ?? 'teach'
        const shelf = shelfFrom(store.read(keyFor(concept)))
        return Object.values(shelf).filter((one) => (one.asked ?? 'teach') === wanted)[0] ?? null
      },
    }
  }
`

describe('AG1 -- the identity function must mention every identity field', () => {
  it('the real shelf identity function (findUnseen) mentions concept and ask', () => {
    const { contract } = loadContract(SHELF)
    const violations = infoloss(contract, {
      readFile: (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'),
    })
    expect(violations, `the live code lost an identity field: ${JSON.stringify(violations)}`).toEqual([])
  })

  it('reports the historical bug: findUnseen(concept, spent) has dropped `ask` (asked)', () => {
    const { contract } = loadContract(SHELF)
    const violations = infoloss(contract, { readFile: () => BUGGED_SOURCE })
    expect(violations.map((v) => v.field)).toContain('asked')
    expect(violations[0]).toMatchObject({ fn: 'findUnseen', file: 'server/memory/lessons.ts' })
  })

  it('the corrected shape passes', () => {
    const { contract } = loadContract(SHELF)
    const violations = infoloss(contract, { readFile: () => FIXED_SOURCE })
    expect(violations).toEqual([])
  })

  it('scanBody extracts a function body by balanced braces, ignoring an interface declaration of the same name', () => {
    const src = `
      interface X { findUnseen(concept, spent, ask): Written | null }
      function elsewhere() { return 1 }
      export function real() { return { findUnseen(concept, spent, ask) { return ask } } }
    `
    const body = scanBody(src, 'findUnseen')
    expect(body).not.toBeNull()
    expect(body).toContain('return ask')
    expect(body).not.toContain('Written | null')
  })
})
