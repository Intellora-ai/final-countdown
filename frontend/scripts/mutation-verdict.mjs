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

/*
 * SHARD COMPLETENESS — a POSITIVE proof that the whole catalogue ran.
 *
 * WHY THE TWO EXISTING GUARDS ARE NOT ENOUGH.
 *
 * `mutation-gate.mjs` stripes with `at % shardCount === shardIndex - 1`, which
 * is complete only if every shard from 1 to n actually runs. Two things watch
 * that today and neither covers the case that matters:
 *
 *   the empty-shard guard      catches ONE shard that selected nothing
 *   `needs.frontend-mutation`  catches a shard that FAILED or was CANCELLED
 *
 * Neither sees a matrix declaring 4 entries while the flag says `--shard=i/6`.
 * Shards 5 and 6 simply never exist, shards 1-4 each select a real non-empty
 * stripe, every job is green, and two thirds of the catalogue never ran. The
 * one check whose whole purpose is proving the tests are strong would be
 * reporting on work it never did.
 *
 * So this does not add a third guard against a third way of losing coverage.
 * It asserts the coverage directly: the union of what the shards say they ran
 * must BE the catalogue. Any way of losing a mutant fails it, including ways
 * nobody has thought of yet.
 *
 * ORDER IS DELIBERATE. Disagreements about the shape of the run are reported
 * before the contents, because a disagreeing set has no single catalogue to
 * measure against and "3 mutants missing" from a mismatched pair of runs sends
 * the reader after the wrong thing entirely.
 *
 * PURE, like `isScopedKill` above, and for the same reason: no I/O, no process
 * access, nothing that runs on import. The caller reads the files.
 *
 * @param {Array<{shard: number, of: number, all: string[], ids: string[]}>} manifests
 *   One entry per shard that reported, each carrying the whole catalogue it was
 *   striped from and the ids it actually ran.
 * @returns {{ok: boolean, missing: string[], reason: string}}
 */
export function shardsAreComplete(manifests) {
  /* SILENCE IS NOT SUCCESS. "Every mutant I heard about ran" is vacuously true
   * of an empty list, and an upload step that quietly produced nothing is a
   * real failure mode -- the exact shape of a gate passing over work it never
   * did. */
  if (!Array.isArray(manifests) || manifests.length === 0) {
    return { ok: false, missing: [], reason: 'no shard reported at all' }
  }

  const counts = [...new Set(manifests.map((m) => m.of))]
  if (counts.length !== 1) {
    return {
      ok: false,
      missing: [],
      reason: `shards disagree on how many shards exist: of=${counts.sort().join(', ')}`,
    }
  }

  const catalogues = [...new Set(manifests.map((m) => JSON.stringify([...m.all].sort())))]
  if (catalogues.length !== 1) {
    return {
      ok: false,
      missing: [],
      reason: 'shards disagree on the catalogue they were striped from',
    }
  }

  const expected = manifests[0].of
  const seen = manifests.map((m) => m.shard)
  const absent = Array.from({ length: expected }, (_, i) => i + 1).filter((n) => !seen.includes(n))

  /* Duplicates before gaps: an id claimed twice means the stripe is broken, and
   * a broken stripe drops one mutant for every one it repeats. Reporting only
   * the gap would describe the symptom and hide the cause. */
  const everyId = manifests.flatMap((m) => m.ids)
  const twice = [...new Set(everyId.filter((id, at) => everyId.indexOf(id) !== at))].sort()
  if (twice.length > 0) {
    return {
      ok: false,
      missing: [],
      reason: `stripe is broken -- mutant(s) claimed twice by different shards: ${twice.join(', ')}`,
    }
  }

  const ran = new Set(everyId)
  const missing = manifests[0].all.filter((id) => !ran.has(id))
  if (missing.length > 0) {
    const why = absent.length > 0
      ? `shard(s) ${absent.join(', ')} never reported`
      : 'every shard reported, but the union is short'
    return { ok: false, missing, reason: `${why}; ${missing.length} mutant(s) never ran` }
  }

  /* A shard can be absent while the union is still whole -- a duplicated matrix
   * entry covering its stripe. That is a broken configuration reporting a right
   * answer by luck, and it must not be allowed to look healthy. */
  if (absent.length > 0) {
    return { ok: false, missing: [], reason: `shard(s) ${absent.join(', ')} never reported` }
  }

  return { ok: true, missing: [], reason: '' }
}
