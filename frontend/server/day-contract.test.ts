/* The wire between the dashboard and Almanac, driven end to end.
 *
 * WHY THIS EXISTS SEPARATELY FROM BOTH UNIT SUITES
 *   `client.test.ts` proves the browser parses a shape it was handed.
 *   `routes.test.ts` proves the server produces a shape it was asked for.
 *   Both can pass while the two shapes are different, because each test
 *   supplies its own idea of what the other side sends.
 *
 *   The shapes are declared twice ON PURPOSE -- the secret-exposure gate
 *   refuses any import from `src/` into `server/`, so the network is the
 *   boundary and each side describes it. Two descriptions of one contract is
 *   exactly the arrangement that drifts. This is the check that they agree.
 *
 * NO SOCKET. The handler is a pure function from request to response, so a
 * four-line `fetchImpl` connects the real client to the real server.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { createLedger, type LedgerStore } from './almanac/ledger.ts'
import { memoryStore } from './almanac/ledger.test.ts'
import { createAlmanacClient, type DayRequest } from '../src/almanac/client.ts'

const model: ModelPort = { lesson: async () => ({}) }
const search: SearchPort = { search: async () => [] }

let store: LedgerStore
beforeEach(() => {
  store = memoryStore()
})

/** The real client talking to the real handler, with the network taken out. */
function connected(almanac = createLedger(store)) {
  const handle = createHandler({ model, search, almanac })
  return createAlmanacClient({
    fetchImpl: async (url, init) => {
      const res = await handle({ method: init.method, path: url, body: JSON.parse(init.body) })
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body }
    },
  })
}

const REQUEST: DayRequest = {
  studentId: 'stu_1',
  date: '2026-08-25',
  schoolClass: 10,
  dailyMinutes: 120,
  subjectIds: ['science', 'mathematics'],
}

describe('a real day survives the real wire', () => {
  it('parses, rather than being rejected as "not a day"', async () => {
    const result = await connected().day(REQUEST)

    /* If the shapes have drifted this is where it shows: the client's own
     * validator refuses the server's real output. */
    expect(result.ok, !result.ok ? `client rejected the server's day: ${result.reason}` : '').toBe(true)
    expect(result.ok && result.day.items.length).toBeGreaterThan(0)
  })

  it('carries every field the dashboard renders', async () => {
    const result = await connected().day(REQUEST)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.day.date).toBe('2026-08-25')
    expect(typeof result.day.allocated).toBe('number')
    expect(typeof result.day.capacity).toBe('number')
    for (const item of result.day.items) {
      expect(item.conceptId.length).toBeGreaterThan(0)
      expect(item.subjectId.length).toBeGreaterThan(0)
      expect(item.chapterId.length).toBeGreaterThan(0)
      expect(item.minutes).toBeGreaterThan(0)
    }
  })

  it('agrees with the server about which classes exist', async () => {
    /* The client keeps its own copy of the supported classes so it can refuse
     * an unfinished setup before making a request. A copy that drifts would
     * either block a real class or send one the server rejects. */
    for (const schoolClass of [9, 10, 11, 12]) {
      const result = await connected().day({ ...REQUEST, schoolClass, subjectIds: ['mathematics'] })
      expect(result.ok, `class ${schoolClass} was refused by the server`).toBe(true)
    }
  })
})

describe('Done is the only thing that removes work', () => {
  it('marking done through the client changes the NEXT day, not just the reply', async () => {
    /* The effect, not the call. A test that asserts markDone returned ok is
     * satisfied by a server that discards the request. */
    const almanac = createLedger(store)
    const client = connected(almanac)

    const today = await client.day(REQUEST)
    expect(today.ok).toBe(true)
    if (!today.ok) return
    const finished = today.day.items[0].conceptId

    expect(await client.markDone('stu_1', finished)).toEqual({ ok: true })

    const tomorrow = await connected(almanac).day({ ...REQUEST, date: '2026-08-26' })
    expect(tomorrow.ok).toBe(true)
    if (!tomorrow.ok) return

    expect(tomorrow.day.items.map((i) => i.conceptId)).not.toContain(finished)
  })

  it('asking for a day does not mark anything, however many times it is asked', async () => {
    const almanac = createLedger(store)
    const client = connected(almanac)

    const first = await client.day(REQUEST)
    await client.day(REQUEST)
    await client.day(REQUEST)
    const again = await client.day(REQUEST)

    expect(first.ok && again.ok && again.day.items).toEqual(first.ok ? first.day.items : null)
  })

  it('work left unfinished comes back tomorrow, labelled with the day it came from', async () => {
    /* This is what makes a row backlog on the dashboard. If `carriedFrom` were
     * dropped anywhere along the wire, yesterday's unfinished work would show
     * up looking like a fresh assignment. */
    const almanac = createLedger(store)
    const today = await connected(almanac).day(REQUEST)
    expect(today.ok).toBe(true)
    if (!today.ok) return

    const tomorrow = await connected(almanac).day({ ...REQUEST, date: '2026-08-26' })
    expect(tomorrow.ok).toBe(true)
    if (!tomorrow.ok) return

    const carried = tomorrow.day.items.filter((i) => i.carriedFrom !== undefined)
    expect(carried.length).toBeGreaterThan(0)
    for (const item of carried) {
      expect(item.carriedFrom).toBe('2026-08-25')
      expect(today.day.items.map((i) => i.conceptId)).toContain(item.conceptId)
    }
  })
})

describe('a server with no planner', () => {
  it('is reported with the server\'s own explanation, and no day', async () => {
    const handle = createHandler({ model, search })
    const client = createAlmanacClient({
      fetchImpl: async (url, init) => {
        const res = await handle({ method: init.method, path: url, body: JSON.parse(init.body) })
        return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body }
      },
    })

    const result = await client.day(REQUEST)
    expect(result).toEqual({ ok: false, reason: 'the planner is not configured on this server' })
  })
})
