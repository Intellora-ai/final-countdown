/* CS-6 / DOD-7 — the camera is learner state, and survives.
 *
 * Tested through a fake adapter rather than jsdom. The Adapter interface is the
 * store's declared swap point, so exercising it here proves the same property
 * the real persistence path has — the camera reaches the adapter and comes back
 * — without pulling a DOM implementation into a test about data.
 */

import { describe, it, expect } from 'vitest'
import { Store } from './store'
import type { Adapter, DB } from '../types'

/** In-memory adapter. Also lets the test assert WHICH path was committed, which
 *  a localStorage stub could not do as directly. */
class FakeAdapter implements Adapter {
  db: DB | null = null
  paths: string[] = []
  private subs: Array<(db: DB) => void> = []
  load() { return Promise.resolve(this.db) }
  subscribe(cb: (db: DB) => void) {
    this.subs.push(cb)
    return () => { this.subs = this.subs.filter((f) => f !== cb) }
  }
  commit(db: DB) { this.db = db; return Promise.resolve() }
  commitPath(path: string, _value: unknown) { this.paths.push(path); return Promise.resolve() }
  close() { /* nothing to release */ }
}

const CH = 'matter-in-our-surroundings'
const CO = 'change-of-state'
const REP = 'lesson-board'

async function freshStore() {
  const adapter = new FakeAdapter()
  const store = new Store()
  await store.init(adapter)
  return { store, adapter }
}

describe('CS-6 camera persistence', () => {
  it('returns null before the learner has moved the camera', async () => {
    const { store } = await freshStore()
    expect(store.canvasCamera(CH, CO, REP)).toBeNull()
  })

  it('saves and restores pan, zoom and the representation it belongs to', async () => {
    const { store } = await freshStore()
    store.saveCanvasCamera(CH, CO, REP, {
      pan: { x: -120, y: 46 },
      zoom: 1.75,
      focusObjectId: 's3-figure',
      representationId: REP,
    })
    const restored = store.canvasCamera(CH, CO, REP)!
    expect(restored.pan).toEqual({ x: -120, y: 46 })
    expect(restored.zoom).toBe(1.75)
    expect(restored.focusObjectId).toBe('s3-figure')
    expect(restored.updatedAt).toBeGreaterThan(0)
  })

  it('keeps a separate camera per representation', async () => {
    // The frame that fits a particle simulation is not the frame that fits an
    // equation. Sharing one camera would "restore" a position never chosen.
    const { store } = await freshStore()
    store.saveCanvasCamera(CH, CO, 'lesson-board', { pan: { x: 10, y: 10 }, zoom: 1, focusObjectId: null, representationId: 'lesson-board' })
    store.saveCanvasCamera(CH, CO, 'equation', { pan: { x: -300, y: 0 }, zoom: 2.2, focusObjectId: null, representationId: 'equation' })
    expect(store.canvasCamera(CH, CO, 'lesson-board')!.zoom).toBe(1)
    expect(store.canvasCamera(CH, CO, 'equation')!.zoom).toBe(2.2)
  })

  it('keeps a separate camera per concept', async () => {
    const { store } = await freshStore()
    store.saveCanvasCamera(CH, 'change-of-state', REP, { pan: { x: 5, y: 5 }, zoom: 1.1, focusObjectId: null, representationId: REP })
    store.saveCanvasCamera(CH, 'evaporation', REP, { pan: { x: 99, y: 99 }, zoom: 0.7, focusObjectId: null, representationId: REP })
    expect(store.canvasCamera(CH, 'change-of-state', REP)!.pan).toEqual({ x: 5, y: 5 })
    expect(store.canvasCamera(CH, 'evaporation', REP)!.pan).toEqual({ x: 99, y: 99 })
  })

  it('commits through the adapter path, not only into memory', async () => {
    // DOD-7 explicitly requires the camera not live only in component state.
    const { store, adapter } = await freshStore()
    store.saveCanvasCamera(CH, CO, REP, { pan: { x: 1, y: 2 }, zoom: 1.4, focusObjectId: null, representationId: REP })
    expect(adapter.paths.some((p) => p.startsWith('canvas/') && p.endsWith(`/${CH}/${CO}/${REP}`))).toBe(true)
    expect(adapter.db?.canvas).toBeTruthy()
  })

  it('survives a reload — a new store reading the same persisted tree', async () => {
    const { store, adapter } = await freshStore()
    store.saveCanvasCamera(CH, CO, REP, { pan: { x: -44, y: 8 }, zoom: 2.0, focusObjectId: null, representationId: REP })

    const reopened = new Store()
    await reopened.init(adapter)
    const restored = reopened.canvasCamera(CH, CO, REP)!
    expect(restored.pan).toEqual({ x: -44, y: 8 })
    expect(restored.zoom).toBe(2.0)
  })

  it('leaves progress untouched — the camera is a separate branch of the tree', async () => {
    const { store, adapter } = await freshStore()
    // Compare the LIVE tree, not the adapter's copy: the adapter holds nothing
    // until the first commit, so its `progress` would read `{}` beforehand and
    // the whole seeded tree afterwards — a difference caused by committing at
    // all, which is not what this test is about.
    const before = JSON.stringify(store.db!.progress)
    store.saveCanvasCamera(CH, CO, REP, { pan: { x: 0, y: 0 }, zoom: 1, focusObjectId: null, representationId: REP })
    expect(JSON.stringify(store.db!.progress)).toBe(before)
    // And the camera did reach the adapter, so this is not passing by inaction.
    expect(adapter.db?.canvas).toBeTruthy()
  })
})
