import { contentTokens } from '../canvas/teach/doubt'
import {
  isAbout,
  type Origin,
  type RetrievedPage,
  type SearchResult,
} from '../canvas/teach/webResolver'
import type { Retrieved } from './gather'
import { interpret } from './interpret'
import { rankHits } from './select'
import { checkClaims, selectEvidence } from './verify'

/**
 * The browser half of open-web search.
 *
 * WHAT IT HOLDS: nothing. No key, no vendor name, no page fetching. It posts
 * the learner's question to a route on its OWN ORIGIN and reads back pages
 * somebody else was allowed to fetch. Both halves of that are forced:
 *
 *   the key   a credential in a browser is a credential you have published
 *   CORS      a browser may not read a page that did not opt in, and almost
 *             no page does
 *
 * WHY THE VERIFICATION HAPPENS HERE AND NOT IN THE CANVAS
 * -------------------------------------------------------
 * `crosscheck.ts` and `evidence.ts` cannot be imported from `src/canvas`:
 * `tsconfig.canvas.json` checks that directory under
 * `noUncheckedIndexedAccess`, and dragging `src/websearch` into the stricter
 * project lights up errors in code no change here touches. So the canvas asks
 * a question and is handed back both the pages AND the verdict, in shapes it
 * declares for itself.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not trim the question. The Wikipedia rung had to: that API matches
 * article titles, so "can you explain photosynthesis to me please" returned a
 * skateboarder. A general engine reads natural language, and stripping words
 * before it sees them throws away the context that lets it do so. The trimmed
 * vocabulary still matters — `contentTokens` decides which pages are ABOUT the
 * question — but that happens to the RESULTS, not to the request.
 */

export const SEARCH_ROUTE = '/api/search'

export interface WebSearchOptions {
  /** Injected so every test runs with no network. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch
  /** Overridden only if the route is mounted somewhere else. */
  readonly endpoint?: string
  readonly signal?: AbortSignal
}

interface RoutePage {
  readonly title: string
  readonly url: string
  readonly domain: string
  readonly text: string
  readonly suspicious: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toRoutePage(value: unknown): RoutePage | null {
  const record = asRecord(value)
  if (!record) return null
  const url = str(record['url'])
  const text = str(record['text'])
  if (!url || !text.trim()) return null
  return {
    title: str(record['title']) || url,
    url,
    domain: str(record['domain']),
    text,
    suspicious: record['suspicious'] === true,
  }
}

function toReaderPage(page: RoutePage): RetrievedPage {
  return {
    ok: true,
    title: page.title,
    /* `text`, never a fence-wrapped variant. This goes to a person. */
    readerText: page.text,
    suspicious: page.suspicious,
    finalUrl: page.url,
    hit: { url: page.url, title: page.title },
  }
}

/**
 * The shape `evidence.ts` and `crosscheck.ts` were written against.
 *
 * Built rather than imported because these pages were fetched by the SERVER;
 * the fields that only a fetcher can know (`retrievedAt`, `truncated`,
 * `fromCache`) are filled with what is actually true from here rather than
 * invented. `retrievedAt` is the one that matters: it feeds freshness, and a
 * fabricated timestamp would let a stale answer call itself live.
 */
function toRetrieved(page: RoutePage, retrievedAt: string): Retrieved {
  return {
    hit: { url: page.url, title: page.title, snippet: '' },
    ok: true,
    title: page.title,
    text: page.text,
    tables: [],
    evidence: '',
    suspicious: page.suspicious,
    signals: [],
    finalUrl: page.url,
    truncated: false,
    retrievedAt,
    fromCache: false,
  }
}

/**
 * A failure, carrying BOTH facts rather than making the caller choose.
 *
 * `engineFailed` says the search broke; `status: 'unknown'` says nothing could
 * be checked. Those are different statements and both are true here, so both
 * are sent. Sending only the first would leave any consumer reading `check`
 * with no verdict at all, and a missing verdict is the one thing a
 * fail-closed reader cannot distinguish from a passing one.
 *
 * `unknown` is NOT a claim that the answer is false. It says nobody looked, or
 * looking failed.
 */
/**
 * The origins the route reported, keeping only the ones that mean something.
 *
 * NOT A CAST. The first version relayed `origins` as `string[]` and the
 * canvas's own type was loose enough to accept it — so a route sending
 * `["totally-fresh"]` would have arrived, typechecked, and rendered as a
 * meaningful provenance label. Tightening the canvas declaration to the real
 * union is what surfaced it, which is the argument for declaring shapes as
 * strictly as the source rather than as loosely as the parser.
 *
 * Unknown values are DROPPED, not mapped to a default. An unrecognised origin
 * is not evidence of freshness in either direction, and `live` is carried
 * separately anyway.
 */
const ORIGINS: readonly Origin[] = ['live', 'recent-cache', 'precomputed']

function originsFrom(value: unknown): readonly Origin[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is Origin => ORIGINS.includes(v as Origin))
}

function failure(why: string): SearchResult {
  return {
    results: [],
    engineFailed: true,
    engineError: why,
    check: { status: 'unknown', supportingEvidenceIds: [], conflictingEvidenceIds: [] },
  }
}

/**
 * Ask the open web, and come back with pages AND a verdict on them.
 *
 * Never throws. Every failure becomes `engineFailed` with a reason, because the
 * caller has to tell "the search is broken" from "the web has nothing to say"
 * and it can only do that if this hands it facts rather than exceptions.
 */
export async function searchTheWeb(
  query: string,
  options: WebSearchOptions = {},
): Promise<SearchResult> {
  if (options.signal?.aborted) return { results: [], engineFailed: false }

  const doFetch = options.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') return failure('no fetch available in this environment')

  let payload: unknown
  let httpOk = false
  let status = 0
  try {
    const response = await doFetch(options.endpoint ?? SEARCH_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    httpOk = response.ok
    status = response.status
    payload = await response.json()
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }

  const record = asRecord(payload)

  if (!httpOk) {
    /* The body is READ even on a failure status, because the route puts the
       actionable sentence there: naming the environment variable it is missing
       is worth far more to whoever is looking than "503".

       The variable's NAME is deliberately not written out here. It belongs to
       the server, and `island.test.ts` refuses any occurrence of it under
       `src/` — everything here is compiled into something a browser downloads,
       and the credential's name has no business on that side of the wire even
       as prose. */
    return failure(str(record?.['engineError']) || `the search route answered ${status}`)
  }

  const raw = record?.['pages']
  if (!Array.isArray(raw)) {
    /* A shape this client cannot read is a broken route, not an empty web.
       Returning `{ results: [], engineFailed: false }` here would tell a
       learner their question has no answer because a JSON key was renamed. */
    return failure('the search route sent something this client could not read')
  }

  const routePages = raw.map(toRoutePage).filter((p): p is RoutePage => p !== null)
  const results = routePages.map(toReaderPage)

  if (record?.['engineFailed'] === true) {
    return {
      results,
      engineFailed: true,
      ...(str(record['engineError']) ? { engineError: str(record['engineError']) } : {}),
      check: { status: 'unknown', supportingEvidenceIds: [], conflictingEvidenceIds: [] },
    }
  }

  /*
   * WHICH PAGES ARE ALLOWED TO VOTE.
   *
   * Two filters here, each removing a different way a page can be worthless:
   *
   *   off-topic    it shares fewer than half the question's words
   *   excluded     `select.ts` judged the source unusable at all
   *
   * A THIRD ONE — `!p.suspicious` — WAS HERE AND WAS REMOVED, ON EVIDENCE.
   * Mutation testing showed deleting it changed no outcome, because taint is
   * already enforced where it matters: `extractClaims` marks a claim from a
   * suspicious page `tainted`, `countVoices` refuses to count tainted voices,
   * and `selectEvidence` refuses to quote one. Filtering here as well was a
   * second spelling of a rule that already holds, and a second spelling is the
   * thing that later disagrees with the first.
   *
   * The pages themselves still go back to the canvas untouched. The canvas has
   * to be able to say "pages came back and could not be trusted", and it cannot
   * say that about pages this function quietly deleted.
   */
  const req = interpret(query)
  const terms = contentTokens(query)
  const onTopic = routePages.filter((p, i) => isAbout(results[i] as RetrievedPage, terms))

  const usableUrls = new Set(
    rankHits(
      onTopic.map((p) => ({ url: p.url, title: p.title, snippet: '' })),
      req,
    )
      .filter((r) => !r.excluded)
      .map((r) => r.hit.url),
  )

  const retrievedAt = new Date().toISOString()
  const voting = onTopic.filter((p) => usableUrls.has(p.url)).map((p) => toRetrieved(p, retrievedAt))

  const check = checkClaims(voting, query)
  const chosen = selectEvidence(voting, query)

  /* Freshness and rounds are RELAYED, never defaulted. The route computes both;
     a client that dropped them would make the canvas unable to say whether an
     answer was read live, and one that invented them would let a saved answer
     claim it was. Absent stays absent. */
  const freshness = asRecord(record?.['freshness'])
  const rounds = record?.['rounds']

  return {
    results,
    engineFailed: false,
    check,
    ...(chosen === null ? {} : { evidence: { text: chosen.text, sourceUrl: chosen.sourceUrl } }),
    ...(freshness === null
      ? {}
      : {
          freshness: {
            live: freshness['live'] === true,
            origins: originsFrom(freshness['origins']),
            usableSources:
              typeof freshness['usableSources'] === 'number' ? freshness['usableSources'] : 0,
            ...(typeof freshness['oldestAgeMs'] === 'number'
              ? { oldestAgeMs: freshness['oldestAgeMs'] }
              : {}),
          },
        }),
    ...(typeof rounds === 'number' ? { rounds } : {}),
  }
}
