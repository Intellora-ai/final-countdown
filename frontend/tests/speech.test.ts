import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { afterEach, expect, it } from 'vitest'
import { speech } from '../server/speech'

const servers: Server[] = []
// A missing response is a failed HTTP deadline assertion, never a Vitest timeout.
async function request(url: string, init: RequestInit) {
  const signal = AbortSignal.any([AbortSignal.timeout(1000), ...(init.signal ? [init.signal] : [])])
  try { return await fetch(url, { ...init, signal }) }
  catch (error) {
    if (signal.aborted && !init.signal?.aborted) throw new Error('Voice response failed its one-second deadline', { cause: error })
    throw error
  }
}
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })
async function endpoint(generate: (text: string, signal: AbortSignal) => Promise<Buffer>) {
  const server = createServer((req, res) => { void speech(req, res, generate) })
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
it('returns generated audio bytes for arbitrary valid text over the real HTTP boundary', async () => {
  const bytes = Buffer.from('RIFF generated waveform')
  const base = await endpoint(async text => { expect(text).toBe('Dr. Rao measured 3.14 cm.'); return bytes })
  const response = await request(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Dr. Rao measured 3.14 cm.' }) })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('audio/wav')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
})
it.each([{}, { text: '' }, { text: 42 }, { text: ' '.repeat(10) }, { text: 'x'.repeat(513) }])('rejects invalid voice input without generating audio: %j', async body => {
  let generated = false
  const base = await endpoint(async () => { generated = true; return Buffer.alloc(0) })
  const response = await request(base, { method: 'POST', body: JSON.stringify(body) })
  expect(response.status).toBe(400); expect(generated).toBe(false)
})
it('bounds request bytes before parsing or invoking the model', async () => {
  let generated = false
  const base = await endpoint(async () => { generated = true; return Buffer.alloc(0) })
  expect((await request(base, { method: 'POST', body: 'x'.repeat(4097) })).status).toBe(413)
  expect(generated).toBe(false)
})
it('reports model failure and remains usable for a later request', async () => {
  let calls = 0
  const base = await endpoint(async () => { if (++calls === 1) throw new Error('offline'); return Buffer.from('RIFF audio') })
  const ask = () => request(base, { method: 'POST', body: JSON.stringify({ text: 'A new idea.' }) })
  expect((await ask()).status).toBe(503); expect((await ask()).status).toBe(200)
})
it('aborts synthesis when the listener interrupts and disconnects', async () => {
  let started!: () => void, stopped!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const ended = new Promise<void>(resolve => { stopped = resolve })
  const base = await endpoint((_text, signal) => new Promise((_resolve, reject) => {
    started(); signal.addEventListener('abort', () => { stopped(); reject(new Error('cancelled')) }, { once: true })
  }))
  const controller = new AbortController()
  const request = fetch(base, { method: 'POST', body: JSON.stringify({ text: 'Stop this turn.' }), signal: controller.signal }).catch(() => {})
  await ready; controller.abort(); await ended; await request
})
it('releases admission immediately after interruption even when native synthesis cannot stop', async () => {
  const started: (() => void)[] = [], pending: Promise<void>[] = []
  for (let i = 0; i < 3; i++) pending.push(new Promise(resolve => { started.push(resolve) }))
  let calls = 0
  const base = await endpoint(async () => { started[calls++](); return await new Promise<Buffer>(() => {}) })
  for (let i = 0; i < 3; i++) {
    const controller = new AbortController()
    const request = fetch(base, { method: 'POST', body: JSON.stringify({ text: 'A fresh turn.' }), signal: controller.signal }).catch(() => {})
    await Promise.race([pending[i], new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Cancelled turn still holds a slot')), 500))])
    controller.abort(); await request
    await new Promise(resolve => setTimeout(resolve, 20))
  }
})
