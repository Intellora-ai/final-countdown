import type { CorpusReport } from './corpus'

/**
 * The gate that turns benchmark numbers into a pass or a fail.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * `corpus.ts` has been able to produce precision and coverage for as long as it
 * has existed, and has never once refused anything, because nothing compared
 * those numbers to a floor. A number nobody acts on is a number nobody reads.
 *
 * WHAT IT REFUSES, AND WHY EACH ONE IS SEPARATE
 * ---------------------------------------------
 * Four different ways a retrieval system rots, and they do not co-vary:
 *
 *   precision    the right pages stopped coming back
 *   coverage     the pages come back but no longer say the required things
 *   unknown      more questions than allowed cannot be checked at all
 *   citation     a span was displayed that its own source does not support
 *
 * The last one is the worst output this system can produce — a wrong sentence
 * wearing a citation — so a single unsupported citation fails the run outright
 * rather than being averaged away.
 *
 * VACUITY IS A FAILURE, NOT A PASS
 * --------------------------------
 * A run that scored nothing breaches no floor, and reads exactly like a perfect
 * one. That is the failure mode this repository has already been bitten by, so
 * it is checked explicitly: too few cases, or no measurable precision anywhere,
 * both refuse.
 */

export interface Floors {
  /** Per category. A category that scores below this fails and is named. */
  readonly meanPrecision: number
  readonly meanCoverage: number
  /** How many cases may come back `unknown` before the run is not worth trusting. */
  readonly maxUnknown: number
  /** Fewer cases than this and the run measured too little to mean anything. */
  readonly minCases: number
}

export interface Verdict {
  readonly ok: boolean
  /** One sentence per breach, naming the category and the numbers. */
  readonly failures: readonly string[]
}

/**
 * The floors that ship, and where they come from.
 *
 * NOT FITTED TO TODAY'S SCORE. A floor set just under the current number
 * ratchets to whatever the code happens to do and can never catch a regression
 * smaller than the gap. These are set at the level below which the feature is
 * not doing its job, and the measured values are printed on every run so the
 * distance between the two stays visible.
 *
 * `maxUnknown` is generous on purpose: the corpus deliberately contains cases
 * that SHOULD come back unknown (the `rare` category exists to be unanswerable).
 * It is a ceiling on "the whole thing stopped working", not a quality target.
 */
export const FLOORS: Floors = {
  meanPrecision: 0.5,
  meanCoverage: 0.5,
  maxUnknown: 6,
  minCases: 10,
}

export function evaluate(report: CorpusReport, floors: Floors): Verdict {
  const failures: string[] = []

  /* Vacuity first. Every check below is satisfied by measuring nothing. */
  if (report.cases.length < floors.minCases) {
    failures.push(
      `the run scored ${report.cases.length} case(s), and fewer than ${floors.minCases} ` +
        `is not enough to mean anything`,
    )
  }

  const measurable = report.cases.some((c) => c.precision !== undefined || c.coverage !== undefined)
  if (report.cases.length > 0 && !measurable) {
    failures.push(
      'every case ran and nothing measurable came out of any of them, which breaches no floor ' +
        'and is indistinguishable from a perfect run',
    )
  }

  for (const [category, stats] of Object.entries(report.byCategory)) {
    if (stats.meanPrecision !== undefined && stats.meanPrecision < floors.meanPrecision) {
      failures.push(
        `${category}: mean precision ${stats.meanPrecision.toFixed(2)} is below the floor ` +
          `${floors.meanPrecision}`,
      )
    }
    if (stats.meanCoverage !== undefined && stats.meanCoverage < floors.meanCoverage) {
      failures.push(
        `${category}: mean coverage ${stats.meanCoverage.toFixed(2)} is below the floor ` +
          `${floors.meanCoverage}`,
      )
    }
  }

  const unknown = report.cases.filter((c) => c.status === 'unknown').length
  if (unknown > floors.maxUnknown) {
    failures.push(`${unknown} case(s) came back unknown, above the ceiling of ${floors.maxUnknown}`)
  }

  /* Not averaged. One displayed span its own source does not support is the
     single worst thing this system can emit, and averaging would let a good
     run carry it. */
  const unsupported = report.cases.filter(
    (c) => c.status !== 'unknown' && !c.citationSupported,
  )
  for (const c of unsupported) {
    failures.push(`${c.id}: the quoted citation is not supported by the page it names`)
  }

  const died = report.cases.filter((c) => c.engineFailed)
  for (const c of died) {
    failures.push(`${c.id}: the engine failed, so this case scored an outage rather than an answer`)
  }

  return { ok: failures.length === 0, failures }
}
