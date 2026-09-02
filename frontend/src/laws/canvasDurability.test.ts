// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { canvasMemory } from '../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../server/memory/sqliteStore.ts'

import type { LearningIntelligence } from '../../server/intelligence/LearningIntelligence.ts'
import { shadowRuns, type ListedRun } from '../../server/intelligence/runs.ts'

import { appendToCanvas, readCanvas, type NewArtifact } from '../canvas/api/memoryClient'

/**
 * THE FIVE DURABILITY LAWS OF THE LEARNING CANVAS.
 *
 * IT LIVES IN `src/laws/` AND NOT BESIDE THE CLIENT, because it imports the
 * server, and `src/canvas` must not -- the canvas ships to a browser and the
 * server holds the keys. `tsconfig.canvas.json` enforces that boundary by
 * being a narrower, stricter project, so a canvas file importing `server/`
 * fails the build. `src/almanac/journey.test.tsx` reaches across the same way
 * for the same reason and sits outside the canvas for the same cause.
 *
 * These are not unit tests of a function. They are the product's promise to a
 * student, asserted end to end: the real browser client, over the real HTTP
 * handler, into the real SQLite store. Nothing here is stubbed except the
 * socket, which this sandbox may not open.
 *
 * WHY THEY EXIST. An audit of the shipped canvas found SIXTEEN ways a term's
 * learning could vanish without a word. They reduced to three causes:
 *
 *   A. a read that FAILED was returned as a canvas that was EMPTY
 *   B. every save replaced the WHOLE canvas, so any save could destroy it
 *   C. a cap of 40 deleted lesson 1 when lesson 41 arrived -- from the database
 *
 * Fixing sixteen bugs would have left the seventeenth. These laws state the
 * guarantee instead, so a future change that reintroduces the shape is caught
 * by the promise rather than by a student.
 *
 * THE ONE RULE FOR ANYONE WHO MAKES ONE OF THESE GO RED: fix the product.
 * A weakened law here is a lie that ships, and the thing it lies about is a
 * child's year of work.
 */

const A_TEST_SECRET = 'laws-secret-not-used-anywhere-real'
const search: SearchPort = { search: async () => [] }
const model: ModelPort = {
  lesson: async () => { throw new Error('no law here asks for a lesson to be written') },
  chat: async () => { throw new Error('no law here asks the model anything') },
}

/** A lesson-shaped payload of roughly `bytes` bytes, so size is deliberate. */
function aLessonOf(bytes: number, mark: string): unknown {
  return { id: mark, blocks: [{ id: 'b1', kind: 'prose', body: mark.padEnd(bytes, ' ') }] }
}

function anAsk(question: string, payload: unknown = { id: 'x', blocks: [] }): NewArtifact {
  return { kind: 'lesson', question, payload, teaching: 'lesson' }
}

/* ------------------------------------------------------------------ */
/* The server, in this process. Real handler, real store, real record. */
/* ------------------------------------------------------------------ */

interface Server {
  /** Every request the browser made, so a law can prove one did NOT happen. */
  readonly sent: { method: string; path: string; body?: unknown }[]
  /** Make the next `times` requests fail the way a dropped connection does. */
  breakTheNetwork(times: number): void
  /** Make the next `times` requests answer 503, the way a restarting server does. */
  refuse(times: number): void
  /** The process that held the database is gone; a new one opens the same file. */
  stopAndStartAgain(): void
  /** What the shadow bridge wrote to the log, if anything. */
  readonly shadowLog: string[]
  /** Swap the shadow's candidate on the running server, keeping the store. */
  withCandidate(candidate: LearningIntelligence): void
  /** Every shadow run kept so far, read back through the runs reader. */
  runsKept(): readonly ListedRun[]
  /** Rows in a table, counted through a SECOND connection to the file. */
  rowsIn(table: 'canvas_memory' | 'canvas_artifacts' | 'shadow_runs'): number
  /**
   * Drop the signed identity cookie, so the NEXT request is a different
   * student on the same machine and the same database. This is what a shared
   * school computer does; closing the database instead would prove nothing.
   */
  forgetWhoIsSignedIn(): void
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

let server: Server
let closeStore: () => void
let scratch = ''

/**
 * Wire `fetch` to the real handler.
 *
 * The identity cookie is carried exactly as a browser carries it, because
 * every law below depends on "the same student" meaning the same thing across
 * requests -- and because two students sharing a machine is a real-life case
 * one of these laws asserts.
 */
/* A candidate that proposes a WHOLE, valid lesson for every question -- the
   most a shadow brain could want to put on a canvas. Floor F1 says it cannot. */
const aProposingCandidate: LearningIntelligence = {
  name: 'proposing-candidate',
  propose: async (r) => ({
    actions: [{ kind: 'explain', because: 'shadow proposes', risk: 0, evidence: [], payload: { answer: `${r.question} is answered here in one plain sentence.`, representations: ['prose'] } }],
    unknowns: [], rationale: 'shadow', capabilities: { selected: ['knowledge'], rejected: [] }, cost: { ms: 1, modelCalls: 1 }, trace: {},
  }),
}

function startServer(path: string): Server {
  let store = sqliteMemoryStore(path)
  const shadowLog: string[] = []
  let candidate: LearningIntelligence = aProposingCandidate
  closeStore = () => store.close()
  const openHandler = () => createHandler({
    model,
    search,
    memory: canvasMemory({ store, log: () => {} }),
    identitySecret: A_TEST_SECRET,
    intelligence: { candidate, legacy: aProposingCandidate, log: (line) => { shadowLog.push(line) } },
    shadowRuns: shadowRuns(store),
  })
  let handle = openHandler()

  const sent: { method: string; path: string; body?: unknown }[] = []
  let cookie = ''
  let breakFor = 0
  let refuseFor = 0

  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://canvas.test')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    sent.push({ method, path: url.pathname, ...(body === undefined ? {} : { body }) })

    if (breakFor > 0) { breakFor -= 1; throw new TypeError('Failed to fetch') }
    if (refuseFor > 0) {
      refuseFor -= 1
      return { ok: false, status: 503, json: async () => ({ error: 'the server is restarting' }) } as Response
    }

    const res = await handle({
      method,
      path: url.pathname,
      query: url.search.replace(/^\?/, ''),
      ...(cookie === '' ? {} : { cookie }),
      ...(body === undefined ? {} : { body }),
    })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response
  }))

  return {
    sent,
    breakTheNetwork: (times: number) => { breakFor = times },
    refuse: (times: number) => { refuseFor = times },
    forgetWhoIsSignedIn: () => { cookie = '' },
    shadowLog,
    withCandidate: (next) => { candidate = next; handle = openHandler() },
    runsKept: () => shadowRuns(store).list(),
    rowsIn: (table) => {
      const peek = new DatabaseSync(path)
      try {
        const row = peek.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
        return row.n
      } finally {
        peek.close()
      }
    },
    stopAndStartAgain: () => {
      /* What a deploy, a crash and the owner's `preview_stop` all do. The
         student keeps her cookie; the server keeps nothing but the file. */
      store.close()
      store = sqliteMemoryStore(path)
      closeStore = () => store.close()
      handle = openHandler()
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  /* A REAL FILE, not `:memory:`. One connection to an in-memory database
     cannot tell a TEMP table from a permanent one, and that blindness let a
     TEMP table ship. The file is what a student's canvas actually lives in. */
  scratch = mkdtempSync(join(tmpdir(), 'canvas-laws-'))
  server = startServer(join(scratch, 'canvas-memory.db'))
})
afterEach(() => {
  closeStore()
  vi.unstubAllGlobals()
  rmSync(scratch, { recursive: true, force: true })
})

/** Read, and fail the test if the read itself failed. Laws that are ABOUT a
    failed read use `readCanvas` directly instead. */
async function whatIsOnTheCanvas(topicId: string): Promise<readonly { question: string }[]> {
  const read = await readCanvas(topicId)
  if (!read.ok) throw new Error(`the canvas could not be read: ${read.reason}`)
  return read.artifacts
}

/* ================================================================== */
/* LAW A — A FAILURE PRESERVES                                        */
/* ================================================================== */

describe('LAW A — a read that fails leaves the canvas exactly as it was', () => {
  it('does not lose a term of work to one dropped connection', async () => {
    /* She has been learning this topic for weeks. */
    for (let n = 1; n <= 12; n += 1) await appendToCanvas('trigonometry', anAsk(`question ${n}`))

    /* Her wifi drops for a moment, exactly as she opens the canvas. */
    server.breakTheNetwork(1)
    const failed = await readCanvas('trigonometry')
    expect(failed.ok).toBe(false)

    /* She asks something anyway. THIS is the moment the shipped canvas
       destroyed everything: the failed read had become an empty list, and the
       next save wrote that empty list back over twelve lessons. */
    await appendToCanvas('trigonometry', anAsk('question 13'))

    const after = await whatIsOnTheCanvas('trigonometry')
    expect(after.map((a) => a.question)).toEqual(
      [...Array.from({ length: 12 }, (_, i) => `question ${i + 1}`), 'question 13'],
    )
  })

  it('never writes anything at all on the back of a read it could not make', async () => {
    await appendToCanvas('optics', anAsk('how does a lens bend light'))

    server.refuse(1)
    const failed = await readCanvas('optics')
    expect(failed.ok).toBe(false)

    /* Not one write may follow a read that failed. A client that "restores"
       what it thinks it saw is a client that can overwrite what it did not. */
    const writesAfterTheFailure = server.sent
      .slice(server.sent.findIndex((call) => call.method === 'GET'))
      .filter((call) => call.method !== 'GET')
    expect(writesAfterTheFailure).toEqual([])
  })

  it('recovers by itself: bad read, then good read, and everything is there', async () => {
    for (const q of ['a', 'b', 'c']) await appendToCanvas('cells', anAsk(q))
    server.breakTheNetwork(2)
    expect((await readCanvas('cells')).ok).toBe(false)
    expect((await readCanvas('cells')).ok).toBe(false)
    const back = await whatIsOnTheCanvas('cells')
    expect(back.map((a) => a.question)).toEqual(['a', 'b', 'c'])
  })
})

/* ================================================================== */
/* LAW B — MONOTONIC PRESERVATION                                     */
/* ================================================================== */

describe('LAW B — what was on the canvas is still on the canvas', () => {
  it('keeps every earlier lesson after every single save, at every length', async () => {
    const asked: string[] = []
    for (let n = 1; n <= 25; n += 1) {
      const q = `step ${n}`
      await appendToCanvas('polynomials', anAsk(q))
      asked.push(q)
      /* Checked after EVERY append, not once at the end. A cap that trims only
         at a threshold would pass an end-only assertion for the first 40. */
      const now = await whatIsOnTheCanvas('polynomials')
      expect(now.map((a) => a.question)).toEqual(asked)
    }
  })

  it('survives a lesson far bigger than the old whole-canvas ceiling', async () => {
    /* The shipped store refused any record over 256 KB and reported it as the
       student's mistake. Sixty lessons of 10 KB is 600 KB of real teaching,
       which is one term, and it must simply work. */
    for (let n = 0; n < 60; n += 1) {
      await appendToCanvas('thermo', { ...anAsk(`big ${n}`), payload: aLessonOf(10_000, `big ${n}`) })
    }
    const all = await whatIsOnTheCanvas('thermo')
    expect(all).toHaveLength(60)
    expect(all[0]?.question).toBe('big 0')
  })

  it('survives the server being stopped and started again, which is every deploy', async () => {
    /* The shipped table was declared TEMP. SQLite keeps a TEMP table only for
       the connection that made it, so every lesson saved onto a canvas left
       with the process that held it. The owner's own database file had no
       artifacts table in it at all (`sqlite3 data/canvas-memory.db`, 2026-09-03),
       which is how this was found -- and the earlier laws could not see it,
       because in one process TEMP and permanent behave identically. */
    const before = [1, 2, 3, 4, 5, 6, 7].map((n) => `before ${n}`)
    for (const q of before) await appendToCanvas('waves', anAsk(q))
    server.stopAndStartAgain()
    expect((await whatIsOnTheCanvas('waves')).map((a) => a.question)).toEqual(before)
    /* And it carries on from where it was, rather than starting a second
       canvas at position one beside the first. */
    await appendToCanvas('waves', anAsk('after'))
    expect((await whatIsOnTheCanvas('waves')).map((a) => a.question)).toEqual([...before, 'after'])
  })
})

/* ================================================================== */
/* LAW C — NO SILENT DELETION                                         */
/* ================================================================== */

describe('LAW C — nothing leaves the canvas without an explicit deletion', () => {
  it('gives two tabs on one topic one canvas, and loses neither tab s work', async () => {
    /* She has the topic open on her laptop and again on her phone. Both write.
       A whole-canvas PUT makes the second writer erase the first. */
    await appendToCanvas('gravity', anAsk('from the laptop'))
    await appendToCanvas('gravity', anAsk('from the phone'))
    await appendToCanvas('gravity', anAsk('from the laptop again'))

    const all = await whatIsOnTheCanvas('gravity')
    expect(all.map((a) => a.question)).toEqual(['from the laptop', 'from the phone', 'from the laptop again'])
  })

  it('keeps a lesson it cannot draw, rather than dropping it', async () => {
    /* One artifact is nonsense -- a bad deploy, a half-written payload. The
       shipped canvas discarded THE WHOLE CANVAS for one bad entry, and then
       saved the loss. The rest must survive, and so must the broken one. */
    await appendToCanvas('acids', anAsk('good one'))
    await appendToCanvas('acids', { kind: 'lesson', question: 'broken one', payload: null, teaching: 'lesson' })
    await appendToCanvas('acids', anAsk('another good one'))

    const all = await whatIsOnTheCanvas('acids')
    expect(all.map((a) => a.question)).toEqual(['good one', 'broken one', 'another good one'])
  })

  it('has no operation, of any name, that makes a canvas shorter', async () => {
    /*
     * THE FIRST VERSION OF THIS TEST WAS THE THING IT WAS MEANT TO CATCH.
     *
     * It read the module's EXPORT NAMES and refused any matching
     * /delete|remove|replace|clear|trim|prune|truncate/. That is a hand-written
     * list of seven English words, and it proves nothing: `discardCanvas`,
     * `dropArtifact`, `purgeOld`, `evict`, `forget` and `reset` all sail past
     * it, and so does an `archiveArtifact()` that deletes everything while
     * being beautifully named. A test that reads names does not test behaviour.
     *
     * This one calls EVERY function the module exports, whatever it is called,
     * including ones nobody has written yet, and requires that the canvas is
     * never shorter afterwards. A throw is a fine outcome -- most of these will
     * be called with arguments that make no sense for them. Losing a lesson is
     * not.
     */
    for (const q of ['one', 'two', 'three']) await appendToCanvas('law-c', anAsk(q))
    const before = await whatIsOnTheCanvas('law-c')
    expect(before).toHaveLength(3)

    const client = await import('../canvas/api/memoryClient')
    const everyFunction = Object.entries(client).filter(([, value]) => typeof value === 'function')
    expect(everyFunction.length, 'nothing was exercised, so nothing was proven').toBeGreaterThan(0)

    /* Arguments a caller might plausibly reach for, including the shapes that
       would tempt an implementation into replacing rather than adding. */
    const plausible: unknown[][] = [
      [],
      ['law-c'],
      ['law-c', []],
      ['law-c', 0],
      ['law-c', anAsk('a new one')],
      ['law-c', [anAsk('only this one')]],
      ['law-c', { seq: 1 }],
      ['law-c', 1],
      ['law-c', null],
    ]

    for (const [name, fn] of everyFunction) {
      for (const args of plausible) {
        try {
          await (fn as (...a: unknown[]) => unknown)(...args)
        } catch {
          /* Called with arguments it was never meant for. Perfectly fine. */
        }
        const after = await readCanvas('law-c')
        expect(after.ok, `${name}(${args.length} args) left the canvas unreadable`).toBe(true)
        if (!after.ok) continue
        expect(
          after.artifacts.length,
          `${name}(${JSON.stringify(args).slice(0, 60)}) made the canvas SHORTER: ${before.length} -> ${after.artifacts.length}`,
        ).toBeGreaterThanOrEqual(before.length)
      }
    }
  })

  it('has no statement anywhere that can update or delete a stored artifact', () => {
    /*
     * The other half, one layer down, and it is why the law above can hold.
     * The store's own header states this, and a header is not a guarantee.
     *
     * Every line of server source that mentions the artifacts table must be an
     * INSERT or a SELECT. That covers code nobody has written yet, under any
     * name, by anybody -- which is the point. The name-based version of this
     * test that came first waved through a `tidyCanvas()` that deleted
     * everything, and this one caught it.
     *
     * A TEMP table is a delete with a delay: SQLite drops it with the
     * connection, so it is every lesson gone at the next restart. It shipped,
     * and the owner's own database proved it on 2026-09-03.
     *
     * Read through Vite's own module graph rather than the filesystem, so it
     * checks the same files however the suite is started and from wherever.
     */
    const sources = import.meta.glob('../../server/**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    const looked = Object.entries(sources).filter(([path]) => !/\.(test|spec)\.ts$/.test(path))
    expect(looked.length, 'the server tree was not found, so this checked nothing').toBeGreaterThan(20)

    const mentions: string[] = []
    const offending: string[] = []
    for (const [path, text] of looked) {
      for (const line of text.split('\n')) {
        if (!/canvas_artifacts/i.test(line)) continue
        mentions.push(path)
        if (/\b(DELETE|UPDATE|DROP|TRUNCATE|REPLACE|TEMP|TEMPORARY)\b/i.test(line)) {
          offending.push(`${path}: ${line.trim()}`)
        }
      }
    }
    expect(mentions.length, 'no server file mentions the artifacts table, so this check is looking at nothing').toBeGreaterThan(0)
    expect(offending, 'the store gained a way to unwrite a lesson').toEqual([])
  })
})

/* ================================================================== */
/* FLOOR F1 — A SHADOW BRAIN CANNOT TOUCH THE CANVAS                  */
/* ================================================================== */

describe('FLOOR F1 — a brain running in shadow adds nothing to the canvas, however much it proposes', () => {
  it('leaves the row count exactly where the student s own asks put it', async () => {
    /* The shadow is switched on for this law only, with a candidate that
       proposes a whole valid lesson for every question. The live brain here
       has no model, so every ask is refused -- and the shadow is asked
       regardless, which is the point: it runs, it proposes, and the canvas
       does not move. */
    const before = process.env['INTELLIGENCE_MODE']
    process.env['INTELLIGENCE_MODE'] = 'shadow'
    try {
      await appendToCanvas('optics', anAsk('her own first lesson'))
      for (let n = 0; n < 5; n += 1) {
        await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: `what is refraction ${n}`, topicId: 'optics', classId: '10' }) })
      }
      await new Promise((r) => setTimeout(r, 20))
      expect(server.shadowLog.length, 'the shadow never ran, so this law checked nothing').toBeGreaterThan(0)
      expect(server.shadowLog.join('\n')).toMatch(/candidate explain/)
      expect((await whatIsOnTheCanvas('optics')).map((a) => a.question)).toEqual(['her own first lesson'])
    } finally {
      if (before === undefined) delete process.env['INTELLIGENCE_MODE']; else process.env['INTELLIGENCE_MODE'] = before
    }
  })
})

/* ================================================================== */
/* FLOORS F2-F5 -- THE STUDENT CANNOT TELL THE SHADOW IS THERE          */
/* ================================================================== */

async function inMode<T>(mode: 'off' | 'shadow', run: () => Promise<T>): Promise<T> {
  const before = process.env['INTELLIGENCE_MODE']
  process.env['INTELLIGENCE_MODE'] = mode
  try {
    return await run()
  } finally {
    if (before === undefined) delete process.env['INTELLIGENCE_MODE']; else process.env['INTELLIGENCE_MODE'] = before
  }
}

async function ask(question: string): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = performance.now()
  const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, topicId: 'optics', classId: '10' }) })
  const body: unknown = await res.json()
  return { status: res.status, body, ms: performance.now() - t0 }
}

function aCandidateThat(behave: () => Promise<void>): LearningIntelligence {
  return { name: 'test-candidate', propose: async (r) => { await behave(); return aProposingCandidate.propose(r) } }
}

describe('FLOOR F2 -- the reply is the same, byte for byte, with the shadow on and off', () => {
  it('for a question the live brain refused, and for small talk', async () => {
    for (const question of ['what is refraction', 'hi']) {
      const off = await inMode('off', () => ask(question))
      const on = await inMode('shadow', () => ask(question))
      expect(on.status, question).toBe(off.status)
      expect(JSON.stringify(on.body), question).toBe(JSON.stringify(off.body))
    }
  })
})

describe('THE GATE -- code decides when no brain is needed, and the shadow records that too', () => {
  it('small talk in shadow mode is one run that says code sufficed, and no brain was asked', async () => {
    const before = server.runsKept().length
    await inMode('shadow', async () => {
      await ask('hi')
      await new Promise((r) => setTimeout(r, 20))
    })
    const runs = server.runsKept().slice(before)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.run?.gate.path).toBe(0)
    expect(runs[0]?.run?.live).toEqual({ did: 'asked', status: 200 })
    expect(runs[0]?.run?.candidate).toEqual({ ok: 'skipped', because: runs[0]?.run?.gate.because })
    expect(server.shadowLog.join('\n')).not.toMatch(/candidate explain/)
  })

  it('a fresh question nobody decided is path 5, and both brains are asked', async () => {
    const before = server.runsKept().length
    await inMode('shadow', async () => {
      await ask('what is total internal reflection')
      await new Promise((r) => setTimeout(r, 20))
    })
    const run = server.runsKept().slice(before)[0]?.run
    expect(run?.gate.path).toBe(5)
    expect(run?.candidate.ok).toBe(true)
  })
})

describe('FLOOR F3 -- the shadow writes to its own table and nothing else', () => {
  it('after five observed asks: five runs, and the two canvas tables exactly as they were', async () => {
    await appendToCanvas('optics', anAsk('hers'))
    const memoryBefore = server.rowsIn('canvas_memory')
    const artifactsBefore = server.rowsIn('canvas_artifacts')
    const runsBefore = server.rowsIn('shadow_runs')
    await inMode('shadow', async () => {
      for (let n = 0; n < 5; n += 1) await ask(`what is refraction ${n}`)
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(server.rowsIn('shadow_runs') - runsBefore, 'the shadow did not record its runs').toBe(5)
    expect(server.rowsIn('canvas_memory')).toBe(memoryBefore)
    expect(server.rowsIn('canvas_artifacts')).toBe(artifactsBefore)
  })

  it('has no statement under server/intelligence that names a canvas table, and none anywhere that unwrites a run', () => {
    const sources = import.meta.glob('../../server/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const looked = Object.entries(sources).filter(([path]) => !/\.(test|spec)\.ts$/.test(path))
    const offending: string[] = []
    let runsMentioned = 0
    for (const [path, text] of looked) {
      for (const line of text.split('\n')) {
        if (/server\/intelligence\//.test(path) && /canvas_memory|canvas_artifacts/.test(line)) offending.push(`${path}: ${line.trim()}`)
        if (!/shadow_runs/.test(line)) continue
        runsMentioned += 1
        if (/\b(DELETE|UPDATE|DROP|TRUNCATE|REPLACE|TEMP|TEMPORARY)\b/i.test(line)) offending.push(`${path}: ${line.trim()}`)
      }
    }
    expect(runsMentioned, 'no server file mentions shadow_runs, so this checked nothing').toBeGreaterThan(0)
    expect(offending).toEqual([])
  })
})

describe('FLOOR F4 -- the shadow never makes her wait', () => {
  it('a candidate that takes two seconds adds nothing to the reply', async () => {
    const off = await inMode('off', () => ask('what is refraction'))
    server.withCandidate(aCandidateThat(() => new Promise((r) => setTimeout(r, 2000))))
    const on = await inMode('shadow', () => ask('what is refraction'))
    expect(on.status).toBe(off.status)
    expect(on.ms, `shadow on took ${on.ms.toFixed(0)}ms, off took ${off.ms.toFixed(0)}ms`).toBeLessThan(Math.max(off.ms * 3, off.ms + 200))
  })
})

describe('FLOOR F5 -- a brain that crashes is invisible', () => {
  it('the reply is identical, and the crash is one log line', async () => {
    const off = await inMode('off', () => ask('what is refraction'))
    server.withCandidate(aCandidateThat(() => Promise.reject(new Error('the reasoner fell over'))))
    const on = await inMode('shadow', () => ask('what is refraction'))
    await new Promise((r) => setTimeout(r, 20))
    expect(JSON.stringify(on.body)).toBe(JSON.stringify(off.body))
    expect(server.shadowLog.filter((l) => /fell over/.test(l))).toHaveLength(1)
  })
})

/* ================================================================== */
/* LAW D — A FAILURE IS NOT AN EMPTY CANVAS                           */
/* ================================================================== */

describe('LAW D — "I could not read it" and "there is nothing here" are different answers', () => {
  it('says a never-studied topic is empty, and means it', async () => {
    const read = await readCanvas('a-topic-she-has-never-opened')
    expect(read).toEqual({ ok: true, artifacts: [], questioned: [] })
  })

  it('says a read that failed FAILED, and gives a reason a person could act on', async () => {
    server.breakTheNetwork(1)
    const read = await readCanvas('trigonometry')
    expect(read.ok).toBe(false)
    if (read.ok) throw new Error('unreachable')
    expect(read.reason.length).toBeGreaterThan(0)
  })

  it('never lets an outage and an empty canvas be the same value', async () => {
    const empty = await readCanvas('nothing-here-yet')
    server.refuse(1)
    const broken = await readCanvas('nothing-here-yet')
    expect(empty).not.toEqual(broken)
  })
})

/* ================================================================== */
/* LAW E — HISTORY IS UNBOUNDED                                       */
/* ================================================================== */

describe('LAW E — adding the next thing never removes the first', () => {
  it('keeps lesson 1 when lesson 41 arrives', async () => {
    /* The shipped cap was exactly 40, and lesson 41 deleted lesson 1 FROM THE
       DATABASE. This is that number, named, so the regression cannot come
       back quietly. */
    for (let n = 1; n <= 41; n += 1) await appendToCanvas('numbers', anAsk(`lesson ${n}`))
    const all = await whatIsOnTheCanvas('numbers')
    expect(all).toHaveLength(41)
    expect(all[0]?.question).toBe('lesson 1')
    expect(all[40]?.question).toBe('lesson 41')
  })

  it('keeps lesson 1 at a hundred and fifty, which is a real year', async () => {
    for (let n = 1; n <= 150; n += 1) await appendToCanvas('history', anAsk(`lesson ${n}`))
    const all = await whatIsOnTheCanvas('history')
    expect(all).toHaveLength(150)
    expect(all[0]?.question).toBe('lesson 1')
  })
})

/* ================================================================== */
/* THE SHARED MACHINE — isolation, which the laws above assume        */
/* ================================================================== */

describe('THE SHARED MACHINE: one database, two students', () => {
  /*
   * THIS TEST REPLACED A WEAKER ONE OF MINE, AND THE DIFFERENCE IS THE WHOLE
   * POINT. The first version signed the second student in by CLOSING the
   * database and opening a new one -- so of course her canvas was empty: there
   * was nothing in the database at all. It proved that a fresh database is
   * fresh, which nobody doubted.
   *
   * This one keeps ONE store and ONE server for the whole test, which is what a
   * school computer actually is, and signs a second student in on top of the
   * first. Now "she cannot see his work" is a claim about isolation rather than
   * about the fixture.
   */

  /** A second student sits down: new browser identity, new signed cookie. */
  function signOutAndIn(): void {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
    server.forgetWhoIsSignedIn()
  }

  it('never shows the second student the first student s canvas', async () => {
    await appendToCanvas('shared-topic', anAsk('the first student asked this'))
    const hers = await whatIsOnTheCanvas('shared-topic')
    expect(hers.map((a) => a.question)).toEqual(['the first student asked this'])

    signOutAndIn()

    const read = await readCanvas('shared-topic')
    expect(read, 'the second student was shown the first student s work').toEqual({
      ok: true,
      artifacts: [],
      questioned: [],
    })
  })

  it('keeps them apart by WHO THEY ARE, not by which browser they used', async () => {
    /*
     * A MUTATION SURVIVED THE TEST ABOVE, AND THIS IS WHY IT EXISTS.
     *
     * Making the server put every student's work under one shared identity --
     * `studentId: 'everyone'` -- passed all sixteen laws. The test above signs
     * a second student in by replacing `localStorage`, which also mints a new
     * BROWSER id, and a memory is keyed by student AND browser. So the work was
     * being kept apart by the browser id the whole time and the test could not
     * see the difference.
     *
     * That distinction is the security boundary. A browser id is a convenience
     * this page mints for itself; the student id comes from a signature this
     * server produced. Here the browser id is deliberately kept IDENTICAL and
     * only the signed identity changes -- two pupils sharing one profile on one
     * school computer, which is the ordinary case in the country this is built
     * for.
     */
    await appendToCanvas('shared-topic', anAsk('the first pupil s work'))
    const browserIdTheyBothUse = window.localStorage.getItem('canvas-browser-id')
    expect(browserIdTheyBothUse, 'no browser id was minted, so this test proves nothing').not.toBeNull()

    /* The second pupil signs in. Same browser, same profile, same stored id. */
    server.forgetWhoIsSignedIn()
    expect(
      window.localStorage.getItem('canvas-browser-id'),
      'the browser id changed, so this is the weaker test again',
    ).toBe(browserIdTheyBothUse)

    const read = await readCanvas('shared-topic')
    expect(read, 'the second pupil was shown the first pupil s work on a shared computer').toEqual({
      ok: true,
      artifacts: [],
      questioned: [],
    })
  })

  it('and neither student can write over the other', async () => {
    /* The half that matters most on a shared machine: one student's work must
       survive the next student using the same computer, on the same topic. */
    await appendToCanvas('shared-topic', anAsk('hers'))
    signOutAndIn()
    await appendToCanvas('shared-topic', anAsk('his'))
    expect((await whatIsOnTheCanvas('shared-topic')).map((a) => a.question)).toEqual(['his'])

    signOutAndIn()
    await appendToCanvas('shared-topic', anAsk('a third pupil'))
    expect((await whatIsOnTheCanvas('shared-topic')).map((a) => a.question)).toEqual(['a third pupil'])
  })
})
