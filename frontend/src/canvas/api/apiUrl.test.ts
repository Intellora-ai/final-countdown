/* WHERE THE BROWSER SENDS A REQUEST IN PRODUCTION.
 *
 * DESIRED OUTCOME
 *   The deployed page reaches the deployed backend, and the same code reaches
 *   the dev server when there is no backend configured.
 *
 * THE DEFECT THIS CLOSES
 *   `teach/engineResolver.ts:46` posts to the relative path `/api/doubt`. That
 *   is correct while Vite is serving both the page and the route. On Vercel the
 *   page is static files and nothing on that origin answers `/api/doubt`, so
 *   every doubt is a 404 against the CDN.
 *
 * WHAT MUST BE TRUE
 *   1. Unset base means UNCHANGED behaviour: a relative path, same origin.
 *      Dev must not need configuration to keep working.
 *   2. A configured base produces an absolute URL on that host.
 *   3. A trailing slash never produces `//` — some gateways route that
 *      elsewhere entirely, which is a 404 nobody can explain from the code.
 *   4. The base is a URL and nothing else. It is the ONE thing allowed to be
 *      public, because it ships in the bundle like every `VITE_` value does.
 */

import { describe, expect, it } from 'vitest'

import { apiUrl } from './config'

describe('apiUrl', () => {
  it('stays relative when no backend is configured', () => {
    expect(apiUrl('/api/doubt', {})).toBe('/api/doubt')
  })

  it('stays relative when the base is blank', () => {
    /* A blank value in a `.env` is a variable somebody meant to turn off. */
    expect(apiUrl('/api/doubt', { VITE_API_BASE: '   ' })).toBe('/api/doubt')
  })

  it('points at the configured backend when there is one', () => {
    expect(apiUrl('/api/doubt', { VITE_API_BASE: 'https://api.example.org' }))
      .toBe('https://api.example.org/api/doubt')
  })

  it('does not produce a double slash when the base ends in one', () => {
    expect(apiUrl('/api/doubt', { VITE_API_BASE: 'https://api.example.org/' }))
      .toBe('https://api.example.org/api/doubt')
  })

  it('joins a path that does not start with a slash', () => {
    expect(apiUrl('api/doubt', { VITE_API_BASE: 'https://api.example.org' }))
      .toBe('https://api.example.org/api/doubt')
  })
})
