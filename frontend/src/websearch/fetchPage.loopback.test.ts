/**
 * THE TRANSPORT, EXERCISED FOR REAL.
 *
 * `fetchPage.test.ts` drives the same code through an injected seam, which
 * proves the POLICY — when to retry, when to refuse, what to record. It cannot
 * prove that an AbortSignal actually cancels a socket, that a real 302 carries
 * the Location header where the code looks for it, or that a chunked body
 * arrives in more than one piece. Those are properties of the runtime, and a
 * fake transport will happily agree with whatever the code believes.
 *
 * So this file talks to a real server over a real socket, on 127.0.0.1 with an
 * ephemeral port. No egress: loopback is not the network, which is why the
 * address guard has to be opted out of explicitly here — and the fact that
 * every test must pass `allowLoopback: true` is itself the demonstration that
 * the guard is on by default.
 */

import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fetchPage } from './fetchPage'

let server: Server
let origin: string

/** Requests seen, so a test can assert how many times the client actually came back. */
const seen: string[] = []
/** Per-path hit counters, for the routes that behave differently on retry. */
const hits = new Map<string, number>()

function count(path: string): number {
  const n = (hits.get(path) ?? 0) + 1
  hits.set(path, n)
  return n
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    seen.push(path)

    switch (path) {
      case '/ok':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<html><body><p>real bytes over a real socket</p></body></html>')
        return

      case '/chunked': {
        /* Written in pieces with no content-length, so the reader genuinely
           has to loop rather than receive one buffer. */
        res.writeHead(200, { 'content-type': 'text/html' })
        res.write('<p>first</p>')
        res.write('<p>second</p>')
        res.end('<p>third</p>')
        return
      }

      case '/big':
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('x'.repeat(50_000))
        return

      case '/redirect-1':
        res.writeHead(302, { location: '/redirect-2' })
        res.end()
        return

      case '/redirect-2':
        res.writeHead(301, { location: '/ok' })
        res.end()
        return

      case '/redirect-loop':
        res.writeHead(302, { location: '/redirect-loop' })
        res.end()
        return

      case '/redirect-internal':
        /* A public page pointing at cloud instance metadata. The whole reason
           the guard re-runs on every hop. */
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
        res.end()
        return

      case '/flaky':
        if (count('/flaky') < 3) {
          res.writeHead(503, { 'content-type': 'text/html' })
          res.end('busy')
          return
        }
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<p>recovered</p>')
        return

      case '/gone':
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('not here')
        return

      case '/image':
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end('PNG')
        return

      case '/slow':
        /* Headers, then silence. The socket stays open and nothing more
           arrives, which is what a hung origin looks like from the client. */
        res.writeHead(200, { 'content-type': 'text/html' })
        res.write('<p>partial')
        return

      default:
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('no route')
    }
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('stub server has no port')
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

const opts = { allowLoopback: true, timeoutMs: 2000 } as const

describe('a real request over a real socket', () => {
  it('returns the body the server actually wrote', async () => {
    const out = await fetchPage(`${origin}/ok`, opts)
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toContain('real bytes over a real socket')
    expect(out.page.status).toBe(200)
    expect(out.page.contentType).toContain('text/html')
    expect(out.page.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(out.page.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reassembles a chunked body', async () => {
    const out = await fetchPage(`${origin}/chunked`, opts)
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toBe('<p>first</p><p>second</p><p>third</p>')
  })

  it('is refused without allowLoopback, which is the default', async () => {
    const out = await fetchPage(`${origin}/ok`, { timeoutMs: 2000 })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-host')
  })
})

describe('redirects, as the runtime actually delivers them', () => {
  it('follows a two-hop chain to the destination', async () => {
    const out = await fetchPage(`${origin}/redirect-1`, opts)
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.finalUrl).toBe(`${origin}/ok`)
    expect(out.page.redirects).toEqual([`${origin}/redirect-1`, `${origin}/redirect-2`])
    expect(out.page.body).toContain('real bytes')
  })

  it('stops a redirect loop instead of spinning', async () => {
    const out = await fetchPage(`${origin}/redirect-loop`, { ...opts, maxRedirects: 3 })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('too-many-redirects')
  })

  it('refuses a redirect into the metadata service', async () => {
    const before = seen.length
    const out = await fetchPage(`${origin}/redirect-internal`, opts)
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('blocked-host')
    /* Exactly one request left this process: the redirect was refused, not
       followed and then discarded. */
    expect(seen.length - before).toBe(1)
  })
})

describe('retry and timeout against a server that misbehaves', () => {
  it('retries a real 503 and succeeds when the server recovers', async () => {
    const out = await fetchPage(`${origin}/flaky`, { ...opts, retries: 3 })
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.body).toContain('recovered')
    expect(out.page.attempts).toBe(3)
  })

  it('does not retry a real 404', async () => {
    const before = seen.filter((p) => p === '/gone').length
    const out = await fetchPage(`${origin}/gone`, { ...opts, retries: 3 })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.status).toBe(404)
    expect(seen.filter((p) => p === '/gone').length - before).toBe(1)
  })

  it('aborts a hung response and reports a timeout', async () => {
    /* The definitive one. The server sends headers and then nothing, so only a
       real AbortSignal reaching a real socket ends this call — an injected
       fake cannot demonstrate it. */
    const out = await fetchPage(`${origin}/slow`, {
      allowLoopback: true,
      timeoutMs: 250,
      retries: 0,
    })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('timeout')
    expect(out.elapsedMs).toBeLessThan(2000)
  })
})

describe('content rules hold against real headers', () => {
  it('refuses an image without reading it', async () => {
    const out = await fetchPage(`${origin}/image`, opts)
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.reason).toBe('unsupported-type')
  })

  it('truncates a large body at the cap', async () => {
    const out = await fetchPage(`${origin}/big`, { ...opts, maxBytes: 1000 })
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error(out.detail)
    expect(out.page.truncated).toBe(true)
    expect(out.page.bytes).toBeLessThanOrEqual(1000)
  })
})
