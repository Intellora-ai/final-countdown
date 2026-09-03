// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { failover, type Standby } from '../../server/failover.ts'
import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { standbysFor } from '../../server/index.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'
import type { Model } from '../../server/model.ts'

import { gasPressure } from '../canvas/lessons/gasPressure'

/**
 * S6 -- THE MODEL IS NEVER ABSENT: WHEN ONE VENDOR SAYS NO, THE NEXT ONE
 * WRITES THE LESSON, INSIDE THE SAME REQUEST.
 *
 * `failover.ts` was built after a measured afternoon in which Groq's daily
 * budget ran out ("Used 198032, Requested 2950") and every lesson failed,
 * because `chooseProvider` picked the first vendor with a key and stopped.
 * `index.ts:454-459` hands the handler `failover(standbys)`. Nothing proved
 * the promise at the boundary the student meets: a POST to `/api/ask` while
 * vendor A is spent. These laws do, with vendors that are stubs and a request
 * path that is real.
 *
 * THE DISTINCTION THE LAWS KEEP. A vendor that is unavailable TO US -- budget
 * spent, key rejected, host down -- is worth asking somebody else about. A
 * request that is WRONG is refused by every vendor for the same reason, so it
 * is refused once, fast, and never turned into four slow refusals.
 * (`worthAskingAnother` reads the message `groq.ts` builds -- ours, not the
 * vendor's prose.)
 *
 * THE DECISION IS NOT UNDER TEST. `failover()`'s model has no `decide`, so the
 * handler would route the controller's decision through `chat` too. A `decide`
 * that never fails is added beside it, so what these laws count is the
 * AUTHORING call and nothing else -- which is where the budget goes.
 */

const A_TEST_SECRET = 'failover-secret-not-used-anywhere-real'
const SUBJECT = 'gas-pressure'
const search: SearchPort = { search: async () => [] }
const NAMES_THE_SUBJECT = JSON.stringify({ action: 'START_LESSON', target: SUBJECT, reason: 'she named the subject', sourceNeeded: false })

/* The messages `groq.ts` builds, and `failover.ts` reads. */
const BUDGET_SPENT = 'the model could not be reached (429 tokens/rate_limit_exceeded): the token budget is spent'
const KEY_REJECTED = 'the model could not be reached (401 invalid_api_key)'
const OUR_REQUEST_IS_WRONG = 'the model could not be reached (400 model_not_found)'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (name: string) => map.get(name) ?? null,
    setItem: (name: string, value: string) => { map.set(name, String(value)) },
    removeItem: (name: string) => { map.delete(name) },
    clear: () => { map.clear() },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  } as Storage
}

function aConcept(): string {
  return JSON.stringify({
    id: gasPressure.id,
    question: gasPressure.question,
    technicalTerms: gasPressure.technicalTerms,
    blocks: gasPressure.blocks,
    relations: gasPressure.relations,
    checkpoint: 'What happens to the pressure if the container is cooled instead?',
    next: [],
    asked: 'teach',
    shown: 'none',
  })
}

interface Vendor {
  readonly name: string
  readonly asked: number
  readonly standby: Standby
}

/** A vendor that refuses every authoring call with this message. */
function aVendorThatSays(name: string, message: string): Vendor {
  const v = { name, asked: 0 } as { name: string; asked: number; standby: Standby }
  const model: Model = {
    lesson: async () => { v.asked += 1; throw new Error(message) },
    chat: async () => { v.asked += 1; throw new Error(message) },
  }
  v.standby = { vendor: name, model }
  return v
}

/** A vendor that writes the reference lesson. */
function aVendorThatWrites(name: string): Vendor {
  const v = { name, asked: 0 } as { name: string; asked: number; standby: Standby }
  const model: Model = {
    lesson: async () => { v.asked += 1; return {} },
    chat: async () => { v.asked += 1; return aConcept() },
  }
  v.standby = { vendor: name, model }
  return v
}

let closeStore: () => void
let scratch = ''

function startServer(path: string, vendors: readonly Vendor[]): void {
  const store = sqliteMemoryStore(path)
  closeStore = () => store.close()
  /* The chain the product builds, with a decision port that never fails so
     only authoring is under test. */
  const chain = failover(vendors.map((v) => v.standby))
  const model: ModelPort = { ...(chain as unknown as ModelPort), decide: async () => NAMES_THE_SUBJECT }
  const handle = createHandler({ model, search, memory: canvasMemory({ store, log: () => {} }), identitySecret: A_TEST_SECRET })
  let cookie = ''
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://canvas.test')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    const res = await handle({ method: init?.method ?? 'GET', path: url.pathname, query: url.search.replace(/^\?/, ''), ...(cookie === '' ? {} : { cookie }), ...(body === undefined ? {} : { body }) })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response
  }))
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-failover-'))
})
afterEach(() => {
  closeStore()
  vi.unstubAllGlobals()
  rmSync(scratch, { recursive: true, force: true })
})

async function ask(question: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, topicId: SUBJECT, classId: '10' }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('LAW S6 -- when one vendor says no, the next one writes the lesson, in the same request', () => {
  it.each([
    ['its budget is spent', BUDGET_SPENT],
    ['it rejected the key', KEY_REJECTED],
  ])('vendor A says %s: vendor B authors, she gets a 200, nobody waits for a second request', async (_why, message) => {
    const a = aVendorThatSays('groq', message)
    const b = aVendorThatWrites('moonshot')
    startServer(join(scratch, 'canvas-memory.db'), [a, b])
    const { status, body } = await ask('explain gas pressure')
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(body['lesson']).toBeDefined()
    expect(a.asked, 'A was never even tried -- the configured order was not honoured').toBeGreaterThanOrEqual(1)
    expect(b.asked, 'B never wrote anything').toBeGreaterThanOrEqual(1)
  })

  it('the local model, configured last, is the last resort behind a spent hosted vendor', async () => {
    const hosted = aVendorThatSays('groq', BUDGET_SPENT)
    const local = aVendorThatWrites('ollama (qwen3:8b)')
    startServer(join(scratch, 'canvas-memory.db'), [hosted, local])
    const { status } = await ask('explain gas pressure')
    expect(status).toBe(200)
    expect(local.asked).toBeGreaterThanOrEqual(1)
  })

  it('a request that is WRONG is refused once, and vendor B is never asked to repeat the mistake', async () => {
    const a = aVendorThatSays('groq', OUR_REQUEST_IS_WRONG)
    const b = aVendorThatWrites('moonshot')
    startServer(join(scratch, 'canvas-memory.db'), [a, b])
    const { status, body } = await ask('explain gas pressure')
    expect(status, 'a wrong request was not refused').not.toBe(200)
    expect(String(body['error'] ?? '')).toMatch(/could not be reached/)
    expect(b.asked, 'B was asked to repeat a request A already showed was wrong').toBe(0)
  })

  it('the chain the product builds puts every hosted vendor before the local one, so a laptop model is the last resort and never the first', () => {
    startServer(join(scratch, 'canvas-memory.db'), [aVendorThatWrites('unused')])
    const hosted = [
      { vendor: 'groq', apiKey: 'not-a-real-key', model: 'm', baseUrl: 'http://127.0.0.1:1/v1', keyVar: 'GROQ_API_KEY', conceptTokens: 800 },
      { vendor: 'moonshot', apiKey: 'not-a-real-key', model: 'm', baseUrl: 'http://127.0.0.1:1/v1', keyVar: 'MOONSHOT_API_KEY', conceptTokens: 800 },
    ]
    const chain = standbysFor(hosted as never, 'qwen3:8b', undefined)
    expect(chain.map((s) => s.vendor)).toEqual(['groq', 'moonshot', 'ollama (qwen3:8b)'])
    /* And with no local model configured, nothing is silently substituted:
       the chain is exactly the hosted vendors. */
    expect(standbysFor(hosted as never, undefined, undefined).map((s) => s.vendor)).toEqual(['groq', 'moonshot'])
  })

  it('with nobody behind it, a spent vendor is an honest refusal, never an empty 200', async () => {
    const only = aVendorThatSays('groq', BUDGET_SPENT)
    startServer(join(scratch, 'canvas-memory.db'), [only])
    const { status, body } = await ask('explain gas pressure')
    expect(status).not.toBe(200)
    expect(String(body['error'] ?? '')).toMatch(/rate_limit|budget/)
  })
})
