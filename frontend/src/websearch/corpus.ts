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

import type { SearchProvider } from './engine'
import { ask } from './pipeline'
import { Latency } from './latency'
import { citationSupports, independentSources, precision, recall, coverage } from './quality'
import { grade, type Expectation, type Outcome } from './accuracy'
import { checkClaims, selectEvidence, type ClaimStatus } from './verify'
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
  /**
   * What a CORRECT answer would have contained.
   *
   * Retrieval metrics say the right pages came back and mention the right
   * words. Neither says the answer was right, and a benchmark without this
   * cannot tell a correct answer from a confident wrong one. A case with no
   * expectation is counted and never judged, which inflates the score.
   */
  expectation: Expectation
  /** Why this case is in the corpus. Read this before changing it. */
  why: string
}

/* -------------------------------------------------------------------------- */
/* The corpus                                                                 */
/* -------------------------------------------------------------------------- */

export const CORPUS: readonly BenchmarkCase[] = [
  {
    id: 'gdp-2025',
    expectation: { type: 'numeric', value: 6.1 },
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
    expectation: { type: 'numeric', value: 383 },
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
    expectation: { type: 'numeric', value: 6.5 },
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
    expectation: { type: 'factual', facts: ['governor', 'monetary policy committee'] },
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
    expectation: { type: 'factual', facts: ['7323', 'window scaling'] },
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
    expectation: { type: 'numeric', value: 96.2 },
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
    expectation: {
      type: 'comparative',
      /* ORDER is the whole claim. Both directions mention every word; only the
         sequence separates "newest is expensed first" from its reverse. */
      relationships: [{ subject: 'lifo', relation: 'newest', object: 'expensed' }],
    },
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
    expectation: { type: 'numeric', value: 97 },
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
    expectation: { type: 'factual', facts: ['population'] },
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
    expectation: { type: 'numeric', value: 1944 },
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
  /**
   * What the claim check decided. The brief's four words, scored per case.
   *
   * Retrieval metrics say whether the right PAGES came back. This says whether
   * what they SAY can be relied on, and the two come apart constantly: perfect
   * precision with one publisher is still `single-source`.
   */
  /**
   * How the ANSWER scored, not the evidence behind it.
   *
   * `answered-unanswerable` is the one that matters most: it is the single
   * failure this whole feature exists to prevent, and it must be visible as
   * its own outcome rather than as "slightly wrong".
   */
  outcome: Outcome
  /** Citations that no claim supports. A second, independent citation check. */
  distortions: readonly string[]
  status: ClaimStatus
  /**
   * Whether the span chosen for display is actually supported by the page it
   * names. The brief's "citation precision".
   *
   * Not "is there a citation" — a citation is the easiest thing here to fake.
   * `citationSupports` compares the figures and the words of the claim against
   * the source text, and it can come out FALSE; that is what makes it a
   * measure rather than a formality.
   */
  citationSupported: boolean
  /** Refinement rounds this case needed. 0 means the first pass covered it. */
  rounds: number
  /** True when EVERY contributing source was read live during the run. §32. */
  freshLive: boolean
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
  /*
   * `ask()`, NOT `search()`. THIS FILE MEASURED THE WRONG PIPELINE.
   *
   * `search()` is one query, one rank, one fetch. The product calls `ask()`,
   * which plans SEVERAL queries from one question, refines when an aspect comes
   * back uncovered, and reports freshness. So every number this harness
   * produced described a path nothing shipped — a benchmark standing beside the
   * thing it claims to score.
   *
   * That failure is worse than a missing benchmark, because both coverage and
   * the green count went UP as this file was improved. The reachability gate
   * exists for exactly this shape and could not see it: a benchmark is not
   * product code, so being unreachable from a product entry point is normal.
   *
   * `maxResults` and `requireFresh` are no longer passed, and that is the
   * point rather than a loss. `planQueries` decides how many pages to fetch
   * from what the question needs, and `interpret` decides whether the question
   * is time-sensitive from the question itself. A benchmark that overruled
   * both would be scoring a configuration the product never uses.
   * `BenchmarkCase.timeSensitive` stays as fixture metadata: it records what a
   * human thought, which is worth keeping next to what the code decides.
   */
  /*
   * THE PROVIDER IS WRAPPED TO COUNT ITS OWN FAILURES, AND IT HAS TO BE.
   *
   * `ask()` turns a dead engine into a refusal, and a refusal with no pages is
   * ALSO what a working engine that found nothing produces. Deriving
   * `engineFailed` from the answer's status therefore reports an outage every
   * time the web is genuinely empty — which is the one distinction this whole
   * layer exists to preserve, and the first version of this change broke it.
   * The corpus test caught it: an empty `fixtureProvider` is not a broken one.
   *
   * Counting is structural and cannot be reworded out of existence, unlike
   * matching on the text of a refusal sentence. An outage is EVERY query
   * failing; one failing is a smaller result. Same rule as `runQueries` and
   * the same rule as the search route.
   */
  let calls = 0
  let failures = 0
  const counted: SearchProvider = {
    name: options.provider.name,
    search: async (q: string) => {
      calls += 1
      try {
        return await options.provider.search(q)
      } catch (error) {
        failures += 1
        throw error
      }
    },
  }

  const result = await ask(testCase.query, {
    provider: counted,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    latency,
  })

  /* Named `outcome` so every measurement below reads unchanged. */
  const outcome = {
    results: result.retrieved,
    engineFailed: calls > 0 && failures === calls,
  }

  const relevant = new Set(testCase.relevantUrls)
  const judged = outcome.results.map((r) => relevant.has(r.hit.url) || relevant.has(r.finalUrl))
  const found = judged.filter(Boolean).length

  const succeeded = outcome.results.filter((r) => r.ok)
  const aspectsCovered = testCase.aspectsRequired.filter((aspect) =>
    succeeded.some((r) => r.text.toLowerCase().includes(aspect.replace(/-/g, ' '))),
  )

  /*
   * THE VERDICT, SCORED. `crosscheck.ts` and `verify.ts` decide it in the
   * product; this runs the same functions over the same pages, so the number
   * describes the shipped decision rather than a re-implementation of it.
   */
  const check = checkClaims(result.retrieved, testCase.query)
  const chosen = selectEvidence(result.retrieved, testCase.query)
  const citedPage = chosen
    ? result.retrieved.find((r) => r.finalUrl === chosen.sourceUrl || r.hit.url === chosen.sourceUrl)
    : undefined
  const citationSupported =
    chosen !== null && citedPage !== undefined && citationSupports(chosen.text, citedPage.text)

  /* `accuracy.ts` was written, fully tested, and reached by nothing that ran.
     It grades the answer against what a correct one would have said. */
  const graded = grade(result.answer, testCase.expectation)

  const p = precision(judged)
  const r = recall(found, testCase.relevantTotal)
  const c = coverage(aspectsCovered, testCase.aspectsRequired)

  return {
    id: testCase.id,
    category: testCase.category,
    ...(p === undefined ? {} : { precision: p }),
    ...(r === undefined ? {} : { recall: r }),
    ...(c === undefined ? {} : { coverage: c }),
    outcome: graded.outcome,
    distortions: graded.distortions,
    status: check.status,
    citationSupported,
    rounds: result.rounds,
    freshLive: result.freshness.live,
    independentSources: independentSources(
      succeeded.map((s) => ({ url: s.finalUrl, text: s.text })),
    ).length,
    retrievedSources: outcome.results.length,
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
