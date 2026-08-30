/**
 * The slice of `pg` this server uses, declared rather than installed.
 *
 * Same choice as `node.d.ts`, for the same reasons: `@types/pg` is not a
 * dependency of this package, the surface actually used is a constructor and
 * three methods, and a declaration of exactly that surface documents the
 * dependency and cannot drift with a version bump.
 *
 * Only `pgClient.ts` may import this module. Everything that decides what the
 * ledger means goes through the two-method `Sql` port instead.
 */
declare module 'pg' {
  export interface QueryResult<Row = Record<string, unknown>> {
    rows: Row[]
    rowCount: number | null
  }

  export interface PoolConfig {
    connectionString?: string
    max?: number
    connectionTimeoutMillis?: number
    idleTimeoutMillis?: number
  }

  export class Pool {
    constructor(config?: PoolConfig)
    query<Row = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>>
    on(event: 'error', listener: (error: Error) => void): this
    end(): Promise<void>
  }

  const pg: { Pool: typeof Pool }
  export default pg
}
