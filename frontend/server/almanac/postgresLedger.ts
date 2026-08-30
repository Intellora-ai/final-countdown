/**
 * THE LEDGER, SHARED BY EVERY COPY OF THE SERVER.
 *
 * WHY THE FILE STORE COULD NOT STAY
 *     A cloud deployment runs more than one copy of this process behind a load
 *     balancer -- that is what scaling means. The file store held the whole
 *     ledger in one process's memory and wrote the entire document back, and
 *     `createLedger`'s mutex serialised writes WITHIN a process and had no
 *     opinion about any other one.
 *
 *     Measured against the shipped image on 2026-08-30, two replicas on one
 *     shared file:
 *
 *       30 marks to replica A + 30 to replica B  ->  28 of 60 LOST
 *       20 marks split across two replicas       ->  10 refused with 500
 *
 *     The 500s were a second defect on top of the first: `fileStore` writes to
 *     a FIXED temporary name, `<ledger>.writing`, so one process renamed the
 *     file out from under the other mid-write.
 *
 *     A student does not experience either of these as a race. They experience
 *     them as the app forgetting a day of work.
 *
 * WHY THIS HAS NO LOCK
 *     Because it needs none. Every operation here is a single statement whose
 *     concurrency behaviour the database already guarantees:
 *
 *       markDone   INSERT ... ON CONFLICT DO NOTHING  -- idempotent by the
 *                  primary key. Two copies marking the same topic at the same
 *                  instant produce one row and no error.
 *       dayFor     INSERT ... ON CONFLICT DO NOTHING RETURNING, then a read of
 *                  whoever won. The day is FROZEN ONCE, and the loser of the
 *                  race returns the winner's day rather than overwriting it --
 *                  which is exactly the guarantee the product promises when it
 *                  says "this day is set".
 *
 *     Read-modify-write is what lost data, so nothing here does one.
 *
 * WHY `Sql` IS A PORT AND NOT `pg`
 *     Two methods. It keeps the driver in one thin file, lets these semantics
 *     be tested without a database, and means the paid part of the deployment
 *     is replaceable without touching the rules.
 */

import { planDay, type DayPlan, type SubjectLike } from './plan.ts'
import type { DayRequest, Ledger, LedgerOptions, StoredDay } from './ledger.ts'

/** The slice of a SQL client this needs. Declared, not imported. */
export interface Sql {
  query<Row>(text: string, params: readonly unknown[]): Promise<{ rows: Row[] }>
}

/**
 * The schema, and it is the whole design.
 *
 * `almanac_done` has a COMPOSITE PRIMARY KEY rather than a serial id, because
 * the key is the fact: this student finished this concept. Saying it twice is
 * the same fact, which is what makes the insert idempotent and the mutex
 * unnecessary.
 *
 * `almanac_day` stores the plan as `jsonb` under `(student_id, day)`. The plan
 * is produced by `planDay` and read back whole; nothing queries inside it, so
 * decomposing it into columns would buy a migration for every shape change and
 * nothing else.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS almanac_done (
  student_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, concept_id)
);

CREATE TABLE IF NOT EXISTS almanac_day (
  student_id TEXT NOT NULL,
  day        DATE NOT NULL,
  plan       JSONB NOT NULL,
  PRIMARY KEY (student_id, day)
);
`

interface DayRow {
  plan: StoredDay
}
interface DoneRow {
  concept_id: string
}
interface DayDateRow {
  plan: StoredDay
}

/**
 * Apply the schema, one statement per call.
 *
 * WHY NOT ONE MULTI-STATEMENT STRING, WHICH IS WHAT THIS USED TO DO.
 *     `pool.query(text, params)` uses PostgreSQL's EXTENDED protocol whenever a
 *     params array is passed -- and the extended protocol runs only the FIRST
 *     statement in the string. Measured 2026-08-30 with `log_statement=all`:
 *
 *         statement: BEGIN;
 *
 *     and nothing after it. So `BEGIN` ran, the DDL and the `COMMIT` never did,
 *     and the connection went back to the pool mid-transaction. Every write
 *     that later borrowed it returned 200 and persisted nothing. A student
 *     marked a topic done, the app said done, and the row was never there.
 *
 *     I also "proved" the multi-statement form worked, by checking whether the
 *     table existed afterwards. It did -- from an earlier run. The check could
 *     not fail, so it proved nothing.
 *
 * WHY NO ADVISORY LOCK EITHER.
 *     A session-level lock has to be taken and released on ONE connection, and
 *     a pool hands out a different connection per call. It cannot be done
 *     through a two-method port, and pretending otherwise is how the multi
 *     statement string got written in the first place.
 *
 *     Instead the race is ANSWERED rather than prevented: two replicas running
 *     `CREATE TABLE IF NOT EXISTS` at the same instant can collide on
 *     `pg_type_typname_nsp_index`, and that collision means the OTHER replica
 *     created the table -- which is the outcome we wanted. It is swallowed only
 *     for that specific error, and only after re-checking that the table is
 *     really there.
 */
const DUPLICATE = ['duplicate key value', 'already exists'] as const

export async function migrate(sql: Sql): Promise<void> {
  const statements = SCHEMA.split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  for (const statement of statements) {
    try {
      await sql.query(statement, [])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const raced = DUPLICATE.some((needle) => message.includes(needle))
      if (!raced) throw error
      /* Another replica won. Prove it actually exists rather than assuming the
       * error meant what we hope it meant. */
      const name = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(statement)?.[1]
      if (name === undefined) throw error
      const { rows } = await sql.query<{ present: boolean }>(
        'SELECT to_regclass($1) IS NOT NULL AS present',
        [`public.${name}`],
      )
      if (rows[0]?.present !== true) throw error
    }
  }
}

export function postgresLedger(sql: Sql, options: LedgerOptions = {}): Ledger {
  const now = options.now ?? (() => new Date().toISOString())

  return {
    async ready() {
      /* The cheapest statement there is. It proves a connection can be taken
       * from the pool AND that the server answers on it, which is what the
       * next student's write needs and what "planner: true" claims. */
      await sql.query('SELECT 1', [])
      return true
    },

    async read(studentId, date) {
      const { rows } = await sql.query<DayRow>(
        'SELECT plan FROM almanac_day WHERE student_id = $1 AND day = $2',
        [studentId, date],
      )
      return rows[0]?.plan
    },

    async doneFor(studentId) {
      const { rows } = await sql.query<DoneRow>(
        'SELECT concept_id FROM almanac_done WHERE student_id = $1',
        [studentId],
      )
      return new Set(rows.map((row) => row.concept_id))
    },

    async markDone(studentId, conceptId) {
      /* No read, no merge, no lock. The primary key is the merge. */
      await sql.query(
        `INSERT INTO almanac_done (student_id, concept_id)
         VALUES ($1, $2)
         ON CONFLICT (student_id, concept_id) DO NOTHING`,
        [studentId, conceptId],
      )
    },

    async dayFor(request: DayRequest) {
      const existing = await sql.query<DayRow>(
        'SELECT plan FROM almanac_day WHERE student_id = $1 AND day = $2',
        [request.studentId, request.date],
      )
      const already = existing.rows[0]?.plan
      if (already !== undefined) return already

      const done = await this.doneFor(request.studentId)

      /* The most recent day BEFORE this one, for the carry-over backlog.
       * Ordered and limited in the database rather than by reading every day
       * this student has ever had and sorting them here. */
      const previous = await sql.query<DayDateRow>(
        `SELECT plan FROM almanac_day
          WHERE student_id = $1 AND day < $2
          ORDER BY day DESC
          LIMIT 1`,
        [request.studentId, request.date],
      )
      const yesterday = previous.rows[0]?.plan

      const plan: DayPlan = planDay({
        date: request.date,
        dailyMinutes: request.dailyMinutes,
        subjects: request.subjects as readonly SubjectLike[],
        done,
        ...(yesterday === undefined ? {} : { yesterday }),
      })
      const stored: StoredDay = { ...plan, plannedAt: now() }

      /* FROZEN ONCE, AND THE LOSER RETURNS THE WINNER'S DAY.
       *
       * Two copies of the server can reach this line for the same student and
       * date at the same instant. `DO NOTHING` means the second insert changes
       * nothing and returns no row; that copy then reads what the first one
       * wrote and hands the student THAT. Overwriting would reshuffle a day
       * she is already looking at, which is the promise "this day is set"
       * exists to keep. */
      const inserted = await sql.query<DayRow>(
        `INSERT INTO almanac_day (student_id, day, plan)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id, day) DO NOTHING
         RETURNING plan`,
        [request.studentId, request.date, JSON.stringify(stored)],
      )
      const won = inserted.rows[0]?.plan
      if (won !== undefined) return won

      const theirs = await sql.query<DayRow>(
        'SELECT plan FROM almanac_day WHERE student_id = $1 AND day = $2',
        [request.studentId, request.date],
      )
      const settled = theirs.rows[0]?.plan
      if (settled === undefined) {
        /* Neither inserted nor present. Something removed the row between the
         * two statements, and returning our unsaved plan would hand the student
         * a day the server does not believe in. */
        throw new Error(
          `almanac: the day for ${request.studentId} on ${request.date} could not be set or read back`,
        )
      }
      return settled
    },
  }
}
