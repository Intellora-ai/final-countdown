/*
 * THE VERDICT PREDICATE, LIFTED OUT SO IT CAN BE TESTED.
 *
 * This is one expression. It lives in its own module for one reason:
 * `mutation-gate.mjs` has no main-guard and runs on import, and it runs vitest,
 * so a test that imported it would start a suite containing itself. Nothing in
 * the gate could reach this predicate from inside the test suite.
 *
 * A module with no side effects can be imported. That is the whole design.
 * Keep it that way: no I/O, no process access, no top-level statements beyond
 * these exports. The moment this file does something on import, it stops being
 * testable and so does the rule it holds.
 */

/*
 * `numTotalTests > 0` is load-bearing and not defensive noise.
 *
 * A scoped KILL skips the count check in the caller, because a subset
 * legitimately runs fewer tests than the baseline. That skip is safe only while
 * a kill means "a real test failed". If vitest ever counts a suite that failed
 * to LOAD as a failed test — a syntax break from a bad mutation — then a broken
 * file would record as a kill in a weak-test detector, which is the one
 * direction this gate must never be wrong in. Requiring that some test actually
 * ran costs nothing and closes it without depending on which way vitest counts.
 *
 * @param {{numFailedTests: number, numTotalTests: number} | null} report
 *   A parsed vitest JSON report, or null when the run produced none.
 * @returns {boolean} true when the scoped run alone is enough to call this a kill.
 */
export function isScopedKill(report) {
  return report !== null
    && report.numFailedTests > 0
    && report.numTotalTests > 0
}
