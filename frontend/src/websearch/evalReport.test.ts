import { describe, expect, it } from 'vitest'

import { evaluate, FLOORS, type Floors } from './evalReport'
import type { CaseResult, CorpusReport } from './corpus'
import { Latency } from './latency'

/**
 * The gate that turns benchmark numbers into a pass or a fail.
 *
 * WHY A GATE AND NOT A DASHBOARD
 * ------------------------------
 * A number nobody acts on is a number nobody reads. `corpus.ts` has been able
 * to produce precision and coverage for as long as it has existed and never
 * once refused anything, because nothing compared it to a floor.
 *
 * THE HARDEST TESTS HERE ARE THE ONES THAT REQUIRE IT TO FAIL
 * -----------------------------------------------------------
 * A gate asserted only to PASS is satisfied by `return true`, and would then
 * sit in CI reporting success for the rest of the repository's life. Every
 * floor below is tested in both directions, and a run that scored nothing at
 * all must FAIL rather than pass vacuously — an empty run and a perfect run
 * must never look the same.
 */

function caseResult(over: Partial<CaseResult> = {}): CaseResult {
  return {
    id: 'x',
    category: 'simple-factual',
    precision: 1,
    coverage: 1,
    status: 'supported',
    citationSupported: true,
    rounds: 0,
    freshLive: true,
    independentSources: 2,
    retrievedSources: 2,
    fetchFailures: 0,
    engineFailed: false,
    suspiciousSources: 0,
    ...over,
  }
}

function report(cases: readonly CaseResult[]): CorpusReport {
  const byCategory: CorpusReport['byCategory'] = {}
  for (const c of cases) {
    const bucket = (byCategory[c.category] ??= { cases: 0 })
    bucket.cases += 1
  }
  for (const key of Object.keys(byCategory)) {
    const mine = cases.filter((c) => c.category === key)
    const ps = mine.map((c) => c.precision).filter((n): n is number => n !== undefined)
    const cs = mine.map((c) => c.coverage).filter((n): n is number => n !== undefined)
    if (ps.length) byCategory[key]!.meanPrecision = ps.reduce((a, b) => a + b, 0) / ps.length
    if (cs.length) byCategory[key]!.meanCoverage = cs.reduce((a, b) => a + b, 0) / cs.length
  }
  return { cases, byCategory, latency: new Latency() }
}

const STRICT: Floors = { meanPrecision: 0.5, meanCoverage: 0.5, maxUnknown: 1, minCases: 1 }

/* -------------------------------------------------------------------------- */
/* It can pass                                                                */
/* -------------------------------------------------------------------------- */

describe('a healthy run passes', () => {
  it('clears every floor', () => {
    const v = evaluate(report([caseResult(), caseResult({ id: 'y' })]), STRICT)
    expect(v.ok).toBe(true)
    expect(v.failures).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* It can FAIL — the half that makes it a gate                                */
/* -------------------------------------------------------------------------- */

describe('a gate that cannot refuse is not a gate', () => {
  it('FAILS when mean precision drops below the floor, and names the category', () => {
    const v = evaluate(report([caseResult({ precision: 0.1 })]), STRICT)
    expect(v.ok).toBe(false)
    expect(v.failures.join(' ')).toContain('simple-factual')
    expect(v.failures.join(' ')).toContain('precision')
  })

  it('FAILS when mean coverage drops below the floor, and names the category', () => {
    const v = evaluate(report([caseResult({ coverage: 0.2 })]), STRICT)
    expect(v.ok).toBe(false)
    expect(v.failures.join(' ')).toContain('coverage')
  })

  it('FAILS when too many cases come back unknown', () => {
    const v = evaluate(
      report([
        caseResult({ status: 'unknown' }),
        caseResult({ id: 'b', status: 'unknown' }),
        caseResult({ id: 'c', status: 'unknown' }),
      ]),
      STRICT,
    )
    expect(v.ok).toBe(false)
    expect(v.failures.join(' ')).toContain('unknown')
  })

  it('FAILS when a citation is not supported by the page it names', () => {
    /* The worst output this system can produce is a wrong sentence wearing a
       citation. A run containing one must not be green. */
    const v = evaluate(report([caseResult({ citationSupported: false })]), STRICT)
    expect(v.ok).toBe(false)
    expect(v.failures.join(' ')).toContain('citation')
  })

  it('FAILS when the engine died, rather than scoring the empty result', () => {
    const v = evaluate(report([caseResult({ engineFailed: true })]), STRICT)
    expect(v.ok).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Vacuity — an empty run must not look like a perfect one                    */
/* -------------------------------------------------------------------------- */

describe('a run that measured nothing FAILS rather than passing quietly', () => {
  it('zero cases is a failure, not a pass', () => {
    const v = evaluate(report([]), STRICT)
    expect(v.ok).toBe(false)
    expect(v.failures.join(' ')).toContain('0 case')
  })

  it('fewer cases than the floor is a failure', () => {
    const v = evaluate(report([caseResult()]), { ...STRICT, minCases: 5 })
    expect(v.ok).toBe(false)
  })

  it('cases that produced NO measurable precision anywhere is a failure', () => {
    /* Every case ran and none of them could be scored. That is indistinguishable
       from a perfect run if you only look at "no floor was breached". */
    const v = evaluate(report([caseResult({ precision: undefined, coverage: undefined })]), STRICT)
    expect(v.ok).toBe(false)
    expect(v.failures.join(' ')).toContain('nothing measurable')
  })
})

/* -------------------------------------------------------------------------- */
/* The shipped floors                                                         */
/* -------------------------------------------------------------------------- */

describe('the floors that ship are real numbers, not zero', () => {
  it('every floor is above zero, so none of them is a no-op', () => {
    /* A floor of 0 passes everything and reads exactly like a floor. */
    expect(FLOORS.meanPrecision).toBeGreaterThan(0)
    expect(FLOORS.meanCoverage).toBeGreaterThan(0)
    expect(FLOORS.minCases).toBeGreaterThan(0)
  })
})
