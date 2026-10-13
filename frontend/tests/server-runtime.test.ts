import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const captured = vi.hoisted(() => ({ servers: [] as Server[] }))
vi.mock('node:http', async importActual => {
  const actual = await importActual<typeof import('node:http')>()
  return { ...actual, createServer: (...args: unknown[]) => {
    const server = (actual.createServer as (...args: unknown[]) => Server)(...args)
    captured.servers.push(server)
    return server
  } }
})
const signals = ['SIGTERM', 'SIGINT'] as const
let previous: Map<string, Function[]>
let state: string
const ownedFiles: string[] = []
const headers = { Authorization: 'Basic ' + Buffer.from('canvas:runtime-contract-password').toString('base64') }

beforeEach(async () => {
  previous = new Map(signals.map(signal => [signal, process.listeners(signal)]))
  state = await mkdtemp(join(tmpdir(), 'canvas-runtime-'))
  vi.resetModules()
  for (const [name, value] of Object.entries({ NODE_ENV: 'development', PORT: '0', HOST: '127.0.0.1', CANVAS_ACCESS_PASSWORD: '', CANVAS_STATE_DIR: state, CANVAS_DAILY_REQUESTS: '2', LESSON_API_URL: '', LESSON_MODEL: '' })) vi.stubEnv(name, value)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks()
  for (const signal of signals) for (const listener of process.listeners(signal)) {
    if (!previous.get(signal)!.includes(listener)) process.removeListener(signal, listener)
  }
  await Promise.all(captured.servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve())
  })))
  await Promise.all(ownedFiles.splice(0).map(file => rm(file, { force: true })))
  await rm(state, { recursive: true, force: true }); vi.unstubAllEnvs()
})

async function start(production = false) {
  if (production) { vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('CANVAS_ACCESS_PASSWORD', 'runtime-contract-password') }
  await import('../server/index')
  const server = captured.servers.at(-1)!
  if (!server.listening) await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No listening address')
  return { server, base: `http://127.0.0.1:${address.port}` }
}
async function fixture(relative: string, content: string | Uint8Array) {
  const path = join('dist', relative)
  await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, content)
  ownedFiles.push(path)
  return '/' + relative
}

it('boots the actual server and serves public readiness without exposing protected configuration', async () => {
  const { server, base } = await start(true)
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(base + '/api/health?probe=deployment', { method })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    if (method === 'GET') expect(await response.json()).toEqual({ ok: true })
    else expect(await response.text()).toBe('')
  }
  expect(await (await fetch(base + '/api/health', { headers })).json()).toEqual({ ok: true, modelConfigured: false })
  for (const path of ['/', '/api/lesson', '/api/health']) {
    const response = await fetch(base + path, { method: 'POST' })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Basic')
    expect(response.headers.get('strict-transport-security')).toContain('max-age=')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  }
  expect(server.headersTimeout).toBe(15000)
  expect(server.requestTimeout).toBe(30000)
  expect(server.keepAliveTimeout).toBe(5000)
})

it('serves exact static bytes, immutable assets, HEAD and SPA fallback while rejecting unsafe paths', async () => {
  const { base } = await start()
  const asset = await fixture(`assets/runtime-${randomUUID()}.js`, 'export const ready = true')
  const binary = await fixture(`runtime-${randomUUID()}.bin`, new Uint8Array([0, 1, 255]))
  let index: Buffer
  try { index = await readFile('dist/index.html') }
  catch { await fixture('index.html', '<main>Canvas boot fixture</main>'); index = await readFile('dist/index.html') }
  for (const path of ['/', '/a/deep/learning/route']) {
    const response = await fetch(base + path)
    expect(response.status).toBe(200); expect(await response.text()).toBe(index.toString())
    expect(response.headers.get('content-type')).toBe('text/html')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(response.headers.has('strict-transport-security')).toBe(false)
  }
  const js = await fetch(base + asset)
  expect(js.headers.get('content-type')).toBe('text/javascript')
  expect(js.headers.get('cache-control')).toContain('immutable')
  expect(await js.text()).toBe('export const ready = true')
  const bytes = await fetch(base + binary)
  expect(bytes.headers.get('content-type')).toBe('application/octet-stream')
  expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(new Uint8Array([0, 1, 255]))
  expect(await (await fetch(base + asset, { method: 'HEAD' })).text()).toBe('')
  expect((await fetch(base + asset, { method: 'PUT' })).status).toBe(405)
  expect((await fetch(base + '/missing.js')).status).toBe(404)
  for (const path of ['/..%2foutside.txt', '/..%2fdist-neighbor%2fprivate.txt']) expect((await fetch(base + path)).status).toBe(403)
  const malformed = await fetch(base + '/%')
  expect(malformed.status).toBe(500); expect(await malformed.text()).toBe('Request failed.')
})

it('charges failed teaching attempts, releases active permits and persists the shared daily ceiling', async () => {
  const { base } = await start(true)
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('not connected')
  }
  const limited = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })
  expect(limited.status).toBe(429); expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
  const persisted = JSON.parse(await readFile(join(state, 'request-budget.json'), 'utf8'))
  expect(persisted.count).toBe(2)
  expect((await fetch(base + '/api/unknown', { headers })).status).toBe(404)
})

it('fails closed on unavailable persistent storage while readiness remains available', async () => {
  const blocked = join(state, 'file-not-directory'); await writeFile(blocked, 'Unavailable storage')
  vi.stubEnv('CANVAS_STATE_DIR', blocked)
  const { base } = await start(true)
  const response = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })
  expect(response.status).toBe(503)
  expect((await response.json()).error).toContain('storage')
  expect((await fetch(base + '/api/health')).status).toBe(200)
})

it.each(['', 'short'])('refuses production startup with unsafe password %j', async password => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('CANVAS_ACCESS_PASSWORD', password)
  await expect(import('../server/index')).rejects.toThrow('CANVAS_ACCESS_PASSWORD')
  expect(captured.servers).toHaveLength(0)
})
it.each(['0', '10001', '1.5', 'NaN'])('refuses invalid daily request policy %s before listening', async daily => {
  vi.stubEnv('CANVAS_DAILY_REQUESTS', daily)
  await expect(import('../server/index')).rejects.toThrow('CANVAS_DAILY_REQUESTS')
  expect(captured.servers).toHaveLength(0)
})

it.each(signals)('closes the listening server on %s rather than accepting further work', async signal => {
  const { server } = await start()
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  vi.useFakeTimers()
  const handler = process.listeners(signal).find(listener => !previous.get(signal)!.includes(listener))!
  const closed = once(server, 'close'); handler(signal); await closed
  expect(server.listening).toBe(false)
  expect(exit).toHaveBeenCalledWith(0)
})
it('forces shutdown at the deadline when active connections do not close', async () => {
  const { server } = await start()
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  vi.spyOn(server, 'close').mockReturnValue(server)
  vi.useFakeTimers()
  const handler = process.listeners('SIGTERM').find(listener => !previous.get('SIGTERM')!.includes(listener))!
  handler('SIGTERM'); expect(exit).not.toHaveBeenCalled()
  vi.advanceTimersByTime(9999); expect(exit).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1); expect(exit).toHaveBeenCalledWith(1)
})
