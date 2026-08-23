import { describe, expect, it } from 'vitest'

import { isScopedKill } from './mutation-verdict.mjs'

/*
 * THE QUIET HALF OF 7c0c36a.
 *
 * That commit shipped two corrections. The empty-shard guard is the loud one:
 * `0 of 39 mutants` is obviously nothing, and it is covered by
 * mutation-gate.test.mjs at the process level.
 *
 * This is the other one, and it fails silently. A mutation can break a source
 * file badly enough that the suite does not LOAD. If vitest reports that as a
 * failed test, the gate reads "a test caught it" and scores a KILL. A weak-test
 * detector would then be claiming strength it does not have — a mutation
 * recorded as caught by tests that never ran. That is the one direction this
 * gate must never be wrong in, and unlike an empty shard it looks exactly like
 * a pass.
 *
 * Testing it needed the predicate out of mutation-gate.mjs. That file has no
 * main-guard, so importing it executes the gate, and the gate runs vitest, so
 * any test reaching this code path from inside the suite would recurse. The
 * extraction is what makes these five lines possible.
 */

/* The rule as it stood BEFORE 7c0c36a. Kept here as an executable record of
 * what changed: every case below that the two disagree on is a case the commit
 * fixed. A test that cannot show the old behaviour failing is not evidence. */
const before7c0c36a = (r) => r !== null && r.numFailedTests > 0

describe('isScopedKill', () => {
  it('is a kill when real tests ran and some failed', () => {
    expect(isScopedKill({ numFailedTests: 3, numTotalTests: 40 })).toBe(true)
  })

  it('is NOT a kill when the suite failed to load, even though failures are reported', () => {
    /* numTotalTests === 0 with failures > 0 is the load-failure shape: vitest
     * counted a failure for a suite in which no test ever executed. */
    const loadFailure = { numFailedTests: 1, numTotalTests: 0 }

    expect(isScopedKill(loadFailure)).toBe(false)

    /* The regression, stated rather than implied. The old rule called this a
     * kill. If this expectation ever flips, the guard has been reverted. */
    expect(before7c0c36a(loadFailure)).toBe(true)
  })

  it('is NOT a kill when tests ran and none failed', () => {
    expect(isScopedKill({ numFailedTests: 0, numTotalTests: 40 })).toBe(false)
  })

  it('is NOT a kill when nothing ran at all', () => {
    expect(isScopedKill({ numFailedTests: 0, numTotalTests: 0 })).toBe(false)
  })

  it('is NOT a kill when the run produced no report', () => {
    /* vitest() returns null when the JSON could not be parsed. A missing report
     * is an unknown, and an unknown must never score as a kill. */
    expect(isScopedKill(null)).toBe(false)
  })

  it('agrees with the old rule everywhere except the load failure', () => {
    /* Scoping the change: this is not a rewrite of the verdict, it is one
     * additional condition. Anything else diverging would be a scope error. */
    const cases = [
      { numFailedTests: 3, numTotalTests: 40 },
      { numFailedTests: 0, numTotalTests: 40 },
      { numFailedTests: 0, numTotalTests: 0 },
      null,
    ]

    for (const c of cases) {
      expect(isScopedKill(c)).toBe(before7c0c36a(c))
    }
  })
})
