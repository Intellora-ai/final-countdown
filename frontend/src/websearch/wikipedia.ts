import { injectionSignals, stripInvisible } from './guard'
import type { RetrievedPage, SearchResult } from '../canvas/teach/webResolver'

/**
 * A retrieval source that needs no key, no server and no billing decision.
 *
 * WHY THIS FILE EXISTS WHEN `engine.ts` ALREADY HAS THE GENERAL SEAM
 * ------------------------------------------------------------------
 * It does, and the seam is right: a real engine slots in as a `jsonProvider`
 * config rather than a rewrite. But every general engine needs an account and a
 * key; a key cannot ship to a browser, because devtools and the network tab
 * both hand it over; and holding one server-side needs a server this repository
 * does not have anywhere in it. So the general path was correct and completely
 * unreachable, and the question that started this — "what is a transformation
 * graph" — kept coming back refused for a reason that had nothing to do with
 * the question.
 *
 * Wikipedia's REST API needs no key and sends CORS headers, so the browser can
 * call it directly. That removes both blockers at once. The cost is a narrower
 * corpus, and for "what does this word mean" — the shape of doubt a lesson most
 * often fails to cover — narrow is the right trade.
 *
 * THIS IS NOT A REPLACEMENT FOR THE GENERAL SEAM. When a keyed engine and
 * somewhere to keep its key both exist, this becomes one provider among
 * several rather than the only reachable one.
 *
 * WHY THE INJECTION GUARD STILL RUNS
 * ----------------------------------
 * Wikipedia is edited by anyone. "It is a reputable source" is a statement
 * about averages, not a security control, and an article can carry a paragraph
 * addressed at this software rather than at a reader. `injectionSignals` is the
 * same check the general path uses, and a flagged page is marked `suspicious`
 * so `webResolver` drops it before anything is rendered.
 *
 * WHY IT HANDS OVER CLEAN TEXT RATHER THAN `asEvidence` OUTPUT
 * ------------------------------------------------------------
 * `asEvidence` wraps content in a `<<<UNTRUSTED-WEB-CONTENT>>>` fence with a
 * warning header. That exists so fetched words can never be read as
 * instructions by a MODEL. Nothing downstream of here is a model — the text
 * goes to a person — and putting a delimiter and a security notice in front of
 * somebody who asked what a word means helps nobody. The fence's job is done
 * instead by `suspicious`: a flagged page is not shown at all.
 */

/** Article search. Public, keyless, CORS-enabled. */
export const SEARCH_URL = 'https://en.wikipedia.org/w/rest.php/v1/search/page'

/** One article's lead paragraph. Same terms. */
export const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/'

/**
 * Enough articles to cover a word with more than one meaning, few enough to
 * stay one request per source and finish while a learner is still waiting.
 */
const MAX_ARTICLES = 4

/**
 * Who is calling. Wikimedia rate-limits clients that do not say.
 *
 * MEASURED, NOT ASSUMED. Against the live API from Node:
 *
 *     no header        -> 429
 *     Api-User-Agent   -> 429
 *     User-Agent       -> 200
 *
 * Without it every request came back 429, `engineFailed` was set on all of
 * them, and the whole web rung refused every question while looking exactly
 * like "the web has no answer to this". A politeness header was the entire
 * difference between a feature that works and one that silently does not.
 *
 * IN A BROWSER THIS HEADER IS DROPPED, AND THAT IS FINE. `User-Agent` is a
 * forbidden header name, so `fetch` ignores it and the browser sends its own —
 * which is descriptive, which is what the limiter wants. The header therefore
 * matters in Node (tests, any future server-side use) and is harmless in the
 * place the app actually runs. Setting `Api-User-Agent` instead would be the
 * browser-safe spelling and, as measured above, does not clear the limit.
 */
const USER_AGENT = 'learning-os/1.0 (educational canvas; https://github.com/Intellora-ai/final-countdown)'

/** Sent on every request. One object so the two call sites cannot disagree. */
const REQUEST_INIT: RequestInit = { headers: { 'User-Agent': USER_AGENT } }

export interface WikipediaOptions {
  /** Injected so every test runs offline. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch
  readonly signal?: AbortSignal
}

interface SearchPage {
  key?: unknown
  title?: unknown
}

function pagesFrom(payload: unknown): SearchPage[] {
  if (typeof payload !== 'object' || payload === null) return []
  const pages = (payload as { pages?: unknown }).pages
  return Array.isArray(pages) ? (pages as SearchPage[]) : []
}

/** The article text and address, or null when there is nothing to show. */
function pageFrom(payload: unknown): { title: string; extract: string; url: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>

  const extract = typeof record['extract'] === 'string' ? record['extract'] : ''
  if (extract.trim().length === 0) return null

  const title = typeof record['title'] === 'string' ? record['title'] : ''

  const urls = record['content_urls']
  const desktop =
    typeof urls === 'object' && urls !== null
      ? (urls as Record<string, unknown>)['desktop']
      : undefined
  const page =
    typeof desktop === 'object' && desktop !== null
      ? (desktop as Record<string, unknown>)['page']
      : undefined

  return {
    title,
    extract,
    url: typeof page === 'string' && page.length > 0 ? page : SUMMARY_URL + encodeURIComponent(title),
  }
}

function toRetrieved(article: { title: string; extract: string; url: string }): RetrievedPage {
  /* Invisible characters stripped for the same reason the general path strips
     them: zero-width joiners are how an instruction hides inside prose that
     reads as ordinary text. */
  const clean = stripInvisible(article.extract)
  const signals = injectionSignals(clean)

  return {
    ok: true,
    title: article.title,
    readerText: clean,
    suspicious: signals.length > 0,
    finalUrl: article.url,
    hit: { url: article.url, title: article.title },
  }
}

/**
 * Query in, articles out. Satisfies `WebResolverDeps['search']`.
 *
 * Never throws. Every failure becomes `engineFailed` with a reason, because the
 * caller distinguishes "the source is down" from "the source has no answer" and
 * it can only do that if this hands it facts rather than exceptions.
 */
export async function wikipediaSearch(
  query: string,
  options: WikipediaOptions = {},
): Promise<SearchResult> {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  if (options.signal?.aborted) return { results: [], engineFailed: false }

  if (typeof doFetch !== 'function') {
    return { results: [], engineFailed: true, engineError: 'no fetch available' }
  }

  let pages: SearchPage[]
  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${MAX_ARTICLES}`
    const response = await doFetch(url, REQUEST_INIT)
    if (!response.ok) {
      return {
        results: [],
        engineFailed: true,
        engineError: `search returned ${response.status}`,
      }
    }
    pages = pagesFrom(await response.json())
  } catch (error) {
    return {
      results: [],
      engineFailed: true,
      engineError: error instanceof Error ? error.message : String(error),
    }
  }

  if (pages.length === 0) return { results: [], engineFailed: false }

  const wanted = pages.slice(0, MAX_ARTICLES)
  const settled = await Promise.all(
    wanted.map(async (page): Promise<RetrievedPage | null> => {
      const key = typeof page.key === 'string' ? page.key : String(page.title ?? '')
      if (key.length === 0) return null
      try {
        const response = await doFetch(SUMMARY_URL + encodeURIComponent(key), REQUEST_INIT)
        if (!response.ok) return null
        const article = pageFrom(await response.json())
        return article === null ? null : toRetrieved(article)
      } catch {
        /* One article being unreachable is not the search failing. Returning
           null drops this source and keeps the others, which is the difference
           between a partial answer and no answer. The engine-level failure
           above is where a real outage is reported. */
        return null
      }
    }),
  )

  return {
    results: settled.filter((page): page is RetrievedPage => page !== null),
    engineFailed: false,
  }
}
