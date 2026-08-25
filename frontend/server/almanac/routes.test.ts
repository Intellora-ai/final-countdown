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

let store: LedgerStore

beforeEach(() => {
  store = memoryStore()
})

function handler() {
  return createHandler({ model, search, almanac: createLedger(store) })
}

const DAY = {
  method: 'POST',
  path: '/api/day',
  body: {
    studentId: 'stu_1',
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
    const res = await createHandler({ model, search })(DAY)
    expect(res.status).toBe(503)
  })
})

describe('POST /api/done', () => {
  it('records that the student finished a concept', async () => {
    const h = handler()
    const day = (await h(DAY)).body['day'] as { items: Array<{ conceptId: string }> }
    const finished = day.items[0].conceptId

    const res = await h({ method: 'POST', path: '/api/done', body: { studentId: 'stu_1', conceptId: finished } })
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
    await h({ method: 'POST', path: '/api/done', body: { studentId: 'stu_1', conceptId: day.items[0].conceptId } })
    expect((await h(DAY)).body['day']).toEqual(before)
  })

  it('refuses a request with no concept', async () => {
    const res = await handler()({ method: 'POST', path: '/api/done', body: { studentId: 'stu_1' } })
    expect(res.status).toBe(400)
  })

  it('refuses a request with no student', async () => {
    const res = await handler()({ method: 'POST', path: '/api/done', body: { conceptId: 'x' } })
    expect(res.status).toBe(400)
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
