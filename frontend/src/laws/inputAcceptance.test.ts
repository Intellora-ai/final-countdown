// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import { gasPressure } from '../canvas/lessons/gasPressure'
import { SHOWNS, readTheShown } from '../canvas/teach/intent'

/**
 * S8 -- A REQUEST THAT NAMES A REPRESENTATION IS TAUGHT, NEVER REFUSED.
 *
 * THE PRINCIPLE (the owner's): the semantic request survives the
 * implementation. "Show me a 3D simulation of X" is a request to understand
 * X; if 3D cannot be shown, X is still taught and the best available thing is
 * shown, silently. What must never happen is the words "3D", "animate",
 * "graph", "timeline", "table" turning a question into a refusal, a
 * clarification, or a dead end.
 *
 * WHAT THIS PINS IN-PROCESS. The controller here names the subject, as the
 * live one does for a sentence that names one; the writer returns the
 * reference lesson. So the law is about the ROUTE: every phrasing below
 * reaches the writer with what she asked to see, comes back 200 with a
 * lesson, and reports a `shown` from the closed list. The live controller's
 * own reading of these sentences is measured by `scripts/baseline-live.mjs`.
 */

const A_TEST_SECRET = 'input-acceptance-secret-not-used-anywhere-real'
const SUBJECT = 'gas-pressure'
const search: SearchPort = { search: async () => [] }
const NAMES_THE_SUBJECT = JSON.stringify({ action: 'START_LESSON', target: SUBJECT, reason: 'she named the subject', sourceNeeded: false })

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

/** The writer answers with the reference, reporting the hint it was given as
    what it showed -- or "none" where the reference has no such block. */
function theWriterFor(hint: string): string {
  const drawn: Record<string, boolean> = { graph: true, table: true, equation: true, simulation: true, animation: true, '3d': true, timeline: true, diagram: false, none: true }
  return JSON.stringify({
    id: gasPressure.id,
    question: gasPressure.question,
    technicalTerms: gasPressure.technicalTerms,
    blocks: gasPressure.blocks,
    relations: gasPressure.relations,
    checkpoint: 'What happens to the pressure if the container is cooled instead?',
    next: [],
    asked: 'teach',
    shown: drawn[hint] ? hint : 'none',
  })
}

let closeStore: () => void
let scratch = ''
let lastSystem = ''
const calls = { decide: 0, chat: 0 }

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-input-acceptance-'))
  const store = sqliteMemoryStore(join(scratch, 'canvas-memory.db'))
  closeStore = () => store.close()
  calls.decide = 0
  calls.chat = 0
  const model: ModelPort = {
    lesson: async () => { throw new Error('no law here asks for a whole lesson') },
    decide: async () => { calls.decide += 1; return NAMES_THE_SUBJECT },
    chat: async (system: string, user: string) => {
      calls.chat += 1
      lastSystem = system
      /* The hint the writer was given is in its own prompt. */
      const hint = /The patterns read her words as: (\w+)/.exec(system)?.[1] ?? 'none'
      return theWriterFor(user.includes('was refused') ? 'none' : hint)
    },
  }
  const handle = createHandler({ model, search, memory: canvasMemory({ store, log: () => {} }), identitySecret: A_TEST_SECRET })
  let cookie = ''
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://canvas.test')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    const res = await handle({ method: init?.method ?? 'GET', path: url.pathname, query: url.search.replace(/^\?/, ''), ...(cookie === '' ? {} : { cookie }), ...(body === undefined ? {} : { body }) })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response
  }))
})
afterEach(() => {
  closeStore()
  vi.unstubAllGlobals()
  rmSync(scratch, { recursive: true, force: true })
})

async function ask(question: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, classId: '10' }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const WANTING = [
  'show me a 3D simulation of how gas pressure rises with temperature',
  'animate how gas particles move when it heats up',
  'make a graph of how gas pressure changes with temperature',
  'draw a diagram of gas pressure in a container',
  'show gas pressure as a timeline of what happens as it warms',
  'put gas pressure and atmospheric pressure side by side in a table',
  'give me the formula that links gas pressure and temperature',
  'simulate what happens to gas pressure when i change the temperature',
  'show me in 3D how the particles hit the walls',
  'i want to see it move, the gas getting hotter',
]

describe('LAW S8 -- naming what she wants to see never costs her the lesson', () => {
  it.each(WANTING)('"%s" is taught, and what she asked to see reaches the writer', async (said) => {
    const { status, body } = await ask(said)
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(body['lesson'], 'no lesson came back -- a representation word became a refusal').toBeDefined()
    expect(body['clarify'], 'she was asked to clarify instead of being taught').toBeUndefined()
    const hint = readTheShown(said)
    expect(hint, 'the rules read nothing from a sentence that plainly names what to show').not.toBe('none')
    expect(lastSystem, 'the writer was not told what she asked to see').toContain(`read her words as: ${hint}`)
    expect(SHOWNS as readonly string[], 'the reply reports a word outside the list').toContain(String(body['shown'] ?? 'none'))
    expect(calls, 'reading what she wants to see must not add a model call').toEqual({ decide: 1, chat: 1 })
  })

  it('a diagram the reference cannot draw is still a lesson, reported honestly as none', async () => {
    const { status, body } = await ask('draw a diagram of gas pressure in a container')
    expect(status).toBe(200)
    expect(body['shown']).toBe('none')
  })
})
