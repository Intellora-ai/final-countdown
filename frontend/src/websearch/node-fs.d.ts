/**
 * The slice of `node:fs`, `node:path` and `node:url` that `island.test.ts` uses,
 * declared rather than installed.
 *
 * Same reasoning as `node-http.d.ts`, and the same constraint: `@types/node` is
 * not a dependency of this package and adding one was not approved. It is also
 * not needed here — six functions are used in total, and a declaration of
 * exactly those six is smaller than the dependency, cannot drift with a version
 * bump, and documents the surface being relied on.
 *
 * `fileURLToPath` is in this list rather than `URL.pathname` for a specific
 * reason: this checkout lives under a directory whose name contains a space,
 * and `.pathname` returns the percent-encoded form, which `readdirSync` cannot
 * open. The typed surface is what makes the right function the easy one to
 * reach for.
 *
 * Deliberately minimal. If something here starts wanting more of Node's API,
 * that is the signal to stop and ask for the dependency rather than to keep
 * growing this file.
 */

declare module 'node:fs' {
  export interface Stats {
    isDirectory(): boolean
  }
  export function readdirSync(path: string): string[]
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function statSync(path: string): Stats
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  export function relative(from: string, to: string): string
}

declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string
}
