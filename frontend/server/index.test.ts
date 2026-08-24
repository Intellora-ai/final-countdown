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

import { readJsonBody, DEFAULT_HOST, createServer } from './index.ts'

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
        blocks: [{ id: 'a', kind: 'prose', body: 'Light becomes sugar.' }],
        relations: [],
      }) },
      search: { search: async () => [] },
      secrets: [],
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
