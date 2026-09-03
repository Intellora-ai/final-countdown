// @vitest-environment jsdom
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { subjectAliases } from '../../server/memory/aliases.ts'
import { writtenLessons } from '../../server/memory/lessons.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import { appendToCanvas, readCanvas } from '../canvas/api/memoryClient'
import { gasPressure } from '../canvas/lessons/gasPressure'
import { validateLesson } from '../canvas/spec/validate'
import { readTheAsk } from '../canvas/teach/intent'
import { TeachView } from '../canvas/teach/TeachView'

/**
 * S0 -- BASELINE REALITY, measured before anything is changed.
 *
 * WHY THIS FILE EXISTS. The plan's completion bar is BEFORE -> CHANGE -> AFTER
 * -> COMPARE. "Tests green" says nothing about how much faster the product
 * got, or whether a student was still handed a lecture for "define X". These
 * are the numbers every later slice is compared against, written to
 * `data/baseline.json` and printed, so they can be walked back to a run.
 *
 * WHAT IS MEASURED HERE, AND WHAT IS NOT. Everything that needs no live model
 * is measured in-process: real handler, a real SQLite FILE, the real browser
 * client, the real `TeachView`. The rows that need a model writing lessons
 * (refusal rate, representation requests, intent match on Hinglish and typos)
 * cannot be measured by a stub without measuring the stub, so they run
 * separately against the real server through a launch entry. This file says
 * which rows it left empty rather than filling them with a guess.
 *
 * THE ASSERTIONS ARE INVARIANTS, NOT THE NUMBERS. A shelf hit that calls the
 * model is a broken shelf, whatever the milliseconds say; a first paint wider
 * than one beat breaks the promise `beats.ts` makes. Those fail this file. The
 * numbers themselves are recorded, never asserted -- a baseline that fails
 * when reality is slow has stopped being a baseline.
 */

const A_TEST_SECRET = 'baseline-secret-not-used-anywhere-real'
const RECIPE = 'baseline-recipe'
const SUBJECT = 'gas-pressure'
const TEACH_ROUTE = 'baseline-route'
/* A phrasing that asks for the WHOLE explanation. "why does…" reads as a chain
   of reasons (`intent.ts`), and since S9-M1 a whole lesson on the shelf does
   not answer that -- so this row measures the shape the shelf lesson has. */
const THE_PHRASING = 'explain how temperature and pressure are linked in a gas'

const search: SearchPort = { search: async () => [] }

/* The vendor key names `provider.ts` reads. Only WHETHER each is set is
   recorded -- never a value, never a prefix. */
const VENDOR_KEYS = ['GEMINI_API_KEY', 'MOONSHOT_API_KEY', 'ZAI_API_KEY', 'MISTRAL_API_KEY', 'GROQ_API_KEY', 'NVIDIA_API_KEY', 'DEEPSEEK_API_KEY'] as const

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

/* One server, with the SHELF wired -- the laws harness leaves `lessons` and
   `aliases` out, so it never exercises the fast path this baseline is about. */
interface Server {
  readonly modelCalls: { chat: number; lesson: number }
  readonly lastBodyBytes: () => number
  keepOnShelf(concept: string): void
  learnPhrasing(context: string, said: string, subject: string): void
}

let server: Server
let closeStore: () => void
let scratch = ''
const baseline: Record<string, unknown> = {}

function startServer(path: string): Server {
  const store = sqliteMemoryStore(path)
  closeStore = () => store.close()
  const modelCalls = { chat: 0, lesson: 0 }
  const model: ModelPort = {
    lesson: async () => { modelCalls.lesson += 1; throw new Error('baseline: no lesson is authored here') },
    chat: async () => { modelCalls.chat += 1; throw new Error('baseline: the model must not be called on a shelf hit') },
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
  let lastBytes = 0
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://canvas.test')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    const res = await handle({
      method,
      path: url.pathname,
      query: url.search.replace(/^\?/, ''),
      ...(cookie === '' ? {} : { cookie }),
      ...(body === undefined ? {} : { body }),
    })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    lastBytes = JSON.stringify(res.body).length
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response
  }))

  return {
    modelCalls,
    lastBodyBytes: () => lastBytes,
    keepOnShelf: (concept) => { lessons.keep(concept, { route: TEACH_ROUTE, lesson: theLesson(), at: new Date().toISOString() }) },
    learnPhrasing: (context, said, subject) => { aliases.learn(context, said, subject, new Date().toISOString()) },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-baseline-'))
  server = startServer(join(scratch, 'canvas-memory.db'))
})
afterEach(() => {
  cleanup()
  closeStore()
  vi.unstubAllGlobals()
  rmSync(scratch, { recursive: true, force: true })
})

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown>; ms: number }> {
  const t0 = performance.now()
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const parsed = (await res.json()) as Record<string, unknown>
  return { status: res.status, body: parsed, ms: performance.now() - t0 }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

describe('S0 -- baseline reality, measured before any change', () => {
  it('row 1: /api/ask on a phrasing already decided is a shelf hit, and calls no model', async () => {
    server.keepOnShelf(SUBJECT)
    server.learnPhrasing('ask', THE_PHRASING, SUBJECT)
    const runs: number[] = []
    for (let n = 0; n < 5; n += 1) {
      const { status, body, ms } = await post('/api/ask', { question: THE_PHRASING, topicId: SUBJECT, classId: '10' })
      expect(status, JSON.stringify(body).slice(0, 200)).toBe(200)
      expect(body['lesson'], 'a shelf hit answers with the lesson on the shelf').toBeDefined()
      runs.push(ms)
    }
    expect(server.modelCalls.chat, 'a shelf hit must not call the model').toBe(0)
    baseline['ask_shelf_hit_ms_median'] = median(runs)
    baseline['ask_shelf_hit_model_calls'] = server.modelCalls.chat
  })

  it('row 2: /api/lesson on a concept already on the shelf is a shelf hit, and calls no model', async () => {
    server.keepOnShelf(SUBJECT)
    server.learnPhrasing('lesson', SUBJECT, SUBJECT)
    const runs: number[] = []
    for (let n = 0; n < 5; n += 1) {
      const { status, body, ms } = await post('/api/lesson', { concept: SUBJECT })
      expect(status, JSON.stringify(body).slice(0, 200)).toBe(200)
      expect(body['lesson']).toBeDefined()
      runs.push(ms)
    }
    expect(server.modelCalls.chat, 'a shelf hit must not call the model').toBe(0)
    baseline['lesson_shelf_hit_ms_median'] = median(runs)
    baseline['lesson_shelf_hit_model_calls'] = server.modelCalls.chat
  })

  it('row 3: a canvas of 200 artifacts is re-sent whole on the second read', async () => {
    for (let n = 1; n <= 200; n += 1) {
      const saved = await appendToCanvas('baseline-topic', { kind: 'lesson', question: `question ${n}`, payload: { id: `l${n}`, blocks: [] }, teaching: 'lesson' })
      if (!saved.ok) throw new Error(`append ${n} failed: ${saved.reason}`)
    }
    const first = await readCanvas('baseline-topic')
    if (!first.ok) throw new Error(first.reason)
    const firstBytes = server.lastBodyBytes()
    const second = await readCanvas('baseline-topic')
    if (!second.ok) throw new Error(second.reason)
    const secondBytes = server.lastBodyBytes()
    expect(second.artifacts).toHaveLength(200)
    baseline['canvas_200_artifacts_first_read_bytes'] = firstBytes
    baseline['canvas_200_artifacts_second_read_bytes'] = secondBytes
    baseline['canvas_200_artifacts_second_read_rows'] = second.artifacts.length
  })

  it('row 4: the first paint of the gas-pressure reference shows one beat, not the lesson', async () => {
    const lesson = theLesson()
    const view = render(<TeachView lesson={lesson} mode="2d" />)
    await settle()
    const shown = view.container.querySelectorAll('section.lc-block').length
    expect(shown, 'nothing rendered -- the view did not mount').toBeGreaterThan(0)
    expect(shown, 'the first paint must be at most one beat (MAX_BLOCKS_PER_BEAT = 5)').toBeLessThanOrEqual(5)
    expect(shown, 'the whole lesson arrived at once').toBeLessThan(lesson.blocks.length)
    baseline['first_paint_blocks'] = shown
    baseline['lesson_total_blocks'] = lesson.blocks.length
  })

  it('row 7: which vendors this process could fail over to (names only)', () => {
    const set = VENDOR_KEYS.filter((name) => typeof process.env[name] === 'string' && process.env[name] !== '')
    baseline['vendors_configured_count'] = set.length
    baseline['vendors_configured_names'] = set
    baseline['ollama_model_configured'] = typeof process.env['OLLAMA_MODEL'] === 'string' && process.env['OLLAMA_MODEL'] !== ''
    expect(Array.isArray(set)).toBe(true)
  })

  it('row 9: a define / why / compare / example / practice ask on a subject with only a TEACH lesson on the shelf', async () => {
    server.keepOnShelf(SUBJECT)
    const phrasings = [
      'define gas pressure',
      'what is gas pressure',
      'why does gas pressure rise with temperature',
      'gas pressure vs atmospheric pressure',
      'give me an example of gas pressure',
      'quiz me on gas pressure',
    ]
    let servedTheTeachLesson = 0
    const record: { said: string; ask: string; status: number; servedShelfLesson: boolean; writerAsked: boolean }[] = []
    for (const said of phrasings) {
      /* What the alias memo holds after the controller once decided this
         phrasing means the subject -- which is what it does today. */
      server.learnPhrasing('ask', said, SUBJECT)
      const before = server.modelCalls.chat
      const { status, body } = await post('/api/ask', { question: said, topicId: SUBJECT, classId: '10' })
      /* MEASURED, NOT ASSERTED: before S9-M1 every one of these was a 200
         carrying the teach lesson and no model call; after it the shelf
         declines the shape and the writer is asked -- which this stub refuses,
         so the status is whatever a refusal is. Both are recorded. */
      const fromShelf = status === 200 && body['route'] === TEACH_ROUTE
      if (fromShelf) servedTheTeachLesson += 1
      record.push({ said, ask: readTheAsk(said).ask, status, servedShelfLesson: fromShelf, writerAsked: server.modelCalls.chat > before })
    }
    baseline['non_teach_asks_served_the_teach_lesson'] = servedTheTeachLesson
    baseline['non_teach_asks_total'] = phrasings.length
    baseline['non_teach_asks_detail'] = record
  })

  it('writes the baseline where a person and the harness can read it', () => {
    baseline['measured_at'] = new Date().toISOString()
    baseline['not_measured_here'] = [
      'fresh topics refused after 2 attempts per 20 (needs a live model; launch entry)',
      'requests naming 3D / animation / graph refused per 20 (needs a live model; launch entry)',
      'asked+shown match on 20 real strings incl. Hinglish/typos (needs a live model; launch entry)',
    ]
    /* `frontend/data/`, as a RELATIVE path: vitest runs from the frontend
       root, Node resolves it against the working directory, and neither
       `process.cwd` nor `path.resolve` is in this project's type shims. Under
       jsdom `import.meta.url` is not a file: URL, so that is out too. */
    const dir = 'data'
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'baseline.json'), JSON.stringify(baseline, null, 2))
    console.log(`[baseline] ${JSON.stringify(baseline)}`)
    expect(Object.keys(baseline).length).toBeGreaterThan(5)
  })
})
