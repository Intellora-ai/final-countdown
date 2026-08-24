import { describe, expect, it } from 'vitest'

import { isScopedKill, shardsAreComplete } from './mutation-verdict.mjs'

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

/*
 * SHARD COMPLETENESS — the risk the empty-shard guard does NOT cover.
 *
 * `mutation-gate.mjs` selects with `MUTANTS.filter((_, at) => at % shardCount
 * === shardIndex - 1)`, a modulo stripe. That is complete only if every shard
 * from 1 to n actually runs, and nothing checks that it did.
 *
 * The empty-shard guard (`mutation-gate.mjs:941`) catches ONE shard that
 * selected nothing. `frontend-verdict` catches a shard that FAILED or was
 * CANCELLED, via `needs.frontend-mutation.result`. Between them they miss the
 * case that matters most:
 *
 *     the matrix declares 4 entries, the flag says `--shard=i/6`
 *     -> shards 5 and 6 never exist, shards 1-4 each select a real stripe,
 *        every job is green, and TWO THIRDS OF THE CATALOGUE NEVER RAN
 *
 * Every signal says success. No guard fires. The mutation gate — the one check
 * whose entire job is proving the tests are strong — would be reporting on work
 * it never did, which is the precise defect it exists to catch, in itself.
 *
 * This predicate is what makes that impossible: shards declare which mutant ids
 * they ran, and the verdict refuses unless the union is the whole catalogue.
 * It is a POSITIVE proof of coverage, not another guard against one way of
 * losing it.
 */

describe('shardsAreComplete', () => {
  /* A shard reports the WHOLE catalogue it was striped from, not just its own
   * slice. Without that the verdict can count a hole but never name what fell
   * in it, and "some mutant is missing" is not something anyone can act on. */
  const CATALOGUE = ['a', 'b', 'c', 'd', 'e', 'f']
  const manifest = (shard, of, ids, all = CATALOGUE) => ({ shard, of, all, ids })

  /* A catalogue of 6 striped across 3 shards: 1 gets a,d  2 gets b,e  3 gets c,f */
  const COMPLETE = [
    manifest(1, 3, ['a', 'd']),
    manifest(2, 3, ['b', 'e']),
    manifest(3, 3, ['c', 'f']),
  ]

  it('accepts a run where every shard reported and the union is the catalogue', () => {
    /* THE CONTROL. Without it, an implementation that refuses everything
     * passes every other test in this block and turns the gate permanently
     * red — which is its own failure, not a safe default. */
    expect(shardsAreComplete(COMPLETE)).toEqual({ ok: true, missing: [], reason: '' })
  })

  it('refuses when a shard never reported at all', () => {
    /* THE HEADLINE CASE. Shard 3 does not exist because the matrix is narrower
     * than the flag. Shards 1 and 2 are internally perfect. */
    const got = shardsAreComplete([manifest(1, 3, ['a', 'd']), manifest(2, 3, ['b', 'e'])])
    expect(got.ok).toBe(false)
    expect(got.reason).toMatch(/shard/i)
    expect(got.missing).toContain('c')
    expect(got.missing).toContain('f')
  })

  it('refuses when every shard reported but the union misses a mutant', () => {
    /* Each shard is present and non-empty, so both existing guards are silent.
     * Only counting the union finds the hole. */
    const got = shardsAreComplete([
      manifest(1, 3, ['a', 'd']),
      manifest(2, 3, ['b']),
      manifest(3, 3, ['c', 'f']),
    ])
    expect(got.ok).toBe(false)
    expect(got.missing).toEqual(['e'])
  })

  it('refuses when shards disagree about how many shards there are', () => {
    /* The matrix/flag mismatch seen from the other side: a stale runner from a
     * previous config reporting `of: 4` alongside `of: 3`. Trusting either
     * number silently picks a winner. */
    const got = shardsAreComplete([
      manifest(1, 3, ['a', 'd']),
      manifest(2, 4, ['b', 'e']),
      manifest(3, 3, ['c', 'f']),
    ])
    expect(got.ok).toBe(false)
    expect(got.reason).toMatch(/disagree|of/i)
  })

  it('refuses when shards disagree about the catalogue size', () => {
    /* A shard built from a different commit. Its stripe is right for a
     * catalogue this run does not have. */
    const got = shardsAreComplete([
      manifest(1, 3, ['a', 'd']),
      manifest(2, 3, ['b', 'e'], [...CATALOGUE, 'g', 'h', 'i']),
      manifest(3, 3, ['c', 'f']),
    ])
    expect(got.ok).toBe(false)
    expect(got.reason).toMatch(/catalogue|total/i)
  })

  it('refuses when two shards claim the same mutant', () => {
    /* An overlap means the stripe is broken, and a broken stripe both
     * duplicates and SKIPS. The union size can still look right, so counting
     * alone would wave this through: here 6 ids arrive but only 5 are distinct
     * and 'f' was never run by anyone. */
    const got = shardsAreComplete([
      manifest(1, 3, ['a', 'd']),
      manifest(2, 3, ['b', 'e']),
      manifest(3, 3, ['c', 'b']),
    ])
    expect(got.ok).toBe(false)
    expect(got.reason).toMatch(/twice|duplicate|overlap/i)
  })

  it('refuses a missing shard even when the union happens to be complete', () => {
    /* FOUND BY A SURVIVING MUTANT. Deleting this branch broke no test.

     * Shard 3 never reported, but shards 1 and 2 between them ran all six
     * mutants -- a duplicated matrix entry doing someone else's stripe. The
     * coverage is right BY LUCK, from a configuration that is wrong, and the
     * next catalogue change silently turns that luck into a hole.
     *
     * A right answer from a broken run must not be allowed to look healthy,
     * because nothing about it will still be right tomorrow. */
    const got = shardsAreComplete([
      manifest(1, 3, ['a', 'd', 'c', 'f']),
      manifest(2, 3, ['b', 'e']),
    ])
    expect(got.ok).toBe(false)
    expect(got.reason).toMatch(/shard\(s\) 3 never reported/)
  })

  it('refuses an empty report set instead of passing vacuously', () => {
    /* THE VACUITY CONTROL. No shard uploaded anything — an artifact step that
     * silently produced nothing. "Every mutant I heard about ran" is trivially
     * true of silence, and that is exactly how a gate reports success over work
     * it never did. */
    const got = shardsAreComplete([])
    expect(got.ok).toBe(false)
    expect(got.reason).toMatch(/no shard|nothing|empty/i)
  })
})
