/**
 * SEARCH HITS IN, QUARANTINED EVIDENCE OUT.
 *
 * The composition step: fetch, extract, guard, time. Everything it does is
 * done by a module that can be tested without it, and what is left here is the
 * part that only exists in the joins — parallelism, failure isolation, cache
 * freshness, and which date wins.
 *
 * FAILURE IS PER SOURCE, NEVER PER SEARCH
 * ---------------------------------------
 * A result set of eight pages will routinely contain one that is dead. If that
 * one can reject the whole batch, the answer is decided by the worst host in
 * it. Every entry therefore comes back — successful or not — in the order it
 * was asked for, with a named failure where there is one. Upstream,
 * `research()` distinguishes "no results" from "one source" from "sources
 * disagree", and it can only do that if a failed source is visibly a failed
 * source rather than an absence.
 *
 * WHY THE CACHE IS THE DANGEROUS PART
 * -----------------------------------
 * Caching is the cheapest latency win available and the easiest way to answer
 * a question about today with bytes from last week. Three rules keep it
 * honest: an entry carries the time it was RETRIEVED and that time travels
 * with it; a caller asking a time-sensitive question can demand the cache be
 * bypassed entirely; and a failure is never cached, because a five-second
 * outage should not become a permanent hole in every future answer.
 *
 * WHICH DATE WINS
 * ---------------
 * The page's own declaration beats the search engine's opinion about the page.
 * And an undated page stays undated all the way through — `freshness()`
 * upstream scores a missing date at 0.5 deliberately, and filling it in with
 * the fetch time would promote every undated page to maximally fresh, which is
 * precisely the failure that rule exists to prevent.
 */

import { extract } from './extract'
import { asEvidence, type InjectionSignal } from './guard'
import { fetchPage, type FetchFailure, type FetchOptions, type FetchOutcome } from './fetchPage'
import { Latency } from './latency'
import type { SearchHit } from './port'

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

export interface CachedPage {
  body: string
  contentType: string
  finalUrl: string
  status: number
  /** When these bytes were obtained. Travels with the entry, always. */
  retrievedAt: string
  truncated: boolean
}

export interface PageCache {
  get(url: string): CachedPage | undefined
  set(url: string, page: CachedPage): void
}

/** The obvious implementation, offered so the common case needs no wiring. */
export class MemoryCache implements PageCache {
  private readonly store = new Map<string, CachedPage>()

  get(url: string): CachedPage | undefined {
    return this.store.get(url)
  }

  set(url: string, page: CachedPage): void {
    this.store.set(url, page)
  }
}

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

export interface Retrieved {
  /** The hit, with `publishedAt` filled in from the page where it declared one. */
  hit: SearchHit
  ok: boolean
  failure?: FetchFailure
  detail?: string

  title: string
  text: string
  tables: string[][][]
  /** The quarantined block, safe to hand to a reader. Empty on failure. */
  evidence: string
  suspicious: boolean
  /**
   * Whether the page's own text is about what was asked.
   *
   * MARKED, NEVER DROPPED, and the distinction is the whole reason this field
   * exists rather than a filter. The first version of this check removed such
   * pages from `retrieved` outright, and the retrieval benchmark immediately
   * went blind: `corpus.test.ts` grades "the engine returned something and it
   * was wrong" as zero precision, which it can only do if it can still SEE the
   * wrong thing. A search that fetched a bad page and a search that fetched
   * nothing are different failures with different fixes.
   *
   * `select.ts` states the same rule for hits -- "the reason stays on the hit,
   * so nothing is silently dropped" -- and this is that rule one step later.
   * Undefined on a page that was never judged (a fetch that failed).
   */
  aboutTheSubject?: boolean
  signals: readonly InjectionSignal[]

  finalUrl: string
  truncated: boolean
  retrievedAt: string
  fromCache: boolean
  /**
   * True when this came from a PRECOMPUTED entry rather than one cached from a
   * real earlier request. `fromCache` is also true in that case; this is the
   * more specific fact, and §32 asks for them to stay distinguishable — a cache
   * entry answered a real question once, a precomputed one may never have been
   * asked for at all.
   */
  precomputed?: boolean
}

export interface GatherOptions {
  concurrency?: number
  /** Epoch ms. Reads not finished by then are left out and marked so; the rest are kept. */
  deadlineAt?: number
  cache?: PageCache
  latency?: Latency
  /** Beyond this age a cached entry is refetched. Absent means never stale. */
  maxAgeMs?: number
  /** Time-sensitive questions skip the cache outright. */
  requireFresh?: boolean
  /**
   * Passed straight to `fetchPage` on the default path.
   *
   * Without this, NONE of the fetcher's limits were reachable from here —
   * `gather` called `fetchPage(url)` with no options, so `timeoutMs`,
   * `totalBudgetMs`, `maxBytes` and `allowLoopback` were all fixed at their
   * defaults and no caller could change them. In the shipped configuration one
   * source could occupy (maxRedirects + 1) x (retries + 1) x timeoutMs, which
   * is 6 x 3 x 8s = 144 seconds.
   *
   * `fetchPage.test.ts` proved every one of those limits works. Nothing proved
   * they were wired, and a mechanism that is tested but unreachable is the same
   * as a mechanism that does not exist.
   *
   * Ignored when `fetchImpl` is supplied, because then there is no
   * `fetchPage` to configure.
   */
  fetch?: FetchOptions
  fetchImpl?: (url: string) => Promise<FetchOutcome>
  now?: () => number
}

const DEFAULT_CONCURRENCY = 4

/** Host for §31 accounting. An unparseable URL is its own bucket, never a shared blank. */
const hostOf = (url: string): string => {
  try { return new URL(url).hostname.toLowerCase() } catch { return `unparseable:${url}` }
}

const emptyResult = (hit: SearchHit, failure: FetchFailure, detail: string): Retrieved => ({
  hit,
  ok: false,
  failure,
  detail,
  title: '',
  text: '',
  tables: [],
  evidence: '',
  suspicious: false,
  signals: [],
  finalUrl: hit.url,
  truncated: false,
  retrievedAt: '',
  fromCache: false,
})

/**
 * Fetch and prepare every hit.
 *
 * Output is one entry per input, in input order, however the requests
 * actually resolved. A duplicated URL costs one request and still yields two
 * entries: the caller asked for what it asked for.
 */
export async function gather(
  hits: readonly SearchHit[],
  options: GatherOptions = {},
): Promise<Retrieved[]> {
  if (!hits.length) return []

  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const latency = options.latency
  const cache = options.cache
  const now = options.now ?? Date.now
  const doFetch = options.fetchImpl ?? ((url: string) => fetchPage(url, options.fetch ?? {}))

  /* One request per distinct URL. Two hits pointing at the same page are two
     results and one fetch — anything else pays twice for identical bytes and
     doubles the load a search puts on a single host. */
  const distinct = [...new Set(hits.map((h) => h.url))]
  const bodies = new Map<string, { page: CachedPage; fromCache: boolean } | { error: Retrieved }>()

  let cursor = 0
  const deadlineAt = options.deadlineAt
  const workers = Array.from({ length: Math.min(concurrency, distinct.length) }, async () => {
    for (;;) {
      if (deadlineAt !== undefined && Date.now() >= deadlineAt) return
      const index = cursor
      cursor += 1
      if (index >= distinct.length) return
      const url = distinct[index]

      /* A CACHE THAT THROWS IS A CACHE MISS, NOT A DEAD SEARCH.
       *
       * `cache.get` is a call into someone else's implementation. The shipped
       * `MemoryCache` cannot fail, which is exactly why this was missing —
       * the promise at the top of this file ("failure is per source, never
       * per search") held only because nothing had tested it against a
       * dependency that fails. The comment below anticipates a cache backed
       * by disk or by a network store; the day one arrives, a dropped
       * connection would have taken down every search rather than degrading
       * to no-cache. */
      const lookupStarted = now()
      let cached: CachedPage | undefined
      try {
        cached = !options.requireFresh && cache ? cache.get(url) : undefined
      } catch {
        cached = undefined
      }
      if (cached && fresh(cached, options.maxAgeMs, now)) {
        /* Measured, not assumed zero. A hardcoded 0 would make the cached p99
           a statement about this line rather than about the cache — and the
           whole point of keeping the three paths apart is that each number
           describes something real. A cache backed by disk or by a network
           store is not free, and this is where that would show up. */
        latency?.record('cached', Math.max(0, now() - lookupStarted))
        bodies.set(url, { page: cached, fromCache: true })
        continue
      }

      /* A FETCHER THAT THROWS IS ONE DEAD SOURCE, NOT A DEAD SEARCH.
       *
       * `fetchPage` returns failures as values and never throws, so this was
       * unreachable with the shipped implementation — and unreachable is not
       * the same as impossible. `fetchImpl` is an injection seam: any caller
       * can pass one that rejects, and one rejection here used to propagate
       * through `Promise.all` and lose every other source in the batch.
       * The reason is preserved rather than flattened, because upstream
       * distinguishes a source that could not be read from a source that had
       * nothing to say. */
      const started = now()
      let outcome: FetchOutcome
      try {
        outcome = await doFetch(url)
      } catch (err) {
        outcome = {
          ok: false,
          reason: 'network',
          detail: err instanceof Error ? err.message : String(err),
          elapsedMs: Math.max(0, now() - started),
          attempts: 1,
        }
      }
      const elapsed = Math.max(0, now() - started)

      if (!outcome.ok) {
        latency?.record('live', elapsed, outcome.reason === 'timeout' ? 'timeout' : 'error')
        bodies.set(url, {
          error: emptyResult({ url, title: '', snippet: '' }, outcome.reason, outcome.detail),
        })
        continue
      }

      latency?.record('live', elapsed)
      /* §31 — the same measurement, keyed by host. Recorded here because this
         is where a real request was actually made; anywhere later and a cache
         hit would be counted as a request that never left the process. */
      latency?.request(hostOf(url), elapsed)
      const stored: CachedPage = {
        body: outcome.page.body,
        contentType: outcome.page.contentType,
        finalUrl: outcome.page.finalUrl,
        status: outcome.page.status,
        retrievedAt: outcome.page.retrievedAt,
        truncated: outcome.page.truncated,
      }
      /* Only successes are cached. A cached failure turns a transient outage
         into a permanent absence.
         Wrapped for the same reason as `get`: a full or disconnected store
         must cost the CACHE WRITE, never the page. The bytes are already in
         hand at this point, and throwing them away because the cache could
         not record them would turn a storage problem into a retrieval one. */
      try {
        cache?.set(url, stored)
      } catch {
        /* Intentionally silent. There is no caller decision to make here and
           nothing is lost: the page is returned either way, and the next
           request simply misses. */
      }
      bodies.set(url, { page: stored, fromCache: false })
    }
  })

  /* THE DEADLINE KEEPS WHAT ARRIVED. Measured 2026-09-02: one slow read held
     the batch past the grounding budget and every page that had arrived was
     thrown away with it. Past the deadline the batch returns as it stands; a
     read still in flight is marked, not awaited. */
  if (deadlineAt === undefined) {
    await Promise.all(workers)
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined
    const untilDeadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, deadlineAt - Date.now()))
    })
    await Promise.race([Promise.all(workers).then(() => undefined), untilDeadline]).finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })
  }

  return hits.map((hit) => {
    const entry = bodies.get(hit.url)
    if (!entry) return emptyResult(hit, 'network', deadlineAt === undefined ? 'not retrieved' : 'not read before the deadline')
    if ('error' in entry) {
      return { ...entry.error, hit, finalUrl: hit.url }
    }

    const extractStarted = now()
    const doc = extract(entry.page.body)
    latency?.stage('extract', Math.max(0, now() - extractStarted))

    const quarantined = asEvidence(doc.text, entry.page.finalUrl)

    return {
      /* The page's own date beats the engine's; an absent date stays absent. */
      hit: {
        ...hit,
        ...(doc.publishedAt ? { publishedAt: doc.publishedAt } : {}),
      },
      ok: true,
      title: doc.title,
      text: doc.text,
      tables: doc.tables,
      evidence: quarantined.text,
      suspicious: quarantined.suspicious,
      signals: quarantined.signals,
      finalUrl: entry.page.finalUrl,
      truncated: entry.page.truncated,
      retrievedAt: entry.page.retrievedAt,
      fromCache: entry.fromCache,
    }
  })
}

/**
 * Whether a cached entry may still answer.
 *
 * No `maxAgeMs` means the caller has not expressed a staleness policy, and
 * the entry is usable — but `requireFresh` is checked before this is ever
 * called, so a time-sensitive question never reaches here at all.
 */
function fresh(entry: CachedPage, maxAgeMs: number | undefined, now: () => number): boolean {
  if (maxAgeMs === undefined) return true
  const at = Date.parse(entry.retrievedAt)
  if (!Number.isFinite(at)) return false
  return now() - at <= maxAgeMs
}
