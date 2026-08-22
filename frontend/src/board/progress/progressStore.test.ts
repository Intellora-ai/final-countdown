import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachFlushOnHide, createProgressStore, STORAGE_KEY, type ProgressStorage } from './progressStore'
import { PROGRESS_VERSION, sameProgress, type LearnerProgress } from './types'

/* The four properties the milestone names, each tested as a property rather
 * than as a happy path: idempotent, debounced, recoverable, versioned.
 *
 * Storage is a fake object, not a jsdom localStorage, so these tests say
 * nothing about a browser they did not run in. The behaviour under test is the
 * store's own logic, which is where the properties live.
 */

function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  let failNextWrite = false
  const s: ProgressStorage & {
    data: Map<string, string>
    writes: number
    failWritesWith: (on: boolean) => void
  } = {
    data,
    writes: 0,
    failWritesWith(on: boolean) { failNextWrite = on },
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failNextWrite) throw new Error('QuotaExceededError')
      s.writes += 1
      data.set(k, v)
    },
    removeItem: (k) => { data.delete(k) },
  }
  return s
}

function progress(over: Partial<LearnerProgress> = {}): LearnerProgress {
  return {
    sessionId: 'session-1',
    boardId: 'change-of-state',
    currentStepId: 'step-2',
    completedStepIds: ['step-1'],
    quizAnswers: {},
    clarificationCount: 0,
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...over,
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('writes are debounced', () => {
  it('coalesces a burst into one write', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 300 })

    store.save('anon', progress({ currentStepId: 'step-1' }))
    store.save('anon', progress({ currentStepId: 'step-2' }))
    store.save('anon', progress({ currentStepId: 'step-3' }))
    expect(storage.writes, 'nothing should reach storage before the timer').toBe(0)

    vi.advanceTimersByTime(300)
    expect(storage.writes).toBe(1)
    expect(store.writeCount()).toBe(1)

    /* The last state is the one that survives, not the first. */
    const stored = JSON.parse(storage.data.get(STORAGE_KEY)!)
    expect(stored.records['anon/change-of-state'].currentStepId).toBe('step-3')
  })

  it('does not write again when nothing changed after the timer', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 300 })
    store.save('anon', progress())
    vi.advanceTimersByTime(300)
    expect(storage.writes).toBe(1)
    vi.advanceTimersByTime(5_000)
    expect(storage.writes).toBe(1)
  })

  it('flush writes immediately without waiting for the timer', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 300 })
    store.save('anon', progress())
    store.flush()
    expect(storage.writes).toBe(1)
    /* And the pending timer does not then write a second time. */
    vi.advanceTimersByTime(300)
    expect(storage.writes).toBe(1)
  })
})

describe('writes are idempotent', () => {
  it('drops a save that would store what is already stored', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 300 })

    expect(store.save('anon', progress())).toBe(true)
    vi.advanceTimersByTime(300)
    expect(storage.writes).toBe(1)

    /* THE INVARIANT: one logical action, one write — however many times the
     * board reports the same position. */
    expect(store.save('anon', progress())).toBe(false)
    expect(store.save('anon', progress())).toBe(false)
    vi.advanceTimersByTime(300)
    expect(storage.writes, 'duplicate progress writes for one logical action').toBe(1)
  })

  it('treats a later timestamp alone as no change', () => {
    /* updatedAt moves on every render tick if the caller lets it. If that
     * counted as a change, "idempotent" would mean nothing. */
    const a = progress({ updatedAt: '2026-08-22T10:00:00.000Z' })
    const b = progress({ updatedAt: '2026-08-22T11:30:00.000Z' })
    expect(sameProgress(a, b)).toBe(true)
  })

  it('treats sub-pixel camera drift as no change, but a real move as a change', () => {
    const base = progress({ lastCamera: { x: 100, y: 200, zoom: 1 } })
    expect(sameProgress(base, progress({ lastCamera: { x: 100.4, y: 200.2, zoom: 1.001 } }))).toBe(true)
    expect(sameProgress(base, progress({ lastCamera: { x: 180, y: 200, zoom: 1 } }))).toBe(false)
    expect(sameProgress(base, progress({ lastCamera: { x: 100, y: 200, zoom: 1.6 } }))).toBe(false)
  })

  it('notices a new answer, a new completed step, and a clarification', () => {
    const base = progress()
    expect(sameProgress(base, progress({
      quizAnswers: { q1: { optionId: 'b', correct: true, at: 'now' } },
    }))).toBe(false)
    expect(sameProgress(base, progress({ completedStepIds: ['step-1', 'step-2'] }))).toBe(false)
    expect(sameProgress(base, progress({ clarificationCount: 1 }))).toBe(false)
  })

  it('does not confuse two answers that differ only in when they were given', () => {
    const a = progress({ quizAnswers: { q1: { optionId: 'b', correct: true, at: 'monday' } } })
    const b = progress({ quizAnswers: { q1: { optionId: 'b', correct: true, at: 'friday' } } })
    expect(sameProgress(a, b)).toBe(true)
  })
})

describe('reading is recoverable', () => {
  it('starts fresh and says so when storage holds nonsense', () => {
    const problems: string[] = []
    const storage = fakeStorage({ [STORAGE_KEY]: 'not json at all {' })
    const store = createProgressStore({ storage, onProblem: (m) => problems.push(m) })

    expect(store.read('anon', 'change-of-state')).toBeNull()
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('unreadable')
  })

  it('refuses a record written by a different version rather than guessing', () => {
    const problems: string[] = []
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 99, records: { 'anon/b': progress() } }),
    })
    const store = createProgressStore({ storage, onProblem: (m) => problems.push(m) })

    expect(store.read('anon', 'b')).toBeNull()
    expect(problems[0]).toContain('different version')
  })

  it('keeps the good records and drops only the unusable one', () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({
        version: PROGRESS_VERSION,
        records: {
          'anon/good': progress({ boardId: 'good' }),
          'anon/bad': { sessionId: 5, nonsense: true },
        },
      }),
    })
    const store = createProgressStore({ storage })
    /* One corrupt board must not cost the learner every other board. */
    expect(store.read('anon', 'good')?.boardId).toBe('good')
    expect(store.read('anon', 'bad')).toBeNull()
  })

  it('survives a storage that throws on write, and says so once', () => {
    const problems: string[] = []
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 10, onProblem: (m) => problems.push(m) })
    storage.failWritesWith(true)

    store.save('anon', progress())
    vi.advanceTimersByTime(10)

    expect(problems.some((p) => p.includes('could not be saved'))).toBe(true)
    /* The lesson continues: nothing threw out of save or the timer. */
    expect(() => store.save('anon', progress({ currentStepId: 'step-9' }))).not.toThrow()
  })

  it('works with no storage at all', () => {
    /* Private browsing, a disabled origin, a non-browser runtime. The board
     * must still teach; it simply will not remember. */
    const store = createProgressStore({ storage: null })
    expect(store.read('anon', 'b')).toBeNull()
    expect(store.save('anon', progress())).toBe(true)
    expect(() => store.flush()).not.toThrow()
    expect(store.writeCount()).toBe(0)
  })
})

describe('a pending write survives the page going away', () => {
  it('can be attached and re-attached, because React mounts more than once', () => {
    /* THE BUG THIS EXISTS TO PREVENT. The flush listener used to be registered
     * inside the store and removed by dispose(), which tied its life to the
     * store's construction rather than to a component's. React 18 mounts,
     * cleans up, and mounts again — so the listener was removed before the
     * real mount and never came back, and an answer given just before a reload
     * was silently lost. Attach/detach is now symmetric and repeatable. */
    const store = createProgressStore({ storage: fakeStorage(), debounceMs: 1000 })
    const detachA = attachFlushOnHide(store)
    detachA()
    const detachB = attachFlushOnHide(store)
    expect(typeof detachB).toBe('function')
    detachB()
  })

  it('is a no-op where there is no page to hide', () => {
    /* These tests run without a DOM on purpose, so the function must degrade
     * rather than throw. That the listener actually fires on a real pagehide
     * is a browser claim, and it is asserted in the browser: see
     * e2e/canvas-phase5.spec.ts, "an answer survives a reload", which answers
     * a question and reloads immediately — inside the debounce window, so the
     * only thing that can save it is the flush this attaches. */
    const store = createProgressStore({ storage: fakeStorage(), debounceMs: 10_000 })
    expect(() => attachFlushOnHide(store)()).not.toThrow()
  })

  it('flushes what is pending when asked directly', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 10_000 })
    store.save('anon', progress())
    expect(storage.writes, 'still inside the debounce window').toBe(0)
    store.flush()
    expect(storage.writes, 'the pending write must land when flushed').toBe(1)
  })
})

describe('records are separated by learner and by board', () => {
  it('keeps two boards for one learner and two learners for one board', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 1 })

    store.save('arya', progress({ boardId: 'chem', currentStepId: 'step-3' }))
    store.save('arya', progress({ boardId: 'maths', currentStepId: 'step-1' }))
    store.save('ishan', progress({ boardId: 'chem', currentStepId: 'step-7' }))
    store.flush()

    expect(store.read('arya', 'chem')?.currentStepId).toBe('step-3')
    expect(store.read('arya', 'maths')?.currentStepId).toBe('step-1')
    expect(store.read('ishan', 'chem')?.currentStepId).toBe('step-7')
  })

  it('clears one board without touching the others', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 1 })
    store.save('arya', progress({ boardId: 'chem' }))
    store.save('arya', progress({ boardId: 'maths' }))
    store.flush()

    store.clear('arya', 'chem')
    store.flush()
    expect(store.read('arya', 'chem')).toBeNull()
    expect(store.read('arya', 'maths')).not.toBeNull()
  })
})

describe('what is written can be read back', () => {
  it('round-trips through a fresh store, which is what resume actually does', () => {
    const storage = fakeStorage()
    const writer = createProgressStore({ storage, debounceMs: 1 })
    const saved = progress({
      currentStepId: 'step-4',
      completedStepIds: ['step-1', 'step-2', 'step-3'],
      quizAnswers: { 'frac-quiz': { optionId: 'b', correct: true, at: '2026-08-22T10:05:00.000Z' } },
      clarificationCount: 2,
      lastCamera: { x: 112, y: 848, zoom: 0.9 },
    })
    writer.save('arya', saved)
    writer.flush()

    /* A new store over the same storage — a reload, in other words. */
    const reader = createProgressStore({ storage })
    expect(reader.read('arya', 'change-of-state')).toEqual(saved)
  })

  it('stores the version inside the envelope, not only in the key', () => {
    const storage = fakeStorage()
    const store = createProgressStore({ storage, debounceMs: 1 })
    store.save('anon', progress())
    store.flush()
    const stored = JSON.parse(storage.data.get(STORAGE_KEY)!)
    expect(stored.version).toBe(PROGRESS_VERSION)
  })
})
