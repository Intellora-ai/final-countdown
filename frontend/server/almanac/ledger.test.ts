/* Tests for the day ledger — Almanac's memory.
 *
 * DESIRED OUTCOME
 *   A day, once set, is the student's day. It does not change under them, it is
 *   still there tomorrow, and what they finished is remembered forever.
 *
 * WHAT MUST BE TRUE
 *   1. FROZEN. Reading the same date twice returns the same plan, even if the
 *      inputs that produced it have since changed. A plan that reshuffles while
 *      a student is working through it is not a plan.
 *   2. HISTORY IS NEVER REWRITTEN. A date that already has a plan keeps it.
 *   3. YESTERDAY IS FINDABLE. The planner needs the most recent earlier day, and
 *      that is not always literally yesterday — students miss days.
 *   4. ONLY THE STUDENT MARKS DONE. The ledger exposes one way to record it, and
 *      planning never calls it.
 *   5. STUDENTS ARE SEPARATE. One student's ledger is never visible in another's.
 *   6. IT SURVIVES A RESTART. That is the whole point of writing it down.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { createLedger, previousDayFor, type LedgerData, type LedgerStore } from './ledger.ts'

/**
 * An in-process store, for tests.
 *
 * This used to live in ledger.ts, where the reachability gate correctly
 * reported it dead: nothing that ships imported it, because the shipping code
 * uses `fileStore`. A test double in production code is still production code
 * nobody runs.
 */
export function memoryStore(initial: LedgerData = { days: {}, done: {} }): LedgerStore {
  let data: LedgerData = structuredClone(initial)
  return {
    async load() {
      return structuredClone(data)
    },
    async save(next) {
      data = structuredClone(next)
    },
  }
}
import type { DayPlan, SubjectLike } from './plan.ts'

function subject(id: string, ids: readonly string[]): SubjectLike {
  return {
    id,
    name: id,
    chapters: [{
      id: `${id}-ch1`,
      name: 'c',
      concepts: ids.map((c) => ({ id: c, name: c, minutes: 15, deps: [] })),
    }],
  }
}

const MATHS = subject('maths', ['m1', 'm2', 'm3'])
const PHYSICS = subject('physics', ['p1', 'p2', 'p3'])

let store: LedgerStore

beforeEach(() => {
  store = memoryStore()
})

function almanac() {
  return createLedger(store)
}

const request = (date: string) => ({
  studentId: 'stu_1',
  date,
  dailyMinutes: 120,
  subjects: [MATHS, PHYSICS],
})

describe('1 — a day, once set, is frozen', () => {
  it('returns the same plan on a second read', async () => {
    const ledger = almanac()
    const first = await ledger.dayFor(request('2026-08-25'))
    const second = await ledger.dayFor(request('2026-08-25'))
    expect(second).toEqual(first)
  })

  it('does not re-plan when the student finishes something mid-day', async () => {
    /* Marking one topic done must not reshuffle the rest of today. */
    const ledger = almanac()
    const before = await ledger.dayFor(request('2026-08-25'))
    await ledger.markDone('stu_1', before.items[0].conceptId)
    const after = await ledger.dayFor(request('2026-08-25'))
    expect(after.items.map((i) => i.conceptId)).toEqual(before.items.map((i) => i.conceptId))
  })

  it('does not re-plan when the student changes subjects mid-day', async () => {
    const ledger = almanac()
    const before = await ledger.dayFor(request('2026-08-25'))
    const after = await ledger.dayFor({ ...request('2026-08-25'), subjects: [MATHS] })
    expect(after.items).toEqual(before.items)
  })

  it('records when the day was set', async () => {
    const ledger = createLedger(store, { now: () => '2026-08-25T06:00:00.000Z' })
    await ledger.dayFor(request('2026-08-25'))
    const stored = await ledger.read('stu_1', '2026-08-25')
    expect(stored?.plannedAt).toBe('2026-08-25T06:00:00.000Z')
  })
})

describe('2 — history is never rewritten', () => {
  it('keeps the original plan for a date that already has one', async () => {
    const ledger = almanac()
    const original = await ledger.dayFor(request('2026-08-25'))
    await ledger.markDone('stu_1', 'm1')
    await ledger.markDone('stu_1', 'p1')
    const again = await ledger.dayFor(request('2026-08-25'))
    expect(again.items).toEqual(original.items)
  })

  it('plans a NEW day differently once work has been finished', async () => {
    /* Frozen means today. Tomorrow reflects everything learned since. */
    const ledger = almanac()
    const day1 = await ledger.dayFor(request('2026-08-25'))
    for (const item of day1.items) await ledger.markDone('stu_1', item.conceptId)
    const day2 = await ledger.dayFor(request('2026-08-26'))
    expect(day2.items.map((i) => i.conceptId)).not.toEqual(day1.items.map((i) => i.conceptId))
  })
})

describe('3 — finding the previous day', () => {
  it('uses the most recent earlier day, not the calendar day before', async () => {
    /* Students miss days. Monday's unfinished work must still reach Thursday. */
    const ledger = almanac()
    const monday = await ledger.dayFor(request('2026-08-24'))
    const thursday = await ledger.dayFor(request('2026-08-27'))
    for (const item of monday.items) {
      expect(thursday.items.some((t) => t.conceptId === item.conceptId)).toBe(true)
    }
  })

  it('marks work from a skipped-over day with its original date', async () => {
    const ledger = almanac()
    await ledger.dayFor(request('2026-08-24'))
    const later = await ledger.dayFor(request('2026-08-27'))
    expect(later.items[0].carriedFrom).toBe('2026-08-24')
  })

  it('treats the first ever day as having no yesterday', async () => {
    const ledger = almanac()
    const first = await ledger.dayFor(request('2026-08-25'))
    expect(first.items.every((i) => i.carriedFrom === undefined)).toBe(true)
  })

  it('never looks at a LATER day when planning an earlier one', async () => {
    const ledger = almanac()
    await ledger.dayFor(request('2026-08-27'))
    const earlier = await ledger.dayFor(request('2026-08-25'))
    expect(earlier.items.every((i) => i.carriedFrom === undefined)).toBe(true)
  })
})

describe('3b — with several earlier days, the MOST RECENT one is used', () => {
  it('carries Tuesday’s work into Thursday, not Monday’s', async () => {
    /* Written after a mutation run: picking the OLDEST earlier day instead of
     * the newest left every test green, because no test had more than one
     * earlier day to choose between. */
    const ledger = almanac()

    const monday = await ledger.dayFor(request('2026-08-24'))
    for (const item of monday.items) await ledger.markDone('stu_1', item.conceptId)

    const tuesday = await ledger.dayFor(request('2026-08-25'))
    const thursday = await ledger.dayFor(request('2026-08-27'))

    for (const item of tuesday.items) {
      expect(
        thursday.items.some((t) => t.conceptId === item.conceptId),
        `${item.conceptId} from Tuesday did not reach Thursday`,
      ).toBe(true)
    }
    expect(thursday.items[0].carriedFrom).toBe('2026-08-25')
  })

  it('does not treat the day being planned as its own predecessor', async () => {
    /* `previousDay` filters on strictly-earlier. Tested directly, because from
     * dayFor the two are indistinguishable: it only ever asks when today has no
     * stored plan, so today could not be returned either way. */
    const ledger = almanac()
    await ledger.dayFor(request('2026-08-25'))
    const data = await store.load()
    expect(previousDayFor(data, 'stu_1', '2026-08-25')).toBeUndefined()
  })

  it('finds the earlier day when asked about a later date', async () => {
    const ledger = almanac()
    await ledger.dayFor(request('2026-08-25'))
    const data = await store.load()
    expect(previousDayFor(data, 'stu_1', '2026-08-26')?.date).toBe('2026-08-25')
  })
})

describe('4 — only the student marks done', () => {
  it('remembers what was marked done', async () => {
    const ledger = almanac()
    await ledger.markDone('stu_1', 'm1')
    expect(await ledger.doneFor('stu_1')).toEqual(new Set(['m1']))
  })

  it('never marks anything done as a side effect of planning', async () => {
    /* The rule the whole design rests on. */
    const ledger = almanac()
    await ledger.dayFor(request('2026-08-25'))
    await ledger.dayFor(request('2026-08-26'))
    await ledger.dayFor(request('2026-08-27'))
    expect(await ledger.doneFor('stu_1')).toEqual(new Set())
  })

  it('keeps a concept out of every future day once it is done', async () => {
    const ledger = almanac()
    await ledger.markDone('stu_1', 'm1')
    for (const date of ['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']) {
      const plan = await ledger.dayFor(request(date))
      expect(plan.items.map((i) => i.conceptId)).not.toContain('m1')
    }
  })

  it('keeps each student’s done marks to themselves', async () => {
    /* Written after a mutation run: returning every student's marks from
     * doneFor left the suite green, because no test had two students who had
     * both finished something. */
    const ledger = almanac()
    await ledger.markDone('stu_1', 'm1')
    await ledger.markDone('stu_2', 'p1')
    expect(await ledger.doneFor('stu_1')).toEqual(new Set(['m1']))
    expect(await ledger.doneFor('stu_2')).toEqual(new Set(['p1']))
  })

  it('marking the same concept twice changes nothing', async () => {
    const ledger = almanac()
    await ledger.markDone('stu_1', 'm1')
    await ledger.markDone('stu_1', 'm1')
    expect(await ledger.doneFor('stu_1')).toEqual(new Set(['m1']))
  })
})

describe('5 — students are separate', () => {
  it('does not show one student another’s day', async () => {
    const ledger = almanac()
    await ledger.dayFor({ ...request('2026-08-25'), studentId: 'stu_1' })
    expect(await ledger.read('stu_2', '2026-08-25')).toBeUndefined()
  })

  it('does not let one student’s done marks affect another', async () => {
    const ledger = almanac()
    await ledger.markDone('stu_1', 'm1')
    const other = await ledger.dayFor({ ...request('2026-08-25'), studentId: 'stu_2' })
    expect(other.items.map((i) => i.conceptId)).toContain('m1')
  })
})

describe('6 — it survives a restart', () => {
  it('reads back a day written by an earlier process', async () => {
    const first = createLedger(store)
    const written = await first.dayFor(request('2026-08-25'))

    /* A second ledger over the same store is what a restart looks like. */
    const second = createLedger(store)
    expect(await second.read('stu_1', '2026-08-25')).toMatchObject({ items: written.items })
  })

  it('reads back done marks written by an earlier process', async () => {
    await createLedger(store).markDone('stu_1', 'm1')
    expect(await createLedger(store).doneFor('stu_1')).toEqual(new Set(['m1']))
  })

  it('starts empty when the store has never been written', async () => {
    expect(await almanac().read('stu_1', '2026-08-25')).toBeUndefined()
    expect(await almanac().doneFor('stu_1')).toEqual(new Set())
  })
})


describe('7 — concurrent writes do not lose each other', () => {
  /* The ledger reads, modifies, then writes. The WRITE is atomic; the
   * read-modify-write around it is not. Two requests arriving together both
   * read the same state, both modify their own copy, and the second save
   * overwrites the first — one student's finished work silently vanishes.
   *
   * Today the server handles one request at a time, so this cannot happen. But
   * nothing enforces that, and nothing would notice when it stops being true.
   * A defect that is currently unreachable is still a defect. */

  it('keeps both marks when two are recorded at the same time', async () => {
    const ledger = createLedger(store)
    await Promise.all([
      ledger.markDone('stu_1', 'm1'),
      ledger.markDone('stu_1', 'p1'),
    ])
    expect(await ledger.doneFor('stu_1')).toEqual(new Set(['m1', 'p1']))
  })

  it('keeps every mark when many are recorded at once', async () => {
    const ledger = createLedger(store)
    const ids = Array.from({ length: 25 }, (_, i) => `c${i}`)
    await Promise.all(ids.map((id) => ledger.markDone('stu_1', id)))
    expect((await ledger.doneFor('stu_1')).size).toBe(25)
  })

  it('does not lose a day when a mark is recorded at the same moment', async () => {
    const ledger = createLedger(store)
    const [day] = await Promise.all([
      ledger.dayFor(request('2026-08-25')),
      ledger.markDone('stu_1', 'unrelated-concept'),
    ])
    expect(await ledger.read('stu_1', '2026-08-25')).toMatchObject({ items: day.items })
    expect(await ledger.doneFor('stu_1')).toEqual(new Set(['unrelated-concept']))
  })

  it('plans a date once even when asked for it twice at the same moment', async () => {
    /* Both callers must get the SAME day. Two plans for one date is the frozen
     * rule broken by a race rather than by logic. */
    const ledger = createLedger(store)
    const [a, b] = await Promise.all([
      ledger.dayFor(request('2026-08-25')),
      ledger.dayFor(request('2026-08-25')),
    ])
    expect(b.items).toEqual(a.items)
    expect(b.plannedAt).toBe(a.plannedAt)
  })

  it('keeps two students apart under concurrency', async () => {
    const ledger = createLedger(store)
    await Promise.all([
      ledger.markDone('stu_1', 'm1'),
      ledger.markDone('stu_2', 'p1'),
      ledger.markDone('stu_1', 'm2'),
    ])
    expect(await ledger.doneFor('stu_1')).toEqual(new Set(['m1', 'm2']))
    expect(await ledger.doneFor('stu_2')).toEqual(new Set(['p1']))
  })
})
