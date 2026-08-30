/**
 * SERVING THE BUILT APP.
 *
 * Until this file existed the server answered `/api/*` and nothing else, so
 * `npm run build` wrote `frontend/dist/` and NO PROCESS ANYWHERE handed it to a
 * browser. In development Vite does that job. In production nothing did, which
 * meant the product could not be opened at all once it left a laptop.
 *
 * WHY THIS IS NOT IN `handler.ts`
 *     `handler.ts` is a pure function from a request to a JSON reply. Every
 *     route it owns returns `application/json`, and its 404 is a JSON document.
 *     A file is neither, so putting file serving there would force that
 *     function to describe two kinds of response and would make its 404 -- the
 *     one that tells an operator a route was never deployed -- ambiguous.
 *
 * WHY UNKNOWN PATHS RETURN `index.html` RATHER THAN 404
 *     The browser app routes on the client. A learner who refreshes on
 *     `/canvas/gas`, or opens a link to `/learn/quadratic-equations`, asks this
 *     server for a path that has never existed on disk. Answering 404 there
 *     breaks the back button, refresh, and every shared link, while the app
 *     works perfectly as long as nobody reloads -- a defect that is invisible
 *     in development because Vite already does this.
 *
 * WHY THE EXTENSION DECIDES
 *     A missing `/assets/index-a1b2c3.js` must stay a 404. If it fell through
 *     to `index.html` the browser would receive HTML with a JavaScript content
 *     type, and the console would report a syntax error at line 1 of a file
 *     that is not JavaScript -- pointing every investigation at the bundler
 *     instead of at the missing file.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize, resolve, sep, extname } from 'node:path'
import type { ServerResponse } from 'node:http'

/**
 * Content types for what a Vite build actually emits.
 *
 * A type this map does not know is served as `application/octet-stream`, which
 * a browser saves rather than executes. That is the safe direction: guessing
 * `text/html` for an unknown file would let an uploaded document run as a page.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/** The document served for any client-routed path. */
const INDEX = 'index.html'

/**
 * Turn a request path into an absolute path INSIDE `root`, or reject it.
 *
 * THE ATTACK THIS REFUSES. `GET /../../etc/passwd` -- or its encoded spellings,
 * which `decodeURIComponent` turns back into the same thing before this runs --
 * would otherwise resolve outside the web root and hand out any file the
 * process can read, which in a container includes the environment of PID 1.
 *
 * Checked by RESOLVING and comparing, never by searching the string for "..".
 * A blocklist of spellings is only as good as the list; `resolve` answers the
 * actual question, which is "where does this end up".
 */
export function resolveWithin(root: string, requestPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    /* A malformed percent-escape is not a path. */
    return null
  }

  /* A NUL byte truncates a path in some system calls but not in JavaScript
   * string comparison, so a name containing one can pass a check and then
   * address a different file than the one that was checked. */
  if (decoded.includes('\0')) return null

  /* A `..` SEGMENT IS REFUSED OUTRIGHT, BEFORE ANY NORMALISING.
   *
   * The containment check below already holds without this -- `normalize`
   * collapses a leading `..` against the root and the result stays inside it.
   * But that made `/../../../etc/passwd` resolve to a file that simply did not
   * exist, fall through to the client-route fallback, and answer 200 with the
   * app's HTML. Nothing leaked, and the reply still said "fine" to a request
   * that was plainly an attempt.
   *
   * A browser normalises a URL before it sends one, so no honest request has a
   * `..` segment in it. Refusing here makes the answer match the question, and
   * stops the containment check resting on a subtlety of `normalize`. */
  if (decoded.split('/').includes('..')) return null

  const candidate = resolve(join(root, normalize(decoded)))
  const bounded = resolve(root)

  /* `startsWith(bounded)` alone would accept a sibling directory whose name
   * merely begins with the root's name -- `/srv/web-old` passes a prefix test
   * against `/srv/web`. The separator is what makes it a containment test. */
  if (candidate !== bounded && !candidate.startsWith(bounded + sep)) return null
  return candidate
}

async function sizeOfFile(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

/** What will actually be sent: a real file, or the client-route document. */
interface Chosen {
  readonly path: string
  readonly size: number
  /** True when this is `index.html` standing in for a client route. */
  readonly isFallback: boolean
}

/**
 * Pick the file for a request, or report that this server owns no answer.
 *
 * Split out so the response half below has nothing to decide. It also removes
 * the reassignment the first version used, where `path` and `size` were
 * declared with `let` and overwritten in the fallback branch -- which meant the
 * cache decision further down had to re-derive which of the two had happened.
 */
async function choose(root: string, target: string, requestPath: string): Promise<Chosen | null> {
  const size = await sizeOfFile(target)
  if (size !== null) return { path: target, size, isFallback: false }

  /* A request naming a real asset that is missing stays missing -- see the
   * header comment on why falling through would misreport the cause. */
  if (extname(requestPath) !== '') return null

  const index = join(resolve(root), INDEX)
  const indexSize = await sizeOfFile(index)
  if (indexSize === null) return null
  return { path: index, size: indexSize, isFallback: true }
}

/**
 * Answer a GET or HEAD from the built app. `false` means it was not ours.
 *
 * CACHING IS SPLIT, AND THE SPLIT IS THE WHOLE POINT.
 *     Vite writes asset filenames containing a content hash, so an asset can be
 *     cached forever: a changed file is a different name. `index.html` names
 *     those assets and must NEVER be cached, or a returning learner loads the
 *     previous release's HTML, which points at asset names the new deployment
 *     no longer has -- a white screen that clears only when the browser is told
 *     to hard-refresh, which no student will do.
 *
 *     The document is recognised by HAVING BEEN CHOSEN as the fallback, not by
 *     its name. `path.endsWith('index.html')` was the first spelling and it is
 *     also true of `myindex.html`, so an ordinary asset with an unlucky name
 *     would have been served uncacheable for a reason nobody could find.
 */
export async function serveStatic(
  root: string,
  requestPath: string,
  method: string,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== 'GET' && method !== 'HEAD') return false

  const target = resolveWithin(root, requestPath)
  if (target === null) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('bad path')
    return true
  }

  const chosen = await choose(root, target, requestPath)
  if (chosen === null) return false

  /* Only a content-hashed name may be cached forever, and only when it is the
   * file that was actually asked for. */
  const immutable =
    !chosen.isFallback && /-[A-Za-z0-9_]{8,}\.[a-z0-9]+$/.test(requestPath)

  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(chosen.path).toLowerCase()] ?? 'application/octet-stream',
    'content-length': chosen.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    /* This server emits documents now, so a browser must not be free to decide
     * one of them is something else. */
    'x-content-type-options': 'nosniff',
  })

  if (method === 'HEAD') {
    res.end()
    return true
  }

  await new Promise<void>((done) => {
    const stream = createReadStream(chosen.path)
    /* A read that fails midway cannot become a status code -- the headers are
     * already on the wire. Destroying the socket is what tells the client the
     * body is incomplete; ending normally would present a truncated file as a
     * whole one. */
    stream.on('error', () => {
      res.destroy()
      done()
    })
    stream.on('end', () => done())
    stream.pipe(res)
  })

  return true
}
