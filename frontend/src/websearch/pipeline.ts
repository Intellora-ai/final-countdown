/**
 * THE WHOLE §46 PIPELINE. A question goes in, a checked answer comes out.
 *
 *     QUERY -> interpret -> planQueries -> provider
 *           -> rankHits -> gather -> extract -> guard
 *           -> extractClaims -> rankEvidence -> crossCheck
 *           -> sufficient? -> refine (bounded) -> buildAnswer -> finalCheck
 *
 * Every stage is a module that can be tested without this file. What is only
 * here is the ORDER, the stop condition, and the fact that the result carries
 * every intermediate stage rather than just the answer.
 *
 * WHY THE RESULT CARRIES EVERY STAGE
 * ----------------------------------
 * A wrong answer from an opaque pipeline is unactionable: the question "was
 * that retrieval, extraction, or cross-checking?" has no answer, and the only
 * available move is to re-run the whole thing and squint. `PipelineResult`
 * therefore exposes requirements, plan, ranked hits, retrievals, claims and
 * findings alongside the answer, so a bad output can be traced to the stage
 * that produced it.
 *
 * WHY SOURCE FILTERING SITS BETWEEN RETRIEVAL AND FETCH
 * -----------------------------------------------------
 * `engine.search()` goes from hits straight to `gather`, which is right for the
 * simple path. §46 puts SOURCE FILTERING in between, and the ordering is the
 * point: ranking after fetching means paying to read pages that were never
 * going to be used, and paying is not the worst of it — a hostile page has
 * already been fetched, redirected through, and parsed before anything judged
 * whether it was worth reading.
 *
 * WHY A DECLINED QUESTION NEVER TOUCHES THE NETWORK
 * -------------------------------------------------
 * §42's refusal is worth nothing if the request has already gone out. The
 * provider is not called at all when `shouldSearch` is false, and a counting
 * provider asserts it — "we decided not to search" and "we searched and then
 * ignored it" differ by one metered API call per question.
 */

import { buildAnswer, finalCheck, sufficient, type Answer } from './answer'
import { crossCheck, type Finding } from './crosscheck'
import type { SearchProvider } from './engine'
import { extractClaims, rankEvidence, type Claim } from './evidence'
import type { FetchOptions, FetchOutcome } from './fetchPage'
import { gather, type PageCache, type Retrieved } from './gather'
import { interpret, type SearchRequirements } from './interpret'
import { Latency } from './latency'
import { hopsOf, reuseOf, type Hop, type HopName, type ReuseStat } from './hops'
import { freshnessOf, type Freshness } from './provenance'
import { planQueries, refine, type QueryPlan } from './strategy'
import { offTopic, rankHits, type RankedHit } from './select'
import type { SearchHit } from './port'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AskOptions {
  /** Epoch ms: reads not done by then are left out, and no further round is searched. */
  deadlineAt?: number
  provider: SearchProvider
  cache?: PageCache
  latency?: Latency
  /**
   * Fetch limits, forwarded to `gather` and on to `fetchPage`.
   *
   * The same gap existed here as in `GatherOptions`: without it, nothing a
   * caller of `ask()` could say would bound a hung origin, because the limits
   * stopped at a layer that had no way to express them.
   */
  fetch?: FetchOptions
  fetchImpl?: (url: string) => Promise<FetchOutcome>
  now?: () => number
}

export interface PipelineResult {
  query: string
  requirements: SearchRequirements
  plan: QueryPlan
  ranked: readonly RankedHit[]
  retrieved: readonly Retrieved[]
  claims: readonly Claim[]
  findings: readonly Finding[]
  answer: Answer
  /**
   * §32 — where the evidence actually came from, and whether the answer may be
   * called live. Built here rather than left to a caller, because a caller that
   * has to remember to compute it is a caller that will forget.
   */
  freshness: Freshness
  /** §30 — where the time went, all four hops including the unobservable one. */
  hops: Record<HopName, Hop>
  /** §31 — per-host connection reuse evidence. Empty without a latency recorder. */
  reuse: Record<string, ReuseStat>
  /** How many refinement rounds ran. 0 means the first pass was enough. */
  rounds: number
  /** Always empty in practice. Non-empty means this file has a bug. */
  violations: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* ask                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Run the planned queries and keep whatever answered.
 *
 * FAILURE IS ALL OF THEM FAILING, NOT ANY OF THEM.
 *
 * This was `Promise.all`, which rejects on the first failure — so one
 * rate-limited query out of four discarded every page the other three had
 * already found, and the answer became "the engine is down" with real evidence
 * sitting in hand. The refinement loop below never made that mistake; its own
 * comment says a failed refinement is "one lost round, never a lost answer".
 * The first round disagreed with that rule, and nothing caught it because
 * nothing had wired this pipeline to a provider that could fail per query.
 *
 * The same URL returned by two planned queries is ONE source. Independence is
 * the entire basis on which anything downstream is called corroborated, so a
 * page counted twice would manufacture agreement out of one publisher.
 */
/** Resolves to null at the deadline; never rejects. */
function untilDeadline(deadlineAt: number): { done: Promise<null>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, deadlineAt - Date.now()))
  })
  return { done, cancel: () => clearTimeout(timer) }
}

async function runQueries(
  provider: SearchProvider,
  queries: readonly { readonly text: string }[],
  deadlineAt?: number,
): Promise<{ hits: readonly SearchHit[]; allFailed: boolean; error?: string }> {
  let firstError: string | undefined
  let failures = 0
  const seen = new Set<string>()
  const hits: SearchHit[] = []

  /* THE DEADLINE BOUNDS THE SEARCH TOO. Measured 2026-09-02: with the reads
     bounded, every lesson was still ungrounded -- the planned queries run
     together and the batch waited for the slowest, which waited for the
     slowest engine. A query that has not answered by the deadline is left
     out; it is not an outage, and the ones that answered are read. */
  const clock = deadlineAt === undefined ? null : untilDeadline(deadlineAt)
  const settled = await Promise.all(
    queries.map(async (q) => {
      try {
        const search = provider.search(q.text)
        return clock === null ? await search : await Promise.race([search, clock.done])
      } catch (err) {
        failures += 1
        firstError ??= err instanceof Error ? err.message : String(err)
        return null
      }
    }),
  )

  for (const batch of settled) {
    if (!batch) continue
    for (const hit of batch) {
      if (seen.has(hit.url)) continue
      seen.add(hit.url)
      hits.push(hit)
    }
  }

  clock?.cancel()
  const allFailed = queries.length > 0 && failures === queries.length
  return { hits, allFailed, ...(firstError === undefined ? {} : { error: firstError }) }
}

/**
 * Ask a question and get an answer that has been checked against §45.
 *
 * `violations` is part of the return rather than a thrown error. A pipeline
 * that throws on its own inconsistency loses every intermediate stage at the
 * exact moment they are needed to diagnose it — the caller gets a stack trace
 * instead of the evidence.
 */
/**
 * How many words a hit must carry before its SILENCE about the subject counts.
 *
 * MEASURED 2026-09-03 across four real school questions on the live nine-engine
 * instance: **116 hits, not one of them without a snippet, the shortest 15
 * words, the median 30.** So this floor sits below every hit real engines are
 * producing today -- it costs nothing now, and it exists because a hit with
 * almost no text has not said the subject is absent, only that it said very
 * little. A results page whose snippet is "PDF download" may be the NCERT
 * chapter itself, which is the best source an Indian student can have.
 *
 * The check that CAN judge such a page is the one after it is read, below.
 */
const ENOUGH_WORDS_TO_JUDGE_A_HIT = 10

/** Ranked hits with the off-topic ones marked excluded, reason on the hit; see `offTopic`. */
function onTopicOnly(ranked: readonly RankedHit[], req: SearchRequirements): RankedHit[] {
  return ranked.map((r) => {
    if (r.excluded) return r
    const said = `${r.hit.title} ${r.hit.snippet}`.trim().split(/\s+/).filter(Boolean).length
    if (said < ENOUGH_WORDS_TO_JUDGE_A_HIT) return r
    const reason = offTopic(r.hit, req)
    return reason === undefined ? r : { ...r, score: 0, excluded: true as const, excludedReason: reason }
  })
}

/**
 * A PAGE THAT WAS READ AND TURNED OUT TO BE ABOUT SOMETHING ELSE.
 *
 * The guard above reads a SNIPPET, which is the engine's summary and is
 * sometimes a lie. This reads the page's own text, which is the thing
 * `select.ts` says in its own header is "what says the subject" -- and which
 * nothing was doing.
 *
 * MEASURED LIVE 2026-09-03, once nine engines were switched on, for
 * "trigonometric ratios class 10 school level, simple language": eight copies
 * of pubmed's **"Cookies must be enabled"**, pmc's **"Checking your browser -
 * reCAPTCHA"**, the World Bank's **"Price level index (GDP)"** and Wikipedia's
 * **"Comparison of programming languages"** all came back as SOURCES a lesson
 * could be written from. A bot wall is not evidence; citing one says a claim
 * rests on a page when it rests on a cookie notice.
 *
 * It also catches the second fault in the same measurement: the LEVEL words
 * ("class 10 school level, simple language") are a bias for the engine, not
 * part of the subject, and engines matched them literally -- which is how
 * "Bantu languages" and "Baldwin Class 10-12-D" became sources for a
 * photosynthesis lesson. A page kept only because it matched the scope says
 * nothing about the subject in its text, so it goes here.
 *
 * A page that could not be fetched is left exactly as it is: it already
 * carries its own failure, and re-labelling it would lose that.
 *
 * IT MARKS RATHER THAN REMOVES. The first version filtered these out of
 * `retrieved`, and the retrieval benchmark went blind the same hour: it grades
 * "the engine returned something and it was wrong" as zero precision, and it
 * can only do that if the wrong thing is still there to grade. A page kept and
 * marked is excluded from every source list below and still visible to anything
 * measuring how well the search did its job.
 */
function judgeReadPages(pages: readonly Retrieved[], req: SearchRequirements): Retrieved[] {
  return pages.map((page) => ({
    ...page,
    aboutTheSubject: page.ok
      ? offTopic({ url: page.hit.url, title: page.title, snippet: page.text }, req) === undefined
      : undefined,
  }))
}

/** The pages that may actually be cited: read, and about what was asked. */
export function usableSources(pages: readonly Retrieved[]): Retrieved[] {
  return pages.filter((page) => page.ok && page.aboutTheSubject !== false)
}

export async function ask(query: string, options: AskOptions): Promise<PipelineResult> {
  const req = interpret(query)
  const plan = planQueries(req)
  const now = options.now ?? Date.now

  const empty = (answer: Answer, extra: Partial<PipelineResult> = {}): PipelineResult => ({
    query,
    requirements: req,
    plan,
    ranked: [],
    retrieved: [],
    claims: [],
    findings: [],
    answer,
    /* Literally empty, not `retrieved` — this helper runs on the paths where
       nothing was fetched, and it is DEFINED before `retrieved` exists.
       Closing over that binding typechecks cleanly and then throws
       `Cannot access 'retrieved' before initialization` at runtime, because a
       closure defers execution past what the type checker can see. */
    freshness: freshnessOf([], now),
    hops: hopsOf(options.latency ?? new Latency()),
    reuse: reuseOf(options.latency?.requestSamples() ?? []),
    rounds: 0,
    violations: finalCheck(answer),
    ...extra,
  })

  /* §42 — decided not to search. No request is made. */
  if (!req.shouldSearch) {
    return empty(buildAnswer(req, crossCheck([], req), { engineFailed: false }))
  }

  /* Retrieval. The engine is another remote party: EVERY query failing is an
     outage, and it must stay distinguishable from a question with no answers.
     One query failing is a smaller result; see `runQueries`. */
  const engineStarted = now()
  const first = await runQueries(options.provider, plan.queries, options.deadlineAt)
  const hits: readonly SearchHit[] = first.hits
  const engineFailed = first.allFailed
  const engineError = first.error
  options.latency?.stage('engine', Math.max(0, now() - engineStarted))

  if (engineFailed) {
    return empty(
      buildAnswer(req, crossCheck([], req), {
        engineFailed: true,
        ...(engineError === undefined ? {} : { engineError }),
      }),
    )
  }

  const gatherOptions = {
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.latency ? { latency: options.latency } : {}),
    ...(plan.maxAgeMs === undefined ? {} : { maxAgeMs: plan.maxAgeMs }),
    requireFresh: plan.requireFresh,
    concurrency: plan.concurrency,
    ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now ? { now: options.now } : {}),
  }

  /* SOURCE FILTERING, then fetch only what survived it and only as deep as the
     question asked for. Excluded hits are still in `ranked`, so the report can
     say what was skipped and why. */
  /* A hit that names none of the question's words is never read: measured
     2026-09-02, Bing answered a polynomial question with song lyrics and
     Vietnamese dishes, and reading them cost the learner four seconds before
     they were handed to the author as citations. The reason stays on the hit. */
  const ranked = onTopicOnly(rankHits(hits, req, now), req)
  const fetchable = ranked.filter((r) => !r.excluded).slice(0, plan.fetchCount)

  const retrieved: Retrieved[] = judgeReadPages(
    await gather(fetchable.map((r) => r.hit), gatherOptions),
    req,
  )

  /* Only pages that are about what was asked become claims. A bot wall ("Cookies
     must be enabled") and a page that matched the reading level rather than the
     subject are both still in `retrieved`, marked, and neither can be cited. */
  const claimsFor = (pages: readonly Retrieved[]): Claim[] =>
    rankEvidence(
      usableSources(pages).flatMap((p) => extractClaims(p, req)),
      req,
    )

  let claims = claimsFor(retrieved)
  let findings = crossCheck(claims, req)
  let rounds = 0
  let issued = plan

  /* §15/§43 — refine while there is a gap, and stop. Termination is guaranteed
     by `refine`'s own exported ceiling, not by this loop being careful. */
  while (!sufficient(findings, req)) {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) break
    const uncovered = findings.filter((f) => f.claims.length === 0).map((f) => f.aspect)
    const next = refine(req, issued, uncovered, rounds)
    if (!next) break
    rounds += 1
    issued = next

    /*
     * Same rule as the first round: one query failing costs that query, not the
     * round, and the evidence already gathered always stands.
     *
     * NO `if (again.allFailed) break` HERE, AND ITS ABSENCE IS DELIBERATE. One
     * was written and mutation proved it dead: every query failing means no
     * batch contributed, so `again.hits` is empty, so `fresh.length === 0`
     * below ends the loop one line later for the same reason. Two guards, one
     * of which can never be the one that fires, is one guard and one thing for
     * the next reader to puzzle over.
     */
    const again = await runQueries(options.provider, next.queries, options.deadlineAt)
    const more: readonly SearchHit[] = again.hits

    const already = new Set(retrieved.map((r) => r.hit.url))
    const fresh = onTopicOnly(rankHits(more, req, now), req)
      .filter((r) => !r.excluded && !already.has(r.hit.url))
      .slice(0, next.fetchCount)
    if (fresh.length === 0) break

    retrieved.push(...judgeReadPages(await gather(fresh.map((r) => r.hit), gatherOptions), req))
    claims = claimsFor(retrieved)
    findings = crossCheck(claims, req)
  }

  const answer = buildAnswer(req, findings, { engineFailed: false })

  return {
    query,
    requirements: req,
    plan,
    ranked,
    retrieved,
    claims,
    findings,
    answer,
    freshness: freshnessOf(retrieved, now),
    hops: hopsOf(options.latency ?? new Latency()),
    reuse: reuseOf(options.latency?.requestSamples() ?? []),
    rounds,
    violations: finalCheck(answer),
  }
}
