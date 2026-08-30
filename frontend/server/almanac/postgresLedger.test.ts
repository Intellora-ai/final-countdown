/* The shared ledger's rules, without a database.
 *
 * DESIRED OUTCOME
 *   Two copies of the server, reaching the same student at the same instant,
 *   never lose a mark and never hand her two different versions of one day.
 *
 * WHAT MUST BE TRUE
 *   1. NOTHING READS-THEN-WRITES. A read-modify-write is what lost 28 of 60
 *      marks against the file store, and no lock this process can take fixes it
 *      because the other process is not in this process. Every write here has
 *      to be a single statement the database resolves.
 *   2. A DAY IS FROZEN ONCE, AND THE LOSER RETURNS THE WINNER'S DAY. When two
 *      replicas plan the same student's day simultaneously, the second must
 *      hand back what the first stored -- not overwrite it, and not return its
 *      own unsaved copy. Overwriting reshuffles a day she is already reading;
 *      returning the unsaved one shows her a day the server does not believe in.
 *   3. THE CARRY-OVER LOOKS BACKWARDS, NOT EVERYWHERE. Yesterday is one ordered
 *      row, not every day this student has ever had, sorted in memory.
 *   4. A DAY THAT CAN BE NEITHER WRITTEN NOR READ IS AN ERROR, not a silently
 *      returned plan nothing persisted.
 *
 * A FAKE `Sql`, NOT A MOCK OF THE LEDGER. The statements are real and are
 * asserted on; only the engine is replaced. A test that stubbed `dayFor` would
 * be testing the stub.
 */

import { describe, expect, it } from 'vitest'

import { postgresLedger, type Sql } from './postgresLedger.ts'
import type { StoredDay } from './ledger.ts'

interface Call {
  text: string
  params: readonly unknown[]
}

const SUBJECTS = [
  {
    id: 'mathematics',
    name: 'Mathematics',
    chapters: [
      {
        id: 'real-numbers',
        name: 'Real Numbers',
        concepts: [
          /* `deps` is REQUIRED, not optional. Leaving it off produced
           * "Cannot read properties of undefined (reading 'every')" from inside
           * `planDay` -- a fixture that did not match the real contract, which
           * is a defect in the test and would have been one in production too. */
          { id: 'euclid', name: 'Euclid division lemma', minutes: 20, deps: [] },
          { id: 'irrational', name: 'Irrational numbers', minutes: 20, deps: ['euclid'] },
        ],
      },
    ],
  },
]

const REQUEST = {
  studentId: 'stu_a',
  date: '2026-09-01',
  dailyMinutes: 60,
  subjects: SUBJECTS,
}

/** Replies queued in order; anything unqueued answers with no rows. */
function fakeSql(replies: Record<string, unknown[][]>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = []
  const queues = new Map(Object.entries(replies).map(([key, value]) => [key, [...value]]))

  const sql: Sql = {
    async query<Row>(text: string, params: readonly unknown[]) {
      calls.push({ text, params })
      for (const [fragment, queue] of queues) {
        if (text.includes(fragment)) {
          const next = queue.shift()
          return { rows: (next ?? []) as Row[] }
        }
      }
      return { rows: [] as Row[] }
    },
  }
  return { sql, calls }
}

const CLOCK = { now: () => '2026-09-01T06:00:00.000Z' }

describe('markDone', () => {
  it('writes in one statement, with no read before it', async () => {
    const { sql, calls } = fakeSql({})
    await postgresLedger(sql, CLOCK).markDone('stu_a', 'euclid')

    expect(calls).toHaveLength(1)
    /* A SELECT here would mean a read-modify-write had crept back in, and with
     * it the lost update the file store had. */
    expect(calls[0]?.text).not.toMatch(/SELECT/i)
    expect(calls[0]?.text).toMatch(/INSERT INTO almanac_done/)
    expect(calls[0]?.text).toMatch(/ON CONFLICT \(student_id, concept_id\) DO NOTHING/)
    expect(calls[0]?.params).toEqual(['stu_a', 'euclid'])
  })
})

describe('dayFor', () => {
  it('returns the stored day without replanning when one already exists', async () => {
    const stored: StoredDay = {
      date: '2026-09-01', items: [], allocated: 0, capacity: 60,
      plannedAt: '2026-08-31T00:00:00.000Z',
    } as StoredDay
    const { sql, calls } = fakeSql({ 'SELECT plan FROM almanac_day': [[{ plan: stored }]] })

    const day = await postgresLedger(sql, CLOCK).dayFor(REQUEST)

    expect(day).toEqual(stored)
    /* One look-up and nothing else: no plan written for a day already set. */
    expect(calls.filter((c) => /INSERT/i.test(c.text))).toHaveLength(0)
  })

  it('hands back the winner s day when another replica froze it first', async () => {
    /* The race, exactly: our first SELECT finds nothing, we plan, our INSERT
     * returns NO ROW because the other replica got there between the two, and
     * we must then return THEIRS. */
    const theirs: StoredDay = {
      date: '2026-09-01', items: [], allocated: 40, capacity: 60,
      plannedAt: '2026-09-01T05:59:59.000Z',
    } as StoredDay
    const { sql } = fakeSql({
      'SELECT plan FROM almanac_day': [[], [], [{ plan: theirs }]],
      'INSERT INTO almanac_day': [[]],
    })

    const day = await postgresLedger(sql, CLOCK).dayFor(REQUEST)

    expect(day).toEqual(theirs)
    expect(day.plannedAt).toBe('2026-09-01T05:59:59.000Z')
  })

  it('refuses rather than returning a plan nothing stored', async () => {
    /* Neither inserted nor readable. Returning our own unsaved plan would show
     * her a day the server does not have. */
    const { sql } = fakeSql({
      'SELECT plan FROM almanac_day': [[], [], []],
      'INSERT INTO almanac_day': [[]],
    })

    await expect(postgresLedger(sql, CLOCK).dayFor(REQUEST)).rejects.toThrow(
      /could not be set or read back/,
    )
  })

  it('asks the database for yesterday rather than reading every day she has had', async () => {
    const { sql, calls } = fakeSql({ 'INSERT INTO almanac_day': [[{ plan: { date: '2026-09-01' } }]] })
    await postgresLedger(sql, CLOCK).dayFor(REQUEST)

    const lookback = calls.find((c) => /day < \$2/.test(c.text))
    expect(lookback).toBeDefined()
    expect(lookback?.text).toMatch(/ORDER BY day DESC/)
    expect(lookback?.text).toMatch(/LIMIT 1/)
  })

  it('freezes the day with ON CONFLICT DO NOTHING, never an overwrite', async () => {
    const { sql, calls } = fakeSql({ 'INSERT INTO almanac_day': [[{ plan: { date: '2026-09-01' } }]] })
    await postgresLedger(sql, CLOCK).dayFor(REQUEST)

    const insert = calls.find((c) => /INSERT INTO almanac_day/.test(c.text))
    expect(insert?.text).toMatch(/ON CONFLICT \(student_id, day\) DO NOTHING/)
    /* An UPDATE here would reshuffle a day the student is already looking at. */
    expect(insert?.text).not.toMatch(/DO UPDATE/i)
  })
})

describe('doneFor', () => {
  it('reads only this student s rows', async () => {
    const { sql, calls } = fakeSql({
      'FROM almanac_done': [[{ concept_id: 'euclid' }, { concept_id: 'irrational' }]],
    })
    const done = await postgresLedger(sql, CLOCK).doneFor('stu_a')

    expect(done).toEqual(new Set(['euclid', 'irrational']))
    expect(calls[0]?.text).toMatch(/WHERE student_id = \$1/)
    expect(calls[0]?.params).toEqual(['stu_a'])
  })
})
