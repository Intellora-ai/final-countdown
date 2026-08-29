/**
 * THE SEARCH PORT THE DEPLOYED SERVER USES.
 *
 * WHY THIS EXISTS
 * ---------------
 * `index.ts` wired its search port to `throw new Error('search is not
 * configured')`, with a comment saying "Wired in Phase 4". So `/api/search`
 * existed on the deployed server and could never answer, while the real
 * implementation sat in a Vite plugin that only runs under `vite dev`.
 *
 * This is the adapter between the two shapes. `searchWeb.ts` answers like an
 * HTTP route — a status and a JSON string, because that is what it was written
 * to be. `handler.ts` wants a port that returns pages or raises. Neither shape
 * is wrong; this is the one place that knows both.
 *
 * WHY A FAILED SEARCH THROWS AND AN EMPTY WEB DOES NOT
 * ----------------------------------------------------
 * They are different facts and the caller acts differently on them. "The web
 * had nothing about this" is an answer. "The provider refused our key" is an
 * outage, and returning it as an empty list is a verdict with no evidence
 * behind it — the learner would be told nothing exists when nobody looked.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * Touch the page text. `handler.ts` screens results for prompt injection, and
 * it can only screen what it is given. A layer that cleaned, trimmed or
 * summarised here would be handing the screen something the model never sees.
 */

import type { SearchResult } from './handler.ts'
import { searchTheOpenWeb, type SearchReply } from './searchWeb.ts'

/** One open-web search: a request document in, a status and a body out. */
export type RunSearch = (requestBody: string) => Promise<SearchReply>

export interface SearchPortOptions {
  /** Injected in tests. Defaults to the real open-web search. */
  readonly run?: RunSearch
}

interface Page {
  readonly url?: unknown
  readonly text?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createSearchPort(options: SearchPortOptions = {}): {
  search(query: string): Promise<readonly SearchResult[]>
} {
  const run: RunSearch = options.run ?? ((body) => searchTheOpenWeb(body))

  return {
    async search(query: string): Promise<readonly SearchResult[]> {
      let reply: SearchReply
      try {
        reply = await run(JSON.stringify({ query }))
      } catch (failure) {
        /* THE MESSAGE IS REPLACED, NOT PASSED ON, AND A TEST FOUND WHY.
         *
         * A provider client that rejects a credential tends to say so with the
         * credential in the sentence. That error would travel up through
         * `handler.ts` and into a response body. `scrub` is the last line of
         * defence and only knows the secrets it was handed; not putting the key
         * in the message is the first line, and it does not depend on a list
         * being complete.
         *
         * The failure is not swallowed: it becomes a throw with a name a reader
         * can act on, and the original is logged where logs are not responses. */
        console.error('search failed:', failure instanceof Error ? failure.name : 'unknown error')
        throw new Error('search unavailable: the provider could not be reached')
      }

      if (reply.status !== 200) {
        /* The status, not the body. A failure body can quote configuration —
         * `searchWeb.ts` redacts the key it knows about, and not repeating the
         * body here means this layer does not depend on that being complete. */
        throw new Error(`search unavailable (${reply.status})`)
      }

      let document: unknown
      try {
        document = JSON.parse(reply.body)
      } catch {
        throw new Error('search returned something that is not JSON')
      }
      if (!isRecord(document)) {
        throw new Error('search returned something that is not an object')
      }

      if (document['engineFailed'] === true) {
        /* Every planned query failed. `searchWeb.ts` sets this only in that
         * case and never for an empty web, which is the distinction that makes
         * throwing here correct. */
        throw new Error('search engine failed on every query')
      }

      const pages = document['pages']
      if (!Array.isArray(pages)) return []

      const results: SearchResult[] = []
      for (const page of pages as readonly Page[]) {
        if (typeof page?.url !== 'string' || typeof page?.text !== 'string') continue
        /* The page's own words, unchanged. See the note at the top. */
        results.push({ url: page.url, content: page.text })
      }
      return results
    },
  }
}
