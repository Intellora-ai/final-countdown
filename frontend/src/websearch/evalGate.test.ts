import { describe, expect, it } from 'vitest'

import { CORPUS, runCorpus, type BenchmarkCase } from './corpus'
import { evaluate, FLOORS } from './evalReport'
import { fixtureProvider } from './engine'
import type { FetchOutcome } from './fetchPage'
import type { SearchHit } from './port'

/**
 * THE EVAL GATE. Runs the whole benchmark and refuses a run that got worse.
 *
 * WHY IT IS A TEST AND NOT A STANDALONE SCRIPT
 * --------------------------------------------
 * A `.mjs` script cannot import these modules — they are TypeScript, and Node
 * has no loader for them here. The options were a build step, a second runner,
 * or this. This is the only one that adds nothing: vitest already compiles the
 * project, already runs in CI as part of the frontend job, and an assertion is
 * already a gate. `npm run gate:eval` runs just this file for a human.
 *
 * OFFLINE, ALWAYS. Every page comes from the corpus's own `examplePage`, so
 * this needs no key, no network and no provider account, and it produces the
 * same numbers on every machine.
 */

/** Serve a page body at a url, as `fetchPage` would have. */
function served(body: string, url: string): FetchOutcome {
  return {
    ok: true,
    page: {
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      contentType: 'text/html',
      body,
      bytes: body.length,
      truncated: false,
      redirects: [],
      elapsedMs: 3,
      attempts: 1,
      retrievedAt: new Date().toISOString(),
    },
  }
}

/**
 * The whole corpus as a fixture world.
 *
 * Every planned query for a case resolves to that case's own relevant urls, and
 * every one of those urls serves that case's `examplePage`. That models a
 * PERFECT engine on purpose: what is being gated is this repository's pipeline,
 * not a vendor's ranking. A case that scores badly here is a bug in our code,
 * because the retrieval was handed to it correct.
 */
function fixtureWorld(cases: readonly BenchmarkCase[]): {
  hits: Record<string, readonly SearchHit[]>
  bodies: Record<string, string>
} {
  const hits: Record<string, readonly SearchHit[]> = {}
  const bodies: Record<string, string> = {}
  for (const c of cases) {
    hits[c.query] = c.relevantUrls.map((url) => ({ url, title: c.id, snippet: '' }))
    for (const url of c.relevantUrls) bodies[url] = c.examplePage
  }
  return { hits, bodies }
}

describe('the eval gate', () => {
  it('the whole corpus clears every quality floor', async () => {
    const { hits, bodies } = fixtureWorld(CORPUS)

    const report = await runCorpus({
      provider: fixtureProvider(hits),
      fetchImpl: async (url: string) => served(bodies[url] ?? '', url),
    })

    /* Printed on every run, pass or fail. A gate whose numbers are invisible
       until it fails gives nobody the chance to see a slide coming. */
    const rows = Object.entries(report.byCategory).map(
      ([k, v]) =>
        `${k.padEnd(22)} cases=${v.cases} precision=${v.meanPrecision?.toFixed(2) ?? '-'} coverage=${v.meanCoverage?.toFixed(2) ?? '-'}`,
    )
    const statuses = report.cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1
      return acc
    }, {})
    console.log(
      [
        '',
        `EVAL GATE — ${report.cases.length} cases`,
        ...rows,
        `statuses: ${JSON.stringify(statuses)}`,
        `citations supported: ${report.cases.filter((c) => c.citationSupported).length}/${report.cases.length}`,
        `refinement rounds: ${report.cases.reduce((n, c) => n + c.rounds, 0)}`,
        '',
      ].join('\n'),
    )

    const verdict = evaluate(report, FLOORS)
    expect(verdict.failures).toEqual([])
    expect(verdict.ok).toBe(true)
  })

  it('and the SAME gate refuses a corpus that got worse', async () => {
    /* The half that proves the run above means something. Every page is served
       empty, so nothing can be extracted, and the gate must say so rather than
       report a clean sweep. */
    const { hits } = fixtureWorld(CORPUS)
    const report = await runCorpus({
      provider: fixtureProvider(hits),
      fetchImpl: async (url: string) => served('', url),
    })
    const verdict = evaluate(report, FLOORS)
    expect(verdict.ok).toBe(false)
    expect(verdict.failures.length).toBeGreaterThan(0)
  })
})
