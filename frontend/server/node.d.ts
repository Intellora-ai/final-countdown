/**
 * The slice of Node the server uses, declared rather than installed.
 *
 * `@types/node` is not a dependency of this package and adding one was not
 * approved. The same choice was already made in `src/websearch/node-http.d.ts`,
 * for the same reasons: the surface actually used is small, a declaration of
 * exactly that surface documents the dependency, and it cannot drift with a
 * version bump.
 *
 * These live in their own file rather than being shared with the websearch
 * declarations because the two are compiled as separate projects — one ambient
 * `declare module 'node:http'` per project, or the compiler reports a duplicate.
 *
 * Deliberately minimal. If the server starts wanting more of Node's API, that is
 * the signal to ask for the real types, not to grow this file quietly.
 */

declare module 'node:http' {
  export interface IncomingMessage {
    url?: string
    method?: string
    headers: Record<string, string | string[] | undefined>
    [Symbol.asyncIterator](): AsyncIterableIterator<unknown>
    iterator(options?: { destroyOnReturn?: boolean }): AsyncIterableIterator<unknown>
    destroy(): void
  }

  export interface ServerResponse {
    headersSent: boolean
    writeHead(status: number, headers?: Record<string, string | number>): void
    end(chunk?: string): void
    /** One piece of a streamed reply; see `index.ts deliver`. */
    write(chunk: string): boolean
  }

  export interface AddressInfo {
    port: number
    address: string
  }

  export interface Server {
    listen(port: number, host: string, callback: () => void): Server
    close(callback?: (err?: Error) => void): Server
    address(): AddressInfo | string | null
  }

  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Server
}

declare module 'node:stream' {
  export interface Readable {
    [Symbol.asyncIterator](): AsyncIterableIterator<unknown>
    /* The explicit iterator, for the one caller that must leave the stream
     * alive after returning early: `readJsonBody` and its 413. */
    iterator(options?: { destroyOnReturn?: boolean }): AsyncIterableIterator<unknown>
    destroy?(): void
    headers?: Record<string, string | string[] | undefined>
  }
  export const Readable: {
    from(source: Iterable<unknown> | AsyncIterable<unknown>): Readable
  }
}

/** The three globals the server touches. */
declare const process: {
  env: Record<string, string | undefined>
  argv: string[]
  execPath: string
  /** This process's id. Used to make a scratch filename private to one writer. */
  pid: number
  exit(code?: number): never
}

declare const Buffer: {
  isBuffer(value: unknown): value is Buffer
  from(input: string | ArrayBuffer, encoding?: string): Buffer
  concat(list: Buffer[]): Buffer
  byteLength(value: string): number
  alloc(size: number, fill?: number): Buffer
}

interface Buffer {
  readonly length: number
  toString(encoding?: string): string
}

/* Used only by the boot test, which starts the built server as a child
 * process. Declared for the same reason as everything above: the surface is
 * three functions, and three declarations are smaller than a dependency. */
declare module 'node:child_process' {
  export interface ChildProcess {
    stdout: { on(event: 'data', listener: (chunk: unknown) => void): void }
    stderr: { on(event: 'data', listener: (chunk: unknown) => void): void }
    exitCode: number | null
    kill(signal?: string): void
    /* Needed to prove a CRASH rather than a shutdown: the M1 proof kills a real
     * child with SIGKILL and must wait for the real death, and the signal that
     * killed it is the difference between "closed cleanly" and "crashed". */
    on(
      event: 'exit',
      listener: (code: number | null, signal: string | null) => void,
    ): void
  }
  export function execFile(
    file: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string | undefined>; maxBuffer?: number },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void
  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      cwd?: string
      env?: Record<string, string | undefined>
      stdio?: readonly string[]
    },
  ): ChildProcess
}

declare module 'node:util' {
  /* Narrowed to the one use in this area: promisifying `execFile`, whose
   * callback yields stdout and stderr. A fully general `promisify` type needs
   * Node's own overloads, and this area does not need one. */
  export function promisify(
    fn: unknown,
  ): (
    file: string,
    args?: readonly string[],
    options?: { cwd?: string; env?: Record<string, string | undefined>; maxBuffer?: number },
  ) => Promise<{ stdout: string; stderr: string }>
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  /* Used to create the ledger's directory on first write. Declared here rather
   * than pulled in with @types/node for the same reason as everything else in
   * this file: these are the calls actually made. */
  export function dirname(path: string): string
}

/* The file surface the ledger and its tests use. Same reasoning as above:
 * these are the calls actually made, not a dependency. */
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  export function rename(from: string, to: string): Promise<void>
  export function unlink(path: string): Promise<void>
  export function mkdtemp(prefix: string): Promise<string>
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
  export function readdir(path: string): Promise<string[]>
  /** Needed for the `wx` flag: create, or fail if it already exists. That
   *  failure IS the lock — see `fileStore.addDone`. */
  export function open(path: string, flags: string): Promise<{ close(): Promise<void> }>
}

declare module 'node:os' {
  export function tmpdir(): string
}

/**
 * The slice of `pg` this server uses, declared rather than imported.
 *
 * SAME REASON `webResolver.ts` DECLARES ITS SEARCH SHAPES. Installing
 * `@types/pg` pulls in `@types/node`, and this project deliberately does not
 * use it -- the file you are reading is a hand-written minimal node typing.
 * Measured: adding `@types/pg` brought `@types/node@26` with it and broke
 * `server/index.ts:113` on an `IncomingMessage`/`Readable` mismatch in code
 * this change never touched.
 *
 * Declaring the three members actually called keeps the checking real and the
 * dependency graph the shape this project chose. `pg` itself stays a real
 * runtime dependency; only its types are local.
 */
declare module 'pg' {
  export interface QueryResult<Row> {
    readonly rows: Row[]
    readonly rowCount: number | null
  }
  export interface PoolClient {
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>
    release(): void
  }
  export class Pool {
    constructor(config: { connectionString: string; max?: number })
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>
    connect(): Promise<PoolClient>
    end(): Promise<void>
  }
  const pg: { Pool: typeof Pool }
  export default pg
}

/**
 * The slice of `node:sqlite` this server uses, declared rather than imported.
 *
 * SAME REASON AS `pg` ABOVE AND `webResolver.ts`'s search shapes. This project
 * deliberately does not use `@types/node` -- the file you are reading is a
 * hand-written minimal node typing -- and `node:sqlite`'s types live there.
 * Measured earlier in this same file's history: pulling `@types/node` in via a
 * types package broke `server/index.ts` on an unrelated `IncomingMessage`
 * mismatch.
 *
 * `node:sqlite` is built into Node 26 and needs no install. Verified by running
 * it: `DatabaseSync` present, `INSERT .. ON CONFLICT DO NOTHING` atomic.
 */
/* The synchronous file calls. `node:fs/promises` below is the async surface and
 * does not cover these: the identity secret must be resolved BEFORE the server
 * binds a port, and the memory proofs create and remove real temp directories
 * around a synchronous SQLite store. */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  /* `flag: 'wx'` is create-or-fail: the one write the identity secret needs,
   * because two servers booting together must not overwrite each other's key.
   * See `persistSecretUnlessPresent` in `identity.ts`. */
  export function writeFileSync(
    path: string,
    data: string,
    options?: { encoding?: 'utf8'; mode?: number; flag?: 'w' | 'wx' },
  ): void
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function mkdtempSync(prefix: string): string
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void
}

declare module 'node:os' {
  export function tmpdir(): string
}

/**
 * Only what `identity.ts` uses to sign and check a student's cookie.
 *
 * Declared narrowly for the reason this whole file states: the surface is what
 * this server actually calls, so an unused corner of the platform cannot drift
 * in unnoticed and cannot be reached by accident.
 */
declare module 'node:crypto' {
  /* Used by `memory/key.ts` to fit a long question into a key; see
     `fittedLessonId`. Same shape as the runtime's. */
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: 'hex'): string }
  }
  export interface Hmac {
    update(data: string): Hmac
    digest(encoding: 'hex'): string
  }
  export function createHmac(algorithm: string, key: string): Hmac
  export function randomBytes(size: number): Buffer
  /** Throws when the two differ in length, which is why callers check first. */
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean
}

declare module 'node:sqlite' {
  export interface StatementSync {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number; lastInsertRowid: number }
    all(...params: unknown[]): unknown[]
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}

/* The async context that carries where streamed words go, for the one
   request that asked for them. See `handler.ts streaming`. Only the two
   members used are declared, the same rule every module in this file keeps. */
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, fn: () => R): R
    getStore(): T | undefined
  }
}
