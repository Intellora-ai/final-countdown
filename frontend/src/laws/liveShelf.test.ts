// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { subjectAliases } from '../../server/memory/aliases.ts'
import { writtenLessons } from '../../server/memory/lessons.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import { gasPressure } from '../canvas/lessons/gasPressure'
import { validateLesson } from '../canvas/spec/validate'

/**
 * S2 -- WHAT A SHELF HIT COSTS ON THE LIVE PATH, PINNED.
 *
 * `baseline.test.tsx` measured the case everyone hoped for: a phrasing the
 * alias memo already holds is a 0.14 ms shelf hit with no model call, on both
 * routes. The design comments in `handler.ts` (~L1095-1115) promise a second
 * case: a NEW phrasing of a subject already on the shelf costs exactly ONE
 * small decision call -- the controller naming the subject -- and never the
 * authoring call, and the memo then makes the same phrasing free next time.
 *
 * Nothing pinned that promise. These laws do, with a model port that counts
 * what it was asked and refuses to author anything, so an authoring call on a
 * shelf hit is a failing law and not a slow afternoon.
 *
 *   1. A memoed phrasing: no decision, no authoring.        (0 + 0)
 *   2. A new phrasing of a shelved subject: one decision.   (1 + 0)
 *   3. The same phrasing again: the memo learned it.        (0 + 0)
 *   4. A subject with nothing on the shelf: decision, then
 *      the writer -- the only path that may call `chat`.    (1 + >=1)
 *
 * Both routes, because `handler.ts:540-542` records this file's history of a
 * fix reaching one of them and silently not the other.
 */

const A_TEST_SECRET = 'live-shelf-secret-not-used-anywhere-real'
const RECIPE = 'live-shelf-recipe'
const SUBJECT = 'gas-pressure'
const search: SearchPort = { search: async () => [] }

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

function theLesson() {
  const result = validateLesson(gasPressure)
  if (!result.ok) throw new Error(`the gas-pressure reference does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

/** The controller's own reply shape (`controller.ts decisionFrom`): the
    subject named, so the shelf can be asked for it. */
const NAMES_THE_SUBJECT = JSON.stringify({ action: 'START_LESSON', target: SUBJECT, reason: 'she named the subject', sourceNeeded: false })

interface Server {
  readonly calls: { decide: number; chat: number }
  keepOnShelf(): void
  learnPhrasing(context: string, said: string): void
  reset(): void
}

let server: Server
let closeStore: () => void
let scratch = ''

function startServer(path: string): Server {
  const store = sqliteMemoryStore(path)
  closeStore = () => store.close()
  const calls = { decide: 0, chat: 0 }
  const model: ModelPort = {
    lesson: async () => { throw new Error('no law here asks for a whole lesson') },
    /* THE DECISION PORT names the subject and nothing else. */
    decide: async () => { calls.decide += 1; return NAMES_THE_SUBJECT },
    /* THE AUTHORING PORT is counted and refused: a law that reaches it on a
       shelf hit has found the defect it exists for. */
    chat: async () => { calls.chat += 1; throw new Error('the writer was asked to write on a shelf hit') },
  }
  const lessons = writtenLessons(store, RECIPE)
  const aliases = subjectAliases(store, RECIPE)
  const handle = createHandler({
    model,
    search,
    memory: canvasMemory({ store, log: () => {} }),
    identitySecret: A_TEST_SECRET,
    lessons,
    aliases,
  })
  let cookie = ''
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://canvas.test')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    const res = await handle({
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: url.search.replace(/^\?/, ''),
      ...(cookie === '' ? {} : { cookie }),
      ...(body === undefined ? {} : { body }),
    })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response
  }))
  return {
    calls,
    keepOnShelf: () => { lessons.keep(SUBJECT, { route: 'shelf-route', lesson: theLesson(), at: new Date().toISOString() }) },
    learnPhrasing: (context, said) => { aliases.learn(context, said, SUBJECT, new Date().toISOString()) },
    reset: () => { calls.decide = 0; calls.chat = 0 },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-live-shelf-'))
  server = startServer(join(scratch, 'canvas-memory.db'))
})
afterEach(() => {
  closeStore()
  vi.unstubAllGlobals()
  rmSync(scratch, { recursive: true, force: true })
})

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const ROUTES = [
  { name: '/api/ask', context: 'ask', request: (said: string) => post('/api/ask', { question: said, topicId: SUBJECT, classId: '10' }) },
  { name: '/api/lesson', context: 'lesson', request: (said: string) => post('/api/lesson', { concept: said }) },
] as const

describe.each(ROUTES)('LAW S2 on $name -- what reaching the shelf costs', (route) => {
  it('a phrasing the memo holds: no decision, no authoring', async () => {
    server.keepOnShelf()
    server.learnPhrasing(route.context, 'why does a hot gas push harder')
    const { status, body } = await route.request('why does a hot gas push harder')
    expect(status, JSON.stringify(body).slice(0, 200)).toBe(200)
    expect(body['lesson']).toBeDefined()
    expect(server.calls).toEqual({ decide: 0, chat: 0 })
  })

  it('a new phrasing of a shelved subject: one decision, no authoring -- and the next time is free', async () => {
    server.keepOnShelf()
    const first = await route.request('what makes the pressure in a sealed can go up when it warms')
    expect(first.status, JSON.stringify(first.body).slice(0, 200)).toBe(200)
    expect(first.body['lesson'], 'the shelf lesson was not served').toBeDefined()
    expect(server.calls, 'a shelf hit through the controller costs exactly one decision and never the writer').toEqual({ decide: 1, chat: 0 })

    server.reset()
    const again = await route.request('what makes the pressure in a sealed can go up when it warms')
    expect(again.status).toBe(200)
    expect(server.calls, 'the memo did not learn the phrasing, so she paid the decision twice').toEqual({ decide: 0, chat: 0 })
  })

  it('a subject with nothing on the shelf: the decision, then the writer', async () => {
    /* Nothing kept. The controller still names the subject; the shelf is
       empty; the writer is the only thing left, and it is asked. */
    const { status } = await route.request('why does a hot gas push harder')
    expect(server.calls.decide).toBe(1)
    expect(server.calls.chat, 'nothing on the shelf and the writer was never asked').toBeGreaterThanOrEqual(1)
    /* The writer here refuses, so the reply is a refusal -- and a refusal is
       not a 200 wearing an empty lesson. */
    expect(status).not.toBe(200)
  })
})
