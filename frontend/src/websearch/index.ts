/**
 * THE DOORWAY INTO `src/websearch`.
 *
 * Measured from `src/main.tsx` before this file existed: 99 of 107 source files
 * were reachable and every one of the 17 orphans was in this directory. The
 * module was complete, tested, and imported by nothing the product loads --- the
 * same defect the reachability gate was built to catch, in a directory the gate
 * did not scan.
 *
 * A DOORWAY, NOT A HOLE. The app imports THIS FILE and nothing else from here.
 * It does not know about `jsonProvider`, `ask`, `gather`, `extract` or the
 * twelve modules underneath them, so those can be rearranged without the app
 * noticing. The only type crossing the boundary is `SearchPort`, which
 * `src/agent` ALREADY declares as its injection seam --- so this invents no new
 * contract, it satisfies one that was waiting.
 *
 * TWO DEPTHS, ONE SHAPE. Both functions return the same `SearchPort`, so
 * `createAgent` cannot tell them apart and does not need to:
 *
 *   searchPort()    the engine only. One HTTP call, snippets as the engine
 *                   wrote them. Cheap, and enough when the agent just needs to
 *                   know what exists.
 *   researchPort()  the full pipeline --- plan, search, fetch, extract,
 *                   cross-check --- returning snippets taken from pages that
 *                   were actually READ. Slower, and the only version whose
 *                   text has been through the injection guard.
 *
 * WHY `null` RATHER THAN A PORT THAT ALWAYS FAILS. The agent reports an absent
 * search capability as UNMET and a failing one as DEGRADED, and those say
 * different things to a student: "I cannot look things up" versus "I tried and
 * the lookup broke". Returning a broken port would collapse that distinction at
 * the only place still able to tell the difference.
 */
import { jsonProvider, type JsonProviderConfig, type SearchProvider } from './engine'
import { ask } from './pipeline'
import { MemoryCache } from './gather'
import type { FetchOutcome } from './fetchPage'
import type { SearchHit, SearchPort } from './port'

export type { SearchHit, SearchPort } from './port'

/** What the app must supply, and nothing more. */
export interface WebSearchConfig {
  /** Engine URL with `{query}`, and optionally `{limit}` and `{key}`. Empty means not configured. */
  readonly endpoint: string
  /** Only ever a local placeholder. See `assertLocalOrKeyless`. */
  readonly apiKey?: string
  readonly name?: string
  readonly limit?: number
  readonly timeoutMs?: number
  /** Turn the engine's body into hits. Defaults to a tolerant reader. */
  readonly map?: (body: unknown) => readonly SearchHit[]
  /** Injected in tests. */
  readonly fetchJson?: (url: string) => Promise<unknown>
  /** Injected in tests. Page fetcher for `researchPort`. */
  readonly fetchImpl?: (url: string) => Promise<FetchOutcome>
}

/** Hosts where a key compiled into the bundle cannot leave the machine. */
function isLocal(endpoint: string): boolean {
  try {
    const h = new URL(endpoint).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h.endsWith('.local')
  } catch {
    return false
  }
}

/**
 * The same refusal the model port makes, for the same reason.
 *
 * Anything reaching here from `import.meta.env.VITE_*` is compiled into the
 * bundle and served to the browser. For a search engine on localhost that is
 * fine. For a hosted engine it is a published key, and rotating it is the only
 * remedy. Refused at CONSTRUCTION so it fails where someone is looking, rather
 * than on the first query in front of a student.
 */
function assertLocalOrKeyless(endpoint: string, apiKey?: string): void {
  if (apiKey && !isLocal(endpoint)) {
    throw new Error(
      `websearch: refusing to send an API key from the browser to ${endpoint}. `
      + 'Anything in VITE_* is compiled into the bundle, so this key would be published. '
      + 'Point VITE_SEARCH_ENDPOINT at a local engine, or put a server-side proxy in '
      + 'front of the hosted one and give the proxy the key.',
    )
  }
}

/**
 * A tolerant default reader.
 *
 * Engines disagree about the envelope and agree about almost nothing else, so
 * this accepts the three shapes that cover the common ones and returns nothing
 * for anything else. It never throws: `jsonProvider` treats a throw here as an
 * engine failure, and a body it merely does not understand is not an outage.
 */
function defaultMap(body: unknown): readonly SearchHit[] {
  const rows: unknown = Array.isArray(body)
    ? body
    : (body as { results?: unknown; items?: unknown; organic?: unknown } | null)?.results
      ?? (body as { items?: unknown } | null)?.items
      ?? (body as { organic?: unknown } | null)?.organic
  if (!Array.isArray(rows)) return []
  const out: SearchHit[] = []
  for (const r of rows as Record<string, unknown>[]) {
    const url = typeof r['url'] === 'string' ? r['url'] : typeof r['link'] === 'string' ? r['link'] : ''
    if (!url) continue
    out.push({
      url,
      title: typeof r['title'] === 'string' ? r['title'] : url,
      snippet: typeof r['snippet'] === 'string' ? r['snippet']
        : typeof r['description'] === 'string' ? r['description'] : '',
      ...(typeof r['publishedAt'] === 'string' ? { publishedAt: r['publishedAt'] } : {}),
    })
  }
  return out
}

function provider(cfg: WebSearchConfig): SearchProvider {
  assertLocalOrKeyless(cfg.endpoint, cfg.apiKey)
  const base: JsonProviderConfig = {
    name: cfg.name ?? 'websearch',
    endpoint: cfg.endpoint,
    map: cfg.map ?? defaultMap,
    ...(cfg.apiKey === undefined ? {} : { apiKey: cfg.apiKey }),
    ...(cfg.limit === undefined ? {} : { limit: cfg.limit }),
    ...(cfg.timeoutMs === undefined ? {} : { timeoutMs: cfg.timeoutMs }),
    ...(cfg.fetchJson === undefined ? {} : { fetchJson: cfg.fetchJson }),
  }
  return jsonProvider(base)
}

/**
 * The engine, as a `SearchPort`. `null` when nothing is configured.
 *
 * Failures PROPAGATE. `jsonProvider` deliberately lets a dead engine throw
 * rather than returning `[]`, because those two mean opposite things --- one is
 * a fact about the world, the other is an outage --- and `loop.ts` turns the
 * throw into a degraded turn that says so.
 */
export function searchPort(cfg: WebSearchConfig): SearchPort | null {
  if (!cfg.endpoint) return null
  return provider(cfg)
}

/**
 * The full pipeline, as a `SearchPort`. `null` when nothing is configured.
 *
 * `SearchHit.snippet` is documented as what the engine said "before anything
 * has been fetched". What comes back here is a superset: the same field
 * carrying text taken from the page itself, after extraction and after the
 * injection guard has quarantined it. That is strictly more truthful than an
 * engine blurb, and it is the only version whose text a reader should be shown.
 *
 * A page that could not be fetched keeps its hit and its original snippet. It
 * is not dropped: a 404 is not a result that never existed, and silently
 * narrowing what the agent may reason about is the failure this module spends
 * `engineFailed` to avoid one level up.
 */
export function researchPort(cfg: WebSearchConfig): SearchPort | null {
  if (!cfg.endpoint) return null
  const p = provider(cfg)
  /* ONE CACHE FOR THE LIFE OF THE PORT, and the lifetime is the point. A
     student asking three questions about the same topic hits the same handful
     of pages, and refetching them is latency the pipeline's own budget cannot
     absorb. Per-port rather than module-global: two agents must not share a
     view of the web, and a cache that outlives the session would serve
     yesterday's page as today's evidence. */
  const cache = new MemoryCache()
  return {
    async search(query: string): Promise<readonly SearchHit[]> {
      /* `ask` RATHER THAN `search`, and the difference is the point. `search`
         is engine-then-fetch. `ask` is the whole pipeline: interpret the
         question, plan queries, search, fetch, extract, cross-check sources
         against each other, and refuse rather than answer when the evidence
         does not support one. Routing through it is what makes the twelve
         modules underneath this doorway reachable instead of ornamental. */
      const out = await ask(query, {
        provider: p,
        cache,
        ...(cfg.fetchImpl === undefined ? {} : { fetchImpl: cfg.fetchImpl }),
      })

      /* THE ONE FAILURE THIS MUST NOT SWALLOW. The pipeline reports a dead
         engine as a REFUSAL with a reason rather than throwing, so that the
         intermediate stages survive for diagnosis. Converting it back into a
         rejection here is what keeps "the engine is down" distinguishable from
         "there is nothing to find" all the way up to the student --- the agent
         turns a rejection into a degraded turn that says so, and an empty list
         into an honest "no sources found". */
      if (out.answer.status === 'refused' && out.answer.refusalReason) {
        throw new Error(`websearch: ${out.answer.refusalReason}`)
      }
      /* `violations` is documented as always empty; non-empty means the
         pipeline contradicted itself. Surfacing it is cheaper than shipping an
         answer built on a stage that disagreed with another. */
      if (out.violations.length > 0) {
        throw new Error(`websearch: the pipeline reported ${out.violations.length} internal violation(s): ${out.violations.join('; ')}`)
      }

      return out.retrieved.map((r) => ({
        ...r.hit,
        /* Fetched text wins; the engine blurb is the fallback for a page that
           could not be read. `evidence` is the quarantined block, the only form
           safe to hand onward. */
        snippet: r.ok && r.evidence ? r.evidence : r.hit.snippet,
      }))
    },
  }
}
