/**
 * THE MISSING HALF: a query goes in, fetched evidence comes out.
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

export interface JsonProviderConfig {
  name: string
  /** `{query}`, `{limit}` and `{key}` are substituted, url-encoded. */
  endpoint: string
  /** Turn the engine's response body into hits. May throw; that is handled. */
  map: (body: unknown) => readonly SearchHit[]
  /** Kept out of everything this returns. Present only in the request. */
  apiKey?: string
  limit?: number
  fetchJson?: (url: string) => Promise<unknown>
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
export function jsonProvider(
  config: JsonProviderConfig & { key?: string },
): SearchProvider {
  const secret = config.apiKey ?? config.key ?? ''
  const limit = config.limit ?? 10
  const fetchJson =
    config.fetchJson ??
    (async (url: string) => {
      const response = await (globalThis.fetch as typeof fetch)(url, {
        headers: { accept: 'application/json' },
      })
      return (await response.json()) as unknown
    })

  return {
    name: config.name,
    search: async (query: string) => {
      const url = config.endpoint
        .replace('{query}', encodeURIComponent(query))
        .replace('{limit}', encodeURIComponent(String(limit)))
        .replace('{key}', encodeURIComponent(secret))

      try {
        const body = await fetchJson(url)
        /* The mapper runs against a remote party's JSON. A changed response
           shape is an outage to report as "no results", never a thrown error
           that takes the caller down. */
        return config.map(body).filter(usable)
      } catch {
        return []
      }
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

const DEFAULT_MAX_RESULTS = 8

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
  const maxResults = Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS)

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
