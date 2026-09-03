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
/* The key this server signs identities with.
 *
 * `createHandler` REQUIRES one and has no default, on purpose -- see
 * `server/identity.ts`: a fallback in the source would be a signature every
 * reader can reproduce. These proofs are not about identity, so the value is
 * arbitrary; it is a fixture and protects nothing.
 */
const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'


describe('GET /api/health', () => {
  it('answers 200 to a plain GET, which is what a waiting process can ask', async () => {
    const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(GET)
    expect(res.status).toBe(200)
    expect(res.body['ok']).toBe(true)
  })

  it('says whether the planner is configured, because that changes what works', async () => {
    const without = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(GET)
    expect(without.body['planner']).toBe(false)

    const with_ = await createHandler({ model, search, almanac: createLedger(memoryStore()), identitySecret: A_TEST_SECRET })(GET)
    expect(with_.body['planner']).toBe(true)
  })

  it('leaks no credential, path, or student, whatever it is holding', async () => {
    const secret = 'CANARY-health-must-not-leak-9999'
    const res = await createHandler({
      model, search, almanac: createLedger(memoryStore()), secrets: [secret], identitySecret: A_TEST_SECRET,
    })(GET)

    const text = JSON.stringify(res.body)
    expect(text).not.toContain(secret)
    expect(text).not.toMatch(/sk-ant|ledger|\.json|\/Users\/|studentId/i)
  })

  it('answers with capabilities only -- every value a boolean, so no value can ride out on it', async () => {
    /*
     * THE LAW `server/m7-control.test.ts` HAS ALWAYS CARRIED, red on this file
     * the first time it was ever run (2026-09-03, the owner's socket-bound
     * suite): "/api/health names CAPABILITIES and never values: no key, no
     * path, no student", asserted structurally so the first string anybody
     * adds fails before it ships.
     *
     * I added `vendors: ['groq', 'ollama (qwen2.5:7b)']` to this route in
     * Part I and wrote a test demanding it. It named the vendor AND the local
     * model on the most public route the server has. The law is older, it is
     * about disclosure, and it wins; this test now asserts it here too, where
     * it runs without a socket.
     */
    const res = await createHandler({
      model, search, identitySecret: A_TEST_SECRET,
      cloudConfigured: true, localConfigured: true,
    })(GET)
    expect(Object.keys(res.body).length, 'health answered with nothing at all').toBeGreaterThan(0)
    for (const [name, value] of Object.entries(res.body)) {
      expect(typeof value, `/api/health reports a value, not a capability: ${name}`).toBe('boolean')
    }
    expect(JSON.stringify(res.body), 'a vendor or model name is on the public route').not.toMatch(/groq|ollama|gemini|anthropic|qwen|gemma/i)
  })

  it('still says whether the laptop is answering alone, without naming what it is', async () => {
    /* The reason `vendors` was added: when a spent cloud budget leaves the
       laptop answering, nothing anywhere could say so. Two booleans answer
       exactly that question and disclose nothing -- `cloud: false, local:
       true` is a laptop on its own. */
    const alone = await createHandler({ model, search, identitySecret: A_TEST_SECRET, cloudConfigured: false, localConfigured: true })(GET)
    expect(alone.body['cloud']).toBe(false)
    expect(alone.body['local']).toBe(true)

    const both = await createHandler({ model, search, identitySecret: A_TEST_SECRET, cloudConfigured: true, localConfigured: true })(GET)
    expect(both.body['cloud']).toBe(true)

    const unsaid = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(GET)
    expect(unsaid.body['cloud'], 'an unconfigured server must answer false, not leave the field out').toBe(false)
    expect(unsaid.body['local']).toBe(false)
  })

  it('is the only route that answers a GET at all', async () => {
    /* Everything else stays POST-only. A GET that mutates is a link a browser
     * can prefetch. */
    for (const path of ['/api/day', '/api/done', '/api/lesson', '/api/ask', '/api/search']) {
      const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })({ method: 'GET', path, body: {} })
      expect(res.status, path).toBe(405)
    }
  })

  it('still refuses an unknown path', async () => {
    const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })({ method: 'GET', path: '/api/nope', body: {} })
    expect(res.status).toBe(404)
  })
})
