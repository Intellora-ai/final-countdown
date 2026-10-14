import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, generateLesson, modelConfig, type ModelConfig } from '../server/api'
import { compactContext } from '../server/context'
import { authenticated, RequestBudget } from '../server/protection'
import { MAX_REQUEST_BYTES, type Lesson } from '../src/lesson'

const config: ModelConfig = { url: 'https://provider.test/chat', model: 'replaceable' }
const answer = { explanation: 'A complete answer — 日本語', blocks: [] }
const envelope = () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] })
const directories: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }))
})

class Reply extends EventEmitter {
  destroyed = false
  writeHead = vi.fn()
  end = vi.fn()
}
function incoming(chunks: Iterable<Uint8Array | string> | AsyncIterable<Uint8Array | string>, options: { url?: string; method?: string; origin?: string; host?: string } = {}) {
  return Object.assign(Readable.from(chunks), {
    url: options.url ?? '/api/lesson', method: options.method ?? 'POST',
    headers: { host: options.host ?? 'canvas.test', ...(options.origin === undefined ? {} : { origin: options.origin }) },
  }) as unknown as IncomingMessage
}
async function request(body: string, model = config, options: Parameters<typeof incoming>[1] = {}) {
  const reply = new Reply()
  await api(incoming([body], options), reply as unknown as ServerResponse, model)
  expect(reply.listenerCount('close')).toBe(0)
  return { status: reply.writeHead.mock.calls[0]?.[0] as number, payload: JSON.parse(reply.end.mock.calls[0][0] as string), reply }
}

describe('provider transport boundaries', () => {
  it('decodes UTF-8 only after assembling the byte stream, including split multibyte code points', async () => {
    const bytes = new TextEncoder().encode(envelope())
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() },
    })
    await expect(generateLesson({ question: 'Explain α' }, config, vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)))).resolves.toEqual(answer)
    expect(stream.locked).toBe(false)
  })

  it('accepts an output at the byte limit and releases its reader', async () => {
    const body = envelope()
    const bytes = new TextEncoder().encode(body)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES - bytes.length).fill(32)); controller.close() },
    })
    await expect(generateLesson({ question: 'Explain' }, config, vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)))).resolves.toEqual(answer)
    expect(stream.locked).toBe(false)
  })

  it('releases the provider reader when a stream fails mid-response', async () => {
    const failure = new Error('The upstream stream closed unexpectedly')
    let reads = 0
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      if (reads++ === 0) controller.enqueue(new TextEncoder().encode('{"choices":'))
      else controller.error(failure)
    } })
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    await expect(generateLesson({ question: 'Explain' }, config, send)).rejects.toBe(failure)
    expect(stream.locked).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rejects a body-free success response instead of inventing lesson content', async () => {
    await expect(generateLesson({ question: 'Explain' }, config, vi.fn<typeof fetch>().mockResolvedValue(new Response(null)))).rejects.toThrow('MODEL_OUTPUT_INVALID')
  })

  it.each([
    {}, { choices: [] }, { choices: [null] }, { choices: [{}] },
    { choices: [{ message: {} }] }, { choices: [{ message: { content: '' } }] },
    { choices: [{ message: { content: '{' } }] },
    { choices: [{ message: { content: '{"explanation":""}' } }] },
    { choices: [{ message: { content: '{"explanation":"Readable","blocks":[{"kind":"svg","title":"Missing source"}]}' } }] },
  ])('rejects incomplete or invalid provider output %#', async payload => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload))
    await expect(generateLesson({ question: 'Explain' }, config, send)).rejects.toThrow('MODEL_OUTPUT_INVALID')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(['http://localhost:9000/chat', 'http://127.0.0.1:9000/chat', 'http://[::1]:9000/chat', 'https://remote.test/chat'])('supports the configured secure or loopback endpoint %s', async url => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(envelope()))
    await generateLesson({ question: 'Explain' }, { ...config, url }, send)
    expect((send.mock.calls[0][0] as URL).href).toBe(url)
    expect(send.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(send.mock.calls[0][1]!.body as string).max_tokens).toBe(4096)
  })

  it.each(['http://localhost.attacker.test/chat', 'ftp://localhost/chat', 'data:text/plain,private'])('rejects unsafe endpoint %s before sending a request', async url => {
    const send = vi.fn<typeof fetch>()
    await expect(generateLesson({ question: 'Explain' }, { ...config, url }, send)).rejects.toThrow('MODEL_CONFIGURATION_INVALID')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects an invalid request before contacting the provider', async () => {
    const send = vi.fn<typeof fetch>()
    await expect(generateLesson({ question: ' ' }, config, send)).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('combines a caller abort signal with the bounded provider request', async () => {
    const controller = new AbortController()
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(envelope()))
    await generateLesson({ question: 'Explain' }, config, send, controller.signal)
    const signal = send.mock.calls[0][1]!.signal!
    expect(signal.aborted).toBe(false)
    controller.abort('Caller closed the lesson')
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('Caller closed the lesson')
  })
})

describe('API input and failure contracts', () => {
  it('returns the validated lesson with uncached JSON headers for a same-origin query route', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(envelope()))
    vi.stubGlobal('fetch', send)
    const result = await request('{"question":"Explain"}', config, { url: '/api/lesson?board=selected', origin: 'https://canvas.test' })
    expect(result.status).toBe(200)
    expect(result.payload).toEqual({ lesson: answer })
    expect(result.reply.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('assembles split UTF-8 request chunks before validating the question', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ question: 'Explain 日本語 — α' }))
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(envelope()))
    vi.stubGlobal('fetch', send)
    const reply = new Reply()
    await api(incoming([...bytes].map(byte => Uint8Array.of(byte))), reply as unknown as ServerResponse, config)
    expect(reply.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
    expect(JSON.parse(send.mock.calls[0][1]!.body as string).messages.at(-1).content).toBe('Explain 日本語 — α')
  })

  it('accepts the exact request byte budget and rejects the next byte without a provider call', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response(envelope()))
    vi.stubGlobal('fetch', send)
    const body = '{"question":"Explain"}'.padEnd(MAX_REQUEST_BYTES, ' ')
    expect((await request(body)).status).toBe(200)
    const oversized = await request(body + ' ')
    expect(oversized.status).toBe(413)
    expect(oversized.payload.error).toContain('too large')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(['', '{', '{"question":""}', '{"question":"' + 'x'.repeat(1001) + '"}'])('rejects unreadable or invalid input %# without calling the provider', async body => {
    const send = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', send)
    expect((await request(body)).status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('reports a request stream failure as unreadable input', async () => {
    const send = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', send)
    const reply = new Reply()
    async function* brokenBody() { yield '{"question":'; throw new Error('Socket read failed') }
    await api(incoming(brokenBody()), reply as unknown as ServerResponse, config)
    expect(reply.writeHead).toHaveBeenCalledWith(400, expect.any(Object))
    expect(JSON.parse(reply.end.mock.calls[0][0]).error).toBe('The question could not be read.')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects malformed origins before reading the request body', async () => {
    const result = await request('unreadable JSON', config, { origin: 'not a URL' })
    expect(result.status).toBe(403)
    expect(result.payload).toEqual({ error: 'Invalid origin.' })
  })

  it('treats a request without a URL as an unknown route', async () => {
    const req = incoming([])
    delete req.url
    const reply = new Reply()
    await api(req, reply as unknown as ServerResponse, config)
    expect(reply.writeHead).toHaveBeenCalledWith(404, expect.any(Object))
    expect(JSON.parse(reply.end.mock.calls[0][0]).error).toBe('Unknown API route.')
  })

  it.each([
    [new Error('MODEL_OUTPUT_TRUNCATED'), 'answer budget'],
    [new Error('MODEL_OUTPUT_TOO_LARGE'), 'response was too large'],
    [new Error('MODEL_OUTPUT_INVALID'), 'invalid visual lesson'],
    [new Error('MODEL_HTTP_429'), 'HTTP 429'],
    [new Error('private transport error'), 'could not be reached'],
    ['private non-Error rejection', 'could not be reached'],
  ])('maps model failure %# to a safe actionable error', async (failure, expected) => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(failure)
    vi.stubGlobal('fetch', send)
    const result = await request('{"question":"Explain"}')
    expect(result.status).toBe(502)
    expect(result.payload.error).toContain(expected)
    expect(JSON.stringify(result.payload)).not.toContain('private')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('aborts the provider on disconnect and writes no error to a destroyed response', async () => {
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signal = init!.signal!
      started()
      return new Promise<Response>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new DOMException('Client disconnected', 'AbortError')), { once: true }) })
    }))
    const reply = new Reply()
    const pending = api(incoming(['{"question":"Explain"}']), reply as unknown as ServerResponse, config)
    await ready
    reply.destroyed = true
    reply.emit('close')
    await pending
    expect(signal.aborted).toBe(true)
    expect(reply.writeHead).not.toHaveBeenCalled()
    expect(reply.end).not.toHaveBeenCalled()
    expect(reply.listenerCount('close')).toBe(0)
  })

  it('writes no late success when the response was destroyed before the provider resolved', async () => {
    let deliver!: (response: Response) => void
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(() => { started(); return new Promise<Response>(resolve => { deliver = resolve }) }))
    const reply = new Reply()
    const pending = api(incoming(['{"question":"Explain"}']), reply as unknown as ServerResponse, config)
    await ready
    reply.destroyed = true
    deliver(new Response(envelope()))
    await pending
    expect(reply.end).not.toHaveBeenCalled()
    expect(reply.listenerCount('close')).toBe(0)
  })
})

describe('configuration and bounded context', () => {
  it.each(['255', '8193', '4096.5', 'NaN', 'Infinity', ''])('rejects invalid token configuration %s', value => {
    expect(() => modelConfig({ LESSON_MAX_TOKENS: value })).toThrow('LESSON_MAX_TOKENS must be between 256 and 8192.')
  })
  it.each(['256', '8192'])('accepts inclusive token boundary %s', value => {
    expect(modelConfig({ LESSON_MAX_TOKENS: value, LESSON_RESPONSE_FORMAT: 'unknown' })).toMatchObject({ maxTokens: Number(value), format: 'json_schema' })
  })
  it('reads defaults and configured values from the server environment', () => {
    vi.stubEnv('LESSON_API_URL', 'https://provider.test/chat')
    vi.stubEnv('LESSON_MODEL', 'configured-model')
    vi.stubEnv('LESSON_API_KEY', 'test-fixture-key')
    vi.stubEnv('LESSON_RESPONSE_FORMAT', 'json_object')
    vi.stubEnv('LESSON_MAX_TOKENS', '1024')
    expect(modelConfig()).toEqual({ url: 'https://provider.test/chat', model: 'configured-model', key: 'test-fixture-key', format: 'json_object', maxTokens: 1024 })
    expect(modelConfig({})).toMatchObject({ format: 'json_schema', maxTokens: 4096 })
  })

  it('handles empty history and adds a separately selected previous board once', () => {
    expect(compactContext([])).toEqual({ turns: [], geometryOmitted: false })
    const previous: Lesson = { title: 'Selected board', explanation: 'Earlier meaning', blocks: [] }
    expect(compactContext([], previous)).toEqual({ turns: [{ question: '', lesson: previous }], geometryOmitted: false })
  })

  it('drops oldest turns to meet the context budget while preserving the newest complete geometry', () => {
    const latest: Lesson = { explanation: 'Latest explanation', blocks: [{ kind: 'svg', title: 'Latest board', source: '<svg viewBox="0 0 100 100"><text x="10" y="20">Latest evidence</text></svg>' }] }
    const history = Array.from({ length: 5 }, (_, i) => ({ question: `Earlier question ${i}`, lesson: { explanation: 'Older explanation '.repeat(20), blocks: [] } as Lesson }))
    history.push({ question: 'Current question', lesson: latest })
    const budget = JSON.stringify([history.at(-1)]).length + 1
    const result = compactContext(history, undefined, budget)
    expect(result.turns).toEqual([history.at(-1)])
    expect(JSON.stringify(result.turns).length).toBeLessThanOrEqual(budget)
    expect(result.geometryOmitted).toBe(false)
    expect(history).toHaveLength(6)
  })

  it('tells the model when selected geometry was removed by the context limit', async () => {
    const previous: Lesson = { explanation: 'A retained transcript', blocks: [{ kind: 'svg', title: 'A large board', source: '<svg viewBox="0 0 100 100">' + '<path d="M0 0L1 1"/>'.repeat(1500) + '</svg>' }] }
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(envelope()))
    await generateLesson({ question: 'Revise this board', previous }, config, send)
    const payload = JSON.parse(send.mock.calls[0][1]!.body as string)
    expect(payload.messages.find((message: { content: string }) => typeof message.content === 'string' && message.content.includes('unseen geometry'))?.role).toBe('system')
    const assistant = payload.messages.find((message: { role: string }) => message.role === 'assistant')
    expect(JSON.parse(assistant.content)).toEqual({ explanation: previous.explanation, blocks: [] })
    expect(previous.blocks).toHaveLength(1)
  })
})

describe('access and persisted request budgets', () => {
  it('requires Basic authentication with the full UTF-8 password and intended username', () => {
    const password = '日本語 — long password'
    const header = (credentials: string) => 'Basic ' + Buffer.from(credentials).toString('base64')
    expect(authenticated('Bearer token', password)).toBe(false)
    expect(authenticated(header('other:' + password), password)).toBe(false)
    expect(authenticated(header('canvas:' + password), password)).toBe(true)
    expect(authenticated(header('canvas:' + 'x'.repeat(Buffer.byteLength(password))), password)).toBe(false)
  })

  it.each([{ day: 4, count: 1 }, { day: '2026-10-13', count: -1 }, { day: '2026-10-13', count: 1.5 }, { day: '2026-10-13', count: Number.MAX_SAFE_INTEGER + 1 }])('rejects invalid persisted request-budget state %#', state => {
    const dir = mkdtempSync(join(tmpdir(), 'provider-budget-')); directories.push(dir)
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify(state))
    expect(() => new RequestBudget({ file })).toThrow('Invalid request-budget state.')
  })

  it('preserves a denied budget on disk and returns seconds until the next UTC day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'provider-budget-')); directories.push(dir)
    const file = join(dir, 'nested', 'state.json')
    let now = Date.parse('2026-10-13T23:59:59.100Z')
    const budget = new RequestBudget({ daily: 1, file, clock: () => now })
    const first = budget.acquire()
    if (!('release' in first)) throw new Error('The first request should fit the budget')
    first.release()
    const saved = readFileSync(file, 'utf8')
    expect(budget.acquire()).toEqual({ retry: 1, reason: 'The daily answer budget is exhausted. Try again tomorrow.' })
    expect(readFileSync(file, 'utf8')).toBe(saved)
    now = Date.parse('2026-10-14T00:00:00Z')
    const renewed = budget.acquire()
    expect('release' in renewed).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ day: '2026-10-14', count: 1 })
    if ('release' in renewed) renewed.release()
  })
})
