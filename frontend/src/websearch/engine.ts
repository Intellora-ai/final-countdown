/**
 * THE MISSING HALF: a query goes in, fetched evidence comes out.
 *
 * NOTHING IN THE PRODUCT CALLS THIS YET. READ THIS BEFORE THE REST.
 * ----------------------------------------------------------------
 * `src/websearch` has zero references from anywhere outside itself — no
 * static import, no dynamic `import()`, not even a string mention:
 *
 *   grep -rn "websearch" src | grep -v "^src/websearch/"   ->  0 results
 *
 * That is not a lazy-loading artefact. `canvas` and `practice` ARE reachable,
 * through `React.lazy(() => import(...))` at `App.tsx:30` and `:36`, so the
 * difference between a deferred chunk and an unreferenced one is visible in
 * the same search. This directory is the second kind.
 *
 * WHAT THIS IS NOT, ANY MORE. An earlier version of this comment called it
 * "an island pointing at an island", because `src/agent` was unreachable too.
 * That half has since become FALSE and the sentence sat here saying it anyway:
 * `src/tutor/TutorView.tsx:22` imports `createAgent` from `../agent`, and
 * `App.tsx:37` lazy-imports `TutorView`. `src/agent` ships.
 *
 * The consequence is the opposite of what the old comment implied, so it is
 * worth stating rather than quietly deleting. Wiring this module in used to be
 * pointless — it would have moved `websearch` from one unreached island to a
 * deeper one. It is now the ONE change that would make this code run:
 * `createAgent()` already takes an optional `search?: SearchPort`
 * (`src/agent/index.ts`), `SearchProvider extends SearchPort`, and the path
 * from `App.tsx` to `research()` is complete except for that argument.
 *
 * A COMMENT ABOUT REACHABILITY GOES STALE THE MOMENT SOMEONE ELSE SHIPS, and
 * it goes stale SILENTLY — nothing fails, because a comment cannot fail. Both
 * halves were verified when written and one of them expired within hours. Run
 * the greps below before trusting either; do not trust this paragraph.
 *
 * `npm run gate:reachability` PRINTS PASS AND DOES NOT CONTRADICT THIS.
 * It scans one declared area — `src/agent`, from the entry points
 * `src/agent/index.ts` and `src/agent/kernel/contracts.ts` — so
 * "15/15 source files reachable" is a statement about paths WITHIN that
 * island, not about whether anything outside reaches it. `src/websearch` is
 * not a declared area at all, so the gate never looks here. Read the PASS as
 * "no orphans inside the scanned area", which is what it measures and is
 * worth having; do not read it as "wired up".
 *
 * Stated here rather than in a pull request, because a gap recorded only in a
 * thread is memory rather than mechanism, and memory is what this module has
 * repeatedly been caught relying on. Everything below is tested, mutation-
 * checked, and unreached. Both halves of that are true and neither cancels
 * the other: a defect found before wiring is cheaper than one found after,
 * and "shipped" here means "merged", not "running".
 *
 * Everything else in this directory processes results. Nothing produced them.
 * That gap is why the system could be fully tested and still not run, and it
 * is what this file closes.
 *
 * WHY A PROVIDER SEAM RATHER THAN AN ENGINE
 * -----------------------------------------
 * A real engine needs an account, a key, and a billing decision that is not
 * mine to make. Hard-coding one would also bind the whole pipeline to a
 * vendor's response shape. `SearchProvider` is the seam instead: `search()`
 * works today against fixtures, and a live engine becomes a `jsonProvider`
 * config — an endpoint template and a mapper — rather than a rewrite.
 *
 * WHY THE ENGINE IS UNTRUSTED TOO
 * -------------------------------
 * It is easy to treat the search API as friendly infrastructure. It is
 * another remote party returning arbitrary JSON: a mapper can throw on a
 * changed shape, and a hit can carry a `javascript:` URL. Both are handled
 * here rather than left for the fetcher, because a bad URL that reaches the
 * result list has already been counted as a source.
 *
 * WHY ENGINE FAILURE IS ITS OWN FIELD
 * -----------------------------------
 * "The engine returned nothing" and "the engine broke" both produce zero
 * results, and they mean opposite things: one is an answer about the world,
 * the other is an outage. Collapsing them lets a broken provider look like a
 * question with no answer, which is the most expensive kind of silent
 * failure.
 */

import { gather, type GatherOptions, type PageCache, type Retrieved } from './gather'
import { Latency } from './latency'
import type { FetchOutcome } from './fetchPage'
import type { SearchHit, SearchPort } from './port'

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

export interface SearchProvider extends SearchPort {
  /** Named so a report can say where results came from. */
  name: string
}

const key = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * A provider backed by recorded results.
 *
 * The thing that makes the whole pipeline runnable and testable without a
 * key, a network, or a billing account — and therefore the thing the
 * benchmark corpus runs against.
 *
 * An unknown query returns NOTHING rather than a guess. A fixture provider
 * that improvises would have the benchmark scoring the improvisation.
 */
export function fixtureProvider(fixtures: Record<string, readonly SearchHit[]>): SearchProvider {
  const table = new Map(Object.entries(fixtures).map(([q, hits]) => [key(q), hits]))
  return {
    name: 'fixture',
    search: async (query: string) => table.get(key(query)) ?? [],
  }
}

/**
 * How many results the engine is asked for, and how many get fetched.
 *
 * ONE constant, because two of them silently disagreed. `jsonProvider`
 * defaulted to 10 while `search` defaulted to 8, so every call to a metered
 * API paid for two results nobody read. Invisible in review and invisible in
 * tests, since no test read both numbers — which is why the test that now
 * guards this asserts they are the same value rather than asserting each.
 */
export const DEFAULT_RESULT_LIMIT = 8

export interface JsonProviderConfig {
  name: string
  /** `{query}`, `{limit}` and `{key}` are substituted, url-encoded. */
  endpoint: string
  /** Turn the engine's response body into hits. May throw; that is handled. */
  map: (body: unknown) => readonly SearchHit[]
  /**
   * Required when the endpoint contains `{key}`. Kept out of everything this
   * returns; present only in the request.
   */
  apiKey?: string
  limit?: number
  /**
   * Deadline for the engine call. The default transport had none, which is
   * the whole reason this option exists.
   */
  timeoutMs?: number
  fetchJson?: (url: string) => Promise<unknown>
}

/**
 * Deadline for the engine call.
 *
 * There was none. Every test in this module injected `fetchJson`, so the
 * default path — the one calling the real `fetch` — was executed by nothing,
 * and untested code cannot fail a test. A search API that accepted the
 * connection and went quiet held `search()` open indefinitely, and every
 * caller with it.
 *
 * This is the same defect fixed in `fetchPage` after a loopback stub caught
 * it at 5011ms against a 250ms budget. Every window was locked and the front
 * door was left open, because the tests all walked around it.
 */
const DEFAULT_ENGINE_TIMEOUT_MS = 8_000

/**
 * The default transport, with a deadline attached.
 *
 * Separated from `jsonProvider` so it can be exercised directly rather than
 * only through a config that replaces it.
 */
function defaultFetchJson(timeoutMs: number): (url: string) => Promise<unknown> {
  return async (url: string) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await (globalThis.fetch as typeof fetch)(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      return (await response.json()) as unknown
    } finally {
      /* Cleared after the BODY is parsed, not after headers arrive. `fetch`
         resolves on headers, so clearing earlier would leave the json() read
         unbounded — precisely the bug this exists to prevent, one layer down. */
      clearTimeout(timer)
    }
  }
}

/** Non-http(s) URLs never make it into a result list. */
function usable(hit: SearchHit): boolean {
  try {
    const url = new URL(hit.url)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The shape a live engine plugs into.
 *
 * Deliberately generic: an endpoint template and a mapping function cover
 * every JSON search API worth using, and none of the pipeline learns the
 * vendor's name.
 */
export function jsonProvider(config: JsonProviderConfig): SearchProvider {
  const secret = config.apiKey ?? ''
  const limit = config.limit ?? DEFAULT_RESULT_LIMIT
  const timeoutMs = config.timeoutMs ?? DEFAULT_ENGINE_TIMEOUT_MS

  /* Fail at CONSTRUCTION, loudly, rather than at request time, silently.
     `{key}` used to be substituted with '' when no secret was supplied: the
     request went out unauthenticated, the engine answered 401, the mapper
     threw on the error body, and the catch below returned [] with
     `engineFailed` still FALSE. A misconfigured key became "this question has
     no answer" — destroying the exact distinction `engineFailed` exists to
     preserve. A missing key is a config error, and config errors belong where
     someone is looking. */
  if (config.endpoint.includes('{key}') && !secret) {
    throw new Error(
      `jsonProvider("${config.name}"): endpoint contains {key} but no apiKey was given`,
    )
  }

  const fetchJson = config.fetchJson ?? defaultFetchJson(timeoutMs)

  return {
    name: config.name,
    search: async (query: string) => {
      const url = config.endpoint
        .replace('{query}', encodeURIComponent(query))
        .replace('{limit}', encodeURIComponent(String(limit)))
        .replace('{key}', encodeURIComponent(secret))

      /* FAILURES PROPAGATE. They used to be swallowed here.
       *
       * This returned [] on any error, so `search()`'s own catch never fired
       * and a dead engine produced `{ results: [], engineFailed: false }` —
       * byte-identical to a question that genuinely has no answers. Those two
       * mean opposite things: one is an answer about the world, the other is
       * an outage, and `engineFailed` exists only to tell them apart.
       *
       * The old comment argued a thrown error "takes the caller down". It
       * does not: `search()` catches it and converts it to `engineFailed`
       * with the reason attached. Swallowing did not protect the caller, it
       * lied to them — and a status field that reports success for every real
       * failure mode is worse than no status field, because it is trusted. */
      const body = await fetchJson(url)
      return config.map(body).filter(usable)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* search                                                                     */
/* -------------------------------------------------------------------------- */

export interface SearchOptions {
  provider: SearchProvider
  maxResults?: number
  latency?: Latency
  cache?: PageCache
  requireFresh?: boolean
  maxAgeMs?: number
  concurrency?: number
  fetchImpl?: (url: string) => Promise<FetchOutcome>
  now?: () => number
}

export interface SearchOutcome {
  query: string
  engine: string
  results: readonly Retrieved[]
  /** True only when the provider itself failed, never when it found nothing. */
  engineFailed: boolean
  engineError?: string
  /** Hits the engine returned, before the fetch cap was applied. */
  hitsReturned: number
}

/**
 * Query in, evidence out.
 *
 * Thin on purpose. The judgement lives in the modules this composes — which
 * pages are worth fetching is the engine's problem, what the bytes mean is
 * `extract`'s, whether the text can be trusted is `guard`'s. What is genuinely
 * only here is the ordering, the cap, and telling an empty answer apart from
 * a broken engine.
 */
export async function search(query: string, options: SearchOptions): Promise<SearchOutcome> {
  const latency = options.latency
  const now = options.now ?? Date.now
  const maxResults = Math.max(1, options.maxResults ?? DEFAULT_RESULT_LIMIT)

  let hits: readonly SearchHit[] = []
  let engineFailed = false
  let engineError: string | undefined

  const engineStarted = now()
  try {
    hits = await options.provider.search(query)
  } catch (err) {
    engineFailed = true
    engineError = err instanceof Error ? err.message : String(err)
  }
  latency?.stage('engine', Math.max(0, now() - engineStarted))

  if (engineFailed || !hits.length) {
    return {
      query,
      engine: options.provider.name,
      results: [],
      engineFailed,
      ...(engineError === undefined ? {} : { engineError }),
      hitsReturned: hits.length,
    }
  }

  const gatherOptions: GatherOptions = {
    ...(options.cache ? { cache: options.cache } : {}),
    ...(latency ? { latency } : {}),
    ...(options.requireFresh === undefined ? {} : { requireFresh: options.requireFresh }),
    ...(options.maxAgeMs === undefined ? {} : { maxAgeMs: options.maxAgeMs }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now ? { now: options.now } : {}),
  }

  const results = await gather(hits.slice(0, maxResults), gatherOptions)

  return {
    query,
    engine: options.provider.name,
    results,
    engineFailed: false,
    hitsReturned: hits.length,
  }
}
