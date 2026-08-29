import { describe, expect, it } from 'vitest'

import { createOpenAIModel } from './openaiModel.ts'

/*
 * THE PROVIDER THE SERVER COULD NOT REACH.
 *
 * `/api/lesson` returned 502 for a reason that had nothing to do with teaching:
 * this server accepted `ANTHROPIC_API_KEY` or `OLLAMA_MODEL` and nothing else,
 * so the only working credential on the machine -- a Groq key -- could not
 * write a lesson. The frontend had a model. The server had none.
 *
 * Groq speaks the OpenAI chat-completions shape, which is NOT ollama's
 * `/api/chat`: the request carries `Authorization` and `response_format`, and
 * the reply arrives at `choices[0].message.content` rather than
 * `message.content`. Reusing the ollama client would have parsed `undefined`
 * out of a perfectly good answer, so this is its own client.
 *
 * Every failure here NAMES the thing a person can act on, for the reason
 * `ollama.ts` gives: "fetch failed" tells nobody anything. A withdrawn model id
 * returns 404 and that is the exact case that wasted a day, so it is the one
 * with the sharpest message.
 */

const BRIEF = {
  topic: 'the fundamental theorem of arithmetic',
  cls: '10',
  subject: 'Mathematics',
} as unknown as Parameters<ReturnType<typeof createOpenAIModel>['lesson']>[0]

/** A fetch that records what it was sent and replies with `body`. */
function stubFetch(body: unknown, status = 200) {
  const seen: { url?: string; init?: RequestInit } = {}
  const impl = async (url: string, init: RequestInit) => {
    seen.url = url
    seen.init = init
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }
  }
  return { impl: impl as never, seen }
}

describe('the OpenAI-compatible model', () => {
  it('reads the lesson out of choices[0].message.content', async () => {
    /* The shape difference from ollama, asserted rather than assumed. Getting
       this wrong produces `undefined` from a reply that was completely fine. */
    const { impl } = stubFetch({
      choices: [{ message: { content: '{"title":"Primes","blocks":[]}' } }],
    })
    const model = createOpenAIModel({
      apiKey: 'gsk-x',
      model: 'openai/gpt-oss-120b',
      endpoint: 'https://example.invalid/v1/chat/completions',
      fetchImpl: impl,
    })
    await expect(model.lesson(BRIEF)).resolves.toEqual({ title: 'Primes', blocks: [] })
  })

  it('sends the key as a bearer token and asks for JSON', async () => {
    const { impl, seen } = stubFetch({
      choices: [{ message: { content: '{"title":"t","blocks":[]}' } }],
    })
    const model = createOpenAIModel({
      apiKey: 'gsk-SECRET',
      model: 'm',
      endpoint: 'https://example.invalid/v1/chat/completions',
      fetchImpl: impl,
    })
    await model.lesson(BRIEF)

    const headers = (seen.init?.headers ?? {}) as Record<string, string>
    expect(headers['authorization'], 'the key never reached the provider').toBe('Bearer gsk-SECRET')
    expect(seen.url).toBe('https://example.invalid/v1/chat/completions')
    expect(String(seen.init?.body), 'nothing asked the model for JSON').toContain('json_object')
  })

  it('names the model when the provider says it does not exist', async () => {
    /*
     * THE CASE THAT COST A DAY. `llama-3.3-70b-versatile` was withdrawn; every
     * call returned 404 and the harness reported it as a teaching refusal. A
     * bare "status 404" would send the next reader after a network fault
     * instead of a dead string in a config file.
     */
    const { impl } = stubFetch({ error: { message: 'model not found' } }, 404)
    const model = createOpenAIModel({
      apiKey: 'gsk-x',
      model: 'llama-3.3-70b-versatile',
      endpoint: 'https://example.invalid/v1/chat/completions',
      fetchImpl: impl,
    })
    await expect(model.lesson(BRIEF)).rejects.toThrow(/llama-3\.3-70b-versatile/)
  })

  it('says the key was rejected, and does not repeat the key', async () => {
    const { impl } = stubFetch({}, 401)
    const model = createOpenAIModel({
      apiKey: 'gsk-SECRET-9999',
      model: 'm',
      endpoint: 'https://example.invalid/v1/chat/completions',
      fetchImpl: impl,
    })
    await expect(model.lesson(BRIEF)).rejects.toThrow(/rejected|401/)
    await expect(model.lesson(BRIEF)).rejects.not.toThrow(/SECRET/)
  })

  it('refuses prose rather than letting it fail three layers away', async () => {
    /* The pair for the success case. A model that ignores the schema and
       answers in sentences must be named here, not blamed on the lesson
       validator downstream. */
    const { impl } = stubFetch({
      choices: [{ message: { content: 'Sure! Here is a lesson about primes.' } }],
    })
    const model = createOpenAIModel({
      apiKey: 'gsk-x',
      model: 'chatty',
      endpoint: 'https://example.invalid/v1/chat/completions',
      fetchImpl: impl,
    })
    await expect(model.lesson(BRIEF)).rejects.toThrow(/not JSON/)
  })

  it('says the endpoint could not be reached when the fetch itself throws', async () => {
    const model = createOpenAIModel({
      apiKey: 'gsk-x',
      model: 'm',
      endpoint: 'https://example.invalid/v1/chat/completions',
      fetchImpl: (async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }) as never,
    })
    await expect(model.lesson(BRIEF)).rejects.toThrow(/could not be reached/)
  })
})
