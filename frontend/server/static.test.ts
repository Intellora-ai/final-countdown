/* Tests for serving the built app.
 *
 * DESIRED OUTCOME
 *   A learner can open the product, refresh on any page of it, and share a
 *   link to one — while the API keeps answering as an API and no request can
 *   read a file outside the build.
 *
 * WHAT MUST BE TRUE
 *   1. `/` returns the app's document. Before this existed nothing did, so a
 *      deployment served the API to a browser that wanted a page.
 *   2. A CLIENT-ROUTED path returns the same document. `/canvas/gas` has never
 *      been a file; answering 404 there breaks refresh and every shared link,
 *      and does it only in production because Vite hides it in development.
 *   3. A MISSING ASSET STAYS MISSING. If `/assets/x-1234abcd.js` fell through
 *      to the document, the browser would report a syntax error at line 1 of
 *      HTML it was told was JavaScript, and point every investigation at the
 *      bundler instead of the missing file.
 *   4. `/api/*` IS NEVER SERVED FROM DISK. A JSON 404 is how an operator
 *      learns a route was not deployed; HTML with a 200 would hide it.
 *   5. NO PATH ESCAPES THE ROOT, in every spelling — raw, percent-encoded, and
 *      buried mid-path. Measured before this was written: `/../../../etc/passwd`
 *      answered 200 with the app's HTML. Nothing leaked, but a refusal that
 *      says "fine" is not a refusal.
 *   6. THE DOCUMENT IS NEVER CACHED and hashed assets always are. A cached
 *      document names the previous release's asset filenames, which the new
 *      deployment does not have — a white screen that only a hard refresh
 *      clears, and no student will do that.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createConnection } from 'node:net'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'

import { createServer } from './index.ts'
import { resolveWithin } from './static.ts'
import type { ModelPort, SearchPort } from './handler.ts'

const model: ModelPort = {
  async lesson() {
    throw new Error('a static request must never reach the lesson model')
  },
}
const search: SearchPort = {
  async search() {
    return []
  },
}

/**
 * A GET written straight onto the socket, status line returned.
 *
 * WHY NOT `fetch`. Every HTTP client, and every browser, normalises `..` out of
 * a path before sending it -- `fetch('/assets/../../etc/passwd')` puts
 * `/etc/passwd` on the wire, so the server never sees the traversal and the
 * test proves nothing about refusing one. Measured, not assumed: three cases
 * here passed through `fetch` as 200 and 404 while the guard was working
 * perfectly. Somebody attacking this server writes the bytes by hand, so the
 * test does too.
 */
async function rawGet(port: number, requestPath: string): Promise<string> {
  return new Promise<string>((settle, fail) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    let received = ''
    socket.setEncoding('utf8')
    socket.on('error', (error) => fail(error))
    socket.on('data', (chunk) => {
      received += chunk
    })
    socket.on('end', () => settle(received))
    socket.write(`GET ${requestPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
  })
}

const DOCUMENT = '<!doctype html><title>the app</title>'
const ASSET = 'export const real = 1\n'

let root: string
let server: Server
let base: string
let port = 0

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'static-'))
  await writeFile(join(root, 'index.html'), DOCUMENT, 'utf8')
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'assets', 'index-CvSzGDau.js'), ASSET, 'utf8')
  /* A REAL FILE WHOSE NAME ENDS WITH THE DOCUMENT'S NAME. The first version
   * recognised the fallback with `path.endsWith('index.html')`, which is also
   * true of this, so an ordinary asset was served uncacheable. */
  await writeFile(join(root, 'assets', 'app-1234index.html'), '<p>an asset</p>', 'utf8')

  server = createServer({ model, search, webRoot: root })
  await new Promise<void>((ready) => {
    server.listen(0, '127.0.0.1', () => ready())
  })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((closed) => {
    server.close(() => closed())
  })
})

describe('resolveWithin', () => {
  it('keeps an ordinary path inside the root', () => {
    expect(resolveWithin('/srv/web', '/assets/app.js')).toBe('/srv/web/assets/app.js')
  })

  it.each([
    ['a leading parent segment', '/../secrets.env'],
    ['several parent segments', '/../../../etc/passwd'],
    ['a parent segment buried mid-path', '/assets/../../etc/passwd'],
    ['a percent-encoded parent segment', '/%2e%2e%2fsecrets.env'],
  ])('refuses %s', (_name, path) => {
    expect(resolveWithin('/srv/web', path)).toBeNull()
  })

  it('refuses a NUL byte, which truncates a path in a syscall but not in a string compare', () => {
    expect(resolveWithin('/srv/web', '/app.js\0.png')).toBeNull()
  })

  it('refuses a malformed percent-escape rather than throwing', () => {
    expect(resolveWithin('/srv/web', '/%ZZ')).toBeNull()
  })

  it('does not accept a sibling directory whose name merely starts with the root', () => {
    /* A prefix test alone would pass `/srv/web-old` against root `/srv/web`. */
    expect(resolveWithin('/srv/web', '/../web-old/secret')).toBeNull()
  })
})

describe('serving the built app over HTTP', () => {
  it('returns the document at the root', async () => {
    const response = await fetch(`${base}/`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await response.text()).toBe(DOCUMENT)
  })

  it('returns the same document for a client-routed path', async () => {
    const response = await fetch(`${base}/canvas/gas`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(DOCUMENT)
  })

  it('returns the same document for a deep client-routed path', async () => {
    const response = await fetch(`${base}/learn/quadratic-equations`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(DOCUMENT)
  })

  it('serves a real asset as itself', async () => {
    const response = await fetch(`${base}/assets/index-CvSzGDau.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await response.text()).toBe(ASSET)
  })

  it('leaves a missing asset missing rather than answering with the document', async () => {
    const response = await fetch(`${base}/assets/index-00000000.js`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'no such route' })
  })

  it('answers an undeployed API route with JSON, never the document', async () => {
    const response = await fetch(`${base}/api/not-a-route`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'no such route' })
  })

  it('still answers the health route as an API', async () => {
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })

  it.each([
    ['/../package.json'],
    ['/%2e%2e%2fpackage.json'],
    ['/../../../etc/passwd'],
    ['/assets/../../etc/passwd'],
    ['/../../../../../../etc/passwd'],
    ['/assets/..%2f..%2fpackage.json'],
  ])('refuses %s on the wire, unnormalised', async (path) => {
    const raw = await rawGet(port, path)
    expect(raw.split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request')
    expect(raw).toContain('bad path')
  })

  it('never puts a file from outside the root on the wire', async () => {
    /* The assertion that matters is not the status code -- it is that no byte
     * of the real file is in the reply, whatever status was chosen. */
    const raw = await rawGet(port, '/../../../../../../etc/passwd')
    expect(raw).not.toContain('root:')
    expect(raw).not.toContain('/bin/')
  })

  it('never caches the document', async () => {
    const response = await fetch(`${base}/`)
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('caches a content-hashed asset forever', async () => {
    const response = await fetch(`${base}/assets/index-CvSzGDau.js`)
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('caches a hashed asset whose name merely ends with the document name', async () => {
    const response = await fetch(`${base}/assets/app-1234index.html`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<p>an asset</p>')
    /* It is a real file that was asked for by name, not the client-route
     * fallback, so it is cacheable like any other hashed asset. */
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('marks every served document nosniff', async () => {
    const response = await fetch(`${base}/`)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('answers HEAD with the headers and no body', async () => {
    const response = await fetch(`${base}/`, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(DOCUMENT.length))
    expect(await response.text()).toBe('')
  })
})

describe('with no webRoot configured', () => {
  it('serves nothing from disk, so development keeps its API-only shape', async () => {
    const apiOnly = createServer({ model, search })
    await new Promise<void>((ready) => {
      apiOnly.listen(0, '127.0.0.1', () => ready())
    })
    const address = apiOnly.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0

    const response = await fetch(`http://127.0.0.1:${port}/`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'no such route' })

    await new Promise<void>((closed) => {
      apiOnly.close(() => closed())
    })
  })
})
