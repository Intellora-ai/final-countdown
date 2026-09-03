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
 * S9-M1 -- THE SHELF ANSWERS THE SHAPE SHE ASKED FOR, NOT JUST THE SUBJECT.
 *
 * THE DEFECT, MEASURED (`baseline.test.tsx`, row 9): with one TEACH lesson on
 * the shelf for a subject, "define gas pressure", "what is gas pressure",
 * "why does gas pressure rise with temperature", "gas pressure vs
 * atmospheric pressure", "give me an example", "quiz me" -- six asks of five
 * different shapes -- were ALL answered with that same full lesson, and no
 * model ever saw the new demand. Six of six. The owner's own complaint,
 * "the model is considering everything as a lecture", reached by the fast
 * path: `lessons.ts` keys the shelf by subject alone, so the reading
 * `intent.ts` makes and the reading the model reports (`asked`) are both
 * thrown away the moment the subject is found.
 *
 * THE LAW. A lesson on the shelf carries the shape it was written in. It is
 * served only to an ask of that shape. An ask of another shape goes to the
 * writer, exactly as a subject with nothing on the shelf does. "explain X"
 * after "explain X" is still one row and no model -- S2's guarantee -- and
 * `/api/lesson`, which asks for the whole concept, still finds it.
 *
 * WHY THE WRITER HERE REFUSES. These laws are about the decision to reach
 * for the shelf, not about what the writer writes. A `chat` port that throws
 * makes the two outcomes unmistakable: a 200 carrying the shelf's route is
 * the shelf; anything else is the writer having been asked.
 */

const A_TEST_SECRET = 'intent-shape-secret-not-used-anywhere-real'
const RECIPE = 'intent-shape-recipe'
const SUBJECT = 'gas-pressure'
const TEACH_ROUTE = 'teach-route'
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

function theLesson() {
  const result = validateLesson(gasPressure)
  if (!result.ok) throw new Error(`the gas-pressure reference does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

interface Server {
  readonly calls: { decide: number; chat: number }
  /** A lesson on the shelf, written in the given shape. */
  keep(asked: 'teach' | 'define' | 'why' | 'compare' | 'example' | 'practice', route: string): void
  learn(context: string, said: string): void
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
    chat: async () => { calls.chat += 1; throw new Error('the writer refuses here; being asked is what these laws measure') },
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
    keep: (asked, route) => { lessons.keep(SUBJECT, { route, lesson: theLesson(), at: new Date().toISOString(), asked }) },
    learn: (context, said) => { aliases.learn(context, said, SUBJECT, new Date().toISOString()) },
    reset: () => { calls.decide = 0; calls.chat = 0 },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-intent-shape-'))
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

const servedTheShelf = (reply: { status: number; body: Record<string, unknown> }, route: string) => reply.status === 200 && reply.body['route'] === route

describe('LAW S9-M1 -- a lesson on the shelf is served only to an ask of its own shape', () => {
  it.each([
    ['define gas pressure', 'define'],
    ['what is gas pressure', 'define'],
    ['why does gas pressure rise with temperature', 'why'],
    ['gas pressure vs atmospheric pressure', 'compare'],
    ['give me an example of gas pressure', 'example'],
    ['quiz me on gas pressure', 'practice'],
  ])('"%s" (%s) is NOT answered with the TEACH lesson on the shelf -- the writer is asked', async (said) => {
    server.keep('teach', TEACH_ROUTE)
    /* The memo already decided this phrasing means the subject -- the state
       every repeat phrasing is in. That is what made the defect a fast one. */
    server.learn('ask', said)
    const reply = await ask(said)
    expect(servedTheShelf(reply, TEACH_ROUTE), `the shelf's teach lesson was served for a ${said} ask`).toBe(false)
    expect(server.calls.chat, 'the writer was never asked, so nothing could have answered in the right shape').toBeGreaterThanOrEqual(1)
  })

  it('"explain gas pressure" IS answered with the TEACH lesson on the shelf: one row, no model', async () => {
    server.keep('teach', TEACH_ROUTE)
    server.learn('ask', 'explain gas pressure')
    const reply = await ask('explain gas pressure')
    expect(servedTheShelf(reply, TEACH_ROUTE)).toBe(true)
    expect(server.calls).toEqual({ decide: 0, chat: 0 })
  })

  it('a DEFINE lesson on the shelf answers a define ask, and not an explain ask', async () => {
    server.keep('define', 'define-route')
    server.learn('ask', 'what is gas pressure')
    server.learn('ask', 'explain gas pressure')
    const defined = await ask('what is gas pressure')
    expect(servedTheShelf(defined, 'define-route'), 'the define lesson on the shelf was not served for a define ask').toBe(true)
    expect(server.calls).toEqual({ decide: 0, chat: 0 })

    server.reset()
    const explained = await ask('explain gas pressure')
    expect(servedTheShelf(explained, 'define-route'), 'a define lesson was served as a whole explanation').toBe(false)
    expect(server.calls.chat).toBeGreaterThanOrEqual(1)
  })

  it('through the controller, too: a new define phrasing of a shelved TEACH subject reaches the writer, not the shelf', async () => {
    server.keep('teach', TEACH_ROUTE)
    /* No memo for this phrasing: the controller names the subject, and the
       second shelf lookup (`handler.ts` ~L1113) must ask for the shape. */
    /* Reads as `define` by the rules (`intent.test.ts`: "define X"); nothing
       memoed for it, so the controller names the subject first. */
    const reply = await ask('define gas pressure for me')
    expect(server.calls.decide).toBe(1)
    expect(servedTheShelf(reply, TEACH_ROUTE), 'the controller path served the teach lesson for a define ask').toBe(false)
    expect(server.calls.chat).toBeGreaterThanOrEqual(1)
  })

  it('/api/lesson asks for the whole concept, so a TEACH lesson on the shelf still answers it', async () => {
    server.keep('teach', TEACH_ROUTE)
    server.learn('lesson', SUBJECT)
    const res = await fetch('/api/lesson', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ concept: SUBJECT }) })
    const body = (await res.json()) as Record<string, unknown>
    expect(res.status).toBe(200)
    expect(body['route']).toBe(TEACH_ROUTE)
    expect(server.calls).toEqual({ decide: 0, chat: 0 })
  })

  it('a lesson filed before shapes existed reads as TEACH, never as nothing', async () => {
    /* Rows written by the old code carry no `asked`. They were all written as
       whole lessons, so that is what they are. */
    server.keep(undefined as unknown as 'teach', TEACH_ROUTE)
    server.learn('ask', 'explain gas pressure')
    server.learn('ask', 'define gas pressure')
    expect(servedTheShelf(await ask('explain gas pressure'), TEACH_ROUTE)).toBe(true)
    expect(servedTheShelf(await ask('define gas pressure'), TEACH_ROUTE)).toBe(false)
  })
})
