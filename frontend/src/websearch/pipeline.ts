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
  /** How many refinement rounds ran. 0 means the first pass was enough. */
  rounds: number
  /** Always empty in practice. Non-empty means this file has a bug. */
  violations: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* ask                                                                        */
/* -------------------------------------------------------------------------- */

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
    rounds: 0,
    violations: finalCheck(answer),
    ...extra,
  })

  /* §42 — decided not to search. No request is made. */
  if (!req.shouldSearch) {
    return empty(buildAnswer(req, crossCheck([], req), { engineFailed: false }))
  }

  /* Retrieval. The engine is another remote party: a throw here is an outage,
     and it must stay distinguishable from a question with no answers. */
  let hits: readonly SearchHit[] = []
  let engineFailed = false
  let engineError: string | undefined

  const engineStarted = now()
  try {
    const perQuery = await Promise.all(plan.queries.map((q) => options.provider.search(q.text)))
    /* Same URL from two planned queries is one page, not two sources. */
    const seen = new Set<string>()
    hits = perQuery.flat().filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)))
  } catch (err) {
    engineFailed = true
    engineError = err instanceof Error ? err.message : String(err)
  }
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

    let more: readonly SearchHit[] = []
    try {
      const results = await Promise.all(next.queries.map((q) => options.provider.search(q.text)))
      more = results.flat()
    } catch {
      /* A refinement that fails is one lost round, never a lost answer: the
         evidence already gathered stands and the loop stops. */
      break
    }

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
    rounds,
    violations: finalCheck(answer),
  }
}
