import type { IncomingMessage, ServerResponse } from 'node:http'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { lessonInstructions, lessonSchema, requestSchema } from '../src/lesson'
import { calculate } from './calculator'
import { searchWeb } from './tools'

export interface ModelConfig { url?: string; model?: string; key?: string }
export function modelConfig(): ModelConfig {
  return { url: process.env.LESSON_API_URL, model: process.env.LESSON_MODEL, key: process.env.LESSON_API_KEY }
}
export async function generateLesson(input: unknown, config: ModelConfig, send: typeof fetch = fetch) {
  const request = requestSchema.parse(input)
  if (!config.url || !config.model) throw new Error('MODEL_NOT_CONFIGURED')
  const url = new URL(config.url)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('MODEL_CONFIGURATION_INVALID')
  }
  const response = await send(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) },
    body: JSON.stringify({
      model: config.model,
      response_format: { type: 'json_schema', json_schema: { name: 'explanation', schema: zodToJsonSchema(lessonSchema), strict: true } },
      messages: [
        { role: 'system', content: lessonInstructions },
        ...request.memory.flatMap(turn => [
          { role: 'user', content: turn.question },
          { role: 'assistant', content: JSON.stringify(turn.lesson) },
        ]),
        ...(request.previous ? [{ role: 'assistant', content: JSON.stringify(request.previous) }] : []),
        { role: 'user', content: request.question },
      ],
      options: { num_ctx: Math.max(4096, Math.min(32768, Number(process.env.LESSON_CONTEXT ?? 8192))) },
    }),
  })
  if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`)
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('MODEL_OUTPUT_INVALID')
  try { return lessonSchema.parse(JSON.parse(content)) }
  catch { throw new Error('MODEL_OUTPUT_INVALID') }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
export async function api(req: IncomingMessage, res: ServerResponse, config = modelConfig()) {
  const path = (req.url ?? '').split('?')[0]
  if (path === '/api/health' && req.method === 'GET') {
    json(res, 200, { ok: true, modelConfigured: Boolean(config.url && config.model) }); return
  }
  if (path === '/api/calculate' && req.method === 'POST') {
    let body = ''
    try {
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) throw new Error('TOO_LARGE') }
      const value = JSON.parse(body) as { expression?: unknown }
      if (typeof value.expression !== 'string') throw new Error('CALCULATION_INVALID')
      json(res, 200, { expression: value.expression, result: calculate(value.expression) })
    } catch { json(res, 400, { error: 'Enter a valid arithmetic expression.' }) }
    return
  }
  if (path === '/api/search' && req.method === 'POST') {
    let body = ''
    try {
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) throw new Error() }
      const value = JSON.parse(body) as { query?: unknown }
      if (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 300) throw new Error()
      json(res, 200, { results: await searchWeb(value.query) })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      json(res, message === 'SEARCH_NOT_CONFIGURED' ? 503 : 502, { error: message === 'SEARCH_NOT_CONFIGURED' ? 'Web search is not configured.' : 'Web search failed.' })
    }
    return
  }
  if (path === '/api/tool' && req.method === 'POST') {
    let body = ''
    try {
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) throw new Error() }
      const value = JSON.parse(body) as { name?: unknown; input?: unknown }
      if (value.name !== 'calculator' || typeof value.input !== 'string') throw new Error()
      json(res, 200, { name: value.name, output: { result: calculate(value.input) } })
    } catch { json(res, 400, { error: 'Only the bounded calculator tool is available.' }) }
    return
  }
  if (path !== '/api/lesson' || req.method !== 'POST') {
    json(res, 404, { error: 'Unknown API route.' }); return
  }
  // Browser requests stay on the same origin. No cross-origin API access.
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        json(res, 403, { error: 'Use the canvas on this server.' }); return
      }
    } catch { json(res, 403, { error: 'Invalid origin.' }); return }
  }
  let input: unknown
  try {
    let body = ''
    for await (const chunk of req) {
      body += chunk.toString()
      if (Buffer.byteLength(body) > 64000) { json(res, 413, { error: 'Question is too large.' }); return }
    }
    input = JSON.parse(body)
    const parsed = requestSchema.safeParse(input)
    if (!parsed.success) { json(res, 400, { error: 'Enter a question of at most 1,000 characters.' }); return }
    input = parsed.data
  } catch { json(res, 400, { error: 'The question could not be read.' }); return }
  try { json(res, 200, { lesson: await generateLesson(input, config) }) }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    const missing = message === 'MODEL_NOT_CONFIGURED'
    json(res, missing ? 503 : 502, { error: missing
      ? 'Teaching is not connected yet. Ask the person running this canvas to connect a model. Saved lessons still open.'
      : message === 'MODEL_OUTPUT_INVALID' ? 'The model returned an invalid visual lesson. Try asking again.'
      : message === 'MODEL_HTTP_404' ? 'The configured model is unavailable. For Ollama, pull the model named in LESSON_MODEL, then try again.'
      : message.startsWith('MODEL_HTTP_') ? `The model service rejected the request (HTTP ${message.slice(11)}). Check the server connection and quota.`
      : 'The model could not be reached. Check the server connection and try again.' })
  }
}
