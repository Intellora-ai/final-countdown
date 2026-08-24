/*
 * THE PORT THAT MAKES THE ENGINE REACHABLE.
 *
 * `src/agent` has been complete and unreachable: eleven thousand lines with no
 * implementation of `ModelPort`, so nothing in the product could ever call it.
 * This is that implementation, and these are its tests.
 *
 * WHY OPENAI-SHAPED AND NOT ANTHROPIC-SHAPED. The target is a local model the
 * user runs themselves. Ollama, LM Studio, llama.cpp's server and vLLM all
 * expose `/v1/chat/completions` with the OpenAI request body, so one client
 * reaches all of them and the user changes an endpoint rather than a file.
 *
 * EVERY FAILURE PATH HERE THROWS. That is deliberate and it is safe: `loop.ts`
 * catches around `ports.model.generate` and produces an answer that SAYS it
 * failed, with `degraded` set. So a missing endpoint surfaces to the student as
 * an honest refusal rather than as silence or as a fabricated answer. What must
 * never happen is this port returning a plausible empty string.
 */
import { describe, expect, it, vi } from 'vitest'
import { httpModel } from './httpModel'
import type { GenerateRequest } from '../kernel/loop'

/** A request with the fields the port actually reads. */
function req(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    understanding: {
      goal: 'explain the discriminant',
      intent: { kind: 'explanation', confidence: 0.9, because: 'asked to explain' },
      entities: [{ id: 'discriminant', label: 'discriminant', kind: 'term', mentions: [0] }],
      constraints: ['under 100 words'],
      ambiguities: [],
      language: 'en',
      topicShift: false,
      userState: {},
    },
    communication: {
      depth: 'standard',
      leadWith: 'the definition',
      define: ['discriminant'],
      omit: ['complex roots'],
      representations: ['prose'],
      progressive: false,
      language: 'en',
      because: 'a first encounter with the term',
    },
    claims: [{ statement: 'b^2 - 4ac decides how many real roots exist', sources: [{ kind: 'file', ref: 'curriculum' }], confidence: 1 }],
    working: { objective: 'explain the discriminant', constraints: [], entities: [], facts: [], decisions: [] },
    capabilities: ['knowledge'],
    computed: {},
    ...over,
  } as unknown as GenerateRequest
}

const ok = (content: string) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }))

describe('refusing rather than pretending', () => {
  it('names the variable to set when no endpoint is configured', async () => {
    const m = httpModel({ endpoint: '' })
    await expect(m.generate(req())).rejects.toThrow(/VITE_TUTOR_ENDPOINT/)
  })

  it('never returns an empty answer when the response has no choices', async () => {
    /* THE FAILURE THAT WOULD BE INVISIBLE. An empty string reaches verification
       and is checked as though it were an answer. Throwing routes it to the
       loop's degraded path, which says out loud that it failed. */
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    const m = httpModel({ endpoint: 'http://localhost:11434/v1/chat/completions', fetchImpl })
    await expect(m.generate(req())).rejects.toThrow(/no message content/i)
  })

  it('carries the status and a body snippet when the server refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('model not found', { status: 404 }))
    const m = httpModel({ endpoint: 'http://localhost:11434/v1/chat/completions', fetchImpl })
    await expect(m.generate(req())).rejects.toThrow(/404.*model not found/s)
  })

  it('reports a transport failure in words a reader can act on', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const m = httpModel({ endpoint: 'http://localhost:11434/v1/chat/completions', fetchImpl })
    await expect(m.generate(req())).rejects.toThrow(/Failed to fetch|unreachable/i)
  })
})

describe('the request it actually sends', () => {
  it('posts an OpenAI-shaped body to the configured endpoint', async () => {
    const fetchImpl = ok('The discriminant is b squared minus four a c.')
    const m = httpModel({ endpoint: 'http://localhost:1234/v1/chat/completions', model: 'qwen2.5', fetchImpl })
    const out = await m.generate(req())

    expect(out).toBe('The discriminant is b squared minus four a c.')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:1234/v1/chat/completions')
    const body = JSON.parse(String(init.body)) as { model: string; messages: { role: string; content: string }[] }
    expect(body.model).toBe('qwen2.5')
    expect(body.messages.map((x) => x.role)).toEqual(['system', 'user'])
  })

  it('sends no Authorization header unless a key was given', async () => {
    const fetchImpl = ok('x')
    await httpModel({ endpoint: 'http://localhost:1234/v1/chat/completions', fetchImpl }).generate(req())
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain('Authorization')
  })

  it('sends one when it was, to a local model', async () => {
    const fetchImpl = ok('x')
    await httpModel({ endpoint: 'http://localhost:1234/v1/chat/completions', apiKey: 'sk-local', fetchImpl }).generate(req())
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-local')
  })

  /*
   * THE GUARD CAUGHT MY OWN TEST FIRST.
   *
   * This block was originally one case pointed at `http://x/`, which is not a
   * local host, carrying a key. It failed, and the refusal was correct: the
   * test was wrong, not the code. Keeping both halves so the rule is stated by
   * behaviour and not only by the comment at the top of the module.
   */
  it('REFUSES to put a key in a request to a host that is not local', async () => {
    const fetchImpl = ok('x')
    const m = httpModel({ endpoint: 'https://api.example.com/v1/chat/completions', apiKey: 'sk-live-real', fetchImpl })
    await expect(m.generate(req())).rejects.toThrow(/refusing to send an API key/i)
    expect(fetchImpl, 'the key must not reach the network even once').not.toHaveBeenCalled()
  })

  it('allows a keyless request to a remote host, because nothing is leaked', async () => {
    /* The refusal is about the KEY, not about the host. A proxy that holds the
       credential server-side is the supported hosted setup, and it needs no
       key from the browser at all. */
    const fetchImpl = ok('x')
    await httpModel({ endpoint: 'https://my-proxy.example.com/tutor', fetchImpl }).generate(req())
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each(['http://localhost:11434/v1/chat/completions', 'http://127.0.0.1:1234/v1', 'http://my-box.local/v1'])(
    'treats %s as local', async (endpoint) => {
      const fetchImpl = ok('x')
      await httpModel({ endpoint, apiKey: 'placeholder', fetchImpl }).generate(req())
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )
})

describe('the prompt carries what the loop already decided', () => {
  const promptOf = async (r: GenerateRequest): Promise<string> => {
    const fetchImpl = ok('x')
    await httpModel({ endpoint: 'http://x/v1/chat/completions', fetchImpl }).generate(r)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as { messages: { content: string }[] }
    return body.messages.map((m) => m.content).join('\n')
  }

  it('states the goal, the constraints and the depth', async () => {
    const p = await promptOf(req())
    expect(p).toContain('explain the discriminant')
    expect(p).toContain('under 100 words')
    expect(p).toContain('standard')
  })

  it('passes the claims through as the ONLY permitted grounding', async () => {
    /* The loop gathers claims and verifies the answer against them. If the
       prompt does not carry them, the model answers from its own weights and
       verification then checks an answer nobody grounded. */
    const p = await promptOf(req())
    expect(p).toContain('b^2 - 4ac decides how many real roots exist')
    expect(p).toMatch(/do not invent|only.*claims|nothing beyond/i)
  })

  it('names what to define and what to leave out', async () => {
    const p = await promptOf(req())
    expect(p).toContain('discriminant')
    expect(p).toContain('complex roots')
  })

  it('turns a repair pass into an instruction rather than a re-roll', async () => {
    const p = await promptOf(req({ mustFix: ['the answer cited nothing', 'over the word limit'] }))
    expect(p).toContain('the answer cited nothing')
    expect(p).toContain('over the word limit')
  })

  it('says when there are no claims, rather than silently omitting the section', async () => {
    /* An absent section reads to the model as "no constraint on sourcing".
       Saying "no sources were found" is what makes an ungrounded answer the
       model's refusal rather than its invention. */
    const p = await promptOf(req({ claims: [] }))
    expect(p).toMatch(/no (verified )?claims|no sources/i)
  })
})

describe('it does not hang forever', () => {
  it('gives up after the timeout and says so', async () => {
    const fetchImpl = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    }))
    const m = httpModel({ endpoint: 'http://x/v1/chat/completions', timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(m.generate(req())).rejects.toThrow(/timed out|abort/i)
  })
})
