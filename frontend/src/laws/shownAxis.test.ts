// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import { gasPressure } from '../canvas/lessons/gasPressure'
import { readTheShown, type Shown } from '../canvas/teach/intent'

/**
 * S9-M2 -- WHAT SHE ASKED TO SEE, READ EVERY TIME, BY THE SAME MECHANISM AS
 * WHAT SHE ASKED FOR.
 *
 * THE GAP, VERIFIED BY GREP. The seven readings (`intent.ts` `Ask`) say what
 * kind of answer she wants; nothing anywhere reads what she asked to SEE.
 * "graph how pressure changes with temperature", "animate it", "in 3D", "as
 * a timeline", "put them side by side" -- the only "show me" pattern was
 * "show me an example". So the demand was invisible to the rules, never put
 * to the model, and never checked on the way back.
 *
 * THE MECHANISM IS THE ONE ALREADY BUILT FOR `asked`. The rules give a free
 * hint (`readTheShown`); the model is shown the closed list inside the one
 * authoring call and reports `"shown"` beside `"asked"`; `conceptIssues`
 * refuses a word outside the list and refuses a reply that claims a kind it
 * did not draw. No second model call. The reply carries both words so the
 * canvas -- and a person reading a live log -- can see what was read.
 *
 * WHY THE WRITER HERE IS A STUB THAT RETURNS THE GAS-PRESSURE REFERENCE. These
 * laws are about the reading, the prompt, the gate and the reply -- not about
 * whether a model can draw. The reference lesson is the one document in the
 * repository known to pass every rule, so what it returns is judged only on
 * the new axis.
 */

const A_TEST_SECRET = 'shown-axis-secret-not-used-anywhere-real'
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

/** The reference lesson, as the concept the writer is asked for, with the two words on it. */
function aConceptReply(asked: string, shown: string): string {
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
  /** The system prompt the writer was last handed. */
  readonly lastSystem: () => string
  /** The user turn the writer was last handed -- on a repair, the gate's own words. */
  readonly lastUser: () => string
  /** What the writer will say. */
  reply(asked: string, shown: string): void
}

let server: Server
let closeStore: () => void
let scratch = ''

function startServer(path: string): Server {
  const store = sqliteMemoryStore(path)
  closeStore = () => store.close()
  const calls = { decide: 0, chat: 0 }
  let says = aConceptReply('teach', 'none')
  let lastSystem = ''
  let lastUser = ''
  const model: ModelPort = {
    lesson: async () => { throw new Error('no law here asks for a whole lesson') },
    decide: async () => { calls.decide += 1; return NAMES_THE_SUBJECT },
    chat: async (system: string, user: string) => { calls.chat += 1; lastSystem = system; lastUser = user; return says },
  }
  const handle = createHandler({
    model,
    search,
    memory: canvasMemory({ store, log: () => {} }),
    identitySecret: A_TEST_SECRET,
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
    lastSystem: () => lastSystem,
    lastUser: () => lastUser,
    reply: (asked, shown) => { says = aConceptReply(asked, shown) },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-shown-axis-'))
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

describe('LAW S9-M2a -- the rules read what she asked to see, for free', () => {
  it.each<[string, Shown]>([
    ['graph how pressure changes with temperature', 'graph'],
    ['plot pressure against temperature', 'graph'],
    ['animate how the particles move when it heats up', 'animation'],
    ['show me in 3D how the planets orbit the sun', '3d'],
    ['show the french revolution as a timeline', 'timeline'],
    ['put mitosis and meiosis side by side in a table', 'table'],
    ['give me the formula for pressure and temperature', 'equation'],
    ['simulate what happens when i change the mass on a spring', 'simulation'],
    ['draw a diagram of the water cycle', 'diagram'],
    ['what is osmosis', 'none'],
    ['explain photosynthesis', 'none'],
  ])('"%s" -> %s', (said, shown) => {
    expect(readTheShown(said)).toBe(shown)
  })
})

describe('LAW S9-M2b -- the model is asked, inside the one call, and its answer comes back', () => {
  it('the writer is told the closed list and the hint; the reply carries asked and shown; one call', async () => {
    server.reply('teach', 'graph')
    const { status, body } = await ask('graph how pressure changes with temperature')
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(server.lastSystem(), 'the writer was never told what she asked to see').toMatch(/"shown"/)
    expect(server.lastSystem(), 'the rules hint (graph) was not offered to the writer').toMatch(/graph/)
    expect(body['asked'], 'the reply does not say what shape it read').toBe('teach')
    expect(body['shown'], 'the reply does not say what it showed').toBe('graph')
    const kinds = ((body['lesson'] as { blocks: { kind: string }[] }).blocks).map((b) => b.kind)
    expect(kinds, 'a graph was reported and none was drawn').toContain('chart')
    expect(server.calls, 'reading what she asked to see must cost no extra call').toEqual({ decide: 1, chat: 1 })
  })

  it('the model may decline: shown "none" is a real answer', async () => {
    server.reply('teach', 'none')
    const { status, body } = await ask('graph how pressure changes with temperature')
    expect(status).toBe(200)
    expect(body['shown']).toBe('none')
  })
})

/*
 * WHAT "HELD TO ITS WORD" MEANS HERE, AND WHY IT IS NOT A NON-200.
 *
 * The first draft of these laws expected a refusal to reach the learner as a
 * failed request. It does not, by design that predates this axis: a draft the
 * gate refuses is given one repair turn, and if that fails its sound blocks
 * are SALVAGED and served `partial: true` -- "a failed write must not cost
 * her the lesson" (`handler.ts`). So the promise the gate can make is this:
 * the writer is told, in the gate's own words, what it claimed and did not
 * draw; and what is finally served never carries that false claim.
 */
describe('LAW S9-M2c -- the gate holds the model to its word', () => {
  it('a kind claimed and not drawn: the writer is told so on its repair turn, and what is served never claims it', async () => {
    /* The reference has charts, tables, equations, a flow and a simulation --
       and no figure. "diagram" is a figure. */
    server.reply('teach', 'diagram')
    const { status, body } = await ask('draw a diagram of gas pressure')
    expect(server.calls.chat, 'the writer gets exactly one repair turn').toBe(2)
    expect(server.lastUser(), 'the repair turn did not name the claim the gate refused').toMatch(/shown.*diagram|figure/i)
    expect(status, 'her lesson must still reach her').toBe(200)
    expect(body['shown'], 'the served reply claims a diagram it does not contain').not.toBe('diagram')
  })

  it('a word outside the list: the writer is told, and the served reply carries no such word', async () => {
    server.reply('teach', 'hologram')
    const { status, body } = await ask('show me gas pressure')
    expect(server.calls.chat).toBe(2)
    expect(server.lastUser()).toMatch(/hologram/)
    expect(status).toBe(200)
    expect(body['shown']).toBeUndefined()
  })
})
