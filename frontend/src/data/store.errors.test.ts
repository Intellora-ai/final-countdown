// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost" }
/* The data layer must never lose a failure silently.
 *
 * The url option is not decoration. jsdom exposes localStorage only when the
 * document has a real origin; on the default `about:blank` it is undefined,
 * and every assertion here would fail on the harness rather than on the code.
 * Measured: with jsdom and no url, `typeof document` is "object" while
 * `typeof localStorage` is "undefined".
 *
 * jsdom is opted into per vite.config.ts's stated policy. This file needs a
 * real `window` to dispatch a `storage` event and a real `localStorage` to
 * refuse a write. It asserts nothing about layout, which is the reason that
 * policy keeps jsdom off by default.
 *
 * WHAT WAS WRONG
 * --------------
 * LocalAdapter had three handlers whose bodies were a single comment:
 *
 *   store.ts:25  a `storage` event whose payload will not parse
 *   store.ts:37  localStorage.setItem refusing the write (quota, private mode)
 *   store.ts:38  BroadcastChannel.postMessage on a closed channel
 *
 * Each caught a real failure and did nothing as a result, so execution
 * continued exactly as though the operation had succeeded. Reproduced
 * 2026-08-25: a `storage` event carrying invalid JSON called the subscriber 0
 * times, logged nothing, raised no window error event and threw nothing. The
 * tab kept showing stale data with no signal, forever. commit() was worse --
 * it returned a resolved promise after a write that never landed, so the app
 * reported a save that did not happen.
 *
 * WHY AN ERROR CHANNEL AND NOT A REJECTED PROMISE
 * -----------------------------------------------
 * store.ts:201-202 calls commit() fire-and-forget; nothing awaits it. Making
 * commit() reject would swap a silent swallow for an unhandled rejection --
 * the same defect wearing a different hat. An additive onError channel lets
 * the failure reach something that can act on it without changing any
 * existing call site.
 *
 * THESE TESTS ARE PAIRED ON PURPOSE
 * ---------------------------------
 * Every failure case has a success counterpart. A test that only asserts "the
 * error callback fired" is satisfied by an adapter that reports failure
 * constantly; one that only asserts "the data callback fired" is satisfied by
 * an adapter that never reports anything. Both directions, or neither proves
 * anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LocalAdapter } from './store'

const KEY = 'learning-os/v2'

function storageEvent(newValue: string | null, key: string = KEY) {
  return new StorageEvent('storage', { key, newValue })
}

/* jsdom 30 does not implement localStorage. Measured in this worktree:
 * `window.location.origin` is http://localhost:3000 and `typeof Storage` is
 * "function", yet `window.localStorage` is undefined. So the API is supplied
 * here rather than stubbed away.
 *
 * This is not mocking the thing under test. The code under test is
 * LocalAdapter's failure handling; localStorage is the platform API it sits
 * on, and this is a faithful in-memory implementation of it -- real values,
 * real string coercion, a real throw when told to refuse a write. The one
 * behaviour these tests need to control is the refusal, and a browser's quota
 * error cannot be triggered on demand any other way. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  refuseWrites: Error | null = null
  get length() { return this.map.size }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) {
    if (this.refuseWrites) throw this.refuseWrites
    this.map.set(String(k), String(v))
  }
  removeItem(k: string) { this.map.delete(k) }
  clear() { this.map.clear() }
  [name: string]: unknown
}

describe('LocalAdapter surfaces failures instead of swallowing them', () => {
  let adapter: LocalAdapter
  let store: MemoryStorage

  beforeEach(() => {
    store = new MemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: store, configurable: true })
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })
    adapter = new LocalAdapter()
  })

  afterEach(() => {
    adapter.close()
    vi.restoreAllMocks()
  })

  /* ---------------- store.ts:25 — the cross-tab parse ---------------- */

  it('reports a storage event whose payload will not parse', () => {
    const data = vi.fn()
    const errors = vi.fn()
    adapter.subscribe(data)
    adapter.onError(errors)

    window.dispatchEvent(storageEvent('{oops'))

    expect(data).toHaveBeenCalledTimes(0)
    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors.mock.calls[0][0]).toMatchObject({ op: 'storage-event' })
    expect(errors.mock.calls[0][0].cause).toBeInstanceOf(Error)
  })

  it('delivers a storage event that does parse, and reports nothing', () => {
    const data = vi.fn()
    const errors = vi.fn()
    adapter.subscribe(data)
    adapter.onError(errors)

    window.dispatchEvent(storageEvent(JSON.stringify({ students: [] })))

    expect(data).toHaveBeenCalledTimes(1)
    expect(data.mock.calls[0][0]).toEqual({ students: [] })
    expect(errors).toHaveBeenCalledTimes(0)
  })

  it('remembers the last failure so a late reader can still find it', () => {
    window.dispatchEvent(storageEvent('{oops'))
    expect(adapter.lastError).toMatchObject({ op: 'storage-event' })
  })

  it('has no lastError before anything has gone wrong', () => {
    expect(adapter.lastError).toBeNull()
  })

  /* ---------------- store.ts:37 — the write that did not land -------- */

  it('reports a commit whose write was refused', async () => {
    const errors = vi.fn()
    adapter.onError(errors)
    store.refuseWrites = new DOMException('QuotaExceededError')

    await adapter.commit({ students: [] } as never)

    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors.mock.calls[0][0]).toMatchObject({ op: 'commit' })
  })

  it('reports nothing when the write lands', async () => {
    const errors = vi.fn()
    adapter.onError(errors)

    await adapter.commit({ students: [] } as never)

    expect(errors).toHaveBeenCalledTimes(0)
    expect(store.getItem(KEY)).toBe(JSON.stringify({ students: [] }))
  })

  /* ---------------- store.ts:29 — load() already had a fallback ------ */

  it('reports a corrupt stored value rather than silently starting empty', async () => {
    const errors = vi.fn()
    adapter.onError(errors)
    store.setItem(KEY, '{corrupt')

    const db = await adapter.load()

    expect(db).toBeNull()
    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors.mock.calls[0][0]).toMatchObject({ op: 'load' })
  })

  it('loads a valid stored value and reports nothing', async () => {
    const errors = vi.fn()
    adapter.onError(errors)
    store.setItem(KEY, JSON.stringify({ students: [] }))

    const db = await adapter.load()

    expect(db).toEqual({ students: [] })
    expect(errors).toHaveBeenCalledTimes(0)
  })

  /* ---------------- the channel itself ------------------------------- */

  it('stops reporting to a listener that unsubscribed', () => {
    const errors = vi.fn()
    const off = adapter.onError(errors)
    window.dispatchEvent(storageEvent('{oops'))
    off()
    window.dispatchEvent(storageEvent('{oops again'))

    expect(errors).toHaveBeenCalledTimes(1)
  })

  it('keeps notifying the other listeners when one of them throws', () => {
    const bad = vi.fn(() => { throw new Error('listener exploded') })
    const good = vi.fn()
    adapter.onError(bad)
    adapter.onError(good)

    window.dispatchEvent(storageEvent('{oops'))

    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
  })
})
