/*
 * THE TUTOR'S MODEL PORT THAT HOLDS NO CREDENTIAL.
 *
 * WHAT WAS WRONG. `TutorView` built its model with
 * `httpModel({ endpoint: VITE_TUTOR_ENDPOINT, apiKey: VITE_TUTOR_KEY })`, and
 * every `VITE_*` value is compiled into the JavaScript a browser downloads.
 * `VITE_TUTOR_KEY` was therefore a PUBLISHED credential: readable by anyone who
 * opened the bundle, and repairable only by rotating it.
 *
 * WHAT REPLACES IT. `backendModel` posts to this project's own server, which
 * already holds the key (`server/provider.ts` reads `ANTHROPIC_API_KEY` from
 * the process environment, `server/index.ts` lists it in the scrub set). The
 * browser sends a question and receives a lesson. It never sends a key because
 * it never has one.
 *
 * WHY THE TESTS LIVE UNDER `src/tutor/`. The port is the tutor's, and this
 * directory is the one these changes own. The port itself is `backendModel.ts`
 * beside this file; the two helpers it leans on -- `buildPrompt` and
 * `escapeHatchKey` -- live in `src/agent/ports/httpModel.ts`, and the escape
 * hatch is tested here because the tutor is where it is configured.
 *
 * WHAT THESE ASSERT, AND WHY EACH ONE EARNS ITS PLACE.
 *   - the request carries no credential, by three independent readings
 *   - it goes to OUR origin, never to a model provider
 *   - the claims the loop gathered survive the trip, because verification
 *     downstream grades the answer against them
 *   - a refusal is a refusal: never an empty string dressed as an answer
 */
import { describe, expect, it, vi } from 'vitest'

import { backendModel, ASK_PATH } from './backendModel'
import { escapeHatchKey, PUBLIC_ENV_WARNING } from '../agent/ports/httpModel'
import type { GenerateRequest } from '../agent/kernel/loop'

/** A key that must never appear in anything this port sends. */
const PUBLISHED_KEY = 'sk-ant-THIS-MUST-NEVER-REACH-THE-WIRE'

/**
 * An environment as hostile as a real `.env` file gets: a provider endpoint
 * AND a key, both in `VITE_*` variables, both therefore public.
 */
const LEAKY_ENV: Record<string, string | undefined> = {
  VITE_TUTOR_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
  VITE_TUTOR_MODEL: 'gpt-4o',
  VITE_TUTOR_KEY: PUBLISHED_KEY,
}

/** A request with the fields the port actually reads. */
function req(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    understanding: {
      goal: 'explain the discriminant',
      intent: { kind: 'explanation', confidence: 0.9, because: 'asked to explain' },
      entities: [],
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
    claims: [
      {
        statement: 'b^2 - 4ac decides how many real roots exist',
        sources: [{ kind: 'file', ref: 'curriculum' }],
        confidence: 1,
      },
    ],
    working: { objective: 'explain the discriminant', constraints: [], entities: [], facts: [], decisions: [] },
    capabilities: ['knowledge'],
    computed: {},
    ...over,
  } as unknown as GenerateRequest
}

interface Sent {
  url: string
  init: RequestInit
}

/** A fetch double that records exactly what was handed to it. */
function recorder(status: number, payload: unknown): {
  fetchImpl: typeof fetch
  sent: Sent[]
} {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return new Response(JSON.stringify(payload), { status })
  }) as unknown as typeof fetch
  return { fetchImpl, sent }
}

/** A lesson shaped exactly as `POST /api/ask` returns one. */
const LESSON = {
  lesson: {
    id: 'discriminant',
    question: 'explain the discriminant',
    blocks: [
      { id: 'b1', kind: 'prose', body: 'The discriminant is the part under the square root.' },
      { id: 'b2', kind: 'callout', title: 'Watch the sign', body: 'A negative discriminant means no real roots.' },
    ],
    relations: [],
    technicalTerms: [],
  },
}

describe('no credential can reach the wire', () => {
  it('sends no Authorization header, even when VITE_TUTOR_KEY is set', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({ fetchImpl, env: LEAKY_ENV }).generate(req())

    const headers = (sent[0]?.init.headers ?? {}) as Record<string, string>
    const names = Object.keys(headers).map((k) => k.toLowerCase())
    expect(names).toEqual(['content-type'])
  })

  it('puts the key nowhere else in the request either', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({ fetchImpl, env: LEAKY_ENV }).generate(req())

    /* URL, headers and body together. A header check alone would pass a port
       that put the key in a query string, which is worse: query strings are
       written to every proxy log on the way. */
    const everything = `${sent[0]?.url} ${JSON.stringify(sent[0]?.init.headers)} ${String(sent[0]?.init.body)}`
    expect(everything).not.toContain(PUBLISHED_KEY)
    expect(everything).not.toContain('sk-ant-')
  })

  it('goes to our own backend and never to the provider named in VITE_TUTOR_ENDPOINT', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({ fetchImpl, env: LEAKY_ENV }).generate(req())

    expect(sent[0]?.url).toBe('/api/ask')
    expect(ASK_PATH).toBe('/api/ask')
  })

  it('follows VITE_API_BASE when the backend is on another origin', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({
      fetchImpl,
      env: { ...LEAKY_ENV, VITE_API_BASE: 'https://almanac.example.test/' },
    }).generate(req())

    expect(sent[0]?.url).toBe('https://almanac.example.test/api/ask')
  })
})

describe('the request it actually sends', () => {
  it('posts the question as JSON, the one field /api/ask reads', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({ fetchImpl, env: {} }).generate(req())

    expect(sent[0]?.init.method).toBe('POST')
    const body = JSON.parse(String(sent[0]?.init.body)) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['question'])
    expect(String(body['question'])).toContain('explain the discriminant')
  })

  it('carries the claims the loop gathered, because verification grades the answer against them', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({ fetchImpl, env: {} }).generate(req())

    const body = JSON.parse(String(sent[0]?.init.body)) as { question: string }
    expect(body.question).toContain('b^2 - 4ac decides how many real roots exist')
    expect(body.question).toContain('under 100 words')
  })

  it('turns a repair pass into an instruction rather than a re-roll', async () => {
    const { fetchImpl, sent } = recorder(200, LESSON)
    await backendModel({ fetchImpl, env: {} }).generate(req({ mustFix: ['cited nothing'] }))

    const body = JSON.parse(String(sent[0]?.init.body)) as { question: string }
    expect(body.question).toContain('cited nothing')
  })
})

describe('what it makes of the answer', () => {
  it('returns the lesson prose, title and body, in the order the server wrote them', async () => {
    const { fetchImpl } = recorder(200, LESSON)
    const answer = await backendModel({ fetchImpl, env: {} }).generate(req())

    expect(answer).toBe(
      'The discriminant is the part under the square root.\n\n'
      + 'Watch the sign\nA negative discriminant means no real roots.',
    )
  })

  it('refuses a 200 whose lesson carries no readable text, rather than answering with nothing', async () => {
    const { fetchImpl } = recorder(200, {
      lesson: { id: 'x', question: 'q', blocks: [{ id: 'b1', kind: 'chart' }], relations: [], technicalTerms: [] },
    })
    await expect(backendModel({ fetchImpl, env: {} }).generate(req())).rejects.toThrow(
      /no readable text/i,
    )
  })

  it('refuses a 200 that carries no lesson at all', async () => {
    const { fetchImpl } = recorder(200, { ok: true })
    await expect(backendModel({ fetchImpl, env: {} }).generate(req())).rejects.toThrow(
      /did not return a lesson/i,
    )
  })

  it('reports the backend refusal, with its status and its own words', async () => {
    const { fetchImpl } = recorder(502, { error: 'the model could not be reached' })
    await expect(backendModel({ fetchImpl, env: {} }).generate(req())).rejects.toThrow(
      /502.*the model could not be reached/,
    )
  })

  it('names the timeout when the backend does not answer in time', async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })) as unknown as typeof fetch

    await expect(
      backendModel({ fetchImpl, env: {}, timeoutMs: 5 }).generate(req()),
    ).rejects.toThrow(/did not answer within 5ms/)
  })

  it('says the backend is unreachable, and names it, when the fetch fails outright', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    await expect(backendModel({ fetchImpl, env: {} }).generate(req())).rejects.toThrow(
      /\/api\/ask is unreachable \(ECONNREFUSED\)/,
    )
  })
})

describe('the escape hatch key, if anyone still sets one', () => {
  it('warns that a VITE_ value is public, naming the variable', async () => {
    const warn = vi.fn()
    escapeHatchKey({ VITE_TUTOR_KEY: PUBLISHED_KEY }, warn)

    expect(warn).toHaveBeenCalledWith(PUBLIC_ENV_WARNING)
    expect(PUBLIC_ENV_WARNING).toContain('VITE_TUTOR_KEY')
    expect(PUBLIC_ENV_WARNING).toContain('bundle')
  })

  it('never prints the key it is warning about', async () => {
    const warn = vi.fn()
    escapeHatchKey({ VITE_TUTOR_KEY: PUBLISHED_KEY }, warn)

    expect(warn.mock.calls.flat().join(' ')).not.toContain(PUBLISHED_KEY)
  })

  it('still hands the value back, so a local runner that wants one keeps working', async () => {
    expect(escapeHatchKey({ VITE_TUTOR_KEY: 'ollama-placeholder' }, vi.fn())).toBe('ollama-placeholder')
  })

  it('is silent, and undefined, when nobody set one', async () => {
    const warn = vi.fn()
    expect(escapeHatchKey({}, warn)).toBeUndefined()
    expect(escapeHatchKey({ VITE_TUTOR_KEY: '   ' }, warn)).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})
