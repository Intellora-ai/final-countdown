/* THE DOUBT RUNG MUST REACH THE DEPLOYED BACKEND.
 *
 * `engineResolver` posts to a relative path. Deployed, the page is static files
 * on a CDN and the backend is somewhere else, so the relative path is a 404 and
 * the rung reports the engine as unavailable when it was never asked.
 *
 * WHAT MUST BE TRUE
 *   1. No configuration => unchanged. Dev keeps working with no `.env`.
 *   2. A configured backend => the POST goes to that host.
 *   3. The rung reads ONLY the base URL from the environment. A credential in
 *      the browser is a published credential, and this is the file that would
 *      most easily start reading one.
 */

import { describe, expect, it } from 'vitest'

import { engineResolver } from './engineResolver'
import type { Doubt, Lesson } from './contract'

const DOUBT = { text: 'why does recursion need a base case', atBeatId: 'beat-1' } as unknown as Doubt
const LESSON = { id: 'python-recursion' } as unknown as Lesson

function recordingFetch(seen: string[]): typeof fetch {
  return (async (url: string) => {
    seen.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => ({ outcome: 'unmappable', refusal: 'not from here' }),
    } as unknown as Response
  }) as unknown as typeof fetch
}

describe('where the doubt rung posts', () => {
  it('posts to the same origin when no backend is configured', async () => {
    const seen: string[] = []
    await engineResolver({ fetchImpl: recordingFetch(seen), env: {} }).resolve(DOUBT, LESSON)

    expect(seen).toEqual(['/api/doubt'])
  })

  it('posts to the configured backend when there is one', async () => {
    const seen: string[] = []
    await engineResolver({
      fetchImpl: recordingFetch(seen),
      env: { VITE_API_BASE: 'https://almanac.example.org' },
    }).resolve(DOUBT, LESSON)

    expect(seen).toEqual(['https://almanac.example.org/api/doubt'])
  })

  it('still honours an explicit endpoint, which the tests rely on', async () => {
    const seen: string[] = []
    await engineResolver({
      fetchImpl: recordingFetch(seen),
      endpoint: '/somewhere/else',
      env: { VITE_API_BASE: 'https://almanac.example.org' },
    }).resolve(DOUBT, LESSON)

    expect(seen).toEqual(['/somewhere/else'])
  })
})
