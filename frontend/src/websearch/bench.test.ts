import { describe, expect, it } from 'vitest'

import { formatReport } from './bench'
import type { CaseResult, CorpusReport } from './corpus'
import { FLOORS } from './evalReport'
import { Latency } from './latency'

/**
 * THE BENCHMARK HAS TO SAY WHETHER IT PASSED, NOT ONLY WHAT IT MEASURED.
 *
 * `formatReport` printed precision, coverage, latency and independent sources
 * and stopped there. `evalReport.evaluate()` holds the declared floors and the
 * sentence-per-breach, and its only caller was `evalGate.test.ts` — so the
 * numbers were printed for a human to compare against floors they could not
 * see, and the module that knows the floors was reachable from no shipping
 * file at all.
 *
 * Both tests below are needed and neither is sufficient. A report asserted only
 * to NAME breaches is satisfied by printing every category unconditionally; a
 * report asserted only to say PASS is satisfied by never checking anything.
 * Together they pin that the verdict tracks the numbers.
 */

function caseAt(id: string, over: Partial<CaseResult> = {}): CaseResult {
  return {
    id,
    category: 'simple-factual',
    precision: 0.9,
    coverage: 0.9,
    outcome: 'answered',
    distortions: [],
    status: 'supported',
    citationSupported: true,
    rounds: 1,
    freshLive: true,
    independentSources: 2,
    retrievedSources: 2,
    ...over,
  } as CaseResult
}

function reportWith(meanPrecision: number, meanCoverage: number): CorpusReport {
  /* Enough cases to clear `minCases`, so the only thing under test is the
     floor being compared — not the vacuity guard standing in front of it. */
  const cases = Array.from({ length: FLOORS.minCases }, (_, i) => caseAt(`c${i}`))
  return {
    cases,
    byCategory: { 'simple-factual': { cases: cases.length, meanPrecision, meanCoverage } },
    latency: new Latency(),
  }
}

describe('the benchmark report applies the declared floors', () => {
  it('names the category and both numbers when a floor is breached', () => {
    const text = formatReport(reportWith(FLOORS.meanPrecision - 0.2, FLOORS.meanCoverage - 0.2))
    expect(text).toContain('simple-factual: mean precision')
    expect(text).toContain(`is below the floor ${FLOORS.meanPrecision}`)
  })

  it('says the floors were met when every one of them was', () => {
    const text = formatReport(reportWith(FLOORS.meanPrecision + 0.2, FLOORS.meanCoverage + 0.2))
    expect(text).toContain('floors: met')
    expect(text).not.toContain('below the floor')
  })
})
