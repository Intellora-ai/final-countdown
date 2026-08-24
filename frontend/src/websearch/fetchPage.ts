/**
 * THE LIVE PATH. One page, fetched safely, or a reason why not.
 *
 * WHY THIS RETURNS A FAILURE INSTEAD OF THROWING
 * ----------------------------------------------
 * A search fans out across many pages and most searches include at least one
 * that is dead, slow, or serving something that is not a document. If a single
 * bad host can throw, one broken page takes down the whole answer — so every
 * outcome here is a value. `research()` upstream already distinguishes "no
 * results" from "sources disagree"; it can only do that if the fetcher hands
 * it facts rather than exceptions.
 *
 * WHY THE GUARD RUNS ON EVERY HOP AND NOT JUST THE FIRST
 * -----------------------------------------------------
 * Checking only the URL you were given is how an open redirect becomes a
 * server-side request forgery. A public page answering 302 to
 * `169.254.169.254` is the standard cloud-credential theft, and the request
 * that steals them looks, from the first URL alone, entirely legitimate. The
 * address is therefore re-checked before each hop, and a redirect that leaves
 * http(s) is refused outright.
 *
 * WHY THE SIZE CAP IS ENFORCED WHILE STREAMING
 * --------------------------------------------
 * A cap applied after `text()` is not a cap: the bytes are already down the
 * wire and in memory, which is the cost it was supposed to avoid. Reading
 * chunk by chunk and stopping is the only version that bounds anything.
 * Exceeding it truncates and SAYS SO rather than discarding the page —
 * a partial document still answers questions, but only if nothing downstream
 * mistakes it for a whole one.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ---------------------------------------
 * No parsing, no ranking, no extraction. It returns bytes and provenance.
 * Extraction and injection defence are separate passes over this output,
 * because the moment fetching and interpretation share a function neither can
 * be tested without the other.
 */

/* -------------------------------------------------------------------------- */
/* The transport seam                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The parts of `Response` this uses, and no more.
 *
 * Narrow on purpose: the global `fetch` satisfies it structurally, and so does
 * a twenty-line fake. A test that must construct a whole `Response` to check
 * retry policy ends up asserting things about the runtime instead.
 */
export interface ResponseLike {
  status: number
  headers: { get(name: string): string | null }
  body: ReadableStream<Uint8Array> | null
  text(): Promise<string>
}

export interface FetchInit {
  signal: AbortSignal
  redirect: 'manual'
  headers: Record<string, string>
}

export type FetchLike = (url: string, init: FetchInit) => Promise<ResponseLike>

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

export type FetchFailure =
  | 'blocked-scheme'
  | 'blocked-host'
  | 'timeout'
  | 'network'
  | 'http-error'
  | 'too-many-redirects'
  | 'unsupported-type'

export interface FetchedPage {
  requestedUrl: string
  /** Where the bytes actually came from, after redirects. */
  finalUrl: string
  status: number
  contentType: string
  body: string
  bytes: number
  /** True when the size cap stopped the read before the page ended. */
  truncated: boolean
  /** Every URL that answered a redirect, in order. Excludes `finalUrl`. */
  redirects: readonly string[]
  elapsedMs: number
  /** Transport calls made, across all hops and retries. */
  attempts: number
  /** When the bytes were obtained. Never conflated with the page's own date. */
  retrievedAt: string
}

export type FetchOutcome =
  | { ok: true; page: FetchedPage }
  | {
      ok: false
      reason: FetchFailure
      detail: string
      status?: number
      elapsedMs: number
      attempts: number
    }

export interface FetchOptions {
  timeoutMs?: number
  /**
   * A ceiling on the WHOLE call, across every hop and retry.
   *
   * `timeoutMs` bounds one request. It does not bound a fetch, and the gap
   * between those two is larger than it looks: five redirects with two retries
   * each is fifteen legal requests, none of them individually late. At the
   * default per-request timeout that is two minutes spent inside a call whose
   * caller asked for eight seconds. Slow-but-never-late is the cheapest way to
   * hold a search open, so the total is bounded separately.
   */
  totalBudgetMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Retries PER HOP, so `retries: 2` means up to three attempts at each. */
  retries?: number
  /** Off by default. Tests against a loopback stub turn it on explicitly. */
  allowLoopback?: boolean
  fetchImpl?: FetchLike
  now?: () => number
  clock?: () => string
  sleep?: (ms: number) => Promise<void>
}

export const DEFAULTS = {
  timeoutMs: 8_000,
  /* Two megabytes is far past any document worth reading and far short of
     what an adversarial host will happily stream at you forever. */
  maxBytes: 2_000_000,
  maxRedirects: 5,
  retries: 2,
  allowLoopback: false,
} as const

/**
 * Types worth reading as a document.
 *
 * An allowlist rather than a blocklist. The failure of a blocklist here is not
 * that it misses a type, it is that it misses the type it has never seen —
 * and the whole point is to refuse the unfamiliar rather than parse it.
 */
const READABLE = ['text/html', 'text/plain', 'application/xhtml+xml'] as const

/* -------------------------------------------------------------------------- */
/* Address safety                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Addresses that are inside the trust boundary rather than out on the web.
 *
 * `169.254.169.254` is listed first because it is the one that matters: the
 * cloud instance metadata endpoint, and the reason SSRF is a credential-theft
 * bug rather than an inconvenience.
 */
const INTERNAL = [
  /^169\.254\./,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
] as const

const LOOPBACK = [/^127\./, /^localhost$/i, /^\[?::1\]?$/] as const

function isInternal(hostname: string, allowLoopback: boolean): boolean {
  const host = hostname.toLowerCase()
  if (allowLoopback && LOOPBACK.some((r) => r.test(host))) return false
  return INTERNAL.some((r) => r.test(host))
}

/**
 * The URL with any credentials removed, for reporting and storage.
 *
 * `finalUrl` is written to the cache and stamped into the quarantined evidence
 * block as its `source:` line, so a URL carrying `user:password@` would put
 * those credentials into both — and into anything that later cites the source.
 * The credentials stay on the WIRE, because removing them there would simply
 * break the fetch; only what is reported and stored is cleaned.
 */
function reportable(url: URL): string {
  if (!url.username && !url.password) return url.toString()
  const clean = new URL(url.toString())
  clean.username = ''
  clean.password = ''
  return clean.toString()
}

type Checked = { ok: true; url: URL } | { ok: false; reason: 'blocked-scheme' | 'blocked-host' }

function check(raw: string, base: string | undefined, allowLoopback: boolean): Checked {
  let url: URL
  try {
    url = base ? new URL(raw, base) : new URL(raw)
  } catch {
    /* An unparseable target is refused as a scheme problem rather than
       normalised into something dialable. Guessing at a malformed URL is how
       you end up requesting something nobody asked for. */
    return { ok: false, reason: 'blocked-scheme' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'blocked-scheme' }
  }
  if (isInternal(url.hostname, allowLoopback)) return { ok: false, reason: 'blocked-host' }
  return { ok: true, url }
}

/* -------------------------------------------------------------------------- */
/* Reading, with the cap applied while reading                                */
/* -------------------------------------------------------------------------- */

async function readCapped(
  res: ResponseLike,
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) {
    const whole = await res.text()
    const encoded = new TextEncoder().encode(whole)
    if (encoded.length <= maxBytes) {
      return { text: whole, bytes: encoded.length, truncated: false }
    }
    const cut = encoded.slice(0, maxBytes)
    return { text: new TextDecoder().decode(cut), bytes: cut.length, truncated: true }
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    if (total + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total))
      total = maxBytes
      truncated = true
      /* Stop the transfer. Reading on and discarding would pay the full
         bandwidth cost of a cap that exists to avoid paying it. */
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
    total += value.length
  }

  const joined = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    joined.set(c, at)
    at += c.length
  }
  return { text: new TextDecoder().decode(joined), bytes: total, truncated }
}

/* -------------------------------------------------------------------------- */
/* Retry policy                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether trying again could plausibly produce a different answer.
 *
 * 404 and 403 are decisions, and repeating the question does not change a
 * decision — it just spends the caller's latency budget being told no three
 * times. 429 and 5xx are the server saying "not now", which is the only case
 * where waiting is the correct response.
 */
function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function aborted(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

/* -------------------------------------------------------------------------- */
/* fetchPage                                                                  */
/* -------------------------------------------------------------------------- */

export async function fetchPage(target: string, options: FetchOptions = {}): Promise<FetchOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  const totalBudgetMs = options.totalBudgetMs
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects
  const retries = options.retries ?? DEFAULTS.retries
  const allowLoopback = options.allowLoopback ?? DEFAULTS.allowLoopback
  const call = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const now = options.now ?? Date.now
  const clock = options.clock ?? (() => new Date().toISOString())
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const started = now()
  let attempts = 0
  const redirects: string[] = []

  const fail = (reason: FetchFailure, detail: string, status?: number): FetchOutcome => ({
    ok: false,
    reason,
    detail,
    ...(status === undefined ? {} : { status }),
    elapsedMs: now() - started,
    attempts,
  })

  const first = check(target, undefined, allowLoopback)
  if (!first.ok) return fail(first.reason, `refused ${target}`)

  let current = first.url

  for (let hop = 0; ; hop += 1) {
    if (totalBudgetMs !== undefined && now() - started > totalBudgetMs) {
      /* Checked per hop rather than only at the end: the point is to stop
         spending, and a budget noticed after the last request has bought
         nothing. */
      return fail('timeout', `exceeded total budget of ${totalBudgetMs}ms`)
    }
    if (hop > maxRedirects) {
      return fail('too-many-redirects', `stopped after ${maxRedirects} redirects`)
    }

    let res: ResponseLike | null = null
    let lastError: unknown = null
    let timedOut = false

    /**
     * THE DEADLINE OUTLIVES THE HEADERS, AND THAT IS THE WHOLE POINT.
     *
     * `fetch` resolves the moment response HEADERS arrive; the body is still
     * streaming. An earlier version cleared the timer in a `finally` attached
     * to that await, which meant the body was read with no deadline at all —
     * so a server that sent headers and then went silent held the fetcher
     * open indefinitely. A loopback stub doing exactly that ran for 5,011ms
     * against a 250ms budget.
     *
     * The injected-transport tests could not see it: a fake resolves headers
     * and body in the same tick, so there is no window in which the timer is
     * wrongly disarmed. The controller and its timer are therefore held here,
     * across the body read, and disarmed by `done()` on every exit.
     */
    let armedTimer: ReturnType<typeof setTimeout> | null = null
    let armedSignal: AbortSignal | null = null
    const disarm = () => {
      if (armedTimer !== null) clearTimeout(armedTimer)
      armedTimer = null
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) {
        /* Exponential, so a struggling host is not hit at a fixed rate by
           every caller that happens to be retrying at the same moment. */
        await sleep(100 * 2 ** (attempt - 1))
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      attempts += 1
      try {
        res = await call(current.toString(), {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
            'accept-language': 'en',
          },
        })
        timedOut = false
        lastError = null
        if (typeof res?.status !== 'number' || typeof res?.headers?.get !== 'function') {
          throw new Error('transport returned a malformed response')
        }
        if (retryable(res.status) && attempt < retries) {
          clearTimeout(timer)
          res = null
          continue
        }
        /* Kept armed deliberately — see the note above. */
        armedTimer = timer
        armedSignal = controller.signal
        break
      } catch (err) {
        clearTimeout(timer)
        lastError = err
        res = null
        timedOut = aborted(err) || controller.signal.aborted
      }
    }

    if (!res) {
      return timedOut
        ? fail('timeout', `no response within ${timeoutMs}ms`)
        : fail('network', describe(lastError))
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) {
        /* A redirect with nowhere to go. Reported as the protocol error it is
           rather than retried, which would just ask again and get the same
           nothing. */
        disarm()
        return fail('http-error', `status ${res.status} with no Location`, res.status)
      }
      const next = check(location, current.toString(), allowLoopback)
      if (!next.ok) {
        disarm()
        return fail(next.reason, `redirect to ${location} refused`)
      }
      redirects.push(reportable(current))
      current = next.url
      disarm()
      continue
    }

    if (res.status < 200 || res.status >= 400) {
      disarm()
      return fail('http-error', `status ${res.status}`, res.status)
    }

    const contentType = res.headers.get('content-type') ?? ''
    const essence = contentType.split(';')[0].trim().toLowerCase()
    if (!READABLE.includes(essence as (typeof READABLE)[number])) {
      /* Decided from the header, before the body is touched. Sniffing the
         bytes to see whether they look like HTML means downloading the thing
         you were trying not to download. */
      disarm()
      return fail('unsupported-type', contentType ? `content-type ${contentType}` : 'no content-type')
    }

    let read: { text: string; bytes: number; truncated: boolean }
    try {
      read = await readCapped(res, maxBytes)
    } catch (err) {
      /* A body that stops arriving is a timeout, not a network error, and the
         distinction is what tells a slow origin apart from a broken one. */
      const cutOff = aborted(err) || armedSignal?.aborted === true
      return cutOff
        ? fail('timeout', `body did not complete within ${timeoutMs}ms`)
        : fail('network', describe(err))
    } finally {
      disarm()
    }

    return {
      ok: true,
      page: {
        requestedUrl: reportable(first.url),
        finalUrl: reportable(current),
        status: res.status,
        contentType,
        body: read.text,
        bytes: read.bytes,
        truncated: read.truncated,
        redirects,
        elapsedMs: now() - started,
        attempts,
        retrievedAt: clock(),
      },
    }
  }
}

/* `hitFrom()` lived here and was deleted rather than kept.
 *
 * It built a `SearchHit` from a fetched page, and nothing called it —
 * `gather()` composes the hit itself because only it knows which date won
 * between the engine's and the page's. A second, simpler path to the same
 * object is exactly how those two answers drift apart, and an exported
 * function with no caller reads as supported API to whoever finds it next. */
