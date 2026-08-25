/* A lesson written by a model running on this machine.
 *
 * WHY THIS EXISTS
 *   `/api/lesson` was the one path that could not be verified here: it needed
 *   an Anthropic key, and there is none. So the teaching screen was built,
 *   tested and shipped against a port that had never once returned a real
 *   lesson. Ollama runs locally, needs no key, and honours a JSON schema --
 *   which means the whole chain can finally be proved end to end.
 *
 * WHAT IT MUST NOT BECOME
 *   A second, subtly different product. The prompt and the schema come from
 *   `prompt.ts`, shared with the Anthropic client. A provider supplies the
 *   TRANSPORT and nothing else. If it carried its own prompt, the two would
 *   describe different lessons within a month -- the exact shape this project
 *   has already fixed three times in one session.
 */

import { describe, expect, it, vi } from 'vitest'

import { createOllamaModel, DEFAULT_OLLAMA_ENDPOINT, grammarSafe } from './ollama.ts'
import { LESSON_SCHEMA, SYSTEM } from './prompt.ts'
import { instructionFor } from './teaching.ts'

const LESSON = {
  id: 'photosynthesis',
  question: 'How does a leaf make food?',
  blocks: [{ id: 'a', kind: 'prose', body: 'A leaf turns light into sugar.' }],
  relations: [],
}

const replied = (content: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }),
})

function recording(response: unknown = replied(LESSON)) {
  const fetchImpl = vi.fn().mockResolvedValue(response)
  return { fetchImpl, model: createOllamaModel({ model: 'qwen2.5:7b', fetchImpl }) }
}

describe('what it sends', () => {
  it('posts to the chat route on the local daemon', async () => {
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'Photosynthesis' })

    expect(fetchImpl.mock.calls[0][0]).toBe(`${DEFAULT_OLLAMA_ENDPOINT}/api/chat`)
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST')
  })

  it('honours a custom endpoint, so the daemon need not be on this machine', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(replied(LESSON))
    await createOllamaModel({ model: 'm', endpoint: 'http://10.0.0.5:11434', fetchImpl })
      .lesson({ concept: 'X' })

    expect(fetchImpl.mock.calls[0][0]).toBe('http://10.0.0.5:11434/api/chat')
  })

  it('asks for one whole answer, not a stream', async () => {
    /* The handler validates a complete LessonSpec. A stream would have to be
     * reassembled before it could be checked, and a half-parsed lesson is
     * exactly what the validator exists to refuse. */
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'X' })

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(false)
  })

  it('sends the product\'s schema, minus only what Ollama cannot compile', async () => {
    /* EXPECTED VALUE CORRECTED against the real daemon, which answers 400
     * "failed to parse grammar" for a 2000-character bound. It is still the
     * PRODUCT'S schema -- a provider supplies transport, not a shape -- with
     * exactly two keys removed, and those two are enforced twice elsewhere. */
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'X' })

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body).format
    expect(sent).toEqual(grammarSafe(LESSON_SCHEMA))
    expect(JSON.stringify(sent)).not.toContain('maxLength')
    /* Everything that shapes the ANSWER is still there. */
    expect(sent.properties.blocks.items.properties.kind.enum)
      .toEqual(LESSON_SCHEMA.properties.blocks.items.properties.kind.enum)
    expect(sent.properties.blocks.items.additionalProperties).toBe(false)
  })

  it('sends the SAME system prompt', async () => {
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'X' })

    const messages = JSON.parse(fetchImpl.mock.calls[0][1].body).messages
    expect(messages[0]).toEqual({ role: 'system', content: SYSTEM })
  })

  it('carries the teaching strategy as an instruction the model can act on', async () => {
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'Photosynthesis', strategy: 'analogy' })

    const user = JSON.parse(fetchImpl.mock.calls[0][1].body).messages[1].content as string
    expect(user).toContain('Photosynthesis')
    expect(user).toContain(instructionFor('analogy'))
    expect(user, 'the strategy name is not an instruction').not.toContain('analogy')
  })

  it('names the model it was configured with', async () => {
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'X' })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('qwen2.5:7b')
  })
})

describe('what it returns', () => {
  it('parses the lesson out of the reply', async () => {
    const { model } = recording()
    expect(await model.lesson({ concept: 'Photosynthesis' })).toEqual(LESSON)
  })

  it('returns the object, not the JSON string', async () => {
    /* The handler runs `validateLesson` on it. Handing back a string would make
     * every lesson fail validation for the wrong reason. */
    const { model } = recording()
    const produced = await model.lesson({ concept: 'X' })
    expect(typeof produced).toBe('object')
  })
})

describe('when the local model cannot answer', () => {
  it('says the daemon is not running, which is the usual cause', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const model = createOllamaModel({ model: 'm', fetchImpl })

    await expect(model.lesson({ concept: 'X' })).rejects.toThrow(/ollama.*not running|could not be reached/i)
  })

  it('says WHICH model is missing when the daemon has not pulled it', async () => {
    /* The single most common setup mistake, and a bare 404 does not tell you
     * that `ollama pull qwen2.5:7b` is the fix. */
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 404, json: async () => ({ error: 'model "qwen2.5:7b" not found' }),
    })
    const model = createOllamaModel({ model: 'qwen2.5:7b', fetchImpl })

    await expect(model.lesson({ concept: 'X' })).rejects.toThrow(/qwen2\.5:7b/)
    await expect(model.lesson({ concept: 'X' })).rejects.toThrow(/ollama pull/i)
  })

  it('keeps the status on any other failure, because an outage and a bad request differ', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const model = createOllamaModel({ model: 'm', fetchImpl })

    await expect(model.lesson({ concept: 'X' })).rejects.toThrow(/500/)
  })

  it('refuses content that is not JSON rather than passing a string on', async () => {
    /* A small local model can ignore the schema. Better a clear failure here
     * than a validation error three layers away that blames the lesson. */
    const fetchImpl = vi.fn().mockResolvedValue(replied('Sure! Here is your lesson:'))
    const model = createOllamaModel({ model: 'm', fetchImpl })

    await expect(model.lesson({ concept: 'X' })).rejects.toThrow(/not JSON|could not be read/i)
  })

  it('refuses a reply with no content at all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const model = createOllamaModel({ model: 'm', fetchImpl })

    await expect(model.lesson({ concept: 'X' })).rejects.toThrow()
  })
})

describe('what it will never do', () => {
  it('sends no credential, because there is none to send', async () => {
    /* A local daemon needs no key. If one ever appears in this request it came
     * from the environment by accident, and it must not. */
    const { fetchImpl, model } = recording()
    await model.lesson({ concept: 'X' })

    const sent = JSON.stringify(fetchImpl.mock.calls[0][1])
    expect(sent).not.toMatch(/sk-ant|authorization|x-api-key|bearer/i)
  })
})

describe('the schema Ollama can actually compile', () => {
  /* THE ROOT CAUSE, PROVEN BOTH WAYS AGAINST THE REAL DAEMON:
   *
   *   {"type":"string","maxLength":2000}  ->  400 failed to parse grammar
   *   {"type":"string","maxLength":120}   ->  200
   *
   * Ollama compiles a JSON schema into a GBNF grammar, and a bounded
   * repetition that long blows its budget. With the full schema the ceiling
   * lands around 1992 characters, which is not a clean limit -- it is a shared
   * complexity budget that one long string tips over.
   *
   * SO THE BOUNDS ARE REMOVED FROM THE GRAMMAR AND NOWHERE ELSE. They are still
   * enforced twice, by `validateLesson` in the handler and again in the canvas.
   * The sampler stops shaping the length; the product still refuses a lesson
   * that breaks it. Nothing is loosened where a student could be affected.
   */

  it('removes every length bound, at every depth', () => {
    const stripped = grammarSafe({
      type: 'object',
      properties: {
        a: { type: 'string', maxLength: 2000 },
        b: { type: 'array', items: { type: 'object', properties: { c: { type: 'string', minLength: 1, maxLength: 120 } } } },
      },
    })
    expect(JSON.stringify(stripped)).not.toContain('maxLength')
    expect(JSON.stringify(stripped)).not.toContain('minLength')
  })

  it('keeps every other constraint, because those are what shape the answer', () => {
    /* Strip too much and the model is free to invent a kind the canvas cannot
     * render. Only the two keys that break the grammar go. */
    const stripped = grammarSafe({
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', pattern: '^[a-z0-9-]+$', maxLength: 64 },
        kind: { type: 'string', enum: ['prose', 'callout'] },
        n: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } },
      },
    }) as Record<string, never>

    const text = JSON.stringify(stripped)
    expect(text).toContain('additionalProperties')
    expect(text).toContain('"required"')
    expect(text).toContain('pattern')
    expect(text).toContain('enum')
    expect(text).toContain('minItems')
    expect(text).toContain('maxItems')
  })

  it('does not mutate the schema it was given', () => {
    /* The same object is sent to Anthropic, which HAS no grammar problem and
     * should keep its bounds. Mutating in place would silently loosen the
     * other provider. */
    const original = { type: 'object', properties: { a: { type: 'string', maxLength: 2000 } } }
    grammarSafe(original)
    expect(JSON.stringify(original)).toContain('maxLength')
  })

  it('is what the provider actually sends', () => {
    const fetchImpl = vi.fn().mockResolvedValue(replied(LESSON))
    return createOllamaModel({ model: 'm', fetchImpl }).lesson({ concept: 'X' }).then(() => {
      const sent = JSON.stringify(JSON.parse(fetchImpl.mock.calls[0][1].body).format)
      expect(sent).not.toContain('maxLength')
      /* and it is still recognisably the product's schema */
      expect(sent).toContain('"prose"')
      expect(sent).toContain('additionalProperties')
    })
  })

  it('leaves the Anthropic client sending the bounded schema', async () => {
    /* The bound is real and Anthropic can honour it. Only the provider that
     * cannot compile it goes without. */
    const { createModel } = await import('./model.ts')
    const sent: string[] = []
    await createModel({
      apiKey: 'sk-ant-test',
      fetchImpl: async (_u, init) => {
        sent.push(init.body)
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) }
      },
    }).lesson({ concept: 'X' }).catch(() => undefined)

    expect(sent[0]).toContain('maxLength')
  })
})
