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
import { freshnessOf, type Freshness } from './provenance'
import { planQueries, refine, type QueryPlan } from './strategy'
import { rankHits, type RankedHit } from './select'
import type { SearchHit } from './port'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AskOptions {
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
async function runQueries(
  provider: SearchProvider,
  queries: readonly { readonly text: string }[],
): Promise<{ hits: readonly SearchHit[]; allFailed: boolean; error?: string }> {
  let firstError: string | undefined
  let failures = 0
  const seen = new Set<string>()
  const hits: SearchHit[] = []

  const settled = await Promise.all(
    queries.map(async (q) => {
      try {
        return await provider.search(q.text)
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
  const first = await runQueries(options.provider, plan.queries)
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
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now ? { now: options.now } : {}),
  }

  /* SOURCE FILTERING, then fetch only what survived it and only as deep as the
     question asked for. Excluded hits are still in `ranked`, so the report can
     say what was skipped and why. */
  const ranked = rankHits(hits, req, now)
  const fetchable = ranked.filter((r) => !r.excluded).slice(0, plan.fetchCount)

  const retrieved: Retrieved[] = [...(await gather(fetchable.map((r) => r.hit), gatherOptions))]

  const claimsFor = (pages: readonly Retrieved[]): Claim[] =>
    rankEvidence(
      pages.flatMap((p) => extractClaims(p, req)),
      req,
    )

  let claims = claimsFor(retrieved)
  let findings = crossCheck(claims, req)
  let rounds = 0
  let issued = plan

  /* §15/§43 — refine while there is a gap, and stop. Termination is guaranteed
     by `refine`'s own exported ceiling, not by this loop being careful. */
  while (!sufficient(findings, req)) {
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
    const again = await runQueries(options.provider, next.queries)
    const more: readonly SearchHit[] = again.hits

    const already = new Set(retrieved.map((r) => r.hit.url))
    const fresh = rankHits(more, req, now)
      .filter((r) => !r.excluded && !already.has(r.hit.url))
      .slice(0, next.fetchCount)
    if (fresh.length === 0) break

    retrieved.push(...(await gather(fresh.map((r) => r.hit), gatherOptions)))
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
    rounds,
    violations: finalCheck(answer),
  }
}
