import { describe, expect, it } from 'vitest'

import { createOllamaModel } from './ollama.ts'

/**
 * OLLAMA, STREAMED. `/api/chat` with `stream: true` answers one JSON object per
 * line, each carrying the next piece of the assistant's text and a `done`
 * flag. This is the reader that turns those lines into words as they arrive,
 * with the same refusals as the whole-reply path -- a missing model, a daemon
 * that is not running -- in the same words.
 */

function ndjson(lines: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = lines.map((line) => encoder.encode(JSON.stringify(line) + '\n'))
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function fetchAnswering(status: number, body: ReadableStream<Uint8Array> | null, seen: { body?: string }) {
  return async (_url: string, init?: { body?: string }) => {
    seen.body = init?.body
    return { ok: status >= 200 && status < 300, status, body, json: async () => ({}), text: async () => '' }
  }
}

describe('a local model, read as it writes', () => {
  it('hands each piece over as it arrives and returns the whole', async () => {
    const seen: { body?: string } = {}
    const model = createOllamaModel({
      model: 'qwen2.5:7b',
      fetchImpl: fetchAnswering(200, ndjson([
        { message: { role: 'assistant', content: 'Hel' }, done: false },
        { message: { role: 'assistant', content: 'lo' }, done: false },
        { message: { role: 'assistant', content: '' }, done: true },
      ]), seen) as never,
    })
    const heard: string[] = []
    await expect(model.chatStream!('sys', 'q', (piece) => heard.push(piece))).resolves.toBe('Hello')
    expect(heard).toEqual(['Hel', 'lo'])
    expect(JSON.parse(seen.body ?? '{}')).toMatchObject({ stream: true, model: 'qwen2.5:7b' })
  })

  it('is not fooled by a line split across two chunks', async () => {
    const encoder = new TextEncoder()
    const text = JSON.stringify({ message: { content: 'ab' }, done: false }) + '\n' + JSON.stringify({ message: { content: 'cd' }, done: true }) + '\n'
    const half = Math.floor(text.length / 2)
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(encoder.encode(text.slice(0, half))); c.enqueue(encoder.encode(text.slice(half))); c.close() },
    })
    const model = createOllamaModel({ model: 'm', fetchImpl: fetchAnswering(200, body, {}) as never })
    const heard: string[] = []
    await expect(model.chatStream!('sys', 'q', (piece) => heard.push(piece))).resolves.toBe('abcd')
    expect(heard.join('')).toBe('abcd')
  })

  it('says the model is missing in the same words as the whole-reply path', async () => {
    const model = createOllamaModel({ model: 'ghost', fetchImpl: fetchAnswering(404, null, {}) as never })
    await expect(model.chatStream!('sys', 'q', () => {})).rejects.toThrow(/ollama pull ghost/)
  })

  it('says the daemon is not answering when nothing answers at all', async () => {
    const model = createOllamaModel({
      model: 'm',
      fetchImpl: (async () => { throw new TypeError('fetch failed') }) as never,
    })
    await expect(model.chatStream!('sys', 'q', () => {})).rejects.toThrow(/could not be reached/)
  })
})
