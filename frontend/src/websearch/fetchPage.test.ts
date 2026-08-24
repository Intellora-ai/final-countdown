import { describe, expect, it } from 'vitest'

import { DEFAULTS, fetchPage, type FetchLike, type ResponseLike } from './fetchPage'

/* -------------------------------------------------------------------------- */
/* Scripted transport                                                         */
/* -------------------------------------------------------------------------- */

interface Scripted {
  status?: number
  headers?: Record<string, string>
  body?: string
  /** Throw instead of responding, to stand for a connection failure. */
  throws?: unknown
  /** Hang until the caller's AbortSignal fires, to stand for a slow server. */
  hangs?: boolean
}

function response(s: Scripted): ResponseLike {
  const headers = new Map(
    Object.entries(s.headers ?? { 'content-type': 'text/html; charset=utf-8' }).map(
      ([k, v]) => [k.toLowerCase(), v] as const,
    ),
  )
  const text = s.body ?? ''
  return {
    status: s.status ?? 200,
    headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        /* Two chunks, deliberately. A cap enforced only on the whole body is a
           cap that has already downloaded whatever it was meant to refuse. */
        const bytes = new TextEncoder().encode(text)
        const half = Math.ceil(bytes.length / 2)
        if (bytes.length) controller.enqueue(bytes.slice(0, half))
        if (bytes.length > half) controller.enqueue(bytes.slice(half))
        controller.close()
      },
    }),
    text: async () => text,
  }
}

/** A transport that replays a script, one entry per attempt, recording calls. */
function transport(script: readonly Scripted[]): {
  fetchImpl: FetchLike
  calls: { url: string; redirect: string }[]
} {
  const calls: { url: string; redirect: string }[] = []
  let i = 0
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, redirect: init.redirect })
    const step = script[Math.min(i, script.length - 1)]
    i += 1
    if (step.throws !== undefined) throw step.throws
    if (step.hangs) {
      return await new Promise<ResponseLike>((_resolve, reject) => {
        if (init.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })
    }
    return response(step)
  }
  return { fetchImpl, calls }
}

/** No real waiting: retry backoff is a policy to assert, not a delay to serve. */
const noSleep = async () => {}

const OK = 'https://example.gov.in/report'

describe('scheme and host are checked before anything is dialled', () => {
  it('refuses a non-http scheme without opening a connection', async () => {
    const { fetchImpl, calls } = transport([{ body: 'x' }])
    const out = await fetchPage('file:///etc/passwd', { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-scheme')
    /* The point of the guard is that the request never happens. Asserting only
       the return value would pass just as well if it dialled first. */
    expect(calls).toHaveLength(0)
  })

  it('refuses javascript: and data: URLs', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>hi</b>']) {
      const { fetchImpl, calls } = transport([{ body: 'x' }])
      const out = await fetchPage(url, { fetchImpl, sleep: noSleep })
      expect(out.ok).toBe(false)
      expect(calls).toHaveLength(0)
    }
  })

  it('refuses a URL that is not a URL at all', async () => {
    const { fetchImpl, calls } = transport([{ body: 'x' }])
    const out = await fetchPage('not a url', { fetchImpl, sleep: noSleep })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-scheme')
    expect(calls).toHaveLength(0)
  })

  it.each([
    'http://localhost:8080/admin',
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.4.4/',
    'http://169.254.169.254/latest/meta-data/',
    'http://printer.local/',
    'http://[::1]/',
  ])('refuses the internal address %s by default', async (url) => {
    const { fetchImpl, calls } = transport([{ body: 'secret' }])
    const out = await fetchPage(url, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-host')
    expect(calls).toHaveLength(0)
  })

  /* ------------------------------------------------------------------ *
   * The generated encoding space.
   *
   * A hand-written list of spellings is what produced this bug: the guard
   * was tested against the notations its author was already thinking of.
   * Enumerating instead found 42 bypasses where five had been guessed —
   * IPv4-mapped IPv6 in three spellings, NAT64, CGNAT, 192.0.0.0/24,
   * `localhost.`, `[::]`.
   *
   * BOTH DIRECTIONS ARE GENERATED, and that symmetry is the point. If the
   * deny side is a property and the allow side is one hand-picked host, the
   * exact asymmetry that caused this is rebuilt pointing the other way, and
   * over-blocking ships instead. A functionality hole found in production
   * costs more than this test does.
   * ------------------------------------------------------------------ */

  const asInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0) >>> 0

  /** Every spelling of one IPv4 address that a URL parser will accept. */
  const spellings = (ip: string): string[] => {
    const n = asInt(ip)
    const o = ip.split('.').map(Number)
    return [
      ip,
      `${n}`,
      `0x${n.toString(16)}`,
      o.map((x) => `0${x.toString(8)}`).join('.'),
      `${ip}.`,
      `[::ffff:${ip}]`,
      `[::FFFF:${ip}]`,
      `[0:0:0:0:0:ffff:${ip}]`,
      `[64:ff9b::${ip}]`,
      `[2002:${o[0].toString(16).padStart(2, '0')}${o[1].toString(16).padStart(2, '0')}:${o[2]
        .toString(16)
        .padStart(2, '0')}${o[3].toString(16).padStart(2, '0')}::]`,
    ]
  }

  /* Boundary pairs are deliberate: the address one below each range and one
     inside it. An off-by-one in a CIDR mask is invisible against midpoints. */
  const MUST_BLOCK = [
    '0.0.0.0', '0.1.2.3',
    '10.0.0.1', '10.255.255.255',
    '100.64.0.0', '100.127.255.255',
    '127.0.0.1', '127.255.255.254',
    '169.254.169.254', '169.254.0.1',
    '172.16.0.0', '172.31.255.255',
    '192.0.0.1', '192.0.0.255',
    '192.168.1.1', '192.168.255.255',
    '198.18.0.1', '198.19.255.255',
    '224.0.0.1', '255.255.255.255',
  ]

  const MUST_REACH = [
    '8.8.8.8', '1.1.1.1', '93.184.216.34',
    '9.255.255.255', '11.0.0.1',
    '100.63.255.255', '100.128.0.0',
    '126.255.255.255', '128.0.0.1',
    '169.253.255.255', '169.255.0.1',
    '172.15.255.255', '172.32.0.1',
    '192.0.1.1', '192.167.255.255', '192.169.0.1',
    '198.17.255.255', '198.20.0.1',
    '223.255.255.255',
  ]

  it.each(MUST_BLOCK.flatMap((ip) => spellings(ip).map((s) => [ip, s] as const)))(
    'blocks %s spelled as %s',
    async (_ip, spelling) => {
      const { fetchImpl, calls } = transport([{ body: 'AccessKeyId ASIA...' }])
      const out = await fetchPage(`http://${spelling}/latest/meta-data/`, {
        fetchImpl,
        sleep: noSleep,
      })

      expect(out.ok).toBe(false)
      if (out.ok) throw new Error('unreachable')
      expect(out.reason).toBe('blocked-host')
      /* Nothing was dialled. Asserting only the return value would pass just
         as well if the request went out and the response was discarded. */
      expect(calls).toHaveLength(0)
    },
  )

  it.each(MUST_REACH.flatMap((ip) => spellings(ip).map((s) => [ip, s] as const)))(
    'still reaches the public host %s spelled as %s',
    async (_ip, spelling) => {
      const { fetchImpl } = transport([{ body: 'public page' }])
      const out = await fetchPage(`http://${spelling}/`, { fetchImpl, sleep: noSleep })
      expect(out.ok).toBe(true)
    },
  )

  it.each([
    ['unspecified address', 'http://[::]/'],
    ['unspecified, long form', 'http://[::0]/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['trailing-dot localhost', 'http://localhost./'],
    ['unique local', 'http://[fd00::1]/'],
    ['link-local v6', 'http://[fe80::1]/'],
  ])('refuses %s', async (_name, url) => {
    /* SECURITY. The guard matched the hostname STRING, and WHATWG URL
       serialises an IPv4-mapped IPv6 address to HEX:

         http://[::ffff:169.254.169.254]/  ->  hostname [::ffff:a9fe:a9fe]

       `169.254.` never appears, so nothing matched and the cloud metadata
       endpoint was reachable. The dotted-quad form was blocked the whole
       time, which is what made this invisible — and decimal notation
       (http://2130706433/) was caught only because URL normalises THAT one
       back to dotted-quad. Free coverage I mistook for real coverage.

       `[::]` is the unspecified address, which routes to localhost on most
       stacks. 100.64.0.0/10 is CGNAT, carrier-internal and not public. */
    const { fetchImpl, calls } = transport([{ body: 'AccessKeyId ASIA...' }])
    const out = await fetchPage(url, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-host')
    expect(calls).toHaveLength(0)
  })

  it('refuses a scoped link-local literal, as an unparseable URL', async () => {
    /* `http://[fe80::1%25eth0]/` is refused, but as `blocked-scheme` rather
       than `blocked-host`: Node's URL parser rejects the percent-encoded zone
       id outright, so the guard never sees a hostname.
       Written down because I first asserted `blocked-host` here and the test
       failed — the address never reaches the address check, and a test that
       claims otherwise documents a code path that does not exist. */
    const { fetchImpl, calls } = transport([{ body: 'internal' }])
    const out = await fetchPage('http://[fe80::1%25eth0]/', { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-scheme')
    expect(calls).toHaveLength(0)
  })

  it('refuses a REDIRECT to an IPv4-mapped metadata address', async () => {
    /* The path that actually steals credentials: a legitimate-looking page
       answers 302 to the mapped form. The per-hop re-check ran correctly the
       whole time — it was just blind to this encoding. */
    const { fetchImpl, calls } = transport([
      { status: 302, headers: { location: 'http://[::ffff:169.254.169.254]/latest/meta-data/' } },
      { body: '{"AccessKeyId":"ASIA..."}' },
    ])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-host')
    expect(calls).toHaveLength(1)
  })

  it('does NOT over-block a mapped PUBLIC address', async () => {
    /* The fix must unwrap the mapping, not refuse every mapped address.
       `[::ffff:8.8.8.8]` serialises to `[::ffff:0808:0808]` and is an
       ordinary public host. Blocking it would trade a security hole for a
       functionality hole. */
    const { fetchImpl } = transport([{ body: 'public' }])
    const out = await fetchPage('http://[::ffff:8.8.8.8]/', { fetchImpl, sleep: noSleep })
    expect(out.ok).toBe(true)
  })

  it('honours allowLoopback for the mapped form too', async () => {
    const { fetchImpl } = transport([{ body: 'stub' }])
    const out = await fetchPage('http://[::ffff:127.0.0.1]/page', {
      fetchImpl,
      sleep: noSleep,
      allowLoopback: true,
    })
    expect(out.ok).toBe(true)
  })

  it('allows loopback only when explicitly opted in', async () => {
    const { fetchImpl } = transport([{ body: 'stub' }])
    const out = await fetchPage('http://127.0.0.1:9/page', {
      fetchImpl,
      sleep: noSleep,
      allowLoopback: true,
    })
    expect(out.ok).toBe(true)
  })
})

describe('a page that comes back', () => {
  it('returns body, status, final URL and byte count', async () => {
    const { fetchImpl, calls } = transport([{ body: '<p>hello</p>' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toBe('<p>hello</p>')
    expect(out.page.status).toBe(200)
    expect(out.page.finalUrl).toBe(OK)
    expect(out.page.bytes).toBe(12)
    expect(out.page.truncated).toBe(false)
    expect(out.page.attempts).toBe(1)
    /* Redirects are followed by hand so each hop can be inspected; asking the
       transport to follow them would hide the chain being asserted below. */
    expect(calls[0].redirect).toBe('manual')
  })

  it('measures elapsed time from the injected clock, not the wall', async () => {
    const { fetchImpl } = transport([{ body: 'x' }])
    let t = 1000
    const out = await fetchPage(OK, {
      fetchImpl,
      sleep: noSleep,
      now: () => (t += 40),
    })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.elapsedMs).toBeGreaterThan(0)
  })
})

describe('content type is decided from the header, before the body is read', () => {
  it.each([
    ['text/html; charset=utf-8', true],
    ['text/plain', true],
    ['application/xhtml+xml', true],
    ['image/png', false],
    ['application/pdf', false],
    ['application/octet-stream', false],
  ])('%s -> accepted: %s', async (contentType, accepted) => {
    const { fetchImpl } = transport([{ headers: { 'content-type': contentType }, body: 'x' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })
    expect(out.ok).toBe(accepted)
    if (!out.ok) expect(out.reason).toBe('unsupported-type')
  })

  it('treats a missing content-type as unsupported rather than guessing', async () => {
    const { fetchImpl } = transport([{ headers: {}, body: 'x' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('unsupported-type')
  })
})

describe('size cap', () => {
  it('stops reading at maxBytes and says so, rather than failing', async () => {
    const { fetchImpl } = transport([{ body: 'abcdefghij' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, maxBytes: 4 })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    /* Truncated, not discarded. Four bytes of a page still answer "did this
       host serve HTML at all", and a partial page is disclosed rather than
       silently presented as whole. */
    expect(out.page.truncated).toBe(true)
    expect(out.page.bytes).toBeLessThanOrEqual(4)
  })

  it('does not mark a page truncated when it fits exactly', async () => {
    const { fetchImpl } = transport([{ body: 'abcd' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, maxBytes: 4 })
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.truncated).toBe(false)
  })
})

describe('redirects are followed by hand', () => {
  it('follows a chain and records every hop', async () => {
    const { fetchImpl, calls } = transport([
      { status: 301, headers: { location: 'https://example.gov.in/b' } },
      { status: 302, headers: { location: '/c' } },
      { body: 'arrived' },
    ])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toBe('arrived')
    expect(out.page.finalUrl).toBe('https://example.gov.in/c')
    expect(out.page.redirects).toEqual([OK, 'https://example.gov.in/b'])
    /* A relative Location must resolve against the hop that sent it. */
    expect(calls[2].url).toBe('https://example.gov.in/c')
  })

  it('gives up past maxRedirects instead of looping forever', async () => {
    const { fetchImpl } = transport([
      { status: 301, headers: { location: 'https://example.gov.in/loop' } },
    ])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, maxRedirects: 3 })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('too-many-redirects')
  })

  it('re-checks the guard on every hop, so a redirect cannot reach an internal host', async () => {
    const { fetchImpl, calls } = transport([
      { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
      { body: 'cloud credentials' },
    ])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-host')
    /* One call: the redirect was refused rather than followed. Checking the
       first URL only is how an open redirect becomes an SSRF. */
    expect(calls).toHaveLength(1)
  })

  it('refuses a redirect that leaves http entirely', async () => {
    const { fetchImpl } = transport([{ status: 302, headers: { location: 'file:///etc/passwd' } }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-scheme')
  })

  it('treats a 3xx with no Location as an http error, not a hang', async () => {
    const { fetchImpl } = transport([{ status: 302, headers: { 'content-type': 'text/html' } }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('http-error')
  })
})

describe('what is worth retrying, and what is not', () => {
  it('does not retry a 404 — the answer will not change', async () => {
    const { fetchImpl, calls } = transport([{ status: 404, body: 'gone' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, retries: 3 })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('http-error')
    expect(out.status).toBe(404)
    expect(calls).toHaveLength(1)
    expect(out.attempts).toBe(1)
  })

  it.each([500, 502, 503, 429])('retries %d, which is usually transient', async (status) => {
    const { fetchImpl, calls } = transport([{ status }, { status }, { body: 'recovered' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, retries: 2 })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toBe('recovered')
    expect(calls).toHaveLength(3)
    expect(out.page.attempts).toBe(3)
  })

  it('retries a connection failure and reports the last one when it never clears', async () => {
    const { fetchImpl, calls } = transport([{ throws: new Error('ECONNRESET') }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, retries: 2 })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('network')
    expect(out.detail).toContain('ECONNRESET')
    expect(calls).toHaveLength(3)
    expect(out.attempts).toBe(3)
  })

  it('backs off between attempts rather than hammering', async () => {
    const waits: number[] = []
    const { fetchImpl } = transport([{ status: 503 }, { status: 503 }, { body: 'ok' }])
    await fetchPage(OK, {
      fetchImpl,
      retries: 2,
      sleep: async (ms) => {
        waits.push(ms)
      },
    })

    expect(waits).toHaveLength(2)
    expect(waits[1]).toBeGreaterThan(waits[0])
  })
})

describe('timeout', () => {
  it('aborts a hanging request and reports a timeout', async () => {
    const { fetchImpl } = transport([{ hangs: true }])
    const out = await fetchPage(OK, {
      fetchImpl,
      sleep: noSleep,
      timeoutMs: 5,
      retries: 0,
    })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('timeout')
  })

  it('times out a body that starts arriving and then stops', async () => {
    /* REGRESSION. `fetch` resolves when HEADERS arrive, not when the body
       finishes. The first version of this file cleared the deadline at that
       moment, so the body was read with no timeout whatsoever and a server
       that sent headers then fell silent held the fetcher open forever. A
       loopback stub caught it at 5,011ms against a 250ms budget.
       Reproduced here at unit speed: headers land normally, then the stream
       never closes. */
    const hangingBody: FetchLike = async (_url, init) => ({
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/html' : null) },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<p>partial'))
          init.signal.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError')),
          )
          /* Never closed on purpose. */
        },
      }),
      text: async () => '<p>partial',
    })

    const out = await fetchPage(OK, {
      fetchImpl: hangingBody,
      sleep: noSleep,
      timeoutMs: 40,
      retries: 0,
    })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('timeout')
    expect(out.detail).toContain('body')
  })

  it('retries after a timeout, because a slow server is often transient', async () => {
    const { fetchImpl, calls } = transport([{ hangs: true }, { body: 'second time lucky' }])
    const out = await fetchPage(OK, {
      fetchImpl,
      sleep: noSleep,
      timeoutMs: 5,
      retries: 1,
    })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toBe('second time lucky')
    expect(calls).toHaveLength(2)
  })
})

describe('the overall deadline, which per-request timeouts do not provide', () => {
  it('stops a redirect chain that outlives the total budget', async () => {
    /* ADVERSARIAL FINDING. `timeoutMs` bounds ONE request. A chain of 5
       redirects with 2 retries each is 15 legal requests, none of them
       individually late, and 15 x 8s is two minutes against a budget the
       caller believed was eight seconds. Slow-but-never-timing-out is the
       cheapest way to hold a search open. */
    const { fetchImpl, calls } = transport([
      { status: 302, headers: { location: 'https://example.gov.in/next' } },
    ])
    let clock = 0
    const out = await fetchPage(OK, {
      fetchImpl,
      sleep: noSleep,
      maxRedirects: 20,
      totalBudgetMs: 500,
      /* Each call to now() advances 200ms, so the third hop is past budget. */
      now: () => (clock += 200),
    })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('timeout')
    expect(out.detail).toContain('budget')
    /* Stopped early rather than running the full 20 hops. */
    expect(calls.length).toBeLessThan(20)
  })

  it('bounds RETRIES, not just hops', async () => {
    /* The budget was sampled only at the top of each hop, so the retry loop
       inside a hop ran unbounded. Measured on a single non-redirecting host
       that accepts the connection and goes silent: 500ms budget, 1205ms
       actual, three attempts — and the failure reported the per-request
       timeout, so the overrun was invisible in the logs.
       At shipped defaults (8000ms x 3 attempts) that is 24 seconds inside
       one hop, against whatever budget the caller asked for.
       The existing budget test only exercised a REDIRECT CHAIN, which is
       why it passed throughout. */
    const { fetchImpl, calls } = transport([{ hangs: true }])
    const out = await fetchPage(OK, {
      fetchImpl,
      sleep: noSleep,
      timeoutMs: 100,
      retries: 5,
      totalBudgetMs: 150,
    })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    /* Named as a budget overrun, not as a per-request timeout — otherwise
       nobody reading the log can tell which limit actually fired. */
    expect(out.detail).toContain('budget')
    /* Five retries were allowed; the budget stopped it far sooner. */
    expect(calls.length).toBeLessThanOrEqual(3)
  })

  it('lets a fast chain finish well inside the budget', async () => {
    const { fetchImpl } = transport([
      { status: 302, headers: { location: 'https://example.gov.in/b' } },
      { body: 'arrived' },
    ])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, totalBudgetMs: 60_000 })
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toBe('arrived')
  })
})

describe('credentials in a URL never reach storage', () => {
  it('strips userinfo from the URL it reports', async () => {
    /* ADVERSARIAL FINDING. `finalUrl` is written to the cache and stamped into
       the quarantined evidence block as `source:`. A URL carrying
       user:password would put those credentials into both. */
    const { fetchImpl, calls } = transport([{ body: 'secret page' }])
    const out = await fetchPage('https://alice:hunter2@example.gov.in/report', {
      fetchImpl,
      sleep: noSleep,
    })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.finalUrl).toBe('https://example.gov.in/report')
    expect(out.page.finalUrl).not.toContain('hunter2')
    expect(out.page.requestedUrl).not.toContain('hunter2')
    /* The request itself still carries them — stripping them from the wire
       would break the fetch. Only what is REPORTED and STORED is cleaned. */
    expect(calls[0].url).toContain('hunter2')
  })

  it('strips userinfo introduced by a redirect', async () => {
    const { fetchImpl } = transport([
      { status: 302, headers: { location: 'https://bob:sesame@example.gov.in/b' } },
      { body: 'arrived' },
    ])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep })

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.finalUrl).not.toContain('sesame')
    expect(out.page.redirects.join(' ')).not.toContain('sesame')
  })
})

describe('it never throws, because a fetcher that throws takes the search down', () => {
  it('survives a transport that rejects with a non-Error', async () => {
    const { fetchImpl } = transport([{ throws: 'just a string' }])
    const out = await fetchPage(OK, { fetchImpl, sleep: noSleep, retries: 0 })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('network')
    expect(out.detail).toContain('just a string')
  })

  it('survives a transport that returns a malformed response', async () => {
    const broken = (async () => ({}) as unknown as ResponseLike) as FetchLike
    const out = await fetchPage(OK, { fetchImpl: broken, sleep: noSleep, retries: 0 })
    expect(out.ok).toBe(false)
  })
})

describe('defaults are stated, not scattered', () => {
  it('exposes them so a caller can reason about the budget it is accepting', () => {
    expect(DEFAULTS.timeoutMs).toBeGreaterThan(0)
    expect(DEFAULTS.maxBytes).toBeGreaterThan(0)
    expect(DEFAULTS.maxRedirects).toBeGreaterThan(0)
    expect(DEFAULTS.retries).toBeGreaterThanOrEqual(0)
    expect(DEFAULTS.allowLoopback).toBe(false)
  })
})
