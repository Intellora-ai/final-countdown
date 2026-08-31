/* THE PLANNER CLIENT MUST REACH THE DEPLOYED BACKEND TOO.
 *
 * `createAlmanacClient` defaulted its base to '' — same origin. In development
 * that is right: `vite.config.ts` proxies /api/day, /api/lesson, /api/done and
 * /api/ask to the planner on 127.0.0.1:8787. That proxy is `server.proxy`, so
 * it exists under `vite dev` and nowhere else.
 *
 * Deployed, same origin is a CDN of static files. Every planner call 404s, and
 * `post()` turns that into "the planner answered 404" — an honest message about
 * a request that never reached a planner.
 *
 * WHAT MUST BE TRUE
 *   1. Unset base => unchanged. Same origin, so the dev proxy keeps working.
 *   2. Configured base => requests go to that host.
 *   3. An explicit baseUrl still wins, because the existing tests pass one.
 */

import { describe, expect, it } from 'vitest'

import { createAlmanacClient } from './client'

function recordingFetch(seen: string[]) {
  return async (url: string) => {
    seen.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => ({ done: true }),
    } as unknown as Response
  }
}

describe('where the planner client posts', () => {
  it('posts to the same origin when no backend is configured', async () => {
    const seen: string[] = []
    await createAlmanacClient({ fetchImpl: recordingFetch(seen), env: {} })
      .markDone('student-1', 'concept-1')

    expect(seen).toEqual(['/api/done'])
  })

  it('posts to the configured backend when there is one', async () => {
    const seen: string[] = []
    await createAlmanacClient({
      fetchImpl: recordingFetch(seen),
      env: { VITE_API_BASE: 'https://almanac.example.org' },
    }).markDone('student-1', 'concept-1')

    expect(seen).toEqual(['https://almanac.example.org/api/done'])
  })

  it('lets an explicit baseUrl win over the environment', async () => {
    const seen: string[] = []
    await createAlmanacClient({
      fetchImpl: recordingFetch(seen),
      baseUrl: 'http://127.0.0.1:8787',
      env: { VITE_API_BASE: 'https://almanac.example.org' },
    }).markDone('student-1', 'concept-1')

    expect(seen).toEqual(['http://127.0.0.1:8787/api/done'])
  })
})
