import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { api, generateLesson } from '../server/api'

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
    expect(payload.messages[0].content).toContain('Response schema:')
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
  it('does not send a key to an insecure remote endpoint', async () => {
    const send = vi.fn<typeof fetch>()
    await expect(generateLesson({ question: 'Energy' }, { ...config, url: 'http://remote.test' }, send)).rejects.toThrow('MODEL_CONFIGURATION_INVALID')
    expect(send).not.toHaveBeenCalled()
  })
})
