/**
 * THE COMPOSITION ROOT — where retrieval becomes something the agent can call.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every module in this directory was written, unit-tested, and imported by
 * nothing that ships. The agent declared a `SearchPort` and made it OPTIONAL;
 * `agent/index.ts` notes that an absent port means the capability "is selected
 * and reported unavailable". So the system reported search as a capability it
 * had, and then reported it unavailable at the point of use --- which is why
 * one reader concluded search was built and another concluded it was not.
 * Both were reading true statements about different halves of a missing wire.
 *
 * WHY IT IS AN ADAPTER AND NOT A RE-EXPORT
 * ----------------------------------------
 * `engine.search()` returns a `SearchOutcome`: hits plus fetch results, plus
 * whether the engine itself failed. The agent's port wants only the hits. The
 * mapping is not cosmetic --- `Retrieved.ok` is false when the page could not
 * be fetched, and handing the agent a hit whose page never loaded invites it
 * to cite a source nobody read. Failed retrievals are dropped here, once,
 * rather than in every caller.
 *
 * WHY `corpus.ts` IS NOT IMPORTED HERE
 * ------------------------------------
 * `corpus.ts` is the SPEC 39 evaluation harness. Importing it from the serving
 * path to make a reachability gate go quiet would be a fake edge: an import
 * that exists to satisfy a checker rather than because the code needs it. It
 * is a second, separate surface and is declared as its own entry point.
 */

import { search as runSearch, type SearchProvider } from './engine'
import { MemoryCache, type PageCache } from './gather'
import type { SearchHit, SearchPort } from './port'

export interface WebSearchConfig {
  /** The retrieval backend. `fixtureProvider` and `jsonProvider` build these. */
  provider: SearchProvider
  /** Upper bound on hits returned to the agent. Engine default applies if unset. */
  maxResults?: number
  /**
   * Keep hits whose page could not be fetched. Default false: a hit the reader
   * cannot open is a citation waiting to be invented.
   */
  includeUnfetched?: boolean
  /**
   * Page cache. `engine.search()` has always accepted one --- `MemoryCache`
   * implements it and was reachable from nothing, so every caller refetched
   * pages it had already read. Omit to get a fresh `MemoryCache` per port.
   */
  cache?: PageCache
}

/**
 * Build the `SearchPort` the agent asks for.
 *
 * The returned object satisfies `agent/knowledge/knowledge.ts`'s `SearchPort`
 * structurally --- the two interfaces declare the identical shape, so no
 * conversion of the hit itself is needed, only selection.
 */
export function createSearchPort(config: WebSearchConfig): SearchPort {
  const cache = config.cache ?? new MemoryCache()
  return {
    async search(query: string): Promise<readonly SearchHit[]> {
      const outcome = await runSearch(query, {
        provider: config.provider,
        cache,
        ...(config.maxResults === undefined ? {} : { maxResults: config.maxResults }),
      })
      const usable = config.includeUnfetched
        ? outcome.results
        : outcome.results.filter((r) => r.ok)
      return usable.map((r) => r.hit)
    },
  }
}

export { fixtureProvider, jsonProvider, DEFAULT_RESULT_LIMIT } from './engine'
export { MemoryCache } from './gather'
export type { PageCache } from './gather'
export type { SearchProvider, SearchOutcome, SearchOptions } from './engine'
export type { SearchHit, SearchPort } from './port'
