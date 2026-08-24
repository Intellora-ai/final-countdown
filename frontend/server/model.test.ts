/* Tests for the Anthropic model client.
 *
 * DESIRED OUTCOME
 *   A concept goes in, a LessonSpec-shaped object comes out, and the API key is
 *   used without ever being written anywhere it could escape.
 *
 * WHY RAW FETCH AND NOT THE OFFICIAL SDK
 *   `@anthropic-ai/sdk` is not a dependency of this project, and adding one is a
 *   stop-and-ask in CLAUDE.md. The repo already calls the API by fetch in
 *   src/practice/engine/modelProvider.ts, so this follows that pattern. If the
 *   dependency is approved later, the SDK is the better long-term choice.
 *
 * API SHAPE — verified against the current reference, not from memory
 *   - model `claude-opus-5`
 *   - `thinking: {type: 'adaptive'}`
 *   - `budget_tokens`, `temperature`, `top_p` are REMOVED on Opus 5 and return
 *     400 if sent. Tests below assert they are absent, because sending one
 *     breaks every request and the failure looks like an outage.
 *   - structured output goes in `output_config.format`, not `output_format`
 *   - `stop_reason: 'refusal'` is a 200 response, so it must be checked before
 *     the content is read
 */

import { describe, expect, it } from 'vitest'

import { createModel } from './model.ts'

const KEY = 'sk-ant-test-key-DO-NOT-LEAK'

const LESSON = {
  id: 'photosynthesis',
  question: 'How does a leaf make food?',
  blocks: [{ id: 'a', kind: 'prose', body: 'Light becomes sugar.' }],
  relations: [],
}

function fetchReturning(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }
  }
  return { impl, calls }
}

const okPayload = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(LESSON) }],
}

function bodyOf(calls: Array<{ init: RequestInit }>) {
  return JSON.parse(String(calls[0].init.body))
}

describe('createModel — credentials', () => {
  it('refuses to start without a key', () => {
    expect(() => createModel({ apiKey: '', fetchImpl: fetchReturning(okPayload).impl }))
      .toThrow(/ANTHROPIC_API_KEY/)
  })

  it('does not put the key in the error when the key is missing', () => {
    /* Nothing to leak here, but the message must never be built FROM the key. */
    try {
      createModel({ apiKey: '', fetchImpl: fetchReturning(okPayload).impl })
    } catch (error) {
      expect(String(error)).not.toContain('sk-ant')
    }
  })

  it('sends the key as x-api-key, never in the url or the body', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'Photosynthesis' })

    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(KEY)
    expect(calls[0].url).not.toContain(KEY)
    expect(String(calls[0].init.body)).not.toContain(KEY)
  })

  it('sends the anthropic-version header', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    expect((calls[0].init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
  })
})

describe('createModel — request shape', () => {
  it('asks for claude-opus-5', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    expect(bodyOf(calls).model).toBe('claude-opus-5')
  })

  it('uses adaptive thinking', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    expect(bodyOf(calls).thinking).toEqual({ type: 'adaptive' })
  })

  it('never sends budget_tokens, which returns 400 on this model', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    expect(bodyOf(calls).thinking.budget_tokens).toBeUndefined()
  })

  it('never sends temperature or top_p, which are removed on this model', async () => {
    /* Sending either breaks every request, and the failure looks like an
     * outage rather than a bad parameter. */
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    const body = bodyOf(calls)
    expect(body.temperature).toBeUndefined()
    expect(body.top_p).toBeUndefined()
  })

  it('constrains the output with output_config.format, not the deprecated output_format', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    const body = bodyOf(calls)
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.output_format).toBeUndefined()
  })

  it('names the concept in the prompt', async () => {
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'Photosynthesis' })
    expect(JSON.stringify(bodyOf(calls).messages)).toContain('Photosynthesis')
  })

  it('tells the model it may not style anything', async () => {
    /* The renderer owns appearance. A spec carrying a colour is refused by the
     * validator, so saying so up front avoids a wasted round trip. */
    const { impl, calls } = fetchReturning(okPayload)
    await createModel({ apiKey: KEY, fetchImpl: impl }).lesson({ concept: 'x' })
    expect(bodyOf(calls).system.toLowerCase()).toContain('colour')
  })
})

describe('createModel — responses', () => {
  it('returns the parsed lesson', async () => {
    const model = createModel({ apiKey: KEY, fetchImpl: fetchReturning(okPayload).impl })
    expect(await model.lesson({ concept: 'x' })).toEqual(LESSON)
  })

  it('throws on a refusal, which arrives as a 200', async () => {
    const refused = { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }
    const model = createModel({ apiKey: KEY, fetchImpl: fetchReturning(refused).impl })
    await expect(model.lesson({ concept: 'x' })).rejects.toThrow(/refused/i)
  })

  it('throws when the upstream status is not ok', async () => {
    const model = createModel({ apiKey: KEY, fetchImpl: fetchReturning({ error: 'nope' }, 500).impl })
    await expect(model.lesson({ concept: 'x' })).rejects.toThrow(/500/)
  })

  it('does not put the key into an upstream error message', async () => {
    const leaky = { error: { message: `invalid key ${KEY}` } }
    const model = createModel({ apiKey: KEY, fetchImpl: fetchReturning(leaky, 401).impl })
    await expect(model.lesson({ concept: 'x' })).rejects.toThrow()
    await model.lesson({ concept: 'x' }).catch((error) => {
      expect(String(error)).not.toContain(KEY)
    })
  })

  it('throws when the model returns text that is not JSON', async () => {
    const junk = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'sorry, no' }] }
    const model = createModel({ apiKey: KEY, fetchImpl: fetchReturning(junk).impl })
    await expect(model.lesson({ concept: 'x' })).rejects.toThrow(/JSON/i)
  })

  it('throws when the response carries no text block at all', async () => {
    const empty = { stop_reason: 'end_turn', content: [] }
    const model = createModel({ apiKey: KEY, fetchImpl: fetchReturning(empty).impl })
    await expect(model.lesson({ concept: 'x' })).rejects.toThrow()
  })
})
