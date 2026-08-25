/**
 * THE SHIPPED WIRING, EXERCISED FOR REAL.
 *
 * `gather.test.ts` drives everything through an injected `fetchImpl`, which
 * replaces `fetchPage` entirely. That proves the fan-out policy — isolation,
 * caching, ordering — and it CANNOT prove that the default path works, because
 * the default path never executes in that file.
 *
 * That gap hid a real defect. `fetchPage` accepts `timeoutMs`, `totalBudgetMs`,
 * `maxBytes` and `allowLoopback`, and `fetchPage.test.ts` proves each of them
 * works. `gather` called `fetchPage(url)` with NO OPTIONS AT ALL, and
 * `GatherOptions` had no field to pass any of them through — so in the shipped
 * configuration a single source could occupy
 * (maxRedirects + 1) x (retries + 1) x timeoutMs = 6 x 3 x 8s = 144 seconds,
 * and no caller could change it. A mechanism that is tested but unreachable is
 * the same as a mechanism that does not exist.
 *
 * So this file uses a real socket and passes NO `fetchImpl`, which is the only
 * way to test what actually ships.
 */

import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { gather } from './gather'
import type { SearchHit } from './port'

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path === '/slow') {
      /* Headers, then silence. The socket stays open and nothing more arrives,
         which is what a hung origin looks like from the client. Without a
         budget reaching the fetcher, this holds the whole search open. */
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<p>partial')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<html><body><p>real bytes over a real socket</p></body></html>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('stub server has no port')
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const hit = (path: string): SearchHit => ({ url: `${origin}${path}`, title: 't', snippet: 's' })

describe('fetch options reach the fetcher, or they are decoration', () => {
  it('a hung source is bounded by the budget the caller asked for', async () => {
    const started = Date.now()
    const [result] = await gather([hit('/slow')], {
      fetch: { allowLoopback: true, timeoutMs: 250, totalBudgetMs: 600 },
    })
    const elapsed = Date.now() - started

    /* The reason matters as much as the timing. Before the options were
       plumbed, this returned `blocked-host` almost instantly — fast, and for
       entirely the wrong reason, because `allowLoopback` never reached the
       guard either. Asserting only "it was quick" would have passed against
       the broken code. */
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('timeout')
    expect(elapsed).toBeLessThan(5_000)
  })

  it('a healthy source still succeeds through the same default path', async () => {
    /* The pair. A budget that refuses everything would satisfy the test above
       on its own, so something must prove the path still works when the origin
       behaves. */
    const [result] = await gather([hit('/ok')], {
      fetch: { allowLoopback: true, timeoutMs: 2000 },
    })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('real bytes over a real socket')
  })

  it('the address guard is still on by default, so the opt-out above is the proof', async () => {
    /* Every test here passes `allowLoopback: true`. That is only meaningful if
       omitting it refuses — otherwise the option is being credited for a guard
       that was never armed. */
    const [result] = await gather([hit('/ok')], { fetch: { timeoutMs: 2000 } })
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('blocked-host')
  })

  it('no fetch options at all still works, because they are optional', async () => {
    const [result] = await gather([hit('/ok')])
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('blocked-host')
  })
})
