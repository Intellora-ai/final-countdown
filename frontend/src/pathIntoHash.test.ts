/*
 * The defect, in one line: the address bar said `/canvas` and the screen showed
 * the dashboard. Nothing errored, nothing logged, and the page it landed on has
 * no topic box on it -- so the only conclusion available to the person looking
 * at it was that the canvas was broken.
 */
import { describe, expect, it } from 'vitest'
import { hashTargetFor } from './pathIntoHash'

const at = (pathname: string, hash = '', search = '') => ({
  origin: 'http://localhost:5173',
  pathname,
  hash,
  search,
})

describe('a path-style url on a hash-routed application', () => {
  it('is moved into the hash, so /canvas reaches the canvas', () => {
    expect(hashTargetFor(at('/canvas'))).toBe('http://localhost:5173/#/canvas')
  })

  it('keeps the query, because a link that carries one means it', () => {
    expect(hashTargetFor(at('/canvas', '', '?topic=rain'))).toBe(
      'http://localhost:5173/#/canvas?topic=rain',
    )
  })

  it('leaves a url that already names a route alone', () => {
    /* The whole bug is the path overruling nothing. It must never overrule
       something: `#/today` is a more specific instruction than `/canvas`. */
    expect(hashTargetFor(at('/canvas', '#/today'))).toBeNull()
  })

  it('leaves a bare "#" alone, because that is still an answer', () => {
    expect(hashTargetFor(at('/canvas', '#'))).toBeNull()
  })

  it('leaves the root alone, which is the ordinary way in', () => {
    expect(hashTargetFor(at('/'))).toBeNull()
    expect(hashTargetFor(at(''))).toBeNull()
  })

  it('leaves a file alone, so a missing asset stays a 404 and not a mystery route', () => {
    expect(hashTargetFor(at('/vite.svg'))).toBeNull()
    expect(hashTargetFor(at('/assets/index-abc123.js'))).toBeNull()
  })

  it('moves a deeper path whole, rather than only its first segment', () => {
    expect(hashTargetFor(at('/learn/photosynthesis'))).toBe(
      'http://localhost:5173/#/learn/photosynthesis',
    )
  })
})
