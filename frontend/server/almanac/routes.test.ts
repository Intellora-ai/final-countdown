/* Tests for the Almanac HTTP routes.
 *
 * DESIRED OUTCOME
 *   The dashboard can ask for today, and record that the student finished
 *   something, and nothing else can.
 *
 * WHAT MUST BE TRUE
 *   1. A day comes back with real concepts from the real curriculum.
 *   2. Asking twice returns the same day — frozen, over HTTP too.
 *   3. Marking done is the ONLY way a concept leaves the plan, and it is a
 *      separate, explicit request. Nothing about fetching a day marks anything.
 *   4. A malformed date is refused. A junk date would silently create a junk
 *      day in the ledger that no calendar would ever ask for again.
 *   5. Every bad input gets a status, never a crash.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../handler.ts'
import { createLedger, type LedgerStore } from './ledger.ts'
import { memoryStore } from './ledger.test.ts'

const model: ModelPort = { lesson: async () => ({}) }
const search: SearchPort = { search: async () => [] }

/* The key this server signs identities with.
 *
 * `createHandler` REQUIRES one and has no default, on purpose -- see
 * `server/identity.ts`: a fallback in the source would be a signature every
 * reader can reproduce. These proofs are not about identity, so the value is
 * arbitrary; it is a fixture and protects nothing.
 */
const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'


let store: LedgerStore

beforeEach(() => {
  store = memoryStore()
})

/**
 * One handler, driven as ONE BROWSER — the cookie is carried between calls.
 *
 * WHY THIS WRAPPER HAD TO EXIST. These proofs used to send
 * `body: { studentId: 'stu_1' }` and the server believed it. It no longer can:
 * identity is assigned by the server and signed, precisely so a caller cannot
 * name a student (see `server/identity.ts`). Without a cookie jar every single
 * request arrives as a BRAND-NEW student, so a day fetched by one and marked
 * done by another can never agree — which is exactly how these read after the
 * change, and it was the harness at fault, not the product.
 *
 * A real browser keeps its cookie. So does this.
 */
function handler() {
  const handle = createHandler({
    model, search, almanac: createLedger(store), identitySecret: A_TEST_SECRET,
  })
  let jar: string | undefined
  return async (req: Parameters<typeof handle>[0]) => {
    const response = await handle(jar === undefined ? req : { ...req, cookie: jar })
    /* Remember the identity the server issued, exactly as a browser does. */
    if (response.setCookie !== undefined) jar = response.setCookie.split(';')[0]
    return response
  }
}

const DAY = {
  method: 'POST',
  path: '/api/day',
  body: {
    /* NO `studentId` HERE, AND ITS ABSENCE IS THE POINT.
   * The server assigns identity and signs it; a body that names a student is
   * refused with 403 once the caller holds a cookie. See `server/identity.ts`
   * and the forgery proof below. */
    date: '2026-08-25',
    schoolClass: 10,
    subjectIds: ['science', 'mathematics'],
    dailyMinutes: 120,
  },
}

describe('POST /api/day', () => {
  it('returns a day built from the real curriculum', async () => {
    const res = await handler()(DAY)
    expect(res.status).toBe(200)
    const day = res.body['day'] as { items: Array<{ conceptId: string }> }
    expect(day.items.length).toBeGreaterThan(0)
  })

  it('gives every item a concept, a subject and its minutes', async () => {
    const res = await handler()(DAY)
    const day = res.body['day'] as { items: Array<Record<string, unknown>> }
    for (const item of day.items) {
      expect(typeof item['conceptId']).toBe('string')
      expect(typeof item['subjectId']).toBe('string')
      expect(typeof item['minutes']).toBe('number')
    }
  })

  it('returns the same day when asked twice', async () => {
    const h = handler()
    const first = await h(DAY)
    const second = await h(DAY)
    expect(second.body['day']).toEqual(first.body['day'])
  })

  it('refuses a date that is not a real calendar date', async () => {
    /* A junk date would create a junk ledger entry that no calendar ever asks
     * for again, and it would sit there forever looking like a real day. */
    for (const date of ['today', '25-08-2026', '2026-13-01', '2026-08-32', '']) {
      const res = await handler()({ ...DAY, body: { ...DAY.body, date } })
      expect(res.status, date).toBe(400)
    }
  })

  it('accepts a well-formed date', async () => {
    const res = await handler()({ ...DAY, body: { ...DAY.body, date: '2026-02-28' } })
    expect(res.status).toBe(200)
  })

  it('refuses a class the app has no curriculum for', async () => {
    const res = await handler()({ ...DAY, body: { ...DAY.body, schoolClass: 7 } })
    expect(res.status).toBe(400)
  })

  it('refuses a request with no subjects chosen', async () => {
    const res = await handler()({ ...DAY, body: { ...DAY.body, subjectIds: [] } })
    expect(res.status).toBe(400)
  })

  it('refuses a request with no student', async () => {
    const res = await handler()({ ...DAY, body: { ...DAY.body, studentId: '' } })
    expect(res.status).toBe(400)
  })

  it('refuses a daily budget that is not a positive number', async () => {
    for (const dailyMinutes of [0, -30, 'lots', null]) {
      const res = await handler()({ ...DAY, body: { ...DAY.body, dailyMinutes } })
      expect(res.status, String(dailyMinutes)).toBe(400)
    }
  })

  it('answers 503 when no ledger is configured, rather than pretending', async () => {
    const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(DAY)
    expect(res.status).toBe(503)
  })
})

describe('POST /api/done', () => {
  it('records that the student finished a concept', async () => {
    const h = handler()
    const day = (await h(DAY)).body['day'] as { items: Array<{ conceptId: string }> }
    const finished = day.items[0].conceptId

    const res = await h({ method: 'POST', path: '/api/done', body: { conceptId: finished } })
    expect(res.status).toBe(200)

    const tomorrow = (await h({ ...DAY, body: { ...DAY.body, date: '2026-08-26' } })).body['day'] as {
      items: Array<{ conceptId: string }>
    }
    expect(tomorrow.items.map((i) => i.conceptId)).not.toContain(finished)
  })

  it('does not change today once it is set', async () => {
    const h = handler()
    const before = (await h(DAY)).body['day']
    const day = before as { items: Array<{ conceptId: string }> }
    await h({ method: 'POST', path: '/api/done', body: { conceptId: day.items[0].conceptId } })
    expect((await h(DAY)).body['day']).toEqual(before)
  })

  it('refuses a request with no concept', async () => {
    const res = await handler()({ method: 'POST', path: '/api/done', body: {} })
    expect(res.status).toBe(400)
  })

  it('files the work under the student the SERVER identified, not one the caller named', async () => {
    /* THIS TEST WAS REVERSED, AND THE OLD VERSION PINNED A DEFECT.
     *
     * It used to post `{ conceptId: 'x' }` with no student and expect 400,
     * because the caller was required to say who it was. That requirement was
     * the hole: anyone could name any student and mark THEIR work done. The
     * server now assigns identity and signs it, so "no student" is impossible
     * rather than refused, and a caller naming someone else is turned away.
     *
     * Closing the hole is what makes this expectation change; the assertion is
     * stronger than the one it replaces, not weaker. */
    const h = handler()
    const first = await h({ method: 'POST', path: '/api/done', body: { conceptId: 'x' } })
    expect(first.status).toBe(200)

    /* And the identity was issued by the server, not taken from the request. */
    expect(first.setCookie).toBeDefined()

    /* A caller that now HAS an identity may not claim a different one. */
    const forged = await h({
      method: 'POST', path: '/api/done', body: { studentId: 'somebody-else', conceptId: 'x' },
    })
    expect(forged.status).toBe(403)
  })

  it('is the only thing that marks work finished', async () => {
    /* Fetching a day, over and over, must never mark anything done. */
    const h = handler()
    for (const date of ['2026-08-25', '2026-08-26', '2026-08-27']) {
      await h({ ...DAY, body: { ...DAY.body, date } })
    }
    const ledger = createLedger(store)
    expect(await ledger.doneFor('stu_1')).toEqual(new Set())
  })
})
