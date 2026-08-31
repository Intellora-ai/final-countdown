/* Every string this server persists or forwards has an upper bound.
 *
 * DESIRED OUTCOME
 *   A stranger cannot make this server store, or pay for, an arbitrarily large
 *   string just by asking it to.
 *
 * WHAT MUST BE TRUE
 *   1. `studentId` and `conceptId` are BOUNDED. They become a key and a value
 *      in the ledger, which is one JSON file loaded whole on every read. A
 *      probe against the running container wrote a 60,000-character student key
 *      with one anonymous request; nothing refused it and nothing ever removes
 *      it. `nonEmptyString` checked `trim().length > 0` and nothing else.
 *   2. `concept`, `question` and `query` are BOUNDED. They are forwarded to a
 *      model that charges by the token, so an unbounded field is an unbounded
 *      bill.
 *   3. THE REFUSAL NAMES THE LIMIT. "studentId is required" for a value that
 *      was supplied is a message that sends the reader looking in the wrong
 *      place.
 *   4. THE BOUNDS CLEAR REAL DATA WITH ROOM TO SPARE. Measured over the
 *      generated CBSE curriculum on 2026-08-30: the longest real concept id is
 *      162 characters and the longest real name is 160. A limit under those
 *      would refuse a legitimate lesson, which is worse than the leak it
 *      closes.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { createLedger } from './almanac/ledger.ts'
import type { LedgerData, LedgerStore } from './almanac/ledger.ts'

const model: ModelPort = {
  async lesson() {
    throw new Error('an over-length request must never reach the paid model')
  },
}
const search: SearchPort = {
  async search() {
    throw new Error('an over-length request must never reach the paid search')
  },
}

function memory(): { store: LedgerStore; data: LedgerData } {
  const data: LedgerData = { days: {}, done: {} }
  return {
    data,
    store: {
      async load() {
        return data
      },
      async save() {
        /* The object is shared, so a save is already reflected in `data`. */
      },
    },
  }
}

function handlerWith(store: LedgerStore) {
  return createHandler({ model, search, almanac: createLedger(store), secrets: [] })
}

/** Comfortably past every bound below, and past the 162-character real max. */
const HUGE = 'x'.repeat(60_000)

describe('bounded fields', () => {
  it('refuses an over-length studentId and says which field and what limit', async () => {
    const { store, data } = memory()
    const response = await handlerWith(store)({
      method: 'POST',
      path: '/api/done',
      body: { studentId: HUGE, conceptId: 'real-numbers' },
    })

    expect(response.status).toBe(400)
    const error = String((response.body as { error?: unknown }).error)
    expect(error).toContain('studentId')
    /* The number, not just the word "long". A limit a caller cannot read is a
     * limit they cannot comply with. */
    expect(error).toMatch(/\d+/)

    /* AND NOTHING WAS WRITTEN. A 400 that still persisted the key would close
     * nothing at all. */
    expect(data.done).toEqual({})
  })

  it('refuses an over-length conceptId', async () => {
    const { store, data } = memory()
    const response = await handlerWith(store)({
      method: 'POST',
      path: '/api/done',
      body: { studentId: 'stu_a', conceptId: HUGE },
    })
    expect(response.status).toBe(400)
    expect(String((response.body as { error?: unknown }).error)).toContain('conceptId')
    expect(data.done).toEqual({})
  })

  it('still accepts the longest id the real curriculum contains', async () => {
    /* 162 characters, measured from the generated CBSE data. A bound that
     * refused this would break a real lesson for a real student. */
    const realistic = 'a'.repeat(162)
    const { store, data } = memory()
    const response = await handlerWith(store)({
      method: 'POST',
      path: '/api/done',
      body: { studentId: 'stu_a', conceptId: realistic },
    })
    expect(response.status).toBe(200)
    expect(data.done['stu_a']).toEqual([realistic])
  })

  it('refuses an over-length concept before it reaches the paid model', async () => {
    const response = await handlerWith(memory().store)({
      method: 'POST',
      path: '/api/lesson',
      body: { concept: HUGE },
    })
    /* The model port throws if reached, so a 502 here would mean it was. */
    expect(response.status).toBe(400)
    expect(String((response.body as { error?: unknown }).error)).toContain('concept')
  })

  it('refuses an over-length question before it reaches the paid model', async () => {
    const response = await handlerWith(memory().store)({
      method: 'POST',
      path: '/api/ask',
      body: { question: HUGE },
    })
    expect(response.status).toBe(400)
    expect(String((response.body as { error?: unknown }).error)).toContain('question')
  })

  it('refuses an over-length search query before it reaches the paid search', async () => {
    const response = await handlerWith(memory().store)({
      method: 'POST',
      path: '/api/search',
      body: { query: HUGE },
    })
    expect(response.status).toBe(400)
    expect(String((response.body as { error?: unknown }).error)).toContain('query')
  })
})
