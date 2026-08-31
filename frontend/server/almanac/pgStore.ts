/* The almanac's store, in PostgreSQL, with ONE atomic operation for the thing
 * students actually do.
 *
 * WHY THIS EXISTS. THE MEASUREMENT, NOT THE THEORY.
 *
 * `ledger.ts` already carries a fix for this bug: `alone()`, a promise chain
 * that serialises every write. Its comment records what it was built for --
 * "twenty-five concurrent marks, ONE survivor". That fix is correct and it is
 * not enough, because a promise chain lives inside ONE process. Two replicas
 * have two chains, and neither can see the other.
 *
 * Measured through the real product over real HTTP, two replicas, one shared
 * ledger file, twenty concepts marked done at the same moment:
 *
 *     15 of 20 requests answered 500 {"error":"internal error"}
 *
 * Not silent loss. Outright failure, because both processes wrote the whole
 * file at once and the reader then found JSON that was half of one write and
 * half of another. A child pressing "done" in a busy lesson was told the
 * server had broken.
 *
 * WHAT ACTUALLY FIXES IT, AND WHY IT IS NOT "THE SAME THING WITH A DATABASE".
 *
 * `LedgerStore` can only `load()` everything and `save()` everything. Ported
 * to SQL unchanged, that is still read-modify-write and still loses marks --
 * it would just lose them more reliably. The operation a student performs is
 * "add ONE mark", so that has to be the operation the store performs:
 *
 *     INSERT INTO almanac_done (student_id, concept_id)
 *     VALUES ($1, $2) ON CONFLICT DO NOTHING
 *
 * One statement. The database serialises it across every process on every
 * machine. Two students, two replicas, the same millisecond: both rows land,
 * and marking the same concept twice is not an error.
 */

import pg from 'pg'

import type { LedgerData, LedgerStore, StoredDay } from './ledger.ts'

const { Pool } = pg

/**
 * The schema, created on first use.
 *
 * IN THE CODE RATHER THAN A MIGRATION TOOL, DELIBERATELY. Two tables and no
 * history to migrate. A migration framework here would be a dependency, a CLI
 * step, and a second place to look, bought for nothing.
 *
 * `almanac_done` is one ROW PER MARK, which is the whole point -- a row is
 * what makes the insert atomic. `almanac_day` stays document-shaped because a
 * planned day is written once, whole, by one request, and never merged.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS almanac_done (
  student_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, concept_id)
);
CREATE TABLE IF NOT EXISTS almanac_day (
  student_id TEXT NOT NULL,
  the_date   TEXT NOT NULL,
  plan       JSONB NOT NULL,
  PRIMARY KEY (student_id, the_date)
);
`

export interface PgStoreOptions {
  readonly connectionString: string
}

/**
 * A store that also offers the atomic single-mark write.
 *
 * `addDone` is OPTIONAL on `LedgerStore` so `fileStore` stays valid without
 * pretending to an atomicity it cannot deliver. `ledger.markDone` uses it when
 * a store has it and falls back to load/save when it does not, which keeps the
 * single-process path exactly as it was.
 */
export function pgStore(options: PgStoreOptions): LedgerStore & {
  addDone(studentId: string, conceptId: string): Promise<void>
  ready(): Promise<void>
  close(): Promise<void>
} {
  const pool = new Pool({ connectionString: options.connectionString, max: 10 })
  let prepared: Promise<void> | null = null

  /* Created once per process, and every caller awaits the SAME promise. Two
   * requests arriving before the schema exists must not both run CREATE. */
  const ready = (): Promise<void> => {
    prepared ??= pool.query(SCHEMA).then(() => undefined)
    return prepared
  }

  return {
    ready,

    async close() {
      await pool.end()
    },

    async load(): Promise<LedgerData> {
      await ready()
      const [doneRows, dayRows] = await Promise.all([
        pool.query<{ student_id: string; concept_id: string }>(
          'SELECT student_id, concept_id FROM almanac_done',
        ),
        pool.query<{ student_id: string; the_date: string; plan: StoredDay }>(
          'SELECT student_id, the_date, plan FROM almanac_day',
        ),
      ])

      const data: LedgerData = { days: {}, done: {} }
      for (const row of doneRows.rows) {
        ;(data.done[row.student_id] ??= []).push(row.concept_id)
      }
      for (const row of dayRows.rows) {
        ;(data.days[row.student_id] ??= {})[row.the_date] = row.plan
      }
      return data
    },

    /**
     * The whole-document write, kept for `dayFor`.
     *
     * IT DELIBERATELY DOES NOT TOUCH `almanac_done`. Writing the done-set from
     * here would reintroduce read-modify-write on the exact table this file
     * exists to protect: a `save()` carrying a stale set would delete marks
     * another replica had inserted in between. Marks are added by `addDone`
     * and by nothing else, which is the same rule `ledger.ts` already states
     * about `markDone` being the only writer of that set.
     */
    async save(data: LedgerData): Promise<void> {
      await ready()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const [studentId, byDate] of Object.entries(data.days)) {
          for (const [date, plan] of Object.entries(byDate)) {
            await client.query(
              `INSERT INTO almanac_day (student_id, the_date, plan)
               VALUES ($1, $2, $3)
               ON CONFLICT (student_id, the_date) DO UPDATE SET plan = EXCLUDED.plan`,
              [studentId, date, JSON.stringify(plan)],
            )
          }
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    /**
     * ONE MARK, ONE STATEMENT. This is the fix.
     *
     * No read. Nothing to be stale. `ON CONFLICT DO NOTHING` makes marking the
     * same concept twice a no-op rather than an error, which matters because a
     * child double-taps a button and a flaky network retries.
     */
    async addDone(studentId: string, conceptId: string): Promise<void> {
      await ready()
      await pool.query(
        `INSERT INTO almanac_done (student_id, concept_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [studentId, conceptId],
      )
    },
  }
}
