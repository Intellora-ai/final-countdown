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
import { readTheAsk } from '../canvas/teach/intent'

/**
 * S9-M3 -- THE MODEL'S READING IS REMEMBERED, SO THE FAST PATH CARRIES IT.
 *
 * THE GAP. After M1 the shelf serves a lesson only to an ask of its own shape,
 * and after M2 the model reports what it read (`asked`, `shown`) inside the
 * one authoring call. But on the FAST path -- a phrasing the memo already
 * holds -- no model runs, so the shape asked of the shelf is the rules'
 * guess, which "got five of eight real student strings wrong" (`intent.ts`).
 * The model's better reading was made once and thrown away.
 *
 * THE LAW. `aliases.ts` memoes what a phrasing was decided to MEAN. It now
 * also memoes what the model read it as WANTING, made in the same decision,
 * under the same key, on the same condition. A second learner typing the same
 * words is served the shape the model chose -- one row, no model -- not the
 * shape a regex guessed. A memo of a decision the model already made is not a
 * second decision-maker (`aliases.ts`'s own rule).
 *
 * THE CASE. "why does gas pressure rise with temperature" reads as `why` by
 * the rules. The writer, shown the menu, reads it as wanting the whole
 * explanation and reports `asked: "teach"`. That is the lesson filed. The
 * next learner asking the same words must get it from the shelf.
 */

const A_TEST_SECRET = 'memo-reading-secret-not-used-anywhere-real'
const RECIPE = 'memo-reading-recipe'
const SUBJECT = 'gas-pressure'
const THE_PHRASING = 'why does gas pressure rise with temperature'
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

function theWriterSays(asked: string, shown: string): string {
  return JSON.stringify({
    id: gasPressure.id,
    question: gasPressure.question,
    technicalTerms: gasPressure.technicalTerms,
    blocks: gasPressure.blocks,
    relations: gasPressure.relations,
    checkpoint: 'What happens to the pressure if the container is cooled instead?',
    next: [],
    asked,
    shown,
  })
}

interface Server {
  readonly calls: { decide: number; chat: number }
  /** The next student sits down: the cookie goes, the store stays. */
  nextStudent(): void
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
    decide: async () => { calls.decide += 1; return NAMES_THE_SUBJECT },
    chat: async () => { calls.chat += 1; return theWriterSays('teach', 'graph') },
  }
  const handle = createHandler({
    model,
    search,
    memory: canvasMemory({ store, log: () => {} }),
    identitySecret: A_TEST_SECRET,
    lessons: writtenLessons(store, RECIPE),
    aliases: subjectAliases(store, RECIPE),
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
    nextStudent: () => { cookie = '' },
    reset: () => { calls.decide = 0; calls.chat = 0 },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-memo-reading-'))
  server = startServer(join(scratch, 'canvas-memory.db'))
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

describe('LAW S9-M3 -- the shape the model read is the shape the fast path serves', () => {
  it('the rules and the model disagree about this phrasing', () => {
    expect(readTheAsk(THE_PHRASING).ask).toBe('why')
  })

  it('the next student typing the same words gets the lesson the model wrote for them: one row, no model', async () => {
    const first = await ask(THE_PHRASING)
    expect(first.status, JSON.stringify(first.body).slice(0, 300)).toBe(200)
    expect(first.body['asked'], 'the writer reported reading it as the whole explanation').toBe('teach')
    expect(server.calls).toEqual({ decide: 1, chat: 1 })
    const route = first.body['route']

    server.nextStudent()
    server.reset()
    const second = await ask(THE_PHRASING)
    expect(second.status).toBe(200)
    expect(second.body['route'], 'the second student was not given the lesson on the shelf').toBe(route)
    expect(server.calls, 'the memo did not carry the model s reading, so the shelf was asked for the regex s shape and missed').toEqual({ decide: 0, chat: 0 })
    expect(second.body['asked'], 'a shelf reply must say the shape it is, as an authored one does').toBe('teach')
  })

  it('what she asked to see travels with it', async () => {
    await ask(THE_PHRASING)
    server.nextStudent()
    server.reset()
    const second = await ask(THE_PHRASING)
    expect(second.body['shown'], 'the memo dropped what the model said it showed').toBe('graph')
    expect(server.calls).toEqual({ decide: 0, chat: 0 })
  })
})
