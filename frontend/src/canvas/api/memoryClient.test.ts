// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appendToCanvas, bringForwardTheOldCanvas, browserId, readCanvas, readProgress, writeProgress } from './memoryClient'

/**
 * THE BROWSER FINALLY CALLS /api/memory.
 *
 * The server side -- key, record ceiling, monotonic progress, sqlite -- was
 * built, tested and exposed, and no browser code ever called it. This is the
 * caller. It reads on open, writes after every change, and never throws:
 * a memory that cannot be reached is a memory that is not there, and the
 * lesson goes on from the local copy.
 *
 * WHICH `tabId`. The server keys a memory by student, tab and lesson. A
 * per-tab id would mean closing the tab loses the topic's memory -- the
 * opposite of what was asked for -- so the id is per BROWSER, kept in
 * localStorage, stable across reloads and tabs. (Decided 2026-09-02.)
 */

let calls: { url: string; init?: RequestInit }[] = []
let answer: () => Response | Promise<Response>

function json(status: number, body: unknown): Response {
  return { ok: status < 300, status, json: async () => body } as unknown as Response
}

/* This environment ships NO `window.localStorage` -- `TeachView.test.tsx`
   records the same finding and defines one. A Map-backed Storage, replaced
   before every test, so an id minted in one test cannot leak into the next. */
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

beforeEach(() => {
  calls = []
  answer = () => json(200, { record: null })
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), ...(init === undefined ? {} : { init }) })
    return answer()
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const saved = { lessonId: 'photosynthesis', revealed: 2, asked: [], draft: '', questionsAsked: 1, emptyAnswers: 0, struggleReported: false }

describe('the browser id', () => {
  it('is minted once and kept, so two visits are one memory', () => {
    const first = browserId()
    expect(first).toMatch(/^[0-9a-f]{16,}$/)
    expect(browserId()).toBe(first)
    expect(window.localStorage.getItem('canvas-browser-id')).toBe(first)
  })
})

describe('reading', () => {
  it('asks the server for THIS lesson under THIS browser, and hands the record back', async () => {
    answer = () => json(200, { record: saved })
    expect(await readProgress('photosynthesis')).toEqual(saved)
    const url = new URL(calls[0]!.url, 'http://x')
    expect(url.pathname).toBe('/api/memory')
    expect(url.searchParams.get('lessonId')).toBe('photosynthesis')
    expect(url.searchParams.get('tabId')).toBe(browserId())
  })

  it('answers null for a lesson the server has never seen', async () => {
    answer = () => json(200, { record: null })
    expect(await readProgress('never')).toBeNull()
  })

  it('answers null, never throws, when memory is off or the network is down', async () => {
    answer = () => json(503, { error: 'memory is not configured on this server' })
    expect(await readProgress('x')).toBeNull()
    answer = () => { throw new TypeError('fetch failed') }
    expect(await readProgress('x')).toBeNull()
  })

  it('refuses a record that is not for the lesson asked about', async () => {
    answer = () => json(200, { record: { ...saved, lessonId: 'other' } })
    expect(await readProgress('photosynthesis')).toBeNull()
  })
})

describe('writing', () => {
  it('PUTs the progress under this browser and lesson', async () => {
    answer = () => json(200, { saved: true })
    await writeProgress(saved)
    const put = calls[0]!
    expect(put.url).toBe('/api/memory')
    expect(put.init?.method).toBe('PUT')
    expect(JSON.parse(String(put.init?.body))).toEqual({ tabId: browserId(), lessonId: 'photosynthesis', record: saved })
  })

  it('never throws when the write is refused or the network is down', async () => {
    answer = () => json(409, { error: 'progress cannot go backwards' })
    await expect(writeProgress(saved)).resolves.toBeUndefined()
    answer = () => { throw new TypeError('fetch failed') }
    await expect(writeProgress(saved)).resolves.toBeUndefined()
  })
})

describe('lessons stored under the old whole-canvas record', () => {
  /* NOBODY LOSES A LESSON TO THIS CHANGE. Before Stage H a topic's canvas was
     one record at `<topic>#canvas` holding an array of entries. Those exist on
     real machines right now. On the first open after the change they are moved
     forward into artifacts, in their original order, and the old record is
     LEFT WHERE IT IS -- deleting it would be the one thing the whole stage
     exists to prevent, and it costs nothing to keep. */
  const old = {
    entries: [
      { question: 'q1', lesson: { id: 'l1' }, teaching: 'lesson' },
      { question: 'q2', lesson: { id: 'l2' }, teaching: 'answer' },
    ],
  }

  it('moves them forward, in order, on the first open', async () => {
    const appended: unknown[] = []
    answer = () => json(200, {})
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/canvas?')) return json(200, { artifacts: [] })
      if (url.startsWith('/api/memory?')) return json(200, { record: old })
      if (url === '/api/canvas') {
        appended.push((JSON.parse(String(init?.body)) as { artifact: unknown }).artifact)
        return json(200, { appended: { seq: appended.length, createdAt: 'now', artifact: {} } })
      }
      throw new Error(`unexpected ${url}`)
    }))

    const moved = await bringForwardTheOldCanvas('snakes')
    expect(moved).toBe(2)
    expect(appended).toEqual([
      { kind: 'lesson', question: 'q1', payload: { id: 'l1' }, teaching: 'lesson' },
      { kind: 'lesson', question: 'q2', payload: { id: 'l2' }, teaching: 'answer' },
    ])
  })

  it('never deletes or rewrites the old record', async () => {
    const writes: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (method !== 'GET') writes.push(`${method} ${url}`)
      if (url.startsWith('/api/canvas?')) return json(200, { artifacts: [] })
      if (url.startsWith('/api/memory?')) return json(200, { record: old })
      if (url === '/api/canvas') return json(200, { appended: { seq: 1, createdAt: 'now', artifact: {} } })
      throw new Error(`unexpected ${url}`)
    }))

    await bringForwardTheOldCanvas('snakes')
    expect(writes.filter((line) => line.includes('/api/memory'))).toEqual([])
  })

  it('does nothing at all when there is no old record', async () => {
    const writes: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') !== 'GET') writes.push(url)
      if (url.startsWith('/api/memory?')) return json(200, { record: null })
      return json(200, { artifacts: [] })
    }))
    expect(await bringForwardTheOldCanvas('snakes')).toBe(0)
    expect(writes).toEqual([])
  })

  it('moves nothing when the old record cannot be read, rather than guessing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    expect(await bringForwardTheOldCanvas('snakes')).toBe(0)
  })
})

describe("a topic's canvas -- everything learned on it, in order", () => {
  /* WHAT THESE TWO CASES USED TO ASSERT, AND WHY THAT CHANGED.
   *
   * They pinned a whole-array PUT to `/api/memory` and, in the second, that a
   * read which FAILED came back as `[]` -- "empty, never broken". Both were
   * requirements once and both were measured as defects: a canvas replaced
   * whole is a canvas any save can destroy, and an outage that reads as an
   * empty canvas is an outage that erases a term of work on the next question.
   *
   * The requirement is now stated in `src/laws/canvasDurability.test.ts` and
   * these follow it. This is not a test being loosened to match the code; the
   * new assertions are strictly stronger, and the laws hold the end-to-end
   * proof against a real server and a real database. */
  const anArtifact = { seq: 1, createdAt: '2026-09-03T00:00:00.000Z', artifact: { kind: 'lesson', question: 'q1', payload: { id: 'l1' }, teaching: 'lesson' } }

  it('is read from and appended to <topic>#canvas', async () => {
    answer = () => json(200, { artifacts: [anArtifact] })
    const read = await readCanvas('snakes')
    expect(read).toEqual({
      ok: true,
      questioned: [],
      artifacts: [{ seq: 1, createdAt: '2026-09-03T00:00:00.000Z', kind: 'lesson', question: 'q1', payload: { id: 'l1' }, teaching: 'lesson' }],
    })
    expect(new URL(calls[0]!.url, 'http://x').searchParams.get('lessonId')).toBe('snakes#canvas')

    calls = []
    answer = () => json(200, { appended: { seq: 2, createdAt: 'now', artifact: {} } })
    const saved = await appendToCanvas('snakes', { kind: 'lesson', question: 'q2', payload: { id: 'l2' }, teaching: 'lesson' })
    expect(saved).toEqual({ ok: true, seq: 2 })
    expect(calls[0]!.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      tabId: browserId(),
      lessonId: 'snakes#canvas',
      artifact: { kind: 'lesson', question: 'q2', payload: { id: 'l2' }, teaching: 'lesson' },
    })
  })

  it('tells an empty canvas apart from one it could not read', async () => {
    answer = () => json(200, { artifacts: [] })
    expect(await readCanvas('snakes')).toEqual({ ok: true, artifacts: [], questioned: [] })

    answer = () => { throw new TypeError('fetch failed') }
    const broken = await readCanvas('snakes')
    expect(broken.ok).toBe(false)

    answer = () => json(503, { error: 'restarting' })
    expect((await readCanvas('snakes')).ok).toBe(false)
  })

  it('reports a save that did not happen instead of swallowing it', async () => {
    /* The shipped `writeCanvas` never read `response.status`. Past the old
       256 KB ceiling every save failed, forever, and nothing said so. */
    answer = () => json(400, { error: 'this is 300000 bytes and the limit is 262144' })
    const refused = await appendToCanvas('snakes', { kind: 'lesson', question: 'q', payload: {}, teaching: 'lesson' })
    expect(refused.ok).toBe(false)

    answer = () => { throw new TypeError('fetch failed') }
    expect((await appendToCanvas('snakes', { kind: 'lesson', question: 'q', payload: {}, teaching: 'lesson' })).ok).toBe(false)
  })

  it('keeps an artifact whose kind it does not recognise', async () => {
    /* From a newer build, or from a feature this one has not learnt yet. It is
       still her work. Dropping it here would be the silent deletion Law C
       forbids, one layer above the store that makes deletion impossible. */
    answer = () => json(200, { artifacts: [{ seq: 7, createdAt: 'then', artifact: { kind: 'hologram', question: 'q7', payload: { id: 'l7' } } }] })
    const read = await readCanvas('snakes')
    expect(read.ok).toBe(true)
    if (!read.ok) throw new Error('unreachable')
    expect(read.artifacts).toHaveLength(1)
    expect(read.artifacts[0]!.question).toBe('q7')
  })
})
