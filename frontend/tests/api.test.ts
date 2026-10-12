import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { api, generateLesson } from '../server/api'
import { MAX_REQUEST_BYTES } from '../src/lesson'

export const example = { title: 'Energy transfer', explanation: 'Energy moves between stores.', blocks: [{ kind: 'svg', title: 'A falling object', source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><path d="M100 80 L100 300" stroke="#335b4a"/><text x="120" y="100">Potential energy</text><text x="120" y="300">Kinetic energy</text></svg>' }] }
const config = { url: 'https://model.example.test/v1/chat/completions', model: 'test-model', key: 'test-only-key' }
const servers: Server[] = []
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => { s.closeAllConnections(); s.close(() => resolve()) }))) })
async function endpoint(model = {}) {
  const server = createServer((req, res) => { void api(req, res, model) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No server address')
  return `http://127.0.0.1:${address.port}`
}
describe('one teaching path', () => {
  it.each([{ url: config.url }, { model: config.model }])('does not advertise a usable model with partial configuration', async partial => {
    const base = await endpoint(partial)
    expect((await (await fetch(base + '/api/health')).json()).modelConfigured).toBe(false)
  })
  it.each([
    { learner: 'Prefers diagrams' },
    { recall: 'Earlier evidence' },
    { attachments: [{ name: 'notes.txt', text: 'Document evidence' }] },
  ])('preserves individually supplied context without requiring other context fields', async extra => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"explanation":"A reply"}' } }] }))
    await generateLesson({ question: 'Explain', ...extra }, config, send)
    const payload = JSON.parse(send.mock.calls[0][1]!.body as string)
    const content = payload.messages.at(-1).content
    expect(Array.isArray(content)).toBe(true)
    const context = JSON.parse(content[0].text)
    expect(context.learnerMemory).toBe('learner' in extra ? extra.learner : '')
    expect(context.earlierRelevantNotes).toBe('recall' in extra ? extra.recall : '')
    expect(context.documents).toEqual('attachments' in extra ? [{ name: 'notes.txt', excerpt: 'Document evidence' }] : [])
  })
  it('health checks do not replace missing routes or accept unsupported methods', async () => {
    const base = await endpoint(config)
    for (const [path, method] of [['/api/missing', 'GET'], ['/api/missing', 'HEAD'], ['/api/health', 'POST'], ['/api/health', 'OPTIONS']]) {
      expect((await fetch(base + path, { method })).status).toBe(404)
    }
  })
  it('accepts body-free HEAD health probes as well as GET probes', async () => {
    const base = await endpoint()
    const response = await fetch(base + '/api/health', { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })
  it('classifies malformed provider envelopes as invalid output, not a connection outage', async () => {
    for (const body of ['{', 'null', '[]', '{"choices":{}}', '{"choices":[{"message":{"content":42}}]}']) {
      const send = async () => new Response(body)
      await expect(generateLesson({ question: 'Explain' }, config, send as typeof fetch)).rejects.toThrow('MODEL_OUTPUT_INVALID')
    }
  })
  it('stops reading an oversized provider response instead of exhausting server memory', async () => {
    let cancelled = false
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES))
        controller.enqueue(new Uint8Array(1))
      },
      cancel() { cancelled = true },
    })
    const send = async () => new Response(stream)
    await expect(generateLesson({ question: 'Draw' }, config, send as typeof fetch)).rejects.toThrow('MODEL_OUTPUT_TOO_LARGE')
    expect(cancelled).toBe(true)
  })
  it('offers only universal drawing blocks to replacement models', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(example) } }] }))
    await generateLesson({ question: 'Draw connections' }, { ...config, model: 'replacement-model' }, send)
    const payload = JSON.parse(send.mock.calls[0][1]!.body as string)
    expect(payload.model).toBe('replacement-model')
    expect(payload.response_format.json_schema.schema.properties.blocks.items.properties.kind.const).toBe('svg')
    expect(payload.response_format.json_schema.schema.properties.check).toBeUndefined()
  })
  it('supports JSON mode on the same replaceable endpoint without vendor tuning', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(example) } }] }))
    expect(await generateLesson({ question: 'Draw energy' }, { ...config, format: 'json_object' }, send)).toEqual(example)
    const payload = JSON.parse(send.mock.calls[0][1]!.body as string)
    expect(payload.response_format).toEqual({ type: 'json_object' })
    expect(payload.messages[0].content).toContain('JSON shape:')
  })
  it('returns 404 for removed disconnected tools', async () => {
    const base = await endpoint()
    for (const path of ['/api/search', '/api/calculate']) expect((await fetch(base + path, { method: 'POST', body: '{}' })).status).toBe(404)
  })
  it('allows conversation without a forced title, diagram, or check', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"explanation":"Hey!"}' } }] }))
    expect(await generateLesson({ question: 'lol hi' }, config, send)).toEqual({ explanation: 'Hey!', blocks: [] })
  })
  it('sends selected context once and no vendor-specific tuning fields', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(example) } }] }))
    await generateLesson({ question: 'Why?', previous: example, memory: [{ question: 'Explain energy', lesson: example }] }, config, send)
    const payload = JSON.parse(send.mock.calls[0][1]!.body as string)
    expect(payload.messages.filter((message: { role: string }) => message.role === 'assistant')).toHaveLength(1)
    expect(payload.options).toBeUndefined()
    expect(payload.response_format.json_schema.strict).not.toBe(true)
    expect(JSON.stringify(payload.response_format.json_schema.schema)).not.toContain('maxLength')
  })
  it('enforces same-origin access on every POST endpoint', async () => {
    const base = await endpoint()
    for (const path of ['/api/lesson', '/api/calculate', '/api/search', '/api/tool']) {
      const response = await fetch(base + path, { method: 'POST', headers: { Origin: 'https://unrelated.test' }, body: '{"expression":"1+1","name":"calculator","input":"1+1","query":"energy"}' })
      expect(response.status).toBe(403)
    }
  })
  it('accepts a direct answer without forcing a visual or a quiz', async () => {
    const answer = { title: 'A prime number', explanation: 'A prime has exactly two positive divisors: 1 and itself.' }
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    expect(await generateLesson({ question: 'What is a prime number?' }, config, send)).toEqual({ ...answer, blocks: [] })
  })
  it('sends the actual question and previous lesson, with credentials only in the server request', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(example) } }] }))
    expect(await generateLesson({ question: 'Why does it accelerate?', previous: example, memory: [{ question: 'What is energy?', lesson: example }] }, config, send)).toEqual(example)
    const options = send.mock.calls[0][1]!
    const payload = JSON.parse(options.body as string)
    expect(payload.response_format.type).toBe('json_schema')
    expect(payload.response_format.json_schema.schema.properties.blocks).toBeTruthy()
    expect(payload.messages.at(-1).content).toBe('Why does it accelerate?')
    expect(payload.messages.some((message: { role: string; content: string }) => message.role === 'assistant' && message.content.includes('Energy transfer'))).toBe(true)
    expect(payload.messages.some((message: { content: string }) => message.content === 'What is energy?')).toBe(true)
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-only-key' })
    expect(options.redirect).toBe('error')
  })
  it('rejects teaching templates in new model output', async () => {
    const invalid = { ...example, blocks: [{ kind: 'steps', title: 'Forced lesson', items: ['First', 'Second'] }] }
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(invalid) } }] }))
    await expect(generateLesson({ question: 'Energy' }, config, send)).rejects.toThrow('MODEL_OUTPUT_INVALID')
  })
  it('boots without credentials and gives an actionable error instead of a fake lesson', async () => {
    const base = await endpoint()
    expect(await (await fetch(base + '/api/health')).json()).toEqual({ ok: true, modelConfigured: false })
    const response = await fetch(base + '/api/lesson', { method: 'POST', body: JSON.stringify({ question: 'Energy' }) })
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('connect a model')
  })
  it('rejects empty questions and cross-origin requests', async () => {
    const base = await endpoint()
    expect((await fetch(base + '/api/lesson', { method: 'POST', body: '{"question":""}' })).status).toBe(400)
    expect((await fetch(base + '/api/lesson', { method: 'POST', headers: { Origin: 'https://unrelated.test' }, body: '{"question":"Energy"}' })).status).toBe(403)
  })
  it('distinguishes a slow model from an unreachable model', async () => {
    const base = await endpoint(config)
    const request = fetch
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')))
    const response = await request(base + '/api/lesson', { method: 'POST', body: JSON.stringify({ question: 'Draw something' }) })
    expect(response.status).toBe(504)
    expect((await response.json()).error).toContain('took too long')
  })
  it('reports provider rejection without exposing its response or credentials', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream error', { status: 429 }))
    await expect(generateLesson({ question: 'Energy' }, config, send)).rejects.toThrow('MODEL_HTTP_429')
  })
  it('distinguishes a missing configured model from invalid output and quota errors', async () => {
    const base = await endpoint(config)
    const request = fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider details', { status: 404 })))
    const response = await request(base + '/api/lesson', { method: 'POST', body: '{"question":"Explain"}' })
    expect(response.status).toBe(502)
    expect((await response.json()).error).toContain('endpoint')
  })
  it('does not send a key to an insecure remote endpoint', async () => {
    const send = vi.fn<typeof fetch>()
    await expect(generateLesson({ question: 'Energy' }, { ...config, url: 'http://remote.test' }, send)).rejects.toThrow('MODEL_CONFIGURATION_INVALID')
    expect(send).not.toHaveBeenCalled()
  })
})
