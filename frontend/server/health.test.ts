/* Can you tell whether it is running, and what it can do?
 *
 * WHY THIS EXISTS
 *   Every route on this server is POST-only, so there was no way to ask "are
 *   you there" without pretending to be a browser making a real request. That
 *   is not a theoretical gap: the browser test environment could not wait for
 *   the planner to come up, so the tests ran against a dashboard whose planner
 *   was unreachable and every "the app works" claim was made against half of
 *   it.
 *
 * WHAT IT MAY AND MAY NOT SAY
 *   Enough to diagnose: is the planner configured, is a model configured. Never
 *   a credential, never a path, never a student. A health endpoint is the most
 *   public thing a server has, and the most tempting place to leak from.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { createLedger } from './almanac/ledger.ts'
import { memoryStore } from './almanac/ledger.test.ts'

const model: ModelPort = { lesson: async () => ({}) }
const search: SearchPort = { search: async () => [] }
const GET = { method: 'GET', path: '/api/health', body: {} }

describe('GET /api/health', () => {
  it('answers 200 to a plain GET, which is what a waiting process can ask', async () => {
    const res = await createHandler({ model, search })(GET)
    expect(res.status).toBe(200)
    expect(res.body['ok']).toBe(true)
  })

  it('says whether the planner is configured, because that changes what works', async () => {
    const without = await createHandler({ model, search })(GET)
    expect(without.body['planner']).toBe(false)

    const with_ = await createHandler({ model, search, almanac: createLedger(memoryStore()) })(GET)
    expect(with_.body['planner']).toBe(true)
  })

  it('leaks no credential, path, or student, whatever it is holding', async () => {
    const secret = 'sk-ant-health-SECRET-9999'
    const res = await createHandler({
      model, search, almanac: createLedger(memoryStore()), secrets: [secret],
    })(GET)

    const text = JSON.stringify(res.body)
    expect(text).not.toContain(secret)
    expect(text).not.toMatch(/sk-ant|ledger|\.json|\/Users\/|studentId/i)
  })

  it('is the only route that answers a GET at all', async () => {
    /* Everything else stays POST-only. A GET that mutates is a link a browser
     * can prefetch. */
    for (const path of ['/api/day', '/api/done', '/api/lesson', '/api/ask', '/api/search']) {
      const res = await createHandler({ model, search })({ method: 'GET', path, body: {} })
      expect(res.status, path).toBe(405)
    }
  })

  it('still refuses an unknown path', async () => {
    const res = await createHandler({ model, search })({ method: 'GET', path: '/api/nope', body: {} })
    expect(res.status).toBe(404)
  })
})
