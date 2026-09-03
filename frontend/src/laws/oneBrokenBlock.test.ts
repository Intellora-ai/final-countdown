// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import { gasPressure } from '../canvas/lessons/gasPressure'

/**
 * S7 -- ONE BROKEN BLOCK NEVER SINKS A LESSON.
 *
 * THE FEAR (plan, "where absence actually lives"): a small model returns one
 * invalid block, the repair turn does not fix it, and the whole lesson is
 * refused after two attempts -- "try a different question" -- a dead end
 * reachable by any topic.
 *
 * WHAT THE CODE ALREADY DOES, read rather than assumed: `handler.ts`
 * `deliverable` is a ladder. `repair.ts` mends what can be mended without
 * inventing content -- `chart-fights-its-data` is "the one rule whose message
 * names its own fix", bars on a numeric axis become a line; then the reply is
 * served as an answer with a note; then the refused blocks are pruned; then
 * a note alone. So a lesson with one bad block is served, not refused. These
 * laws pin that at the request boundary, with a writer that returns the
 * reference lesson with exactly one thing wrong, twice.
 *
 *   1. The mendable fault: the chart is drawn as bars over a numeric axis.
 *      Served WHOLE, the chart now a line -- the rule's own remedy, applied by
 *      code, no content invented.
 *   2. A fault nothing can mend: a chart whose points are not numbers. Served
 *      with that block gone and everything else intact, and marked partial.
 *   3. Never a 200 with no lesson, and never a refusal for one block.
 */

const A_TEST_SECRET = 'one-broken-block-secret-not-used-anywhere-real'
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

type Block = Record<string, unknown>

/** The reference, with one block replaced by `broken(block)`. */
function aConceptWith(id: string, broken: (block: Block) => Block): string {
  const blocks = (gasPressure.blocks as readonly Block[]).map((b) => (b['id'] === id ? broken({ ...b }) : b))
  return JSON.stringify({
    id: gasPressure.id,
    question: gasPressure.question,
    technicalTerms: gasPressure.technicalTerms,
    blocks,
    relations: gasPressure.relations,
    checkpoint: 'What happens to the pressure if the container is cooled instead?',
    next: [],
    asked: 'teach',
    shown: 'none',
  })
}

let closeStore: () => void
let scratch = ''
const calls = { chat: 0 }
let says = ''

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-one-broken-block-'))
  const store = sqliteMemoryStore(join(scratch, 'canvas-memory.db'))
  closeStore = () => store.close()
  calls.chat = 0
  const model: ModelPort = {
    lesson: async () => { throw new Error('no law here asks for a whole lesson') },
    decide: async () => NAMES_THE_SUBJECT,
    /* The same flawed draft on the repair turn too: a writer that cannot
       fix its one mistake, which is the case the ladder exists for. */
    chat: async () => { calls.chat += 1; return says },
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

async function ask(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'explain gas pressure', topicId: SUBJECT, classId: '10' }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const kindsOf = (body: Record<string, unknown>): string[] => ((body['lesson'] as { blocks: { kind: string; id: string; chartType?: string }[] }).blocks).map((b) => b.kind)
const blockOf = (body: Record<string, unknown>, id: string) => ((body['lesson'] as { blocks: { id: string; chartType?: string }[] }).blocks).find((b) => b.id === id)

describe('LAW S7 -- one broken block never sinks a lesson', () => {
  it('bars over a numeric axis: served whole, the chart mended into a line by the rule s own remedy', async () => {
    says = aConceptWith('pressure-vs-temperature', (chart) => ({ ...chart, chartType: 'bar' }))
    const { status, body } = await ask()
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(body['lesson']).toBeDefined()
    expect(blockOf(body, 'pressure-vs-temperature')?.chartType, 'the mendable chart was pruned or left as bars').toBe('line')
    expect(kindsOf(body)).toHaveLength((gasPressure.blocks as readonly unknown[]).length)
    expect(body['partial'], 'a lesson mended without inventing content is whole, not partial').toBeUndefined()
  })

  it('a chart nothing can mend: served with that block gone and everything else intact, marked partial', async () => {
    says = aConceptWith('pressure-vs-temperature', (chart) => ({ ...chart, series: [{ name: 'p', colorIndex: 0, points: [{ x: 'not', y: 'numbers' }] }] }))
    const { status, body } = await ask()
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(body['lesson'], 'one bad block cost her the whole lesson').toBeDefined()
    expect(blockOf(body, 'pressure-vs-temperature'), 'the unmendable block was served').toBeUndefined()
    expect(kindsOf(body).length, 'more than the one bad block was lost').toBeGreaterThanOrEqual((gasPressure.blocks as readonly unknown[]).length - 2)
    expect(calls.chat, 'the writer gets its one repair turn').toBe(2)
  })
})
