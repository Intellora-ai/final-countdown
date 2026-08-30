import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { interpret } from './interpret'

/*
 * LAWS FOR THE QUERY INTERPRETER, ASSERTED AGAINST INPUT NOBODY WROTE DOWN.
 *
 * `interpret` turns free text into a search plan. It is one of three widest
 * free-text entry points in the product and had no property test.
 *
 * WHY THERE IS NO DOMAIN-SHAPED GENERATOR HERE, WHEN `understand` NEEDED ONE
 * -------------------------------------------------------------------------
 * Measured first, 1,000 runs per generator, on `shouldSearch === true`:
 *
 *   grapheme  85.6%     binary  41.8%     NASTY  55.0%     all three  71.8%
 *
 * Plain random text already reaches the branch two times in three, so the laws
 * below are genuinely exercised by generated input rather than by a hand-written
 * list. `understand` measured 2.5% on the same treatment and needed fragments
 * assembled by the machine to become meaningful. Same discipline, opposite
 * conclusion -- which is the point of measuring instead of assuming.
 *
 * A NOTE ON THE FIRST MEASUREMENT, BECAUSE IT WAS WRONG
 * ----------------------------------------------------
 * The probe first counted `intent !== 'none'` and reported a flat 100% for all
 * four generators. That is the shape of a number that is not measuring
 * anything, and it was: refusal is signalled by `shouldSearch: false`, while
 * `intent` is set to `'factual'` as a placeholder EVEN ON A REFUSAL
 * (`interpret.ts:299`). Four unrelated generators agreeing exactly should
 * always be read as a broken instrument before it is read as a result.
 */

/** Known-nasty as a BIAS only. `oneof` still draws true strings most of the
 *  time -- `constantFrom` alone would be an enumeration in property clothes. */
const NASTY = fc.constantFrom(
  'hi',
  'ok',
  'asdf',
  '???',
  '👍',
  'مرحبا',
  '',
  '   ',
  'a'.repeat(5_000),
  '2 + 2',
  'the a of an',
)

/*
 * `fc.fullUnicodeString()` does not exist in fast-check 4.4.0 -- it was removed
 * in v4 and fails at COLLECTION time, which vitest reports as "no tests": a
 * file that silently never runs. `string({ unit })` is the v4 spelling.
 */
const ANY_QUERY = fc.oneof(
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: 'binary' }),
  NASTY,
)

/*
 * A SECOND GENERATOR, ADDED BECAUSE THE GUARD CAUGHT A VACUOUS PROPERTY.
 *
 * The `requireFresh` law below first ran against `ANY_QUERY` and reported:
 *
 *   vacuous — a fresh-results demand held for 0.00% of inputs
 *
 * Zero. Random text is never time-sensitive, so that property was asserting
 * nothing at all across a thousand runs and would have shipped green -- which
 * is precisely the failure `scripts/check_vacuity.py` exists to catch, arriving
 * here in TypeScript.
 *
 * THE FIX IS MORE INPUTS THAT REACH THE BRANCH, NEVER A LOWER FLOOR. Lowering
 * it to make the guard pass is the same move as weakening a test: the check
 * survives and stops checking. So: time words the machine combines, not
 * sentences a person wrote.
 */
const WHEN = fc.constantFrom(
  'latest', 'today', 'this week', 'right now', 'current', 'recent',
  'breaking', 'in 2026', 'yesterday', 'this month', 'up to date',
)
const SUBJECT = fc.constantFrom(
  'news on the budget', 'bitcoin price', 'the weather in delhi',
  'react release', 'exam results', 'the election', 'petrol prices',
)
const TIMELY = fc
  .tuple(WHEN, SUBJECT)
  .map(([when, subject]) => `${when} ${subject}`)

/** Everything above, plus queries that can actually be time-sensitive. Used by
 *  the freshness law only; the others are already well above the floor without
 *  it, and diluting them would weaken measurements that are already honest. */
const ANY_OR_TIMELY = fc.oneof(ANY_QUERY, TIMELY)

/** The vacuity floor, copied from `scripts/check_vacuity.py`, which gates on
 *  exactly this: "reject specs whose precondition is (almost) never
 *  satisfiable." */
const REACHED_FLOOR = 0.01

function assertReached(label: string, reached: number, total: number): void {
  const rate = total === 0 ? 0 : reached / total
  const pct = `${(rate * 100).toFixed(2)}%`
  console.log(
    rate < REACHED_FLOOR
      ? `vacuous — ${label} held for ${pct} of inputs`
      : `reachable — ${label} held for ${pct} of inputs`,
  )
  expect(
    rate,
    `${label}: reached for ${pct} of inputs, so the assertion never ran and ` +
      `this property proved nothing. The fix is more inputs that reach the ` +
      `branch, never a lower floor.`,
  ).toBeGreaterThanOrEqual(REACHED_FLOOR)
}

describe('interpret, against input nobody wrote down', () => {
  it('never throws, whatever arrives', () => {
    /* Everything downstream assumes this returns. A throw here takes the search
       down before any fallback can run. */
    fc.assert(
      fc.property(ANY_QUERY, (query) => {
        expect(() => interpret(query)).not.toThrow()
      }),
      { numRuns: 1_000 },
    )
  })

  it('never refuses without saying why', () => {
    /*
     * THE LAW THIS WHOLE PLAN IS BUILT ON, at this boundary: no branch may
     * produce a verdict it has no evidence for. A refusal with no reason is
     * exactly that -- the caller is told "no" and given nothing to act on, and
     * `noSearchReason` exists precisely so "it didn't search" is a debuggable
     * decision rather than a silent absence.
     */
    let refused = 0
    let total = 0

    fc.assert(
      fc.property(ANY_QUERY, (query) => {
        total += 1
        const req = interpret(query)
        if (req.shouldSearch) return
        refused += 1
        expect(
          req.noSearchReason,
          `refused ${JSON.stringify(query.slice(0, 40))} with no reason recorded`,
        ).toBeDefined()
      }),
      { numRuns: 1_000 },
    )

    assertReached('a refusal', refused, total)
  })

  it('never invents an entity the query does not contain', () => {
    /*
     * `interpret.ts:81` states this as the contract: entities are "Substrings
     * of the query. Never expansions of it." An expansion is the search
     * equivalent of a fabricated citation -- the system would go looking for a
     * term the person never used and report back on it as though they had.
     *
     * Compared against the NORMALIZED query, which is what the extractor works
     * from: lowercased, invisible-stripped, whitespace-collapsed.
     */
    let withEntities = 0
    let total = 0

    fc.assert(
      fc.property(ANY_QUERY, (query) => {
        total += 1
        const req = interpret(query)
        if (req.entities.length === 0) return
        withEntities += 1
        for (const entity of req.entities) {
          expect(
            req.normalized.includes(entity),
            `invented the entity ${JSON.stringify(entity)}, which is not in ` +
              `${JSON.stringify(req.normalized.slice(0, 60))}`,
          ).toBe(true)
        }
      }),
      { numRuns: 1_000 },
    )

    assertReached('an extracted entity', withEntities, total)
  })

  it('never asks for fresh results without saying the query is time-sensitive', () => {
    /*
     * The pairing that keeps `requireFresh` honest. Demanding fresh sources is
     * a cost paid on every search; doing it while reporting `timeSensitivity:
     * 'none'` would be a demand with nothing behind it.
     */
    let fresh = 0
    let total = 0

    fc.assert(
      fc.property(ANY_OR_TIMELY, (query) => {
        total += 1
        const req = interpret(query)
        if (!req.requireFresh) return
        fresh += 1
        expect(
          req.timeSensitivity,
          `demanded fresh sources for ${JSON.stringify(query.slice(0, 40))} ` +
            `while reporting no time sensitivity`,
        ).not.toBe('none')
      }),
      { numRuns: 1_000 },
    )

    assertReached('a fresh-results demand', fresh, total)
  })

  /* ------------------------------------------------------------------------ */
  /* Counterexamples, promoted                                                */
  /* ------------------------------------------------------------------------ */

  /*
   * THE PROPERTY PROVES THE CLASS; THESE PROVE THESE ONES NEVER COME BACK.
   *
   * Both were produced by mutating `interpret.ts` on purpose and reading what
   * fast-check shrank to. A named example reads as a failure in a diff a year
   * from now; a seed does not. Both, not either.
   */

  it('refuses the empty query with a stated reason -- regression', () => {
    /* Commenting out `noSearchReason: reason` in the refuse object at
       `interpret.ts:307` was killed by:  Counterexample: [""]  --
       refused "" with no reason recorded: expected undefined to be defined */
    const req = interpret('')
    expect(req.shouldSearch, 'the fixture stopped reaching the refusal branch').toBe(false)
    expect(req.noSearchReason).toBeDefined()
  })

  it('extracts nothing that is not in the query -- regression', () => {
    /* Appending a term to `terms` was killed by:  Counterexample: ["ࠀ"]  --
       invented the entity "invented", which is not in "ࠀ". The shrinker found a
       single Samaritan letter, which is a better fixture than anything a person
       would have thought to write down. */
    const req = interpret('ࠀ')
    for (const entity of req.entities) {
      expect(req.normalized.includes(entity), `invented ${JSON.stringify(entity)}`).toBe(true)
    }
  })
})
