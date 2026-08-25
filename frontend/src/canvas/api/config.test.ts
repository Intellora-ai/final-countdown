import { describe, expect, it } from 'vitest'

import { API_BASE_VARIABLE, apiBase, apiConfigured } from './config'

/**
 * Every case here is one somebody actually produces in a `.env` file.
 *
 * The interesting ones are not "a valid URL" -- that path is trivial. They are
 * blank, whitespace, and trailing slashes, because those are the three ways a
 * variable ends up technically set and semantically off, and each one has a
 * different wrong behaviour if the parser is naive.
 */
describe('apiBase', () => {
  it('is null when the variable is absent, so the default is unchanged behaviour', () => {
    expect(apiBase({})).toBeNull()
  })

  it('is null for an empty string rather than the current origin', () => {
    // `VITE_API_BASE=` in a .env file. Returning '' would make every caller
    // request `/health` on whatever origin the page happens to be served from,
    // which is a silent misroute, not a configuration error anyone can see.
    expect(apiBase({ [API_BASE_VARIABLE]: '' })).toBeNull()
  })

  it('is null for whitespace only', () => {
    expect(apiBase({ [API_BASE_VARIABLE]: '   ' })).toBeNull()
  })

  it('returns the exact base when one is set', () => {
    expect(apiBase({ [API_BASE_VARIABLE]: 'https://api.example.test' })).toBe(
      'https://api.example.test',
    )
  })

  it('strips a single trailing slash', () => {
    // `${base}/health` with a trailing slash gives `//health`, which some
    // gateways route as a different path rather than normalising it.
    expect(apiBase({ [API_BASE_VARIABLE]: 'https://api.example.test/' })).toBe(
      'https://api.example.test',
    )
  })

  it('strips several trailing slashes', () => {
    expect(apiBase({ [API_BASE_VARIABLE]: 'https://api.example.test///' })).toBe(
      'https://api.example.test',
    )
  })

  it('keeps a path prefix, which is how it is deployed behind a gateway', () => {
    expect(apiBase({ [API_BASE_VARIABLE]: 'https://example.test/learning/' })).toBe(
      'https://example.test/learning',
    )
  })

  it('trims surrounding whitespace rather than building a URL that contains it', () => {
    expect(apiBase({ [API_BASE_VARIABLE]: '  https://api.example.test  ' })).toBe(
      'https://api.example.test',
    )
  })

  it('does not strip a leading slash from a same-origin base', () => {
    // `/api` is a legitimate value: the API behind the same origin as the app.
    expect(apiBase({ [API_BASE_VARIABLE]: '/api' })).toBe('/api')
  })
})

describe('apiConfigured', () => {
  it('is false by default, which is the whole point of the flag', () => {
    expect(apiConfigured({})).toBe(false)
  })

  it('is false for a blank value, matching apiBase', () => {
    // Paired with the test above. If these two ever disagree, one call site
    // thinks the API is on while another thinks it is off, and the bug shows up
    // as an intermittent 404 rather than as a configuration mistake.
    expect(apiConfigured({ [API_BASE_VARIABLE]: '  ' })).toBe(false)
  })

  it('is true once a base is supplied', () => {
    expect(apiConfigured({ [API_BASE_VARIABLE]: 'https://api.example.test' })).toBe(true)
  })
})
