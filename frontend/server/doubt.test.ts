/* THE DOUBT ROUTE, ON THE SERVER THAT IS ACTUALLY DEPLOYED.
 *
 * DESIRED OUTCOME
 *   A learner who asks something the lesson cannot answer gets an answer on the
 *   deployed site, not only on a laptop running `vite dev`.
 *
 * THE DEFECT THIS CLOSES
 *   `frontend/src/canvas/teach/engineResolver.ts:46` posts to `/api/doubt`. The
 *   only thing that has ever answered it is `vite-plugin-engine.ts`, registered
 *   in `configureServer` — a hook that runs under `vite dev` and nowhere else.
 *   That file says so at `:268`: "configureServer only — deliberately no
 *   configurePreviewServer." `vite build` emits static files with no middleware
 *   among them, so on the deployed site every doubt POST is a 404 and the rung
 *   that exists to catch an unanswerable question catches nothing.
 *
 * WHAT MUST BE TRUE FOR THE OUTCOME TO HOLD
 *   1. The route exists on THIS server — the one with a deployment story.
 *   2. A refusal comes back 200. This is the whole contract and it is the part a
 *      port gets wrong. `learning-os/src/learning_os/api/ask.py` exits zero for
 *      every OUTCOME because a refusal is an answer, not a failure, and
 *      `engineResolver.ts:170` THROWS on any non-ok status. Returning 400 for
 *      "I would rather not guess" tells the learner the bridge is broken.
 *   3. The server does not invent its own validation of the question. Every
 *      other route here guards its fields; this one must not, because the
 *      engine owns that decision and two validators disagree eventually.
 *   4. An absent engine is 503 with a document, never a 404 and never a crash.
 *      `engineResolver` reads the body of what it throws on.
 *   5. The credential never appears in any response, on any path.
 */

import type { Server } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { createHandler, type DoubtPort, type ModelPort, type SearchPort } from './handler.ts'
import { createServer, DEFAULT_HOST } from './index.ts'

const model: ModelPort = {
  async complete() {
    throw new Error('the doubt route must not reach the lesson model')
  },
}

const search: SearchPort = {
  async find() {
    return []
  },
}

/** The engine's reply, as `askEngine` produces it: a status and a JSON string. */
function engineReturning(status: number, document: Record<string, unknown>): DoubtPort {
  return {
    async ask() {
      return { status, body: JSON.stringify(document) }
    },
  }
}

const ANSWERED = {
  outcome: 'answered',
  resume_at: 'beat-1',
  provider: 'fake',
  lesson: { id: 'recursion', question: 'why a base case?', blocks: [] },
}

function ask(body: unknown = { text: 'why does recursion need a base case', resume_at: 'beat-1', lesson_skill: 'python-recursion' }) {
  return { method: 'POST', path: '/api/doubt', body }
}

describe('POST /api/doubt', () => {
  it('is a route on this server at all', async () => {
    const res = await createHandler({ model, search, doubt: engineReturning(200, ANSWERED) })(ask())

    expect(res.status).not.toBe(404)
  })

  it('returns the engine document unchanged when it answers', async () => {
    const res = await createHandler({ model, search, doubt: engineReturning(200, ANSWERED) })(ask())

    expect(res.status).toBe(200)
    expect(res.body).toEqual(ANSWERED)
  })

  it('returns a refusal as 200, because a refusal is an answer', async () => {
    /* THE ONE THAT MATTERS. engineResolver throws on any non-ok status, so a
     * refusal reported as 4xx reaches the learner as "the engine is broken"
     * instead of as the sentence the engine wrote for them. */
    const refusal = {
      outcome: 'unmappable',
      resume_at: 'beat-1',
      refusal: 'That is not something I can answer from here.',
    }
    const res = await createHandler({ model, search, doubt: engineReturning(200, refusal) })(ask())

    expect(res.status).toBe(200)
    expect(res.body).toEqual(refusal)
  })

  it('does not invent its own check on the question text', async () => {
    /* Every other route here rejects a blank field with 400. This one must pass
     * it through: `ask.py` answers a blank question with its own `bad_request`
     * document at exit zero, and a second validator here would produce a
     * different status for the same input. */
    const engineSaw: string[] = []
    const recording: DoubtPort = {
      async ask(request: string) {
        engineSaw.push(request)
        return { status: 200, body: JSON.stringify({ outcome: 'bad_request', refusal: 'the request carried no question' }) }
      },
    }

    const res = await createHandler({ model, search, doubt: recording })(ask({ text: '   ' }))

    expect(res.status).toBe(200)
    expect(engineSaw).toHaveLength(1)
    expect(JSON.parse(engineSaw[0] as string)).toEqual({ text: '   ' })
  })

  it('reports an absent engine as 503 with a document, not a 404', async () => {
    /* A server built without the engine port must still answer the browser in
     * the shape the browser parses. 404 would be indistinguishable from the bug
     * this route exists to fix. */
    const res = await createHandler({ model, search })(ask())

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ outcome: 'unavailable' })
    expect(String((res.body as { refusal?: unknown }).refusal ?? '')).toMatch(/engine/i)
  })

  it('passes the engine status through when the engine itself failed', async () => {
    const res = await createHandler({
      model, search,
      doubt: engineReturning(502, { outcome: 'engine_error', refusal: 'the engine exited without answering' }),
    })(ask())

    expect(res.status).toBe(502)
    expect(res.body).toMatchObject({ outcome: 'engine_error' })
  })

  it('refuses a GET, because asking costs money', async () => {
    const res = await createHandler({ model, search, doubt: engineReturning(200, ANSWERED) })({
      method: 'GET', path: '/api/doubt', body: undefined,
    })

    expect(res.status).toBe(405)
  })

  it('refuses a body over the cap', async () => {
    const handler = createHandler({ model, search, doubt: engineReturning(200, ANSWERED), maxBodyBytes: 64 })
    const res = await handler({ ...ask({ text: 'x'.repeat(500) }), rawLength: 5000 })

    expect(res.status).toBe(413)
  })

  it('never lets the credential into a response, on any path', async () => {
    const SENTINEL = 'CANARY-doubt-must-not-leak-0000'
    const leaking: DoubtPort = {
      async ask() {
        throw new Error(`engine failed using key ${SENTINEL}`)
      },
    }

    const responses = [
      await createHandler({ model, search, doubt: leaking })(ask()),
      await createHandler({ model, search })(ask()),
      await createHandler({ model, search, doubt: leaking })({ method: 'GET', path: '/api/doubt', body: undefined }),
    ]

    for (const res of responses) {
      expect(JSON.stringify(res)).not.toContain(SENTINEL)
    }
  })

  it('turns an engine that throws into a document, never a crash', async () => {
    /* `askEngine` is documented as never throwing. "Documented as" is not
     * "cannot", and a rejection escaping here becomes the platform's own HTML
     * 500 — which `engineResolver` then tries to parse as JSON. */
    const throwing: DoubtPort = {
      async ask() {
        throw new Error('spawn ENOENT')
      },
    }

    const res = await createHandler({ model, search, doubt: throwing })(ask())

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ outcome: 'unavailable' })
  })
})

/* THE WIRING, OVER A REAL SOCKET.
 *
 * The tests above prove the handler answers. They inject the port directly, so
 * they would all still pass if `createServer` dropped it on the floor — and a
 * route that exists in the handler and not on the server is exactly the shape of
 * the bug being fixed, one layer in.
 */
describe('the deployed server serves /api/doubt', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server === undefined) return
    await new Promise<void>((done) => server!.close(() => done()))
    server = undefined
  })

  async function baseUrlFor(options: Parameters<typeof createServer>[0]): Promise<string> {
    server = createServer(options)
    await new Promise<void>((done) => server!.listen(0, DEFAULT_HOST, done))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    return `http://${DEFAULT_HOST}:${address.port}`
  }

  it('answers a POST with the engine document', async () => {
    const base = await baseUrlFor({ model, search, doubt: engineReturning(200, ANSWERED) })

    const res = await fetch(`${base}/api/doubt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'why a base case', resume_at: 'beat-1', lesson_skill: 'recursion' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(ANSWERED)
  })

  it('is 503 and not 404 when the engine is not configured', async () => {
    /* 404 is what the undeployed route already returns. If this ever regresses
     * to 404 the symptom is identical to the original defect. */
    const base = await baseUrlFor({ model, search })

    const res = await fetch(`${base}/api/doubt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'anything' }),
    })

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ outcome: 'unavailable' })
  })
})
