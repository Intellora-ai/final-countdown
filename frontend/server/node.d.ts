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
    /* Who is calling, as the kernel sees it. The only caller identity that is
     * not simply asserted by the caller -- see `index.ts` on why a forwarded
     * header is trusted only when the deployment says to. */
    socket: { remoteAddress?: string }
    [Symbol.asyncIterator](): AsyncIterableIterator<unknown>
    destroy(): void
  }

  export interface ServerResponse {
    headersSent: boolean
    writeHead(status: number, headers?: Record<string, string | number>): void
    end(chunk?: string): void
    /* Tearing the socket down is the only way to signal a truncated body once
     * headers are on the wire -- see `static.ts`, where a mid-stream read
     * failure must not present a partial file as a whole one. */
    destroy(): void
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
  exit(code?: number): never
  /* Where the engine bridge and the ledger resolve their relative roots. */
  cwd(): string
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
    stdin?: { end(chunk?: string): void }
    exitCode: number | null
    kill(signal?: string): void
    on(event: 'error', listener: (error: Error) => void): void
    on(event: 'close', listener: (code: number | null) => void): void
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
      /* Stated at the call site rather than defaulted -- `doubtEngine.ts`
       * explains why an interpreter path must never reach a shell. */
      shell?: boolean
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
  /* `resolve` and `sep` are what make the static server's containment check a
   * real one: it compares resolved absolute paths rather than searching the
   * request for "..", which would only catch the spellings someone thought of. */
  export function resolve(...parts: string[]): string
  export function normalize(path: string): string
  export function extname(path: string): string
  export const sep: string
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
  /* `isFile` matters as much as `size`: a directory answers `stat` perfectly
   * well, and serving one as a document would send its metadata as a body. */
  export interface Stats {
    isFile(): boolean
    size: number
  }
  export function stat(path: string): Promise<Stats>
}

declare module 'node:os' {
  export function tmpdir(): string
}

/* A socket, so a test can send a request line that no HTTP client will send.
 * `fetch` and every browser normalise `..` out of a path before it reaches the
 * wire, which means neither can be used to prove the server refuses one. An
 * attacker is under no such constraint, so the test writes the bytes itself. */
declare module 'node:net' {
  export interface Socket {
    write(data: string): boolean
    end(): void
    setEncoding(encoding: string): void
    on(event: 'data', listener: (chunk: string) => void): Socket
    on(event: 'end', listener: () => void): Socket
    on(event: 'error', listener: (error: Error) => void): Socket
  }
  export function createConnection(options: { port: number; host: string }): Socket
}

/* Synchronous existence for the engine bridge's interpreter discovery, and a
 * read stream for serving a built file without buffering it into memory. */
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export interface ReadStream {
    on(event: 'error', listener: (error: Error) => void): ReadStream
    on(event: 'end', listener: () => void): ReadStream
    pipe(destination: unknown): unknown
  }
  export function createReadStream(path: string): ReadStream
}
