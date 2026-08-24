import type { Plugin } from 'vite'

import { search, type SearchProvider } from './src/websearch/engine'
import type { FetchOutcome } from './src/websearch/fetchPage'
import type { SearchHit } from './src/websearch/port'

/**
 * The bridge between the canvas and the OPEN WEB.
 *
 * WHY A SERVER ROUTE EXISTS HERE WHEN THE WIKIPEDIA RUNG NEEDED NONE
 * ------------------------------------------------------------------
 * Two independent forces, either one sufficient on its own.
 *
 * THE KEY. Every general search provider needs one. A key that reaches a
 * browser is a key you have published: devtools shows it, the network tab
 * shows it, view-source shows it. Wikipedia needs no key, which is the only
 * reason that rung could live entirely inside the page.
 *
 * CORS. A browser may not read a response from a site that did not opt in, and
 * almost no site opts in. Wikipedia does. So even holding a key, reading the
 * pages a search returns is something only a server can do.
 *
 * Together they are why "just call Brave from the component" is not a smaller
 * version of this. It is not a version of this at all.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER
 * -------------------------------------
 * A production build. This is a dev-server middleware exactly like
 * `/api/doubt`, and `vite build` emits static files with no middleware among
 * them. Where this runs in production, who pays for the searches and what holds
 * the key are hosting decisions; a build plugin does not get to make them
 * quietly. Stated here rather than discovered at deploy time.
 *
 * WHY IT COMPOSES `engine.ts` RATHER THAN CALLING A VENDOR
 * --------------------------------------------------------
 * `src/websearch/engine.ts` already had the general seam — a provider, a fetch
 * cap, and the one distinction the whole rung rests on: an engine that FAILED
 * versus a web with NOTHING TO SAY. It was written, tested, and reached by
 * nothing that ships, because a key cannot live in a browser and no server
 * existed to hold one. This route is that server. Nothing here names a vendor:
 * the endpoint is a template read from the environment, so swapping Brave for
 * Tavily is an env change, not a code change.
 */

/** The one route. Relative, so the browser never learns which vendor answered. */
export const ENDPOINT = '/api/search'

/** Server-side only. Never read in `src/`, never bundled, never sent to a page. */
export const API_KEY_ENV = 'WEB_SEARCH_API_KEY'

/**
 * The provider's search URL, as a template.
 *
 * `{query}`, `{limit}` and `{key}` are substituted url-encoded. A provider that
 * authenticates by header simply omits `{key}` and gets it in the headers
 * instead; see `authHeaders`.
 *
 *   Brave    https://api.search.brave.com/res/v1/web/search?q={query}&count={limit}
 *   generic  https://example/search?q={query}&n={limit}&key={key}
 */
export const ENDPOINT_ENV = 'WEB_SEARCH_ENDPOINT'

/**
 * How many candidates to ask for, and how many to actually read.
 *
 * ASK is larger than READ on purpose. Ranking is candidate ORDER, never
 * verification, and several of the top hits will be unfetchable, paywalled or
 * off-topic. Asking for more than will be read is what makes "at least five
 * pages, from more than one domain" reachable rather than aspirational.
 */
const ASK_FOR = 10
const READ_AT_MOST = 5

/** A question is a sentence. Anything larger is not a question. */
const MAX_BODY_BYTES = 8_000

/** Long enough for a search plus five page reads, short enough to not hang a learner. */
const TIMEOUT_MS = 20_000

export interface SearchedPage {
  readonly title: string
  readonly url: string
  /** Hostname. The browser groups by registrable domain; this is what it groups. */
  readonly domain: string
  /** The page's own words, unchanged. Never summarised, never rewritten. */
  readonly text: string
  /** True when the page carries text aimed at this software rather than a reader. */
  readonly suspicious: boolean
}

export interface SearchReplyBody {
  readonly pages: readonly SearchedPage[]
  /** True only when the PROVIDER failed. Never true for a web with no answer. */
  readonly engineFailed: boolean
  readonly engineError?: string
}

export interface SearchReply {
  readonly status: number
  readonly body: string
}

export type FetchJson = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<unknown>

export interface SearchDeps {
  /** Injected so tests never read the real environment. */
  readonly env?: Record<string, string | undefined>
  readonly fetchJson?: FetchJson
  readonly fetchImpl?: (url: string) => Promise<FetchOutcome>
  readonly now?: () => number
}

/* -------------------------------------------------------------------------- */
/* Keeping the secret a secret                                                */
/* -------------------------------------------------------------------------- */

/**
 * Remove the key from anything on its way out.
 *
 * NOT BELT-AND-BRACES — THIS CATCHES A REAL AND ORDINARY LEAK. A provider
 * client that throws `401 from https://api…?key=sk-live-…` has put the secret
 * inside an Error message, and that message is exactly what a helpful route
 * forwards as `engineError`. The key never appears in a response we CONSTRUCT;
 * it appears in one we RELAY. So the redaction happens at the boundary, on
 * everything, rather than at each place a message is built.
 */
function redact(text: string, secret: string): string {
  if (!secret) return text
  return text.split(secret).join('[redacted]')
}

/**
 * How the key is presented when the endpoint template does not carry it.
 *
 * Both headers are sent because providers disagree and the route refuses to
 * learn their names: Brave reads `X-Subscription-Token`, bearer-style APIs read
 * `Authorization`. A provider ignores the header it does not know. The endpoint
 * is operator-supplied server configuration, not user input, so sending a
 * credential to it is a decision the operator already made by setting it.
 */
function authHeaders(secret: string): Record<string, string> {
  return {
    accept: 'application/json',
    'X-Subscription-Token': secret,
    Authorization: `Bearer ${secret}`,
  }
}

/* -------------------------------------------------------------------------- */
/* Reading a provider's answer without learning its name                      */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Find the result list in a provider response, whatever it decided to call it.
 *
 * A HAND-WRITTEN MAPPER PER VENDOR IS THE THING THIS AVOIDS. The moment the
 * route contains `body.web.results`, swapping providers is a code change and a
 * deploy, and the "no vendor named here" property is gone. Every general search
 * API returns an array of objects carrying a url, a title and a snippet under
 * some name; this walks the response for the first array shaped like that.
 *
 * Depth-limited rather than unbounded: a response is a document, not a graph,
 * and an unbounded walk over attacker-influenced JSON is a denial of service
 * waiting to be reported.
 */
function findHits(body: unknown, depth = 0): readonly SearchHit[] {
  if (depth > 4) return []

  if (Array.isArray(body)) {
    const hits = body
      .map((item) => {
        const record = asRecord(item)
        if (!record) return null
        const url = str(record['url']) || str(record['link']) || str(record['href'])
        if (!url) return null
        return {
          url,
          title: str(record['title']) || str(record['name']) || url,
          snippet:
            str(record['snippet']) ||
            str(record['description']) ||
            str(record['content']) ||
            str(record['extract']),
        }
      })
      .filter((hit): hit is SearchHit => hit !== null)
    if (hits.length > 0) return hits
    return []
  }

  const record = asRecord(body)
  if (!record) return []

  /* Ordered so the obvious names win before the walk starts guessing. */
  for (const key of ['results', 'web', 'items', 'data', 'organic', 'value']) {
    const found = findHits(record[key], depth + 1)
    if (found.length > 0) return found
  }
  for (const value of Object.values(record)) {
    const found = findHits(value, depth + 1)
    if (found.length > 0) return found
  }
  return []
}

/* -------------------------------------------------------------------------- */
/* The provider                                                               */
/* -------------------------------------------------------------------------- */

/** The default transport. Has a deadline, because a silent socket is forever. */
function defaultFetchJson(): FetchJson {
  return async (url, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await (globalThis.fetch as typeof fetch)(url, {
        headers: init?.headers ?? {},
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`the search provider answered ${response.status}`)
      return (await response.json()) as unknown
    } finally {
      /* Cleared after the BODY is read, not after headers arrive: `fetch`
         resolves on headers, so clearing earlier leaves the json() read
         unbounded — the same defect `engine.ts` documents one layer down. */
      clearTimeout(timer)
    }
  }
}

function providerFor(endpoint: string, secret: string, fetchJson: FetchJson): SearchProvider {
  const carriesKey = endpoint.includes('{key}')

  return {
    /* No vendor name. The browser is told a search happened, never by whom. */
    name: 'web',
    search: async (query: string) => {
      const url = endpoint
        .replace('{query}', encodeURIComponent(query))
        .replace('{limit}', encodeURIComponent(String(ASK_FOR)))
        .replace('{key}', encodeURIComponent(secret))

      const headers = carriesKey ? { accept: 'application/json' } : authHeaders(secret)
      return findHits(await fetchJson(url, { headers }))
    },
  }
}

/* -------------------------------------------------------------------------- */
/* The route                                                                  */
/* -------------------------------------------------------------------------- */

function reply(status: number, body: SearchReplyBody, secret: string): SearchReply {
  return { status, body: redact(JSON.stringify(body), secret) }
}

function failed(status: number, why: string, secret: string): SearchReply {
  /* `engineFailed` rather than an empty page list. "Nobody looked" and "the web
     has nothing" are opposite facts, and a route that returns the same document
     for both turns a missing environment variable into a claim about the
     world. */
  return reply(status, { pages: [], engineFailed: true, engineError: redact(why, secret) }, secret)
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * Run one question against the open web and return what to send back.
 *
 * Exported so the whole path is testable with no dev server, no socket and no
 * network. Never throws: every failure becomes a status and a JSON document,
 * because the caller renders whatever it gets and an exception here reaches a
 * learner as a blank panel.
 */
export async function searchTheOpenWeb(
  requestBody: string,
  deps: SearchDeps = {},
): Promise<SearchReply> {
  const environment = deps.env ?? process.env
  const secret = environment[API_KEY_ENV] ?? ''
  const endpoint = environment[ENDPOINT_ENV] ?? ''

  if (Buffer.byteLength(requestBody) > MAX_BODY_BYTES) {
    return failed(413, 'that question is too long', secret)
  }

  let query = ''
  try {
    const parsed = asRecord(JSON.parse(requestBody))
    query = str(parsed?.['query']).trim()
  } catch {
    return failed(400, 'the request body was not JSON', secret)
  }
  if (query.length === 0) {
    return failed(400, 'no question was sent', secret)
  }

  /* Configuration is checked AFTER the request is validated and BEFORE the
     network is touched, so a malformed request never costs a metered call and
     a missing key never looks like a bad question. */
  if (!secret) {
    return failed(
      503,
      `web search is not configured on this server: ${API_KEY_ENV} is not set, so no search was made`,
      secret,
    )
  }
  if (!endpoint) {
    return failed(
      503,
      `web search is not configured on this server: ${ENDPOINT_ENV} is not set, so no search was made`,
      secret,
    )
  }

  const outcome = await search(query, {
    provider: providerFor(endpoint, secret, deps.fetchJson ?? defaultFetchJson()),
    maxResults: READ_AT_MOST,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  })

  if (outcome.engineFailed) {
    return failed(502, outcome.engineError ?? 'the search provider could not be reached', secret)
  }

  /*
   * ORDER IS THE PROVIDER'S, AND NOTHING HERE REORDERS IT.
   *
   * No domain is promoted, demoted, or given a bonus — including Wikipedia,
   * which is why replacing the Wikipedia rung with this is a real change rather
   * than a rename. Ranking is candidate ORDER, never verification; deciding
   * which of these is true happens downstream, against the question, using more
   * than one of them.
   */
  const pages: SearchedPage[] = outcome.results
    .filter((r) => r.ok && r.text.trim().length > 0)
    .map((r) => ({
      title: r.title || r.hit.title,
      url: r.finalUrl || r.hit.url,
      domain: hostnameOf(r.finalUrl || r.hit.url),
      /* `text`, never `evidence`. `evidence` is the same words wrapped in an
         UNTRUSTED-WEB-CONTENT fence with a security header, which exists so a
         MODEL cannot read them as instructions. A person is going to read
         these. The fence's job is done by `suspicious` instead. */
      text: r.text,
      suspicious: r.suspicious,
    }))

  return reply(200, { pages, engineFailed: false }, secret)
}

/**
 * Attach the route to the dev server.
 *
 * `configureServer` only, deliberately — matching `/api/doubt`. `vite preview`
 * serves the production build, and pretending the route exists there would make
 * a build behave one way locally and another way deployed. Plainly absent in
 * both is the honest failure.
 */
export function searchPlugin(): Plugin {
  return {
    name: 'learning-os-web-search',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        let aborted = false

        request.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BODY_BYTES) {
            aborted = true
            const tooLong = failed(413, 'that question is too long', '')
            response.statusCode = tooLong.status
            response.setHeader('content-type', 'application/json')
            response.end(tooLong.body)
            request.destroy()
            return
          }
          chunks.push(chunk)
        })

        request.on('end', () => {
          if (aborted) return
          void searchTheOpenWeb(Buffer.concat(chunks).toString('utf8')).then((out) => {
            response.statusCode = out.status
            response.setHeader('content-type', 'application/json')
            response.end(out.body)
          })
        })
      })
    },
  }
}
