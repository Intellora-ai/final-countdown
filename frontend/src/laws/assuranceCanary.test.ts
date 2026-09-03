// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCanaries } from '../../scripts/assurance/canaries.mjs'
import { shelfDriver } from '../assurance/drivers/shelf'

/**
 * AG9 -- THE DEPLOYMENT-PRESERVATION CANARY (attack F).
 *
 * Three asks on one subject that differ only in `asked` -- the shelf identity
 * dimension -- must be served three DISTINCT artifacts. If a deployment
 * collapses two of them onto one artifact, the identity that passed CI was lost
 * in the build/bundle/import path. Proven here in-process against the real
 * handler; post-deploy the same spec runs against a live base URL with a
 * fetch-based `ask`.
 */

const SPEC = JSON.parse(readFileSync('assurance/canaries/shelf.json', 'utf8'))

describe('AG9 -- the shelf canaries stay pairwise distinct', () => {
  let env: Awaited<ReturnType<typeof shelfDriver.newEnv>>
  beforeEach(async () => {
    env = await shelfDriver.newEnv()
    // Seed one artifact per canary shape, so a correct shelf can serve each.
    for (const c of SPEC.canaries) await shelfDriver.seed(env, { subject: SPEC.subject, asked: c.asked })
  })
  afterEach(() => { env.close(); vi.unstubAllGlobals() })

  const askInProcess = async (canary: { asked: string }, subject: string) =>
    shelfDriver.ask(env, { subject, asked: canary.asked }, '')

  it('a correct shelf serves a distinct artifact for each canary', async () => {
    const { served, violations } = await runCanaries(SPEC, askInProcess)
    expect(violations, `the deployment collapsed canaries: ${JSON.stringify(violations)}`).toEqual([])
    const ids = Object.values(served)
    expect(new Set(ids).size, `canaries did not stay distinct: ${JSON.stringify(served)}`).toBe(SPEC.canaries.length)
  })

  it('the canary catches a collapse (a deployment that ignores `asked`)', async () => {
    // A deployment whose shelf ignored `asked` would serve one artifact for all.
    const collapsed = async () => 'route-collapsed'
    const { violations } = await runCanaries(SPEC, collapsed)
    expect(violations.length, 'the canary did not catch the collapse').toBeGreaterThan(0)
    expect(violations[0]).toMatchObject({ decision: 'shelf_lookup' })
  })
})
