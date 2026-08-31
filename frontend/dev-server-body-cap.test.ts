/**
 * A LEARNER PASTES SOMETHING ENORMOUS INTO THE DEV SERVER.
 *
 * WHY THIS TEST EXISTS.
 *
 * `vite-plugin-search.ts` and `vite-plugin-engine.ts` cap the request body as
 * it streams, before any of it is buffered. Both imported that cap by a name
 * their source module had stopped exporting, and nothing noticed:
 *
 *   - `tsconfig.json` includes `src`, `tsconfig.server.json` includes `server`.
 *     Neither includes a file at the package root, so `tsc` never looked at
 *     either plugin.
 *   - Under vitest the missing binding is simply `undefined`, and
 *     `size > undefined` is `false`, so the guard silently never fired and
 *     every existing test still passed.
 *   - Under `vite dev` the config is bundled by esbuild into one module, where
 *     the same missing binding is a hard `ReferenceError` thrown inside a
 *     stream handler with no catch above it. That KILLS THE DEV SERVER: on
 *     2026-08-31 it took 96 browser scenarios from one paste, every one of them
 *     reporting ERR_CONNECTION_REFUSED rather than the defect.
 *
 * So the test starts THE REAL DEV SERVER through THE REAL `vite.config.ts` --
 * the esbuild config bundle included, because that is where the two behaviours
 * diverge -- and asks for the refusal a learner should get. A test that called
 * the middleware directly would have passed while the product was dead.
 */

import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let server: ViteDevServer
let origin: string

beforeAll(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
    /* Port 0 lets the kernel choose, so this never collides with a dev server
       the developer already has open, nor with a parallel vitest worker. */
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'silent',
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (address === null || address === undefined || typeof address === 'string') {
    throw new Error('the dev server did not report a port')
  }
  origin = `http://127.0.0.1:${address.port}`
}, 120_000)

afterAll(async () => {
  await server?.close()
})

/**
 * Both caps are 8,000 bytes, so 20,000 characters is comfortably over either.
 *
 * The same size the shipping refusals are tested with -- `searchTheOpenWeb`
 * and `askEngine` each have an oversized-body case built from
 * `'x'.repeat(20_000)`. Matching it keeps "oversized" one number in this
 * repository rather than three.
 *
 * Both keys are sent because the two routes read different fields, and one
 * body that is over the cap for both is what makes the two cases identical
 * apart from the route.
 */
const OVERSIZED = JSON.stringify({ query: 'x'.repeat(20_000), text: 'x'.repeat(20_000) })

describe.each([
  ['/api/doubt', 'the doubt engine'],
  ['/api/search', 'open-web search'],
])('%s refuses a body no question could justify', (route, what) => {
  it(`answers 413 rather than reading all of it (${what})`, async () => {
    const response = await fetch(origin + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: OVERSIZED,
    })

    expect(response.status).toBe(413)
    const body: unknown = await response.json()
    expect(JSON.stringify(body)).toContain('too long')
  })
})

it('the dev server is still serving everyone else afterwards', async () => {
  const response = await fetch(origin + '/')
  expect(response.status).toBe(200)
})
