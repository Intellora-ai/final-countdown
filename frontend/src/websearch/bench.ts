/**
 * THE BENCHMARK'S DOORWAY, WHICH IS A COMMAND AND NOT A BUNDLE.
 *
 * `corpus.ts`, `quality.ts` and `accuracy.ts` were the last three orphans in
 * this module. They are not product code: a fixed evaluation corpus, the
 * retrieval measures, and per-answer-type grading. Wiring them into
 * `index.ts` would have made the reachability number look right by shipping an
 * evaluation harness to every student's browser, which is worse than leaving
 * them unreachable --- the metric would have improved and the product would
 * have got heavier for nothing.
 *
 * So they get their own doorway, in the shape they actually want: something a
 * developer or CI runs. `runBenchmark` is that seam, and it takes the same
 * `WebSearchConfig` the product uses, so the thing being measured is the thing
 * that ships rather than a parallel construction of it.
 *
 * WHAT IT REFUSES TO DO. It does not reduce the report to one number. `§24`
 * says there is no single universal accuracy score and `quality.ts` returns
 * `undefined` rather than 0 for measures it cannot honestly take --- because 1
 * makes an empty benchmark look solved and 0 makes working search look broken.
 * A runner that averaged those into a headline figure would undo both. Per
 * category, or nothing.
 */
import { runCorpus, type CorpusReport, type RunOptions } from './corpus'
import type { FetchOutcome } from './fetchPage'
import { searchPort, type WebSearchConfig } from './index'
import { fixtureProvider, jsonProvider } from './engine'
/* `nearestRank` is the surviving name. A second copy of this function shipped
   as `percentile`; both computed the same thing, and one was deleted so a
   measurement has one definition. */
import { nearestRank as percentile } from './latency'
import { citationSupports } from './quality'
import { grade, type Expectation, type Grade } from './accuracy'
import { evaluate, FLOORS } from './evalReport'
import type { Answer } from './answer'
import type { SearchHit } from './port'

export type { CorpusReport } from './corpus'

export interface BenchmarkOptions extends WebSearchConfig {
  /** Injected by tests and by an offline run. */
  readonly fetchImpl?: (url: string) => Promise<FetchOutcome>
  readonly maxResults?: number
  /**
   * Canned engine responses, keyed by query.
   *
   * AN OFFLINE RUN IS THE ONLY REPEATABLE ONE. A benchmark pointed at a live
   * engine measures the engine's mood as much as the code: results move, pages
   * change, and a regression is indistinguishable from the web having a
   * different day. Supplying fixtures makes the number a fact about this
   * commit. `endpoint` is still required, because the key and host rules must
   * apply identically to both modes --- an offline path that skips them is a
   * second configuration nobody tested.
   */
  readonly fixtures?: Record<string, readonly SearchHit[]>
}

/**
 * Run the fixed corpus against a configured engine.
 *
 * Returns `null` when nothing is configured, for the same reason the ports do:
 * "no engine" and "an engine that fails every query" are different results, and
 * a benchmark that scores the second as the first reports a system outage as a
 * quality regression.
 */
export async function runBenchmark(opts: BenchmarkOptions): Promise<CorpusReport | null> {
  /* Constructed through `searchPort` so the key guard and the endpoint rules
     apply here exactly as they do in the product. A benchmark that reached past
     the doorway would be measuring a configuration nobody can ship. */
  if (!searchPort(opts)) return null

  const options: RunOptions = {
    provider: opts.fixtures ? fixtureProvider(opts.fixtures) : jsonProvider({
      name: opts.name ?? 'benchmark',
      endpoint: opts.endpoint,
      map: opts.map ?? ((b: unknown) => (Array.isArray(b) ? (b as never[]) : [])),
      ...(opts.apiKey === undefined ? {} : { apiKey: opts.apiKey }),
      ...(opts.limit === undefined ? {} : { limit: opts.limit }),
      ...(opts.fetchJson === undefined ? {} : { fetchJson: opts.fetchJson }),
    }),
    ...(opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }),
    ...(opts.maxResults === undefined ? {} : { maxResults: opts.maxResults }),
  }
  return runCorpus(options)
}

/**
 * The report as lines a human reads, per category.
 *
 * `undefined` is rendered as `not measured` rather than as a dash or a zero.
 * The distinction is the whole reason `quality.ts` returns `undefined`, and a
 * formatter that flattens it puts the lie back in at the last possible step.
 */
export function formatReport(report: CorpusReport): string {
  const lines: string[] = [`cases: ${report.cases.length}`]
  const show = (n: number | undefined): string => (n === undefined ? 'not measured' : n.toFixed(3))
  for (const [category, m] of Object.entries(report.byCategory).sort()) {
    lines.push(
      `  ${category.padEnd(22)} n=${String(m.cases).padStart(3)}`
      + `  precision=${show(m.meanPrecision).padStart(12)}`
      + `  coverage=${show(m.meanCoverage).padStart(12)}`,
    )
  }
  /* THE TAIL, NOT THE MEAN, and taken from the recorder rather than recomputed.
     `Latency` already sorts once and reads p50/p95/p99 off the sorted array ---
     a measured fix after a 200k-sample run, because the one-shot helper
     re-sorts per call and `Math.min(...)` spreads every sample into an argument
     list and throws. Asking it again here would reintroduce exactly that. */
  const live = report.latency.summary().live
  lines.push(
    `  fetch latency  p50=${show(live.p50)}  p95=${show(live.p95)}  p99=${show(live.p99)}`
    + `  (n=${live.count}, ${live.failures} failed, ${live.timeouts} timed out)`,
  )

  /* INDEPENDENT SOURCES, AS A DISTRIBUTION. The mean would say "about three"
     while a third of the corpus answered from one page --- and one page is not
     corroboration, it is a single point of failure wearing a citation. The
     median and the bottom decile are what show that. `percentile` is the
     right tool here: one small array, read once. */
  const independent = report.cases.map((c) => c.independentSources)
  lines.push(
    `  independent sources  p10=${show(percentile(independent, 10))}`
    + `  p50=${show(percentile(independent, 50))}`
    + `  p90=${show(percentile(independent, 90))}`,
  )

  /* THE VERDICT, NOT ONLY THE MEASUREMENTS.
     Everything above is a number with no stated expectation, which asks the
     reader to compare against floors they cannot see. `evalReport` holds those
     floors and the sentence-per-breach; until this call its only consumer was
     `evalGate.test.ts`, so the module that knew what "good" meant was reachable
     from nothing that ships.
     The `met` line is not decoration. Printing only breaches is indistinguishable
     from printing nothing when a run is healthy, and a silent gate is the one
     failure mode this repository keeps finding. */
  const verdict = evaluate(report, FLOORS)
  if (verdict.ok) {
    lines.push('  floors: met')
  } else {
    for (const failure of verdict.failures) lines.push(`  FLOOR  ${failure}`)
  }
  return lines.join('\n')
}

/**
 * How many citations actually contain what they are cited for.
 *
 * MEASURED HERE BEFORE IT IS ENFORCED ANYWHERE. `answer.ts` builds a citation
 * for every untainted claim and calls it "an assertion that this text supports
 * the answer" --- and nothing checks that assertion. `citationSupports` is the
 * check, and it existed with no caller.
 *
 * Reporting it is the honest first step. Turning it into a filter inside
 * `answer.ts` changes which citations reach a reader, which is a behaviour
 * change that deserves its own tests and its own review rather than arriving
 * as a side effect of wiring. Measure, then decide.
 */
export function citationSupportRate(
  pairs: readonly { claim: string; sourceText: string }[],
): { checked: number; supported: number; rate?: number } {
  if (!pairs.length) return { checked: 0, supported: 0 }
  const supported = pairs.filter((p) => citationSupports(p.claim, p.sourceText)).length
  return { checked: pairs.length, supported, rate: supported / pairs.length }
}

/**
 * Grade answers against what a correct answer had to contain.
 *
 * WHY THIS IS SEPARATE FROM `runBenchmark`. The corpus scores RETRIEVAL ---
 * did we find the right pages --- and that gap is recorded in `accuracy.ts`'s
 * own header: the benchmark "scored RETRIEVAL and reported it as quality ...
 * every number it produced was true and none of them was about whether the
 * answer was right". Retrieval and accuracy are different questions and are
 * reported apart, here as there.
 *
 * NO SINGLE SCORE, deliberately. `§24` ends with "There is no single universal
 * accuracy score" and `§44` says quality must not be optimised with one number.
 * This returns the grades; anything that averages them across answer types has
 * chosen a weighting nobody agreed to, and the weighting would then be the
 * thing being optimised.
 */
export function gradeAnswers(
  pairs: readonly { answer: Answer; expectation: Expectation }[],
): readonly Grade[] {
  return pairs.map((p) => grade(p.answer, p.expectation))
}
