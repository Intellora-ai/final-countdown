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
    destroy(): void
  }

  export interface ServerResponse {
    headersSent: boolean
    writeHead(status: number, headers?: Record<string, string | number>): void
    end(chunk?: string): void
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
}

declare module 'node:os' {
  export function tmpdir(): string
}
