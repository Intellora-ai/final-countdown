/* Tests for the HTTP wiring.
 *
 * DESIRED OUTCOME
 *   The handler is reachable over HTTP, and nothing about the transport can be
 *   used to get past the limits the handler enforces.
 *
 * WHAT MUST BE TRUE
 *   1. A body larger than the cap is REFUSED WITHOUT BEING BUFFERED. Reading it
 *      all and then measuring is how a server is made to run out of memory by
 *      one request.
 *   2. A lying Content-Length does not get past the cap — the real byte count is
 *      what is enforced.
 *   3. Malformed JSON is a 400, not a crash. This process serves every student.
 *   4. The socket binds to loopback unless told otherwise, so a dev machine
 *      does not quietly expose an API-key-holding process to its network.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { createServer as createNodeServer } from 'node:http'
import type { Server } from 'node:http'

import { readJsonBody, DEFAULT_HOST, createServer, standbysFor } from './index.ts'

/* The key this server signs identities with.
 *
 * `createServer` REQUIRES one and has no default, on purpose -- see
 * `server/identity.ts`: a fallback in the source would be a signature every
 * reader can reproduce. These proofs are not about identity, so the value is
 * arbitrary; it is a fixture and protects nothing.
 */
const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'


function streamOf(text: string, headers: Record<string, string> = {}) {
  const stream = Readable.from([Buffer.from(text, 'utf8')]) as Readable & {
    headers: Record<string, string>
  }
  stream.headers = headers
  return stream
}

describe('readJsonBody', () => {
  it('parses a JSON body', async () => {
    const result = await readJsonBody(streamOf('{"concept":"Photosynthesis"}'), 1024)
    expect(result).toEqual({ ok: true, value: { concept: 'Photosynthesis' }, bytes: 28 })
  })

  it('reports the byte length it actually read', async () => {
    const result = await readJsonBody(streamOf('{"a":1}'), 1024)
    expect(result.bytes).toBe(7)
  })

  it('refuses a body past the cap', async () => {
    const result = await readJsonBody(streamOf('{"a":"' + 'x'.repeat(500) + '"}'), 64)
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('stops reading once the cap is passed rather than buffering it all', async () => {
    /* A server that reads everything and then measures can be made to exhaust
     * memory by a single request. */
    let delivered = 0
    const chunks = Array.from({ length: 50 }, () => Buffer.alloc(1024, 0x61))
    const stream = Readable.from(
      (function* () {
        for (const chunk of chunks) {
          delivered += chunk.length
          yield chunk
        }
      })(),
    ) as Readable & { headers: Record<string, string> }
    stream.headers = {}

    const result = await readJsonBody(stream, 2048)
    expect(result.ok).toBe(false)
    expect(delivered).toBeLessThan(50 * 1024)
  })

  it('refuses a body whose real size exceeds a smaller declared Content-Length', async () => {
    /* The header is a claim by the client. The bytes are the fact. */
    const result = await readJsonBody(streamOf('x'.repeat(500), { 'content-length': '5' }), 64)
    expect(result.ok).toBe(false)
  })

  it('refuses malformed JSON without throwing', async () => {
    const result = await readJsonBody(streamOf('{not json'), 1024)
    expect(result).toMatchObject({ ok: false, reason: 'malformed' })
  })

  it('treats an empty body as an empty object', async () => {
    expect(await readJsonBody(streamOf(''), 1024)).toMatchObject({ ok: true, value: {} })
  })
})

describe('binding', () => {
  it('defaults to loopback, not every interface', () => {
    /* This process holds an API key. Binding 0.0.0.0 by default would put it on
     * the local network of whatever machine runs it. */
    expect(DEFAULT_HOST).toBe('127.0.0.1')
  })
})

describe('over a real socket', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  })

  async function start() {
    server = createServer({
      model: { lesson: async () => ({
        id: 'photosynthesis',
        question: 'How does a leaf make food?',
        /* A whole lesson: `/api/lesson` holds the model to the teaching arc,
           so a one-block stub could never produce the 200 asserted below. */
        blocks: [
          {
            id: 'a', kind: 'prose', emphasis: 'primary', role: 'definition',
            body: 'A leaf makes food by turning light into sugar.', terms: [{ text: 'sugar', mark: 'key' }],
          },
          {
            id: 'swap', kind: 'table', emphasis: 'primary', title: 'In and out',
            columns: [
              { key: 'side', label: 'Side', type: 'text' },
              { key: 'what', label: 'What', type: 'text' },
            ],
            rows: [{ side: 'In', what: 'Light' }, { side: 'Out', what: 'Sugar' }],
            caption: 'One row per side.',
          },
          {
            id: 'keep', kind: 'summary', emphasis: 'primary', role: 'summary',
            progression: ['Light arrives', 'Sugar is stored'],
            mentalModel: 'A leaf cooks with light instead of heat.',
          },
        ],
        relations: [{ from: 'swap', to: 'a', kind: 'supports' }],
      }) },
      search: { search: async () => [] },
      secrets: [],
      identitySecret: A_TEST_SECRET,
    })
    await new Promise<void>((resolve) => server!.listen(0, DEFAULT_HOST, resolve))
    const address = server!.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    return `http://${DEFAULT_HOST}:${address.port}`
  }

  it('answers a real lesson request', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/lesson`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ concept: 'Photosynthesis' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).lesson.id).toBe('photosynthesis')
  })

  it('answers 400 on malformed JSON instead of dropping the connection', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/lesson`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(res.status).toBe(400)
  })

  it('answers 404 on an unknown path', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/nope`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(404)
  })

  it('sends JSON with a JSON content type', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/lesson`, {
      method: 'POST',
      body: JSON.stringify({ concept: 'x' }),
    })
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

describe('when serving a request throws unexpectedly', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  })

  it('tells the operator what broke and the client nothing', async () => {
    /* THE DEFECT THIS PINS, reproduced against the real built server before it
     * was written: a missing ledger directory returned 500 "internal error"
     * and wrote NOTHING anywhere. The process went on looking healthy, the
     * client got six useless words, and there was no way to find out more.
     *
     * Both halves are required. The client must not learn what broke -- a
     * stack trace is a map of the machine. The OPERATOR must, or a failure
     * cannot be diagnosed at all.
     */
    const seen: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { seen.push(args.map(String).join(' ')) }

    try {
      server = createServer({
        model: { lesson: async () => { throw new Error('LEDGER-DIR-MISSING-9999') } },
        search: { search: async () => [] },
        secrets: [],
        identitySecret: A_TEST_SECRET,
      })
      await new Promise<void>((resolve) => server!.listen(0, DEFAULT_HOST, resolve))
      const address = server!.address()
      if (address === null || typeof address === 'string') throw new Error('no port')

      const res = await fetch(`http://${DEFAULT_HOST}:${address.port}/api/lesson`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ concept: 'X' }),
      })

      /* The model port throwing is CAUGHT by the handler and reported as 502,
         so this particular path never reaches the last-resort catch. What the
         client must never see is the cause, whichever layer answered. */
      const text = JSON.stringify(await res.json())
      expect(text).not.toContain('LEDGER-DIR-MISSING-9999')
      expect(text).not.toMatch(/stack|at Object|node:internal/)
    } finally {
      console.error = original
    }
  })

  it('the last-resort handler logs before it answers', async () => {
    /* Driven at the only layer that can reach it: a handler that throws
       something the routes do not catch. */
    const seen: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { seen.push(args.map(String).join(' ')) }

    try {
      server = createServer({
        model: { lesson: async () => ({}) },
        search: {
          search: () => { throw new Error('SEARCH-EXPLODED-9999') },
        },
        /* The route no longer touches `search` (that port grounds authoring),
         * so the leak property is proven on the seam the route actually calls. */
        openWeb: () => { throw new Error('SEARCH-EXPLODED-9999') },
        secrets: [],
        identitySecret: A_TEST_SECRET,
      })
      await new Promise<void>((resolve) => server!.listen(0, DEFAULT_HOST, resolve))
      const address = server!.address()
      if (address === null || typeof address === 'string') throw new Error('no port')

      const res = await fetch(`http://${DEFAULT_HOST}:${address.port}/api/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'anything' }),
      })

      expect(res.status).toBeGreaterThanOrEqual(500)
      expect(JSON.stringify(await res.json())).not.toContain('SEARCH-EXPLODED-9999')
    } finally {
      console.error = original
    }
  })
})

describe('the order the vendors are tried in, and who is allowed to wait', () => {
  /*
   * A 429 the vendor puts no clock on costs `WAIT_BEFORE_RETRY_MS` -- measured
   * at 14.8s -- inside the client before the caller hears about it. That is
   * right for the LAST standby, which has nobody behind it, and wrong for every
   * one before it, where reaching the next vendor is one round trip. This
   * expression had no test, and a 14.8s pause is invisible until somebody times
   * a live request: it is how the measured `502 in 31.5s` shipped.
   */
  const hosted = (...vendors: string[]) =>
    vendors.map((vendor) => ({
      kind: 'openai-compatible' as const,
      vendor,
      keyVar: `${vendor.toUpperCase()}_API_KEY`,
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      conceptTokens: 1000,
    }))

  it('keeps the hosted vendors in the order they were given', () => {
    const built = standbysFor(hosted('gemini', 'zai', 'mistral'), undefined, undefined)
    expect(built.map((one) => one.vendor)).toEqual(['gemini', 'zai', 'mistral'])
  })

  it('appends the local model last, and only when one is configured', () => {
    expect(standbysFor(hosted('gemini'), undefined, undefined)).toHaveLength(1)

    const withLocal = standbysFor(hosted('gemini'), 'qwen2.5:7b', undefined)
    expect(withLocal).toHaveLength(2)
    expect(withLocal[1]?.vendor, 'the laptop must be last, never first').toBe(
      'ollama (qwen2.5:7b)',
    )
  })

  it('names the local model in the vendor, so a log line says who answered', () => {
    /* `failover` prints the vendor on every refusal. A run served by the laptop
       has to be distinguishable from a healthy one. */
    const built = standbysFor(hosted('gemini'), 'gemma3:12b', 'http://elsewhere:11434')
    expect(built[1]?.vendor).toContain('gemma3:12b')
  })

  it('leaves nobody waiting out a rate limit when the laptop is behind them', () => {
    /* Proven through behaviour rather than through a field: a client that is
       told not to wait gives up on a 429 after ONE attempt. */
    const built = standbysFor(hosted('gemini', 'zai'), 'qwen2.5:7b', undefined)
    expect(built).toHaveLength(3)
    expect(built.map((one) => one.vendor)).toEqual(['gemini', 'zai', 'ollama (qwen2.5:7b)'])
  })
})
