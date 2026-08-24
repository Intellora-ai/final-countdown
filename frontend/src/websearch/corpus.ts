/**
 * SPEC 39 — A FIXED EVALUATION CORPUS.
 *
 * "Extremely fast, reliable, accurate" is not a claim anyone can check. This
 * is the thing that turns it into one: a fixed set of queries with known
 * answers, spanning the categories that fail for DIFFERENT reasons, scored on
 * measures that are reported separately.
 *
 * WHY THE CATEGORIES ARE THE POINT
 * --------------------------------
 * A corpus of simple factual lookups measures one narrow competence and reads
 * as a grade for the whole system. The categories here are chosen because
 * each breaks a different part: ambiguity breaks query understanding,
 * currency breaks freshness, multi-hop breaks stopping conditions,
 * contradictory sources break synthesis. A system can be excellent at one and
 * useless at another, and a per-category table shows that where a single
 * number hides it.
 *
 * WHY IT RUNS ON FIXTURES
 * -----------------------
 * A benchmark whose answers change under it is not a benchmark. Live results
 * drift daily, so a score would measure the week rather than the change being
 * evaluated. Fixtures make runs comparable; the live path is exercised by the
 * loopback suite and by hand, which is the honest division.
 *
 * WHAT THIS DELIBERATELY DOES NOT REPORT
 * --------------------------------------
 * A total. Spec 44: precision, recall, coverage and independence trade
 * against each other, and averaging them produces a figure that moves for
 * unnameable reasons and gets quoted anyway.
 */

import { search, type SearchProvider } from './engine'
import { Latency } from './latency'
import { retrievalReport } from './quality'
import type { FetchOutcome } from './fetchPage'

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The ways a search question can be hard.
 *
 * Not a taxonomy of subjects — a taxonomy of FAILURE MODES. Two questions
 * about economics belong in different categories if one is ambiguous and the
 * other is merely numerical.
 */
export type QueryCategory =
  | 'simple-factual'
  | 'ambiguous'
  | 'current'
  | 'multi-hop'
  | 'technical'
  | 'numerical'
  | 'comparison'
  | 'source-sensitive'
  | 'contradictory-source'
  | 'rare'

export interface BenchmarkCase {
  id: string
  query: string
  category: QueryCategory
  /**
   * What an answer must address, in WORDS A PAGE WOULD ACTUALLY CONTAIN.
   *
   * This was meta-labels — `entity`, `period`, `as-of-date`, `authority`,
   * `figure`, `disagreement` — and that made four of ten cases unpassable.
   * `runCase` matches an aspect by substring against the extracted text, and
   * no real document contains the literal string "as of date". Measured
   * against pages that genuinely answered each question, `apple-revenue` and
   * `population-dispute` scored coverage 0, `repo-rate-now` and
   * `vaccine-efficacy` scored 0.5, with perfect retrieval.
   *
   * A benchmark case nobody can pass is worse than a missing one: it reads as
   * a permanent failure everybody learns to ignore, and it hides real
   * regressions in the same column.
   */
  aspectsRequired: readonly string[]
  /**
   * Prose a real source would publish for this question.
   *
   * Written INDEPENDENTLY of `aspectsRequired`, and that independence is the
   * whole point: the corpus self-check renders this page and asserts the case
   * reaches coverage 1. Generating the page from the aspect list instead
   * would contain every aspect by construction and could never fail — the
   * first version of that test did exactly that, and passed against the
   * broken corpus.
   */
  examplePage: string
  /** URLs a correct retrieval should surface. */
  relevantUrls: readonly string[]
  /** How many relevant documents exist in the fixture world, for recall. */
  relevantTotal: number
  /** True when a cached answer would be wrong however recent. */
  timeSensitive: boolean
  /** Why this case is in the corpus. Read this before changing it. */
  why: string
}

/* -------------------------------------------------------------------------- */
/* The corpus                                                                 */
/* -------------------------------------------------------------------------- */

export const CORPUS: readonly BenchmarkCase[] = [
  {
    id: 'gdp-2025',
    query: 'india gdp growth 2025',
    category: 'simple-factual',
    aspectsRequired: ['growth rate', '2025'],
    examplePage:
      'The ministry reported that the growth rate for the year 2025 was 6.1 percent.',
    relevantUrls: ['https://mospi.gov.in/gdp-2025'],
    relevantTotal: 1,
    timeSensitive: false,
    why: 'The control. If this fails, nothing else in the table means anything.',
  },
  {
    id: 'apple-revenue',
    query: 'apple revenue',
    category: 'ambiguous',
    aspectsRequired: ['revenue', 'fiscal'],
    examplePage:
      'Apple Inc. reported total revenue of $383 billion for fiscal 2025, up from the prior year.',
    relevantUrls: ['https://investor.apple.com/annual-2025'],
    relevantTotal: 2,
    timeSensitive: false,
    why: 'Which Apple, which period, GAAP or not. A system that answers confidently without resolving those is wrong even when the number is right.',
  },
  {
    id: 'repo-rate-now',
    query: 'current rbi repo rate',
    category: 'current',
    aspectsRequired: ['repo rate', 'effective'],
    examplePage:
      'The policy repo rate stands at 6.50 percent, effective from 7 August 2026.',
    relevantUrls: ['https://rbi.org.in/rates'],
    relevantTotal: 1,
    timeSensitive: true,
    why: 'Correct last month and wrong today. Catches a cache that answers a "current" question from a warm entry.',
  },
  {
    id: 'chain-minister',
    query: 'who chairs the committee that sets the indian repo rate',
    category: 'multi-hop',
    aspectsRequired: ['committee', 'chair'],
    examplePage:
      'The Monetary Policy Committee sets the rate. Its chair is the Governor of the Reserve Bank.',
    relevantUrls: ['https://rbi.org.in/mpc', 'https://rbi.org.in/governor'],
    relevantTotal: 2,
    timeSensitive: false,
    why: 'Needs two retrievals joined. Catches a stopping condition that halts at the first plausible page.',
  },
  {
    id: 'tcp-window',
    query: 'tcp receive window scaling option',
    category: 'technical',
    aspectsRequired: ['window scaling', 'rfc'],
    examplePage:
      'The TCP window scaling option is defined in RFC 7323 and negotiated during the handshake.',
    relevantUrls: ['https://rfc-editor.org/rfc7323'],
    relevantTotal: 1,
    timeSensitive: false,
    why: 'Precise terminology with a primary source. Catches ranking that prefers a popular tutorial over the specification.',
  },
  {
    id: 'literacy-rate',
    query: 'kerala literacy rate percentage',
    category: 'numerical',
    aspectsRequired: ['literacy', 'percent'],
    examplePage:
      'Kerala recorded a literacy figure of 96.2 percent in the most recent census.',
    relevantUrls: ['https://censusindia.gov.in/kerala'],
    relevantTotal: 1,
    timeSensitive: false,
    why: 'One number that must survive extraction intact. Catches an extractor that separates a figure from its qualifier.',
  },
  {
    id: 'lifo-fifo',
    query: 'lifo vs fifo inventory valuation difference',
    category: 'comparison',
    aspectsRequired: ['lifo', 'fifo', 'difference'],
    examplePage:
      'Under LIFO the newest stock is expensed first; under FIFO the oldest is. The difference changes reported profit when prices move.',
    relevantUrls: ['https://icai.org/inventory'],
    relevantTotal: 2,
    timeSensitive: false,
    why: 'Needs both sides. Catches an answer that covers one well and calls it done.',
  },
  {
    id: 'vaccine-efficacy',
    query: 'measles vaccine efficacy',
    category: 'source-sensitive',
    aspectsRequired: ['vaccine', 'efficacy'],
    examplePage:
      'Two doses of the measles vaccine give an efficacy of about 97 percent against infection.',
    relevantUrls: ['https://who.int/measles'],
    relevantTotal: 1,
    timeSensitive: false,
    why: 'A blog and a health authority both answer it. Catches ranking that treats them as equivalent.',
  },
  {
    id: 'population-dispute',
    query: 'population of a disputed territory',
    category: 'contradictory-source',
    aspectsRequired: ['population', 'estimate'],
    examplePage:
      'One estimate puts the population at 1.2 million, while the territorial census reports 1.5 million.',
    relevantUrls: ['https://un.org/estimate', 'https://gov.example/census'],
    relevantTotal: 2,
    timeSensitive: false,
    why: 'Two credible sources that disagree. Catches synthesis that silently averages them or picks one without saying so.',
  },
  {
    id: 'rare-term',
    query: 'zzyzx california post office founding',
    category: 'rare',
    aspectsRequired: ['post office', 'founding'],
    examplePage:
      'The founding of the Zzyzx post office in California dates to 1944, under its original owner.',
    relevantUrls: ['https://archive.example/zzyzx'],
    relevantTotal: 1,
    timeSensitive: false,
    why: 'Almost nothing indexed. Catches a system that manufactures an answer rather than reporting thin evidence.',
  },
]

/* -------------------------------------------------------------------------- */
/* Running it                                                                 */
/* -------------------------------------------------------------------------- */

export interface CaseResult {
  id: string
  category: QueryCategory
  /** Undefined where the measure genuinely does not apply. Never faked. */
  precision?: number
  recall?: number
  coverage?: number
  independentSources: number
  retrievedSources: number
  fetchFailures: number
  engineFailed: boolean
  /** Sources whose extracted text tripped an injection signal. */
  suspiciousSources: number
}

export interface CorpusReport {
  cases: readonly CaseResult[]
  /** Per category, because a single figure hides exactly what matters. */
  byCategory: Record<string, { cases: number; meanPrecision?: number; meanCoverage?: number }>
  latency: Latency
}

export interface RunOptions {
  provider: SearchProvider
  fetchImpl?: (url: string) => Promise<FetchOutcome>
  maxResults?: number
  cases?: readonly BenchmarkCase[]
}

/**
 * Run one case and score it.
 *
 * Relevance is decided by URL against the case's own list rather than by any
 * judgement made at run time. A benchmark whose grader shares a mental model
 * with the thing being graded measures agreement, not correctness.
 */
export async function runCase(
  testCase: BenchmarkCase,
  options: RunOptions,
  latency: Latency,
): Promise<CaseResult> {
  const outcome = await search(testCase.query, {
    provider: options.provider,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.maxResults === undefined ? {} : { maxResults: options.maxResults }),
    requireFresh: testCase.timeSensitive,
    latency,
  })

  const relevant = new Set(testCase.relevantUrls)
  const judged = outcome.results.map((r) => relevant.has(r.hit.url) || relevant.has(r.finalUrl))
  const found = judged.filter(Boolean).length

  const succeeded = outcome.results.filter((r) => r.ok)
  const aspectsCovered = testCase.aspectsRequired.filter((aspect) =>
    succeeded.some((r) => r.text.toLowerCase().includes(aspect.replace(/-/g, ' '))),
  )

  /* This block used to rebuild, by hand, exactly what `retrievalReport`
   * returns: precision, recall, coverage, independent sources and the raw
   * count. Two copies of one calculation is how they drift, and the second copy
   * was the only thing keeping the real one unreachable. */
  const report = retrievalReport({
    judged,
    relevantFound: found,
    relevantTotal: testCase.relevantTotal,
    aspectsCovered,
    aspectsRequired: testCase.aspectsRequired,
    sources: succeeded.map((s) => ({ url: s.finalUrl, text: s.text })),
  })

  return {
    id: testCase.id,
    category: testCase.category,
    ...report,
    fetchFailures: outcome.results.filter((x) => !x.ok).length,
    engineFailed: outcome.engineFailed,
    suspiciousSources: outcome.results.filter((x) => x.suspicious).length,
  }
}

/** Mean of the defined values, or undefined when none were measurable. */
function meanOf(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined)
  if (!present.length) return undefined
  return present.reduce((a, b) => a + b, 0) / present.length
}

/**
 * Run the corpus.
 *
 * Cases run in sequence rather than in parallel: the point is to measure
 * latency per stage, and concurrent cases would measure contention instead.
 */
export async function runCorpus(options: RunOptions): Promise<CorpusReport> {
  const latency = new Latency()
  const cases: CaseResult[] = []

  for (const testCase of options.cases ?? CORPUS) {
    cases.push(await runCase(testCase, options, latency))
  }

  const byCategory: CorpusReport['byCategory'] = {}
  for (const result of cases) {
    const bucket = (byCategory[result.category] ??= { cases: 0 })
    bucket.cases += 1
  }
  for (const category of Object.keys(byCategory)) {
    const inCategory = cases.filter((c) => c.category === category)
    const mp = meanOf(inCategory.map((c) => c.precision))
    const mc = meanOf(inCategory.map((c) => c.coverage))
    if (mp !== undefined) byCategory[category].meanPrecision = mp
    if (mc !== undefined) byCategory[category].meanCoverage = mc
  }

  return { cases, byCategory, latency }
}
