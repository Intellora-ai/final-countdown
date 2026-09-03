// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { evidenceIn } from '../../server/memory/evidence.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import { appendToCanvas, CANVAS_CACHE_KEY, readCanvas, type NewArtifact } from '../canvas/api/memoryClient'

/**
 * S1 -- A LONG CANVAS IS NOT RE-SENT WHOLE ON EVERY OPEN.
 *
 * THE MEASUREMENT THIS ANSWERS. `baseline.test.tsx`: a topic with 200
 * artifacts is 32,113 bytes, and the second read is 32,113 bytes again. The
 * store could already answer "everything after seq N" (`sqliteStore.list(key,
 * after)`); nothing above it asked. And the client reads a topic once per
 * open, so the only read that can be made cheaper is the NEXT open -- which
 * means the client has to keep what it already merged, and ask for the rest.
 *
 * WHAT THESE LAWS PROTECT, IN ORDER OF WHAT WOULD BE WORST TO BREAK:
 *
 *   1. A shared school computer. A cache keyed by topic alone would hand
 *      student B the canvas student A left in this browser. The server names
 *      the student with an opaque tag; the cache is used only when the tag
 *      matches, else discarded and read from zero.
 *   2. Law D. A read that FAILED with a cache present is still a failed read.
 *      The cache is never surfaced as "the canvas" over an outage.
 *   3. Laws B and C. Whatever the interleaving of appends and reads, the merged
 *      canvas equals a full read: nothing dropped, nothing doubled.
 *   4. Then, and only then, the bytes: a second read carries only what is new.
 *
 * THE MERGE IS THE CLIENT'S. The server is the truth and computes what
 * deserves another look over the WHOLE canvas every time (a suspicion about
 * lesson 1 can be raised by lesson 41); only the artifact payload is cut to
 * what the client has not got. `questioned` is replaced whole on every read.
 */

const A_TEST_SECRET = 'incremental-laws-secret-not-used-anywhere-real'
const search: SearchPort = { search: async () => [] }
const model: ModelPort = {
  lesson: async () => { throw new Error('no law here asks for a lesson') },
  chat: async () => { throw new Error('no law here asks the model anything') },
}

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

function anAsk(question: string): NewArtifact {
  return { kind: 'lesson', question, payload: { id: 'x', blocks: [] }, teaching: 'lesson' }
}

interface Server {
  /** Every GET /api/canvas: the `after` it carried and how many rows came back. */
  readonly reads: { after: string | null; rows: number; bytes: number }[]
  /** Make the next `times` requests fail the way a dropped connection does. */
  breakTheNetwork(times: number): void
  /** Drop the signed cookie: the next request is a different student in the SAME browser. */
  forgetWhoIsSignedIn(): void
  /** A raw request, for a law about the route itself. */
  raw(method: string, path: string, query: string): Promise<{ status: number; body: unknown }>
}

let server: Server
let closeStore: () => void
let scratch = ''

function startServer(path: string): Server {
  const store = sqliteMemoryStore(path)
  closeStore = () => store.close()
  const handle = createHandler({
    model,
    search,
    memory: canvasMemory({ store, log: () => {} }),
    evidence: evidenceIn(store),
    identitySecret: A_TEST_SECRET,
  })

  const reads: { after: string | null; rows: number; bytes: number }[] = []
  let cookie = ''
  let breakFor = 0

  const send = async (method: string, pathname: string, query: string, body?: unknown) => {
    const res = await handle({
      method,
      path: pathname,
      query,
      ...(cookie === '' ? {} : { cookie }),
      ...(body === undefined ? {} : { body }),
    })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    return res
  }

  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://canvas.test')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    if (breakFor > 0) { breakFor -= 1; throw new TypeError('Failed to fetch') }
    const res = await send(method, url.pathname, url.search.replace(/^\?/, ''), body)
    if (method === 'GET' && url.pathname === '/api/canvas') {
      const rows = Array.isArray((res.body as { artifacts?: unknown })?.artifacts) ? ((res.body as { artifacts: unknown[] }).artifacts).length : -1
      reads.push({ after: url.searchParams.get('after'), rows, bytes: JSON.stringify(res.body).length })
    }
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response
  }))

  return {
    reads,
    breakTheNetwork: (times) => { breakFor = times },
    forgetWhoIsSignedIn: () => { cookie = '' },
    raw: async (method, pathname, query) => {
      const res = await send(method, pathname, query)
      return { status: res.status, body: res.body }
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  scratch = mkdtempSync(join(tmpdir(), 'canvas-incremental-'))
  server = startServer(join(scratch, 'canvas-memory.db'))
})
afterEach(() => {
  closeStore()
  vi.unstubAllGlobals()
  rmSync(scratch, { recursive: true, force: true })
})

async function appendMany(topic: string, from: number, to: number): Promise<void> {
  for (let n = from; n <= to; n += 1) {
    const saved = await appendToCanvas(topic, anAsk(`question ${n}`))
    if (!saved.ok) throw new Error(`append ${n} failed: ${saved.reason}`)
  }
}

/** What a brand-new browser would read: no cache, no cookie carried over. */
async function aFullReadFromNowhere(topic: string): Promise<string> {
  const kept = window.localStorage.getItem(CANVAS_CACHE_KEY)
  window.localStorage.removeItem(CANVAS_CACHE_KEY)
  try {
    const read = await readCanvas(topic)
    if (!read.ok) throw new Error(`full read failed: ${read.reason}`)
    return JSON.stringify(read)
  } finally {
    if (kept !== null) window.localStorage.setItem(CANVAS_CACHE_KEY, kept)
  }
}

const lastRead = () => server.reads[server.reads.length - 1]

/* ================================================================== */
/* 1. THE SHARED MACHINE -- the worst thing a cache could do           */
/* ================================================================== */

describe('LAW S1.1 -- a cache in this browser never shows the next student the last one s canvas', () => {
  it('student B, same browser, same topic, sees nothing of A -- and the cache is now B s', async () => {
    await appendMany('shared-topic', 1, 3)
    const hers = await readCanvas('shared-topic')
    expect(hers.ok && hers.artifacts.map((a) => a.question)).toEqual(['question 1', 'question 2', 'question 3'])

    /* The cookie goes; localStorage STAYS. That is a shared school computer
       with one browser profile, which is what most of them are. */
    server.forgetWhoIsSignedIn()

    const his = await readCanvas('shared-topic')
    expect(his, 'the second student was shown the first student s work').toEqual({ ok: true, artifacts: [], questioned: [] })

    /* And A s work is no longer sitting in this browser under B. */
    await appendToCanvas('shared-topic', anAsk('his own'))
    const hisAgain = await readCanvas('shared-topic')
    expect(hisAgain.ok && hisAgain.artifacts.map((a) => a.question)).toEqual(['his own'])
  })
})

/* ================================================================== */
/* 2. LAW D STILL HOLDS -- a failed read with a cache is a failed read */
/* ================================================================== */

describe('LAW S1.2 -- an outage is reported as an outage, never answered from the cache', () => {
  it('says it could not read, keeps the cache, and reads incrementally once the network is back', async () => {
    await appendMany('optics', 1, 5)
    const before = await readCanvas('optics')
    expect(before.ok).toBe(true)

    server.breakTheNetwork(1)
    const during = await readCanvas('optics')
    expect(during.ok, 'a dropped connection was answered from the cache as if it were the canvas').toBe(false)

    await appendMany('optics', 6, 6)
    const after = await readCanvas('optics')
    expect(after.ok && after.artifacts.map((a) => a.question)).toEqual(['question 1', 'question 2', 'question 3', 'question 4', 'question 5', 'question 6'])
    expect(lastRead()?.rows, 'after the outage the client should still only need what is new').toBe(1)
  })
})

/* ================================================================== */
/* 3. LAWS B AND C -- merged equals whole, whatever the interleaving   */
/* ================================================================== */

describe('LAW S1.3 -- the merged canvas equals a full read: nothing dropped, nothing doubled', () => {
  it('under appends between reads, one at a time and in bursts', async () => {
    await appendMany('waves', 1, 4)
    await readCanvas('waves')
    for (const burst of [1, 1, 3, 1, 5]) {
      const soFar = server.reads.length
      const highest = (await readCanvas('waves'))
      const top = highest.ok ? Math.max(0, ...highest.artifacts.map((a) => a.seq)) : 0
      await appendMany('waves', top + 1, top + burst)
      const merged = await readCanvas('waves')
      if (!merged.ok) throw new Error(merged.reason)
      const seqs = merged.artifacts.map((a) => a.seq)
      expect(new Set(seqs).size, 'a seq appears twice').toBe(seqs.length)
      expect(seqs, 'seqs are not strictly increasing').toEqual([...seqs].sort((a, b) => a - b))
      expect(JSON.stringify(merged)).toBe(await aFullReadFromNowhere('waves'))
      expect(server.reads.length).toBeGreaterThan(soFar)
    }
  })

  it('a cache that will not parse is treated as no cache, never as content', async () => {
    await appendMany('sound', 1, 3)
    await readCanvas('sound')
    window.localStorage.setItem(CANVAS_CACHE_KEY, '{ this is not json')
    const read = await readCanvas('sound')
    expect(JSON.stringify(read)).toBe(await aFullReadFromNowhere('sound'))
    expect(lastRead()?.after, 'a corrupt cache must not be trusted for a cursor').toBeNull()
  })

  it('a cache for another topic is not this topic s cache', async () => {
    await appendMany('topic-a', 1, 3)
    await readCanvas('topic-a')
    await appendMany('topic-b', 1, 2)
    const b = await readCanvas('topic-b')
    expect(b.ok && b.artifacts.map((a) => a.question)).toEqual(['question 1', 'question 2'])
    expect(lastRead()?.after).toBeNull()
  })
})

/* ================================================================== */
/* 4. THE BYTES -- only what is new crosses on the next read           */
/* ================================================================== */

describe('LAW S1.4 -- the second read of a long canvas carries only what is new', () => {
  it('200 artifacts read once; three more; the next read carries three rows', async () => {
    await appendMany('history', 1, 200)
    const first = await readCanvas('history')
    expect(first.ok && first.artifacts).toHaveLength(200)
    const fullBytes = lastRead()?.bytes ?? 0

    await appendMany('history', 201, 203)
    const second = await readCanvas('history')
    if (!second.ok) throw new Error(second.reason)
    expect(second.artifacts).toHaveLength(203)
    expect(lastRead()?.after, 'the client did not say what it already holds').toBe('200')
    expect(lastRead()?.rows, 'the server re-sent the whole canvas').toBe(3)
    expect(lastRead()?.bytes ?? Infinity).toBeLessThan(fullBytes / 10)
    expect(JSON.stringify(second)).toBe(await aFullReadFromNowhere('history'))
  })

  it('what deserves another look is judged over the WHOLE canvas even on an incremental read', async () => {
    await appendMany('plea-topic', 1, 2)
    await readCanvas('plea-topic')
    /* A plea against artifact 1, filed the way the canvas files it. */
    await fetch('/api/evidence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ said: 'i still dont get it', topicId: 'plea-topic', beat: 'b1', artifactSeq: 1 }) })
    await appendMany('plea-topic', 3, 3)
    const incremental = await readCanvas('plea-topic')
    /* Read off THIS request, before the full-read helper below makes another. */
    const rowsThatCrossed = lastRead()?.rows
    const full = JSON.parse(await aFullReadFromNowhere('plea-topic')) as { questioned: unknown }
    expect(incremental.ok && incremental.questioned).toEqual(full.questioned)
    expect(rowsThatCrossed, 'the incremental read should carry only the new artifact').toBe(1)
  })
})

/* ================================================================== */
/* 5. THE ROUTE -- a cursor it cannot read is refused, never guessed   */
/* ================================================================== */

describe('LAW S1.5 -- a malformed cursor is a 400, never an empty canvas and never the whole one', () => {
  it.each(['abc', '-1', '1.5', '1e3', ''])('after=%s', async (after) => {
    await appendMany('cursor-topic', 1, 2)
    await readCanvas('cursor-topic')
    const { status, body } = await server.raw('GET', '/api/canvas', `tabId=any&lessonId=cursor-topic%23canvas&after=${encodeURIComponent(after)}`)
    expect(status, JSON.stringify(body)).toBe(400)
  })
})
