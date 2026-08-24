/**
 * The slice of `node:http` the loopback stub uses, declared rather than
 * installed.
 *
 * `@types/node` is not a dependency of this package and adding one was not
 * approved. It is also not needed: the stub server calls four methods, and a
 * declaration of exactly those four is smaller than the dependency, cannot
 * drift with a version bump, and documents the surface being relied on.
 *
 * Deliberately minimal. If something here starts wanting more of Node's API,
 * that is the signal to ask for the real types rather than to keep growing
 * this file quietly.
 */
declare module 'node:http' {
  export interface IncomingMessage {
    url?: string
    method?: string
    headers: Record<string, string | string[] | undefined>
  }

  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): void
    write(chunk: string): boolean
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
