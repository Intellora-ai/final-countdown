/**
 * The driver binding, kept to one file on purpose.
 *
 * Everything that decides what the ledger MEANS lives in `postgresLedger.ts`
 * behind the two-method `Sql` port. This file is the only place that knows the
 * database is PostgreSQL, so the rules can be tested without one and the
 * dependency can be replaced without touching them.
 *
 * WHY A POOL AND NOT A CONNECTION
 *     Requests arrive concurrently and a single connection serialises them,
 *     which would reintroduce by accident the bottleneck this change exists to
 *     remove. The pool is also what survives a database restart: a dead
 *     connection is discarded and replaced rather than poisoning the process
 *     until someone notices.
 */

import pg from 'pg'

import type { Sql } from './postgresLedger.ts'

export interface PoolOptions {
  readonly connectionString: string
  /** Above the request concurrency one process can usefully serve. */
  readonly max?: number
}

export interface Closeable extends Sql {
  end(): Promise<void>
}

export function pgPool(options: PoolOptions): Closeable {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    /* A request that cannot get a connection must FAIL rather than queue for
     * ever. A student seeing an error knows to try again; a request that hangs
     * looks to them like the app is broken and to the operator like nothing is
     * wrong. */
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  })

  /* A pool emits errors for connections that die while idle. Unhandled, that is
   * an `error` event on an EventEmitter, which in Node terminates the process
   * -- so a database blip would take the server down rather than the one
   * connection. */
  pool.on('error', (error: Error) => {
    console.error('[almanac] idle database connection failed:', error.message)
  })

  return {
    async query<Row>(text: string, params: readonly unknown[]) {
      const result = await pool.query(text, params as unknown[])
      return { rows: result.rows as Row[] }
    },
    async end() {
      await pool.end()
    },
  }
}
