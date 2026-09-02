/**
 * Every `/api/...` route the browser code fetches must be reachable through the
 * dev server -- proxied to the API process, or owned by a Vite plugin.
 *
 * WHY THIS EXISTS. `vite.config.ts` routes `/api` ONE PATH AT A TIME, on
 * purpose (a blanket `/api` proxy would swallow the plugin-owned routes). The
 * cost of that choice is that a new browser-fetched route is silently dead in
 * development until somebody adds it to the list -- and "silently" is exact:
 * Vite's SPA fallback answers the request with index.html and a 200, so a
 * client that reads `response.json()` sees "not JSON" and degrades to nothing.
 *
 * That is precisely how `/api/situation` failed. The canvas GET and PUT never
 * reached the server; the open-loop ledger stored nothing; Law G's return card
 * had nothing to return, in all four browsers, on three CI runs (up to
 * 33596363576) -- while every server-side test of the same route passed,
 * because the server was never the problem.
 *
 * So the list is now checked against the code, not remembered. This test finds
 * every `'/api/<name>'` literal in the shipped browser source and refuses if
 * any is neither proxied nor plugin-owned. It cannot go stale in the useful
 * direction: a route added to the browser and forgotten here fails this test
 * the same day, which is the only day it is cheap to notice.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import config from './vite.config'

/** Routes the dev server answers itself, via a plugin, rather than proxying. */
const OWNED_BY_A_PLUGIN = new Set(['/api/doubt', '/api/search'])

/** Browser-shipped source only: not tests, not the server, not the plugins. */
function shippedSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      shippedSourceFiles(path, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) continue
    out.push(path)
  }
  return out
}

function apiRoutesFetchedByTheBrowser(): Set<string> {
  const found = new Set<string>()
  for (const file of shippedSourceFiles(join(__dirname, 'src'))) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/['"`](\/api\/[a-z][a-z0-9-]*)['"`]/g)) {
      found.add(match[1]!)
    }
  }
  return found
}

function proxiedRoutes(): Set<string> {
  const resolved = config as unknown as { server?: { proxy?: Record<string, unknown> } }
  return new Set(Object.keys(resolved.server?.proxy ?? {}))
}

describe('the dev server can reach every API route the browser fetches', () => {
  it('finds the routes it is checking, so an empty pass cannot happen', () => {
    /* The two routes this repository has always fetched; if this fails, the
       scan is broken, not the config. */
    const fetched = apiRoutesFetchedByTheBrowser()
    expect(fetched.has('/api/ask'), 'the scan no longer sees /api/ask').toBe(true)
    expect(fetched.has('/api/situation'), 'the scan no longer sees /api/situation').toBe(true)
  })

  it('proxies or owns every one of them', () => {
    const proxied = proxiedRoutes()
    const unreachable = [...apiRoutesFetchedByTheBrowser()]
      .filter((route) => !proxied.has(route) && !OWNED_BY_A_PLUGIN.has(route))
      .sort()
    expect(
      unreachable,
      'the browser fetches these routes but the dev server sends them to index.html: ' +
        'add each to the proxy list in vite.config.ts (one path at a time, as the file explains)',
    ).toEqual([])
  })

  it('fails in the other direction too: a route dropped from the proxy is caught', () => {
    /* The test above would be vacuous if it could not distinguish a proxied
       route from an unproxied one. Prove it can, against the real config. */
    const proxied = proxiedRoutes()
    expect(proxied.has('/api/situation'), 'the guard could not see /api/situation in the proxy').toBe(true)
    const withoutIt = new Set(proxied)
    withoutIt.delete('/api/situation')
    const wouldFail = [...apiRoutesFetchedByTheBrowser()].filter(
      (route) => !withoutIt.has(route) && !OWNED_BY_A_PLUGIN.has(route),
    )
    expect(wouldFail, 'removing /api/situation from the proxy went unnoticed').toContain('/api/situation')
  })
})
